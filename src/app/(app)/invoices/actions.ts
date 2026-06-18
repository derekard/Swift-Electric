"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { staffContext } from "@/lib/guards"
import { getSettings } from "@/lib/settings"
import { loadInvoiceDoc } from "@/lib/invoice-load"
import { renderInvoicePdf } from "@/lib/pdf/render"
import { sendInvoiceEmail } from "@/lib/email"
import { ok, fail, type ActionResult } from "@/lib/actions"
import type { Invoice } from "@/lib/supabase/types"

const updateSchema = z.object({
  status: z.enum(["draft", "sent", "paid", "void"]).optional(),
  issued_date: z.string().nullable().optional(),
  due_date: z.string().nullable().optional(),
  paid_date: z.string().nullable().optional(),
  payment_method: z
    .enum(["cash", "cheque", "e_transfer", "card", "other"])
    .nullable()
    .optional(),
  notes: z.string().trim().nullable().optional(),
})

export type InvoiceUpdateInput = z.infer<typeof updateSchema>

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}
function addDaysISO(fromISO: string, days: number) {
  const d = new Date(fromISO + "T00:00:00Z")
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

export async function updateInvoiceAction(
  id: string,
  input: InvoiceUpdateInput
): Promise<ActionResult> {
  const parsed = updateSchema.safeParse(input)
  if (!parsed.success) return fail(parsed.error.issues[0].message)

  const guard = await staffContext()
  if (!guard.ok) return guard.result

  let existing:
    | Pick<Invoice, "issued_date" | "due_date" | "paid_date">
    | null = null
  if (
    (parsed.data.status === "sent" &&
      (parsed.data.issued_date === undefined ||
        parsed.data.due_date === undefined)) ||
    (parsed.data.status === "paid" &&
      (parsed.data.paid_date === undefined ||
        parsed.data.paid_date === null ||
        parsed.data.paid_date === ""))
  ) {
    const { data, error } = await guard.ctx.supabase
      .from("invoices")
      .select("issued_date, due_date, paid_date")
      .eq("id", id)
      .maybeSingle()
    if (error) return fail(error.message)
    if (!data) return fail("Invoice not found")
    existing = data
  }

  const patch: Partial<Invoice> = {}
  for (const [k, v] of Object.entries(parsed.data)) {
    ;(patch as Record<string, unknown>)[k] = v === "" ? null : v
  }

  // Marking sent without explicit dates → apply Net-N terms.
  if (parsed.data.status === "sent") {
    const issued = parsed.data.issued_date || existing?.issued_date || todayISO()
    if (parsed.data.issued_date === undefined && !existing?.issued_date) {
      patch.issued_date = issued
    }
    if (parsed.data.due_date === undefined && !existing?.due_date) {
      const settings = await getSettings()
      patch.due_date = addDaysISO(issued, settings?.net_days ?? 15)
    }
  }

  if (
    parsed.data.status === "paid" &&
    (parsed.data.paid_date === null ||
      parsed.data.paid_date === "" ||
      (parsed.data.paid_date === undefined && !existing?.paid_date))
  ) {
    patch.paid_date = todayISO()
  }

  const { error } = await guard.ctx.supabase
    .from("invoices")
    .update(patch)
    .eq("id", id)
  if (error) return fail(error.message)

  revalidatePath("/invoices")
  revalidatePath(`/invoices/${id}`)
  return ok()
}

/**
 * Toggle whether an invoice charges HST. When exempt, HST is zeroed and the
 * total drops to the pre-tax amount; when re-enabled, HST is recomputed from
 * the tenant's current rate. Recomputed totals are stored so PDFs, the list,
 * and accountant reports all reflect it.
 */
export async function setInvoiceTaxExemptAction(
  id: string,
  exempt: boolean
): Promise<ActionResult> {
  const guard = await staffContext()
  if (!guard.ok) return guard.result
  const { supabase } = guard.ctx

  const { data: inv } = await supabase
    .from("invoices")
    .select("amount_pretax")
    .eq("id", id)
    .maybeSingle()
  if (!inv) return fail("Invoice not found")

  const pretax = Number(inv.amount_pretax)
  let rate = 0
  if (!exempt) {
    const settings = await getSettings()
    rate = settings?.hst_rate ?? 13
  }
  const hst = Math.round(pretax * rate) / 100 // pretax * (rate/100), 2dp
  const total = Math.round((pretax + hst) * 100) / 100

  const { error } = await supabase
    .from("invoices")
    .update({ tax_exempt: exempt, hst_amount: hst, total })
    .eq("id", id)
  if (error) return fail(error.message)

  revalidatePath("/invoices")
  revalidatePath(`/invoices/${id}`)
  return ok()
}

export async function sendInvoiceAction(id: string): Promise<ActionResult> {
  const guard = await staffContext()
  if (!guard.ok) return guard.result

  let loaded = await loadInvoiceDoc(id)
  if (!loaded) return fail("Invoice not found")
  if (!loaded.clientEmail) {
    return fail("This client has no email. Add one on the Clients page first.")
  }

  const issued = loaded.invoice.issued_date || todayISO()
  const settings = await getSettings()
  const due =
    loaded.invoice.due_date || addDaysISO(issued, settings?.net_days ?? 15)
  const datePatch: Partial<Invoice> = {}
  if (!loaded.invoice.issued_date) datePatch.issued_date = issued
  if (!loaded.invoice.due_date) datePatch.due_date = due
  if (Object.keys(datePatch).length > 0) {
    const { error } = await guard.ctx.supabase
      .from("invoices")
      .update(datePatch)
      .eq("id", id)
    if (error) return fail(error.message)

    loaded = await loadInvoiceDoc(id)
    if (!loaded) return fail("Invoice not found")
  }
  if (!loaded.clientEmail) {
    return fail("This client has no email. Add one on the Clients page first.")
  }

  const pdf = await renderInvoicePdf(loaded.doc)
  const sent = await sendInvoiceEmail({
    to: loaded.clientEmail,
    doc: loaded.doc,
    pdf,
  })
  if (!sent.ok) return fail(sent.error)

  const patch: Partial<Invoice> = {
    status: loaded.invoice.status === "paid" ? "paid" : "sent",
    issued_date: loaded.invoice.issued_date || issued,
    due_date: loaded.invoice.due_date || due,
  }
  if (loaded.invoice.status === "paid" && !loaded.invoice.paid_date) {
    patch.paid_date = todayISO()
  }
  const { error } = await guard.ctx.supabase
    .from("invoices")
    .update(patch)
    .eq("id", id)
  if (error) return fail(error.message)

  revalidatePath("/invoices")
  revalidatePath(`/invoices/${id}`)
  return ok()
}

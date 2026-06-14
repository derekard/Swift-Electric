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

  const patch: Partial<Invoice> = {}
  for (const [k, v] of Object.entries(parsed.data)) {
    ;(patch as Record<string, unknown>)[k] = v === "" ? null : v
  }

  // Marking sent without explicit dates → apply Net-N terms.
  if (parsed.data.status === "sent") {
    const issued = parsed.data.issued_date || todayISO()
    if (parsed.data.issued_date === undefined) patch.issued_date = issued
    if (parsed.data.due_date === undefined) {
      const settings = await getSettings()
      patch.due_date = addDaysISO(issued, settings?.net_days ?? 15)
    }
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

export async function sendInvoiceAction(id: string): Promise<ActionResult> {
  const guard = await staffContext()
  if (!guard.ok) return guard.result

  const loaded = await loadInvoiceDoc(id)
  if (!loaded) return fail("Invoice not found")
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

  // Mark sent + apply Net-N terms when dates aren't already set.
  const issued = loaded.invoice.issued_date || todayISO()
  const settings = await getSettings()
  const patch: Partial<Invoice> = {
    status: "sent",
    issued_date: issued,
    due_date:
      loaded.invoice.due_date || addDaysISO(issued, settings?.net_days ?? 15),
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

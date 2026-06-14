"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { ownerContext } from "@/lib/guards"
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

export async function updateInvoiceAction(
  id: string,
  input: InvoiceUpdateInput
): Promise<ActionResult> {
  const parsed = updateSchema.safeParse(input)
  if (!parsed.success) return fail(parsed.error.issues[0].message)

  const guard = await ownerContext()
  if (!guard.ok) return guard.result

  const patch: Partial<Invoice> = {}
  for (const [k, v] of Object.entries(parsed.data)) {
    ;(patch as Record<string, unknown>)[k] = v === "" ? null : v
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
  const guard = await ownerContext()
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

  const patch: Partial<Invoice> = { status: "sent" }
  if (!loaded.invoice.issued_date) {
    patch.issued_date = new Date().toISOString().slice(0, 10)
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

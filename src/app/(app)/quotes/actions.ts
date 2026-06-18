"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { staffContext } from "@/lib/guards"
import { getSettings } from "@/lib/settings"
import { loadQuote } from "@/lib/quote-load"
import { ensureQuoteAcceptedWithArtifacts } from "@/lib/quote-acceptance"
import { renderQuotePdf } from "@/lib/pdf/render"
import { sendQuoteEmail } from "@/lib/email"
import { ok, fail, type ActionResult } from "@/lib/actions"
import type { Quote, QuoteStatus } from "@/lib/supabase/types"

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------
const metaSchema = z.object({
  client_id: z.string().uuid().nullable(),
  site_address: z.string().trim().nullable(),
  intro: z.string().trim().nullable(),
  notes: z.string().trim().nullable(),
  billing_type: z.enum(["fixed", "tm"]),
  tm_labor_rate: z.number().min(0).nullable(),
  tm_materials_markup_pct: z.number().min(0).max(100).nullable(),
  jic_pct: z.number().min(0).max(100),
  admin_pct: z.number().min(0).max(100),
  small_parts_pct: z.number().min(0).max(100),
  permit_fee: z.number().min(0),
  hst_rate: z.number().min(0).max(100),
  show_hst_line: z.boolean(),
})

const lineSchema = z.object({
  price_book_item_id: z.string().uuid().nullable(),
  description: z.string().trim().min(1),
  qty: z.number().min(0),
  unit_price: z.number(),
})

const areaSchema = z.object({
  name: z.string().trim().min(1),
  lines: z.array(lineSchema),
})

const saveSchema = z.object({
  meta: metaSchema,
  areas: z.array(areaSchema),
})

const ACCEPTED_QUOTE_LOCK_MESSAGE =
  "Accepted quotes are locked because a job and invoice have already been created. Duplicate the quote to make changes."

export type QuoteMetaInput = z.infer<typeof metaSchema>
export type QuoteAreaInput = z.infer<typeof areaSchema>
export type QuoteLineInput = z.infer<typeof lineSchema>
export type QuoteSaveInput = z.infer<typeof saveSchema>

// ---------------------------------------------------------------------------
// Schema-drift safety net
// ---------------------------------------------------------------------------
// Columns introduced by later migrations (0002–0005: payment method, wages,
// Time & Materials, mileage). If a live DB hasn't applied those yet, PostgREST
// rejects writes that mention them with "Could not find the 'X' column ... in
// the schema cache" (code PGRST204). We strip those columns and retry, so core
// quoting keeps working until the ordered migrations are applied.
const OPTIONAL_COLUMNS = [
  "billing_type",
  "tm_labor_rate",
  "tm_materials_markup_pct",
  "labor_amount",
  "materials_amount",
  "payment_method",
] as const

function isMissingColumn(
  error: { code?: string; message?: string } | null
): boolean {
  return (
    !!error &&
    (error.code === "PGRST204" ||
      /could not find the '.*' column/i.test(error.message ?? ""))
  )
}

function withoutOptional<T extends Record<string, unknown>>(row: T): T {
  const copy = { ...row }
  for (const col of OPTIONAL_COLUMNS) delete (copy as Record<string, unknown>)[col]
  return copy
}

// ---------------------------------------------------------------------------
// Create — starts a draft, snapshotting the current fee settings
// ---------------------------------------------------------------------------
export async function createQuoteAction(input: {
  client_id?: string | null
  site_address?: string | null
}): Promise<ActionResult<{ id: string }>> {
  const guard = await staffContext()
  if (!guard.ok) return guard.result
  const { supabase, profile } = guard.ctx

  const settings = await getSettings()

  const row = {
    client_id: input.client_id ?? null,
    site_address: input.site_address ?? null,
    status: "draft" as const,
    tm_labor_rate: settings?.tm_labor_rate ?? 0,
    tm_materials_markup_pct: settings?.tm_materials_markup_pct ?? 0,
    jic_pct: settings?.jic_pct ?? 10,
    admin_pct: settings?.admin_pct ?? 10,
    small_parts_pct: settings?.small_parts_pct ?? 3,
    permit_fee: settings?.permit_fee ?? 200,
    hst_rate: settings?.hst_rate ?? 13,
    show_hst_line: settings?.show_hst_line ?? false,
    created_by: profile.id,
  }

  let { data, error } = await supabase
    .from("quotes")
    .insert(row)
    .select("id")
    .single()

  // DB without the T&M migration yet → drop those columns and retry.
  if (isMissingColumn(error)) {
    ;({ data, error } = await supabase
      .from("quotes")
      .insert(withoutOptional(row))
      .select("id")
      .single())
  }

  if (error || !data) return fail(error?.message ?? "Could not create quote")
  revalidatePath("/quotes")
  return ok({ id: data.id })
}

// ---------------------------------------------------------------------------
// Save — replaces meta + the full areas/lines tree (simple + robust for the
// small quotes this app produces; lines aren't referenced elsewhere).
// ---------------------------------------------------------------------------
export async function saveQuoteAction(
  id: string,
  input: QuoteSaveInput
): Promise<ActionResult> {
  const parsed = saveSchema.safeParse(input)
  if (!parsed.success) return fail(parsed.error.issues[0].message)

  const guard = await staffContext()
  if (!guard.ok) return guard.result
  const { supabase } = guard.ctx
  const { meta, areas } = parsed.data

  const { data: current, error: currentErr } = await supabase
    .from("quotes")
    .select("status")
    .eq("id", id)
    .maybeSingle()
  if (currentErr) return fail(currentErr.message)
  if (!current) return fail("Quote not found")
  if (current.status === "accepted") return fail(ACCEPTED_QUOTE_LOCK_MESSAGE)

  const { data: oldAreas, error: oldAreasErr } = await supabase
    .from("quote_areas")
    .select("id")
    .eq("quote_id", id)
  if (oldAreasErr) return fail(oldAreasErr.message)
  const oldAreaIds = (oldAreas ?? []).map((area) => area.id)

  let { data: updated, error: metaErr } = await supabase
    .from("quotes")
    .update(meta)
    .eq("id", id)
    .neq("status", "accepted")
    .select("id")
    .maybeSingle()
  // DB without the T&M migration yet → drop those columns and retry.
  if (isMissingColumn(metaErr)) {
    ;({ data: updated, error: metaErr } = await supabase
      .from("quotes")
      .update(withoutOptional(meta))
      .eq("id", id)
      .neq("status", "accepted")
      .select("id")
      .maybeSingle())
  }
  if (metaErr) return fail(metaErr.message)
  if (!updated) return fail(ACCEPTED_QUOTE_LOCK_MESSAGE)

  const insertedAreaIds: string[] = []

  async function cleanupInsertedAreas() {
    if (insertedAreaIds.length === 0) return null

    const { error } = await supabase
      .from("quote_areas")
      .delete()
      .eq("quote_id", id)
      .in("id", insertedAreaIds)
    return error
  }

  function failWithCleanup(
    error: { message: string },
    cleanupError: { message: string } | null
  ) {
    if (!cleanupError) return fail(error.message)
    return fail(`${error.message}; cleanup also failed: ${cleanupError.message}`)
  }

  for (const [areaIndex, area] of areas.entries()) {
    const { data: areaRow, error: areaErr } = await supabase
      .from("quote_areas")
      .insert({ quote_id: id, name: area.name, sort: areaIndex })
      .select("id")
      .single()
    if (areaErr) {
      const cleanupErr = await cleanupInsertedAreas()
      return failWithCleanup(areaErr, cleanupErr)
    }
    insertedAreaIds.push(areaRow.id)

    if (area.lines.length > 0) {
      const { error: lineErr } = await supabase.from("quote_lines").insert(
        area.lines.map((line, lineIndex) => ({
          area_id: areaRow.id,
          price_book_item_id: line.price_book_item_id,
          description: line.description,
          qty: line.qty,
          unit_price: line.unit_price,
          sort: lineIndex,
        }))
      )
      if (lineErr) {
        const cleanupErr = await cleanupInsertedAreas()
        return failWithCleanup(lineErr, cleanupErr)
      }
    }
  }

  const { data: beforeReplace, error: beforeReplaceErr } = await supabase
    .from("quotes")
    .select("status")
    .eq("id", id)
    .maybeSingle()
  if (beforeReplaceErr) {
    const cleanupErr = await cleanupInsertedAreas()
    return failWithCleanup(beforeReplaceErr, cleanupErr)
  }
  if (!beforeReplace) {
    const cleanupErr = await cleanupInsertedAreas()
    return failWithCleanup({ message: "Quote not found" }, cleanupErr)
  }
  if (beforeReplace.status === "accepted") {
    const cleanupErr = await cleanupInsertedAreas()
    return failWithCleanup({ message: ACCEPTED_QUOTE_LOCK_MESSAGE }, cleanupErr)
  }

  // Replace the area/line tree only after the full new tree has been built.
  if (oldAreaIds.length > 0) {
    const { error: delErr } = await supabase
      .from("quote_areas")
      .delete()
      .eq("quote_id", id)
      .in("id", oldAreaIds)
    if (delErr) {
      const cleanupErr = await cleanupInsertedAreas()
      return failWithCleanup(delErr, cleanupErr)
    }
  }

  revalidatePath(`/quotes/${id}`)
  revalidatePath(`/quotes/${id}/edit`)
  revalidatePath("/quotes")
  return ok()
}

// ---------------------------------------------------------------------------
// Status, duplicate, delete
// ---------------------------------------------------------------------------
export async function setQuoteStatusAction(
  id: string,
  status: QuoteStatus
): Promise<ActionResult> {
  // Accepting a quote must also create the job + invoice — delegate so this
  // happens no matter how the status is changed (menu, status dropdown, button).
  if (status === "accepted") {
    const res = await acceptQuoteAction(id)
    return res.ok ? ok() : res
  }

  const guard = await staffContext()
  if (!guard.ok) return guard.result

  const { data: current, error: currentErr } = await guard.ctx.supabase
    .from("quotes")
    .select("status")
    .eq("id", id)
    .maybeSingle()
  if (currentErr) return fail(currentErr.message)
  if (!current) return fail("Quote not found")
  if (current.status === "accepted") return fail(ACCEPTED_QUOTE_LOCK_MESSAGE)

  const patch: Partial<Quote> = { status }
  if (status === "sent") patch.sent_at = new Date().toISOString()

  const { data: updated, error } = await guard.ctx.supabase
    .from("quotes")
    .update(patch)
    .eq("id", id)
    .neq("status", "accepted")
    .select("id")
    .maybeSingle()

  if (error) return fail(error.message)
  if (!updated) return fail(ACCEPTED_QUOTE_LOCK_MESSAGE)
  revalidatePath("/quotes")
  revalidatePath(`/quotes/${id}`)
  return ok()
}

/**
 * Accept a quote: ensure the scheduled job and draft invoice exist, then mark
 * the quote accepted. Idempotent retries repair a missing invoice or quote
 * status instead of treating a stranded job as success.
 */
export async function acceptQuoteAction(
  id: string
): Promise<ActionResult<{ jobId: string }>> {
  const guard = await staffContext()
  if (!guard.ok) return guard.result
  const { supabase, profile } = guard.ctx

  const loaded = await loadQuote(id)
  if (!loaded) return fail("Quote not found")
  const { quote, client, totals } = loaded

  const accepted = await ensureQuoteAcceptedWithArtifacts({
    supabase,
    quote,
    totals,
    clientName: client?.name,
    createdBy: profile.id,
    mode: "staff",
  })
  if (!accepted.ok) return fail(accepted.error)

  revalidatePath("/quotes")
  revalidatePath(`/quotes/${id}`)
  revalidatePath("/jobs")
  revalidatePath(`/jobs/${accepted.jobId}`)
  revalidatePath("/invoices")
  revalidatePath(`/invoices/${accepted.invoiceId}`)
  revalidatePath("/schedule")
  return ok({ jobId: accepted.jobId })
}

export async function sendQuoteAction(id: string): Promise<ActionResult> {
  const guard = await staffContext()
  if (!guard.ok) return guard.result

  const loaded = await loadQuote(id)
  if (!loaded) return fail("Quote not found")
  if (!loaded.client?.email) {
    return fail("This client has no email. Add one on the Clients page first.")
  }

  const pdf = await renderQuotePdf(loaded.doc)
  const base = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? ""
  const sent = await sendQuoteEmail({
    to: loaded.client.email,
    doc: loaded.doc,
    pdf,
    acceptUrl: base ? `${base}/q/${loaded.quote.share_token}` : undefined,
  })
  if (!sent.ok) return fail(sent.error)

  const { error } = await guard.ctx.supabase
    .from("quotes")
    .update({ status: "sent", sent_at: new Date().toISOString() })
    .eq("id", id)
  if (error) return fail(error.message)

  revalidatePath("/quotes")
  revalidatePath(`/quotes/${id}`)
  return ok()
}

export async function deleteQuoteAction(id: string): Promise<ActionResult> {
  const guard = await staffContext()
  if (!guard.ok) return guard.result

  const { error } = await guard.ctx.supabase
    .from("quotes")
    .delete()
    .eq("id", id)

  if (error) return fail(error.message)
  revalidatePath("/quotes")
  return ok()
}

export async function duplicateQuoteAction(
  id: string
): Promise<ActionResult<{ id: string }>> {
  const guard = await staffContext()
  if (!guard.ok) return guard.result
  const { supabase, profile } = guard.ctx

  const { data: src, error: srcErr } = await supabase
    .from("quotes")
    .select("*")
    .eq("id", id)
    .single()
  if (srcErr || !src) return fail(srcErr?.message ?? "Quote not found")

  const { data: copy, error: copyErr } = await supabase
    .from("quotes")
    .insert({
      client_id: src.client_id,
      site_address: src.site_address,
      status: "draft",
      intro: src.intro,
      notes: src.notes,
      jic_pct: src.jic_pct,
      admin_pct: src.admin_pct,
      small_parts_pct: src.small_parts_pct,
      permit_fee: src.permit_fee,
      hst_rate: src.hst_rate,
      show_hst_line: src.show_hst_line,
      created_by: profile.id,
    })
    .select("id")
    .single()
  if (copyErr) return fail(copyErr.message)

  const { data: srcAreas } = await supabase
    .from("quote_areas")
    .select("id, name, sort")
    .eq("quote_id", id)
    .order("sort")

  for (const area of srcAreas ?? []) {
    const { data: areaRow, error: areaErr } = await supabase
      .from("quote_areas")
      .insert({ quote_id: copy.id, name: area.name, sort: area.sort })
      .select("id")
      .single()
    if (areaErr) return fail(areaErr.message)

    const { data: srcLines } = await supabase
      .from("quote_lines")
      .select("price_book_item_id, description, qty, unit_price, sort")
      .eq("area_id", area.id)
      .order("sort")

    if (srcLines && srcLines.length > 0) {
      const { error: lineErr } = await supabase.from("quote_lines").insert(
        srcLines.map((l) => ({
          area_id: areaRow.id,
          price_book_item_id: l.price_book_item_id,
          description: l.description,
          qty: l.qty,
          unit_price: l.unit_price,
          sort: l.sort,
        }))
      )
      if (lineErr) return fail(lineErr.message)
    }
  }

  revalidatePath("/quotes")
  return ok({ id: copy.id })
}

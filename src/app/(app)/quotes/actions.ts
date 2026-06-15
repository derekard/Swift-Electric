"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { staffContext } from "@/lib/guards"
import { getSettings } from "@/lib/settings"
import { loadQuote } from "@/lib/quote-load"
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

export type QuoteMetaInput = z.infer<typeof metaSchema>
export type QuoteAreaInput = z.infer<typeof areaSchema>
export type QuoteLineInput = z.infer<typeof lineSchema>
export type QuoteSaveInput = z.infer<typeof saveSchema>

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

  const { data, error } = await supabase
    .from("quotes")
    .insert({
      client_id: input.client_id ?? null,
      site_address: input.site_address ?? null,
      status: "draft",
      tm_labor_rate: settings?.tm_labor_rate ?? 0,
      tm_materials_markup_pct: settings?.tm_materials_markup_pct ?? 0,
      jic_pct: settings?.jic_pct ?? 10,
      admin_pct: settings?.admin_pct ?? 10,
      small_parts_pct: settings?.small_parts_pct ?? 3,
      permit_fee: settings?.permit_fee ?? 200,
      hst_rate: settings?.hst_rate ?? 13,
      show_hst_line: settings?.show_hst_line ?? false,
      created_by: profile.id,
    })
    .select("id")
    .single()

  if (error) return fail(error.message)
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

  const { error: metaErr } = await supabase
    .from("quotes")
    .update(meta)
    .eq("id", id)
  if (metaErr) return fail(metaErr.message)

  // Replace the area/line tree.
  const { error: delErr } = await supabase
    .from("quote_areas")
    .delete()
    .eq("quote_id", id)
  if (delErr) return fail(delErr.message)

  for (const [areaIndex, area] of areas.entries()) {
    const { data: areaRow, error: areaErr } = await supabase
      .from("quote_areas")
      .insert({ quote_id: id, name: area.name, sort: areaIndex })
      .select("id")
      .single()
    if (areaErr) return fail(areaErr.message)

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
      if (lineErr) return fail(lineErr.message)
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

  const patch: Partial<Quote> = { status }
  if (status === "sent") patch.sent_at = new Date().toISOString()

  const { error } = await guard.ctx.supabase
    .from("quotes")
    .update(patch)
    .eq("id", id)

  if (error) return fail(error.message)
  revalidatePath("/quotes")
  revalidatePath(`/quotes/${id}`)
  return ok()
}

/**
 * Accept a quote: snapshot its totals into a draft invoice, create a scheduled
 * job, and mark the quote accepted. Idempotent — reuses the existing job if the
 * quote was already accepted.
 */
export async function acceptQuoteAction(
  id: string
): Promise<ActionResult<{ jobId: string }>> {
  const guard = await staffContext()
  if (!guard.ok) return guard.result
  const { supabase, profile } = guard.ctx

  const existing = await supabase
    .from("jobs")
    .select("id")
    .eq("quote_id", id)
    .maybeSingle()
  if (existing.data) return ok({ jobId: existing.data.id })

  const loaded = await loadQuote(id)
  if (!loaded) return fail("Quote not found")
  const { quote, client, totals } = loaded

  const title =
    (client?.name ? `${client.name}` : "Job") +
    (quote.site_address ? ` — ${quote.site_address}` : ` — ${quote.quote_number}`)

  const isTM = quote.billing_type === "tm"

  const { data: job, error: jobErr } = await supabase
    .from("jobs")
    .insert({
      quote_id: quote.id,
      client_id: quote.client_id,
      title,
      status: "scheduled",
      site_address: quote.site_address,
      billing_type: quote.billing_type,
      tm_labor_rate: quote.tm_labor_rate,
      tm_materials_markup_pct: quote.tm_materials_markup_pct,
      created_by: profile.id,
    })
    .select("id")
    .single()
  if (jobErr) return fail(jobErr.message)

  // Fixed-price → snapshot the quote totals now. T&M → empty invoice, built
  // later from logged hours + materials on the job.
  const { error: invErr } = await supabase.from("invoices").insert(
    isTM
      ? {
          job_id: job.id,
          quote_id: quote.id,
          client_id: quote.client_id,
          status: "draft",
          billing_type: "tm",
          created_by: profile.id,
        }
      : {
          job_id: job.id,
          quote_id: quote.id,
          client_id: quote.client_id,
          status: "draft",
          billing_type: "fixed",
          items_subtotal: totals.items_subtotal,
          jic_amount: totals.jic_amount,
          admin_amount: totals.admin_amount,
          small_parts_amount: totals.small_parts_amount,
          permit_amount: totals.permit_amount,
          amount_pretax: totals.amount_pretax,
          hst_amount: totals.hst_amount,
          total: totals.total,
          created_by: profile.id,
        }
  )
  if (invErr) return fail(invErr.message)

  const { error: quoteErr } = await supabase
    .from("quotes")
    .update({ status: "accepted", accepted_at: new Date().toISOString() })
    .eq("id", id)
  if (quoteErr) return fail(quoteErr.message)

  revalidatePath("/quotes")
  revalidatePath("/jobs")
  revalidatePath("/invoices")
  return ok({ jobId: job.id })
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

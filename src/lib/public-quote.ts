import "server-only"

import { createServiceClient } from "@/lib/supabase/server"
import { computeQuoteTotals, type QuoteTotals } from "@/lib/quote-totals"
import { buildQuoteDoc, type AreaWithLines, type QuoteDoc } from "@/lib/quote-doc"
import type { Quote } from "@/lib/supabase/types"

export type PublicQuote = {
  quoteId: string
  status: Quote["status"]
  acceptedName: string | null
  doc: QuoteDoc
  brand: { companyName: string; brandColor: string; logoUrl: string | null }
}

/** Items subtotal + computed totals for a quote, from its lines + fee snapshot. */
async function quoteTotals(
  supabase: ReturnType<typeof createServiceClient>,
  quote: Quote
): Promise<{ totals: QuoteTotals; areas: AreaWithLines[] }> {
  const { data: areaRows } = await supabase
    .from("quote_areas")
    .select("*")
    .eq("quote_id", quote.id)
    .order("sort")
  const areaIds = (areaRows ?? []).map((a) => a.id)
  const { data: lineRows } = areaIds.length
    ? await supabase
        .from("quote_lines")
        .select("*")
        .in("area_id", areaIds)
        .order("sort")
    : { data: [] }

  const areas: AreaWithLines[] = (areaRows ?? []).map((a) => ({
    ...a,
    lines: (lineRows ?? []).filter((l) => l.area_id === a.id),
  }))
  const itemsSubtotal = (lineRows ?? []).reduce(
    (s, l) => s + Number(l.line_total),
    0
  )
  const totals = computeQuoteTotals(itemsSubtotal, {
    jic_pct: quote.jic_pct,
    admin_pct: quote.admin_pct,
    small_parts_pct: quote.small_parts_pct,
    permit_fee: quote.permit_fee,
    hst_rate: quote.hst_rate,
  })
  return { totals, areas }
}

/** Load a quote for the public accept page by its share token (no auth). */
export async function loadPublicQuote(
  token: string
): Promise<PublicQuote | null> {
  const supabase = createServiceClient()

  const { data: quote } = await supabase
    .from("quotes")
    .select("*")
    .eq("share_token", token)
    .maybeSingle()
  if (!quote) return null

  const { totals, areas } = await quoteTotals(supabase, quote)

  const [{ data: client }, { data: settings }] = await Promise.all([
    quote.client_id
      ? supabase.from("clients").select("*").eq("id", quote.client_id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from("tenant_settings")
      .select("*")
      .eq("tenant_id", quote.tenant_id)
      .maybeSingle(),
  ])

  const doc = buildQuoteDoc({ quote, client, settings, areas, totals })

  return {
    quoteId: quote.id,
    status: quote.status,
    acceptedName: quote.accepted_name,
    doc,
    brand: {
      companyName: settings?.company_name ?? quote.quote_number,
      brandColor: settings?.brand_color ?? "#C49A2C",
      logoUrl: settings?.logo_url ?? null,
    },
  }
}

/**
 * Accept a quote by token from the public page: snapshot totals into a draft
 * invoice + create a scheduled job + record the typed signature. Idempotent.
 * Uses the service-role client (anonymous caller), so tenant_id is set explicitly.
 */
export async function acceptPublicQuote(
  token: string,
  signature: string
): Promise<{ ok: boolean; error?: string }> {
  const name = signature.trim()
  if (!name) return { ok: false, error: "Please type your name to accept." }

  const supabase = createServiceClient()
  const { data: quote } = await supabase
    .from("quotes")
    .select("*")
    .eq("share_token", token)
    .maybeSingle()
  if (!quote) return { ok: false, error: "Quote not found." }

  // already accepted / job already exists → idempotent success
  if (quote.status === "accepted") return { ok: true }
  const { data: existingJob } = await supabase
    .from("jobs")
    .select("id")
    .eq("quote_id", quote.id)
    .maybeSingle()

  if (!existingJob) {
    const { totals } = await quoteTotals(supabase, quote)
    const title =
      (quote.site_address ? quote.site_address : quote.quote_number) +
      " — accepted online"

    const { data: job, error: jobErr } = await supabase
      .from("jobs")
      .insert({
        tenant_id: quote.tenant_id,
        quote_id: quote.id,
        client_id: quote.client_id,
        title,
        status: "scheduled",
        site_address: quote.site_address,
      })
      .select("id")
      .single()
    if (jobErr) return { ok: false, error: jobErr.message }

    const { error: invErr } = await supabase.from("invoices").insert({
      tenant_id: quote.tenant_id,
      job_id: job.id,
      quote_id: quote.id,
      client_id: quote.client_id,
      status: "draft",
      items_subtotal: totals.items_subtotal,
      jic_amount: totals.jic_amount,
      admin_amount: totals.admin_amount,
      small_parts_amount: totals.small_parts_amount,
      permit_amount: totals.permit_amount,
      amount_pretax: totals.amount_pretax,
      hst_amount: totals.hst_amount,
      total: totals.total,
    })
    if (invErr) return { ok: false, error: invErr.message }
  }

  const { error } = await supabase
    .from("quotes")
    .update({
      status: "accepted",
      accepted_at: new Date().toISOString(),
      accepted_name: name,
    })
    .eq("id", quote.id)
  if (error) return { ok: false, error: error.message }

  return { ok: true }
}

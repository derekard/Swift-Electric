import "server-only"

import { createServiceClient } from "@/lib/supabase/server"
import { ensureQuoteAcceptedWithArtifacts } from "@/lib/quote-acceptance"
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
    .eq("tenant_id", quote.tenant_id)
    .order("sort")
  const areaIds = (areaRows ?? []).map((a) => a.id)
  const { data: lineRows } = areaIds.length
    ? await supabase
        .from("quote_lines")
        .select("*")
        .in("area_id", areaIds)
        .eq("tenant_id", quote.tenant_id)
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
      ? supabase
          .from("clients")
          .select("*")
          .eq("id", quote.client_id)
          .eq("tenant_id", quote.tenant_id)
          .maybeSingle()
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
 * Accept a quote by token from the public page: ensure the scheduled job and
 * draft invoice exist, then record the typed signature. Idempotent retries can
 * repair a previously stranded job/invoice pair.
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

  const { totals } = await quoteTotals(supabase, quote)
  const accepted = await ensureQuoteAcceptedWithArtifacts({
    supabase,
    quote,
    totals,
    acceptedName: name,
    createdBy: null,
    mode: "public",
  })
  if (!accepted.ok) return { ok: false, error: accepted.error }

  return { ok: true }
}

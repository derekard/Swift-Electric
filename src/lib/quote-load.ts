import { createClient } from "@/lib/supabase/server"
import { getSettings } from "@/lib/settings"
import { computeQuoteTotals } from "@/lib/quote-totals"
import { buildQuoteDoc, type AreaWithLines, type QuoteDoc } from "@/lib/quote-doc"
import type {
  TenantSettings,
  Client,
  Quote,
  QuoteTotals,
} from "@/lib/supabase/types"

export type LoadedQuote = {
  quote: Quote
  client: Client | null
  settings: TenantSettings | null
  areas: AreaWithLines[]
  totals: QuoteTotals
  doc: QuoteDoc
}

/** Load a quote with its tree, client, settings, computed totals and doc model. */
export async function loadQuote(id: string): Promise<LoadedQuote | null> {
  const supabase = await createClient()

  const { data: quote } = await supabase
    .from("quotes")
    .select("*")
    .eq("id", id)
    .maybeSingle()
  if (!quote) return null

  const [{ data: areaRows }, { data: totalsRow }, settings] = await Promise.all([
    supabase.from("quote_areas").select("*").eq("quote_id", id).order("sort"),
    supabase.from("quote_totals").select("*").eq("quote_id", id).maybeSingle(),
    getSettings(),
  ])

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

  let client: Client | null = null
  if (quote.client_id) {
    const { data } = await supabase
      .from("clients")
      .select("*")
      .eq("id", quote.client_id)
      .maybeSingle()
    client = data
  }

  // The view returns a row per quote; fall back to a local compute if missing.
  const totals: QuoteTotals =
    totalsRow ??
    ({
      quote_id: id,
      ...computeQuoteTotals(0, {
        jic_pct: quote.jic_pct,
        admin_pct: quote.admin_pct,
        small_parts_pct: quote.small_parts_pct,
        permit_fee: quote.permit_fee,
        hst_rate: quote.hst_rate,
      }),
    } as QuoteTotals)

  const doc = buildQuoteDoc({ quote, client, settings, areas, totals })

  return { quote, client, settings, areas, totals, doc }
}

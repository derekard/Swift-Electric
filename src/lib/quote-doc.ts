import type {
  TenantSettings,
  Client,
  Quote,
  QuoteArea,
  QuoteLine,
} from "@/lib/supabase/types"
import { formatDate } from "@/lib/format"

export type QuoteDocArea = { name: string; bullets: string[] }

export type QuoteDoc = {
  company: {
    name: string
    licenseNumber: string | null
    ownerName: string | null
    address: string | null
    phone: string | null
    email: string | null
    logoUrl: string | null
    brandColor: string
  }
  quoteNumber: string
  date: string
  validUntil: string
  netDays: number
  client: { name: string; address: string | null; email: string | null } | null
  siteAddress: string | null
  intro: string
  areas: QuoteDocArea[]
  notes: string | null
  amountPretax: number
  hstAmount: number
  total: number
  hstRate: number
  showHstLine: boolean
}

/** Quantity-aware bullet text, e.g. "7 × Pot light" or "Install permit". */
export function bulletText(line: Pick<QuoteLine, "description" | "qty">): string {
  const qty = Number(line.qty)
  const desc = line.description.trim()
  if (!qty || qty === 1) return desc
  const q = Number.isInteger(qty) ? String(qty) : qty.toFixed(2)
  return `${q} × ${desc}`
}

export type AreaWithLines = QuoteArea & { lines: QuoteLine[] }

/**
 * Assemble the client-facing letter model from the quote + its tree. Shared by
 * the on-screen preview and the PDF so they never drift.
 */
export function buildQuoteDoc(args: {
  quote: Quote
  client: Client | null
  settings: TenantSettings | null
  areas: AreaWithLines[]
  totals: { amount_pretax: number; hst_amount: number; total: number }
}): QuoteDoc {
  const { quote, client, settings, areas, totals } = args

  const intro =
    (quote.intro?.trim() || settings?.quote_intro?.trim() || "") +
    (quote.site_address ? ` at ${quote.site_address}:` : ":")

  // Estimates are valid for 30 days from issue.
  const created = new Date(quote.created_at)
  const valid = new Date(created)
  valid.setDate(valid.getDate() + 30)

  return {
    company: {
      name: settings?.company_name ?? "Swift Electric",
      licenseNumber: settings?.license_number ?? null,
      ownerName: settings?.owner_name ?? null,
      address: settings?.address ?? null,
      phone: settings?.phone ?? null,
      email: settings?.email ?? null,
      logoUrl: settings?.logo_url ?? null,
      brandColor: settings?.brand_color ?? "#C49A2C",
    },
    quoteNumber: quote.quote_number,
    date: formatDate(quote.created_at),
    validUntil: formatDate(valid.toISOString()),
    netDays: settings?.net_days ?? 15,
    client: client
      ? { name: client.name, address: client.address, email: client.email }
      : null,
    siteAddress: quote.site_address,
    intro,
    areas: areas
      .map((a) => ({
        name: a.name,
        bullets: a.lines
          .filter((l) => l.description.trim())
          .map((l) => bulletText(l)),
      }))
      .filter((a) => a.bullets.length > 0),
    notes: quote.notes,
    amountPretax: totals.amount_pretax,
    hstAmount: totals.hst_amount,
    total: totals.total,
    hstRate: Number(quote.hst_rate),
    showHstLine: quote.show_hst_line,
  }
}

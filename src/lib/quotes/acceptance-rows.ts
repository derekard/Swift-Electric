export type AcceptanceBillingType = "fixed" | "tm"
export type AcceptanceQuoteStatus = "draft" | "sent" | "accepted" | "declined"

export type AcceptanceQuote = {
  id: string
  tenant_id: string
  quote_number: string
  client_id: string | null
  site_address: string | null
  status: AcceptanceQuoteStatus
  billing_type?: AcceptanceBillingType | null
  tm_labor_rate?: number | string | null
  tm_materials_markup_pct?: number | string | null
  accepted_at?: string | null
  accepted_name?: string | null
}

export type AcceptanceTotals = {
  items_subtotal: number
  jic_amount: number
  admin_amount: number
  small_parts_amount: number
  permit_amount: number
  amount_pretax: number
  hst_amount: number
  total: number
}

export type AcceptanceMode = "staff" | "public"

export type QuoteJobRow = {
  tenant_id: string
  quote_id: string
  client_id: string | null
  title: string
  status: "scheduled"
  site_address: string | null
  billing_type: AcceptanceBillingType
  tm_labor_rate: number | null
  tm_materials_markup_pct: number | null
  created_by: string | null
}

export type QuoteInvoiceRow = AcceptanceTotals & {
  tenant_id: string
  job_id: string
  quote_id: string
  client_id: string | null
  status: "draft"
  billing_type: AcceptanceBillingType
  labor_amount: number
  materials_amount: number
  created_by: string | null
}

export type AcceptedQuotePatch = {
  status: "accepted"
  accepted_at?: string
  accepted_name?: string
}

export type ExistingAcceptanceJob = {
  billing_type?: string | null
  tm_labor_rate?: number | string | null
  tm_materials_markup_pct?: number | string | null
}

export type ExistingAcceptanceInvoice = {
  job_id?: string | null
  status?: string | null
  billing_type?: string | null
}

export type JobRepairPatch = Partial<
  Pick<QuoteJobRow, "billing_type" | "tm_labor_rate" | "tm_materials_markup_pct">
>

export type InvoiceRepairPatch = Partial<
  Pick<
    QuoteInvoiceRow,
    | "job_id"
    | "billing_type"
    | "labor_amount"
    | "materials_amount"
    | keyof AcceptanceTotals
  >
>

function numberOrNull(value: number | string | null | undefined): number | null {
  if (value == null) return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function sameNumber(
  left: number | string | null | undefined,
  right: number | null
): boolean {
  const leftNumber = numberOrNull(left)
  return (leftNumber ?? null) === right
}

export function quoteBillingType(quote: AcceptanceQuote): AcceptanceBillingType {
  return quote.billing_type === "tm" ? "tm" : "fixed"
}

export function quoteTmLaborRate(quote: AcceptanceQuote): number | null {
  const value = numberOrNull(quote.tm_labor_rate)
  return quoteBillingType(quote) === "tm" ? value ?? 0 : value
}

export function quoteTmMaterialsMarkup(quote: AcceptanceQuote): number | null {
  const value = numberOrNull(quote.tm_materials_markup_pct)
  return quoteBillingType(quote) === "tm" ? value ?? 0 : value
}

export function buildQuoteJobTitle(args: {
  quote: AcceptanceQuote
  clientName?: string | null
  mode: AcceptanceMode
}): string {
  const siteOrNumber = args.quote.site_address?.trim() || args.quote.quote_number
  if (args.mode === "public") return `${siteOrNumber} - accepted online`

  const clientOrJob = args.clientName?.trim() || "Job"
  return `${clientOrJob} - ${siteOrNumber}`
}

export function zeroInvoiceTotals(): AcceptanceTotals {
  return {
    items_subtotal: 0,
    jic_amount: 0,
    admin_amount: 0,
    small_parts_amount: 0,
    permit_amount: 0,
    amount_pretax: 0,
    hst_amount: 0,
    total: 0,
  }
}

export function buildInvoiceTotals(
  quote: AcceptanceQuote,
  totals: AcceptanceTotals
): AcceptanceTotals {
  return quoteBillingType(quote) === "tm" ? zeroInvoiceTotals() : totals
}

export function buildQuoteJobRow(args: {
  quote: AcceptanceQuote
  clientName?: string | null
  createdBy: string | null
  mode: AcceptanceMode
}): QuoteJobRow {
  const { quote } = args
  return {
    tenant_id: quote.tenant_id,
    quote_id: quote.id,
    client_id: quote.client_id,
    title: buildQuoteJobTitle({
      quote,
      clientName: args.clientName,
      mode: args.mode,
    }),
    status: "scheduled",
    site_address: quote.site_address,
    billing_type: quoteBillingType(quote),
    tm_labor_rate: quoteTmLaborRate(quote),
    tm_materials_markup_pct: quoteTmMaterialsMarkup(quote),
    created_by: args.createdBy,
  }
}

export function buildQuoteInvoiceRow(args: {
  quote: AcceptanceQuote
  totals: AcceptanceTotals
  jobId: string
  createdBy: string | null
}): QuoteInvoiceRow {
  const invoiceTotals = buildInvoiceTotals(args.quote, args.totals)
  return {
    tenant_id: args.quote.tenant_id,
    job_id: args.jobId,
    quote_id: args.quote.id,
    client_id: args.quote.client_id,
    status: "draft",
    billing_type: quoteBillingType(args.quote),
    labor_amount: 0,
    materials_amount: 0,
    created_by: args.createdBy,
    ...invoiceTotals,
  }
}

export function buildAcceptedQuotePatch(args: {
  quote: AcceptanceQuote
  acceptedName?: string | null
  acceptedAt: string
}): AcceptedQuotePatch {
  const patch: AcceptedQuotePatch = { status: "accepted" }

  if (!args.quote.accepted_at) patch.accepted_at = args.acceptedAt

  const name = args.acceptedName?.trim()
  if (name && !args.quote.accepted_name) patch.accepted_name = name

  return patch
}

export function buildJobRepairPatch(
  quote: AcceptanceQuote,
  existing: ExistingAcceptanceJob
): JobRepairPatch {
  const billingType = quoteBillingType(quote)
  const patch: JobRepairPatch = {}

  if (existing.billing_type !== billingType) patch.billing_type = billingType

  if (billingType === "tm") {
    const laborRate = quoteTmLaborRate(quote)
    const materialsMarkup = quoteTmMaterialsMarkup(quote)

    if (!sameNumber(existing.tm_labor_rate, laborRate)) {
      patch.tm_labor_rate = laborRate
    }
    if (!sameNumber(existing.tm_materials_markup_pct, materialsMarkup)) {
      patch.tm_materials_markup_pct = materialsMarkup
    }
  }

  return patch
}

export function buildInvoiceRepairPatch(args: {
  quote: AcceptanceQuote
  totals: AcceptanceTotals
  existing: ExistingAcceptanceInvoice
  jobId: string
}): InvoiceRepairPatch {
  const patch: InvoiceRepairPatch = {}

  if (args.existing.job_id !== args.jobId) patch.job_id = args.jobId

  if (
    quoteBillingType(args.quote) === "tm" &&
    args.existing.billing_type !== "tm" &&
    args.existing.status === "draft"
  ) {
    Object.assign(patch, buildInvoiceTotals(args.quote, args.totals), {
      billing_type: "tm" as const,
      labor_amount: 0,
      materials_amount: 0,
    })
  }

  return patch
}

export function hasPatch(patch: Record<string, unknown>): boolean {
  return Object.keys(patch).length > 0
}

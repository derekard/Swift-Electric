import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"

import {
  buildAcceptedQuotePatch,
  buildInvoiceRepairPatch,
  buildJobRepairPatch,
  buildQuoteInvoiceRow,
  buildQuoteJobRow,
  hasPatch,
  type AcceptanceMode,
  type AcceptanceTotals,
} from "@/lib/quotes/acceptance-rows"
import type { Database, Invoice, Job, Quote } from "@/lib/supabase/types"

type QuoteAcceptanceClient = SupabaseClient<Database>

type ExistingJob = Pick<
  Job,
  "id" | "billing_type" | "tm_labor_rate" | "tm_materials_markup_pct"
>

type ExistingInvoice = Pick<
  Invoice,
  "id" | "job_id" | "status" | "billing_type"
>

type DbError = { code?: string; message?: string } | null

export type QuoteAcceptanceResult =
  | { ok: true; jobId: string; invoiceId: string }
  | { ok: false; error: string }

type EnsureQuoteAcceptedArgs = {
  supabase: QuoteAcceptanceClient
  quote: Quote
  totals: AcceptanceTotals
  clientName?: string | null
  createdBy: string | null
  acceptedName?: string | null
  mode: AcceptanceMode
}

const OPTIONAL_COLUMNS = [
  "billing_type",
  "tm_labor_rate",
  "tm_materials_markup_pct",
  "labor_amount",
  "materials_amount",
  "payment_method",
] as const

function fail(error: string): QuoteAcceptanceResult {
  return { ok: false, error }
}

function isMissingColumn(error: DbError): boolean {
  return (
    !!error &&
    (error.code === "PGRST204" ||
      /could not find the '.*' column/i.test(error.message ?? ""))
  )
}

function withoutOptional<T extends object>(row: T): Partial<T> {
  const copy = { ...(row as Record<string, unknown>) }
  for (const col of OPTIONAL_COLUMNS) delete copy[col]
  return copy as Partial<T>
}

function patchHasValues(patch: object): boolean {
  return hasPatch(patch as Record<string, unknown>)
}

function publicCanAccept(status: Quote["status"]): boolean {
  return status === "draft" || status === "sent" || status === "accepted"
}

async function loadExistingJobs(
  supabase: QuoteAcceptanceClient,
  quoteId: string,
  tenantId: string
): Promise<{ jobs: ExistingJob[] } | { error: string }> {
  const full = await supabase
    .from("jobs")
    .select("id, billing_type, tm_labor_rate, tm_materials_markup_pct")
    .eq("quote_id", quoteId)
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: true })
    .limit(2)

  if (!isMissingColumn(full.error)) {
    if (full.error) return { error: full.error.message }
    return { jobs: (full.data ?? []) as ExistingJob[] }
  }

  const fallback = await supabase
    .from("jobs")
    .select("id")
    .eq("quote_id", quoteId)
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: true })
    .limit(2)

  if (fallback.error) return { error: fallback.error.message }
  return { jobs: (fallback.data ?? []) as ExistingJob[] }
}

async function loadExistingInvoices(
  supabase: QuoteAcceptanceClient,
  quoteId: string,
  tenantId: string
): Promise<{ invoices: ExistingInvoice[] } | { error: string }> {
  const full = await supabase
    .from("invoices")
    .select("id, job_id, status, billing_type")
    .eq("quote_id", quoteId)
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: true })
    .limit(2)

  if (!isMissingColumn(full.error)) {
    if (full.error) return { error: full.error.message }
    return { invoices: (full.data ?? []) as ExistingInvoice[] }
  }

  const fallback = await supabase
    .from("invoices")
    .select("id, job_id, status")
    .eq("quote_id", quoteId)
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: true })
    .limit(2)

  if (fallback.error) return { error: fallback.error.message }
  return { invoices: (fallback.data ?? []) as ExistingInvoice[] }
}

async function createJob(args: EnsureQuoteAcceptedArgs): Promise<
  | { ok: true; job: ExistingJob }
  | { ok: false; error: string }
> {
  const row = buildQuoteJobRow({
    quote: args.quote,
    clientName: args.clientName,
    createdBy: args.createdBy,
    mode: args.mode,
  })

  let { data, error } = await args.supabase
    .from("jobs")
    .insert(row)
    .select("id, billing_type, tm_labor_rate, tm_materials_markup_pct")
    .single()

  if (isMissingColumn(error)) {
    ;({ data, error } = await args.supabase
      .from("jobs")
      .insert(withoutOptional(row))
      .select("id")
      .single())
  }

  if (error || !data) {
    return { ok: false, error: error?.message ?? "Could not create job" }
  }

  return { ok: true, job: data as ExistingJob }
}

async function updateJob(
  supabase: QuoteAcceptanceClient,
  id: string,
  tenantId: string,
  patch: object
): Promise<string | null> {
  if (!patchHasValues(patch)) return null

  let { error } = await supabase
    .from("jobs")
    .update(patch)
    .eq("id", id)
    .eq("tenant_id", tenantId)

  if (isMissingColumn(error)) {
    const fallbackPatch = withoutOptional(patch)
    if (!patchHasValues(fallbackPatch)) return null
    ;({ error } = await supabase
      .from("jobs")
      .update(fallbackPatch)
      .eq("id", id)
      .eq("tenant_id", tenantId))
  }

  return error?.message ?? null
}

async function createInvoice(
  args: EnsureQuoteAcceptedArgs,
  jobId: string
): Promise<
  | { ok: true; invoice: ExistingInvoice }
  | { ok: false; error: string }
> {
  const row = buildQuoteInvoiceRow({
    quote: args.quote,
    totals: args.totals,
    jobId,
    createdBy: args.createdBy,
  })

  let { data, error } = await args.supabase
    .from("invoices")
    .insert(row)
    .select("id, job_id, status, billing_type")
    .single()

  if (isMissingColumn(error)) {
    ;({ data, error } = await args.supabase
      .from("invoices")
      .insert(withoutOptional(row))
      .select("id, job_id, status")
      .single())
  }

  if (error || !data) {
    return { ok: false, error: error?.message ?? "Could not create invoice" }
  }

  return { ok: true, invoice: data as ExistingInvoice }
}

async function updateInvoice(
  supabase: QuoteAcceptanceClient,
  id: string,
  tenantId: string,
  patch: object
): Promise<string | null> {
  if (!patchHasValues(patch)) return null

  let { error } = await supabase
    .from("invoices")
    .update(patch)
    .eq("id", id)
    .eq("tenant_id", tenantId)

  if (isMissingColumn(error)) {
    const fallbackPatch = withoutOptional(patch)
    if (!patchHasValues(fallbackPatch)) return null
    ;({ error } = await supabase
      .from("invoices")
      .update(fallbackPatch)
      .eq("id", id)
      .eq("tenant_id", tenantId))
  }

  return error?.message ?? null
}

async function markQuoteAccepted(
  args: EnsureQuoteAcceptedArgs
): Promise<string | null> {
  const patch = buildAcceptedQuotePatch({
    quote: args.quote,
    acceptedName: args.acceptedName,
    acceptedAt: new Date().toISOString(),
  })

  if (
    args.quote.status === "accepted" &&
    !patch.accepted_at &&
    !patch.accepted_name
  ) {
    return null
  }

  const { error } = await args.supabase
    .from("quotes")
    .update(patch)
    .eq("id", args.quote.id)
    .eq("tenant_id", args.quote.tenant_id)

  return error?.message ?? null
}

/**
 * Ensure accepting a quote leaves the three generated records consistent:
 * a scheduled job, a draft invoice, and an accepted quote. This intentionally
 * avoids returning success for half-finished accept attempts so a retry can
 * repair the missing artifact.
 */
export async function ensureQuoteAcceptedWithArtifacts(
  args: EnsureQuoteAcceptedArgs
): Promise<QuoteAcceptanceResult> {
  if (args.mode === "public" && !publicCanAccept(args.quote.status)) {
    return fail("This estimate is no longer available.")
  }

  const loadedJobs = await loadExistingJobs(
    args.supabase,
    args.quote.id,
    args.quote.tenant_id
  )
  if ("error" in loadedJobs) return fail(loadedJobs.error)
  if (loadedJobs.jobs.length > 1) {
    return fail(
      "Multiple jobs already exist for this quote. Please clean up duplicates before accepting."
    )
  }

  const loadedInvoices = await loadExistingInvoices(
    args.supabase,
    args.quote.id,
    args.quote.tenant_id
  )
  if ("error" in loadedInvoices) return fail(loadedInvoices.error)
  if (loadedInvoices.invoices.length > 1) {
    return fail(
      "Multiple invoices already exist for this quote. Please clean up duplicates before accepting."
    )
  }

  let job = loadedJobs.jobs[0] ?? null
  if (!job) {
    const created = await createJob(args)
    if (!created.ok) return fail(created.error)
    job = created.job
  } else {
    const jobPatch = buildJobRepairPatch(args.quote, job)
    const jobErr = await updateJob(
      args.supabase,
      job.id,
      args.quote.tenant_id,
      jobPatch
    )
    if (jobErr) return fail(jobErr)
  }

  let invoice = loadedInvoices.invoices[0] ?? null
  if (!invoice) {
    const created = await createInvoice(args, job.id)
    if (!created.ok) return fail(created.error)
    invoice = created.invoice
  } else {
    const invoicePatch = buildInvoiceRepairPatch({
      quote: args.quote,
      totals: args.totals,
      existing: invoice,
      jobId: job.id,
    })
    const invoiceErr = await updateInvoice(
      args.supabase,
      invoice.id,
      args.quote.tenant_id,
      invoicePatch
    )
    if (invoiceErr) return fail(invoiceErr)
  }

  const quoteErr = await markQuoteAccepted(args)
  if (quoteErr) return fail(quoteErr)

  return { ok: true, jobId: job.id, invoiceId: invoice.id }
}

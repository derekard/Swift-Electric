import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { test } from "node:test"
import ts from "typescript"

async function importTs(path) {
  const source = await readFile(new URL(path, import.meta.url), "utf8")
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
    },
  })

  const url = `data:text/javascript;base64,${Buffer.from(outputText).toString(
    "base64"
  )}`
  return import(url)
}

const {
  buildAcceptedQuotePatch,
  buildInvoiceRepairPatch,
  buildQuoteInvoiceRow,
  buildQuoteJobRow,
} = await importTs("../src/lib/quotes/acceptance-rows.ts")

const totals = {
  items_subtotal: 1000,
  jic_amount: 100,
  admin_amount: 100,
  small_parts_amount: 30,
  permit_amount: 200,
  amount_pretax: 1430,
  hst_amount: 185.9,
  total: 1615.9,
}

const baseQuote = {
  id: "quote-1",
  tenant_id: "tenant-1",
  quote_number: "SEQ-26001",
  client_id: "client-1",
  site_address: "123 Main St",
  status: "sent",
  accepted_at: null,
  accepted_name: null,
}

test("T&M accept rows preserve job rates and create a zero draft invoice", () => {
  const quote = {
    ...baseQuote,
    billing_type: "tm",
    tm_labor_rate: 125,
    tm_materials_markup_pct: 18,
  }

  const job = buildQuoteJobRow({
    quote,
    clientName: "Acme Co",
    createdBy: "profile-1",
    mode: "staff",
  })
  const invoice = buildQuoteInvoiceRow({
    quote,
    totals,
    jobId: "job-1",
    createdBy: "profile-1",
  })

  assert.equal(job.billing_type, "tm")
  assert.equal(job.tm_labor_rate, 125)
  assert.equal(job.tm_materials_markup_pct, 18)
  assert.equal(invoice.status, "draft")
  assert.equal(invoice.billing_type, "tm")
  assert.equal(invoice.labor_amount, 0)
  assert.equal(invoice.materials_amount, 0)
  assert.equal(invoice.amount_pretax, 0)
  assert.equal(invoice.hst_amount, 0)
  assert.equal(invoice.total, 0)
})

test("fixed accept rows snapshot quote totals into the invoice", () => {
  const quote = {
    ...baseQuote,
    billing_type: "fixed",
    tm_labor_rate: null,
    tm_materials_markup_pct: null,
  }

  const invoice = buildQuoteInvoiceRow({
    quote,
    totals,
    jobId: "job-1",
    createdBy: "profile-1",
  })

  assert.equal(invoice.billing_type, "fixed")
  assert.equal(invoice.items_subtotal, totals.items_subtotal)
  assert.equal(invoice.amount_pretax, totals.amount_pretax)
  assert.equal(invoice.hst_amount, totals.hst_amount)
  assert.equal(invoice.total, totals.total)
})

test("repairing an old draft public T&M invoice zeroes fixed totals", () => {
  const quote = {
    ...baseQuote,
    billing_type: "tm",
    tm_labor_rate: 110,
    tm_materials_markup_pct: 15,
  }

  const patch = buildInvoiceRepairPatch({
    quote,
    totals,
    existing: {
      job_id: "job-1",
      status: "draft",
      billing_type: "fixed",
    },
    jobId: "job-1",
  })

  assert.equal(patch.billing_type, "tm")
  assert.equal(patch.labor_amount, 0)
  assert.equal(patch.materials_amount, 0)
  assert.equal(patch.amount_pretax, 0)
  assert.equal(patch.total, 0)
})

test("accepted quote patch preserves existing signature metadata", () => {
  const patch = buildAcceptedQuotePatch({
    quote: {
      ...baseQuote,
      status: "accepted",
      accepted_at: "2026-06-01T12:00:00.000Z",
      accepted_name: "Original Name",
    },
    acceptedName: "Retry Name",
    acceptedAt: "2026-06-02T12:00:00.000Z",
  })

  assert.deepEqual(patch, { status: "accepted" })
})

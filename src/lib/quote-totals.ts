import { round2 } from "./format"

export type QuoteFees = {
  jic_pct: number
  admin_pct: number
  small_parts_pct: number
  permit_fee: number
  hst_rate: number
}

export type QuoteTotals = {
  items_subtotal: number
  jic_amount: number
  admin_amount: number
  small_parts_amount: number
  permit_amount: number
  amount_pretax: number
  hst_amount: number
  total: number
}

/**
 * Compute quote totals from the items subtotal + fee snapshot.
 * Mirrors the `quote_totals` SQL view exactly (round each fee, then sum, then HST)
 * so the live builder preview matches what the database reports.
 */
export function computeQuoteTotals(
  itemsSubtotal: number,
  fees: QuoteFees
): QuoteTotals {
  const items = round2(itemsSubtotal)
  const jic = round2((items * fees.jic_pct) / 100)
  const admin = round2((items * fees.admin_pct) / 100)
  const small = round2((items * fees.small_parts_pct) / 100)
  const permit = round2(fees.permit_fee)
  const pretax = round2(items + jic + admin + small + permit)
  const hst = round2((pretax * fees.hst_rate) / 100)
  const total = round2(pretax + hst)

  return {
    items_subtotal: items,
    jic_amount: jic,
    admin_amount: admin,
    small_parts_amount: small,
    permit_amount: permit,
    amount_pretax: pretax,
    hst_amount: hst,
    total,
  }
}

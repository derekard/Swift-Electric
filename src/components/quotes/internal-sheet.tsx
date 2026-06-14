import type { Quote, QuoteTotals } from "@/lib/supabase/types"
import type { AreaWithLines } from "@/lib/quote-doc"
import { money, pct } from "@/lib/format"

/**
 * Owner-only pricing breakdown: line items + fee math. (Real margin shows on
 * the job once time/mileage/parts are logged — Phase 4/5.)
 */
export function InternalSheet({
  quote,
  areas,
  totals,
}: {
  quote: Quote
  areas: AreaWithLines[]
  totals: QuoteTotals
}) {
  return (
    <div className="flex flex-col gap-6">
      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Item</th>
              <th className="px-3 py-2 text-right font-medium">Qty</th>
              <th className="px-3 py-2 text-right font-medium">Unit</th>
              <th className="px-3 py-2 text-right font-medium">Total</th>
            </tr>
          </thead>
          <tbody>
            {areas.map((area) => (
              <FragmentArea key={area.id} area={area} />
            ))}
            {areas.every((a) => a.lines.length === 0) && (
              <tr>
                <td
                  colSpan={4}
                  className="px-3 py-6 text-center text-muted-foreground"
                >
                  No line items yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="ml-auto w-full max-w-sm space-y-1.5 text-sm">
        <Row label="Items subtotal" value={money(totals.items_subtotal)} />
        <Row
          label={`Contingency (JIC ${pct(quote.jic_pct)})`}
          value={money(totals.jic_amount)}
        />
        <Row
          label={`Admin / overhead (${pct(quote.admin_pct)})`}
          value={money(totals.admin_amount)}
        />
        <Row
          label={`Small parts (${pct(quote.small_parts_pct)})`}
          value={money(totals.small_parts_amount)}
        />
        <Row label="Permit" value={money(totals.permit_amount)} />
        <div className="border-t pt-1.5">
          <Row label="Subtotal" value={money(totals.amount_pretax)} strong />
        </div>
        <Row label={`HST (${pct(quote.hst_rate)})`} value={money(totals.hst_amount)} />
        <div className="border-t pt-1.5">
          <Row label="Total" value={money(totals.total)} big />
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Job costs &amp; margin appear on the job once time, mileage and parts are
        logged.
      </p>
    </div>
  )
}

function FragmentArea({ area }: { area: AreaWithLines }) {
  if (area.lines.length === 0) return null
  return (
    <>
      <tr className="bg-muted/20">
        <td colSpan={4} className="px-3 py-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {area.name}
        </td>
      </tr>
      {area.lines.map((l) => (
        <tr key={l.id} className="border-t">
          <td className="px-3 py-2">{l.description}</td>
          <td className="px-3 py-2 text-right tabular-nums">{Number(l.qty)}</td>
          <td className="px-3 py-2 text-right tabular-nums">
            {money(l.unit_price)}
          </td>
          <td className="px-3 py-2 text-right tabular-nums">
            {money(Number(l.qty) * Number(l.unit_price))}
          </td>
        </tr>
      ))}
    </>
  )
}

function Row({
  label,
  value,
  strong,
  big,
}: {
  label: string
  value: string
  strong?: boolean
  big?: boolean
}) {
  return (
    <div
      className={`flex items-center justify-between ${
        big ? "text-base font-semibold" : ""
      } ${strong ? "font-medium" : ""}`}
    >
      <span className={strong || big ? "" : "text-muted-foreground"}>
        {label}
      </span>
      <span className="tabular-nums">{value}</span>
    </div>
  )
}

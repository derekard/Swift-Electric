import type { QuoteDoc } from "@/lib/quote-doc"
import { money, pct } from "@/lib/format"

/**
 * On-screen, paper-styled preview of the client-facing quote. Mirrors Matthew's
 * estimate letter: header with license, recipient, intro, room-by-room scope,
 * notes, then TOTAL (+ "HST extra" unless HST is shown explicitly).
 */
export function QuoteLetter({ doc }: { doc: QuoteDoc }) {
  return (
    <div className="mx-auto max-w-2xl rounded-xl border bg-white p-8 text-sm text-zinc-900 shadow-sm sm:p-10">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4 border-b pb-5">
        <div>
          <p className="text-xl font-bold tracking-tight">{doc.company.name}</p>
          {doc.company.ownerName && (
            <p className="text-zinc-700">{doc.company.ownerName}</p>
          )}
          <p className="text-zinc-700">Master Electrician</p>
          {doc.company.licenseNumber && (
            <p className="text-xs text-zinc-500">
              ECRA/ESA {doc.company.licenseNumber}
            </p>
          )}
        </div>
        <div className="text-right text-xs text-zinc-600">
          <p className="text-sm font-semibold text-zinc-900">
            Estimate {doc.quoteNumber}
          </p>
          <p>{doc.date}</p>
          {doc.company.phone && <p>{doc.company.phone}</p>}
          {doc.company.email && <p>{doc.company.email}</p>}
          {doc.company.address && <p>{doc.company.address}</p>}
        </div>
      </div>

      {/* Recipient */}
      {doc.client && (
        <div className="mt-5">
          <p className="font-medium">{doc.client.name}</p>
          {doc.client.address && (
            <p className="text-zinc-600">{doc.client.address}</p>
          )}
        </div>
      )}

      {/* Intro */}
      <p className="mt-5 text-zinc-800">{doc.intro}</p>

      {/* Scope by area */}
      <div className="mt-5 flex flex-col gap-4">
        {doc.areas.map((area, i) => (
          <div key={i}>
            <p className="font-semibold">{area.name}</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-zinc-800 marker:text-zinc-400">
              {area.bullets.map((b, j) => (
                <li key={j}>{b}</li>
              ))}
            </ul>
          </div>
        ))}
        {doc.areas.length === 0 && (
          <p className="text-zinc-400 italic">No items added yet.</p>
        )}
      </div>

      {/* Notes */}
      {doc.notes && (
        <div className="mt-5">
          <p className="font-semibold">Notes</p>
          <p className="whitespace-pre-line text-zinc-800">{doc.notes}</p>
        </div>
      )}

      {/* Total */}
      <div className="mt-6 border-t pt-4">
        {doc.showHstLine ? (
          <div className="ml-auto w-full max-w-xs space-y-1">
            <Row label="Subtotal" value={money(doc.amountPretax)} />
            <Row label={`HST (${pct(doc.hstRate)})`} value={money(doc.hstAmount)} />
            <div className="border-t pt-1">
              <Row label="Total" value={money(doc.total)} strong />
            </div>
          </div>
        ) : (
          <div className="flex items-baseline justify-between">
            <span className="text-base font-bold">TOTAL</span>
            <div className="text-right">
              <p className="text-base font-bold">{money(doc.amountPretax)}</p>
              <p className="text-xs text-zinc-500">HST extra</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function Row({
  label,
  value,
  strong,
}: {
  label: string
  value: string
  strong?: boolean
}) {
  return (
    <div className="flex items-center justify-between">
      <span className={strong ? "font-bold" : "text-zinc-600"}>{label}</span>
      <span className={strong ? "font-bold" : "tabular-nums"}>{value}</span>
    </div>
  )
}

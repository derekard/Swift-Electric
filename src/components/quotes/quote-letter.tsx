import type { QuoteDoc } from "@/lib/quote-doc"
import { money, pct } from "@/lib/format"

/**
 * Presentation-grade client estimate. Branded accent (company brand colour),
 * header with logo + estimate meta, prepared-for / site blocks, scope by area,
 * notes, totals, and a terms/validity strip. Mirrors the PDF.
 */
export function QuoteLetter({ doc }: { doc: QuoteDoc }) {
  const brand = doc.company.brandColor

  return (
    <div className="mx-auto max-w-3xl overflow-hidden rounded-2xl border bg-white text-zinc-900 shadow-sm">
      {/* Accent bar */}
      <div className="h-2 w-full" style={{ backgroundColor: brand }} />

      <div className="p-8 sm:p-10">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="flex items-center gap-3">
            {doc.company.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={doc.company.logoUrl}
                alt={doc.company.name}
                className="h-12 w-auto"
              />
            ) : null}
            <div>
              <p className="text-xl font-bold tracking-tight">
                {doc.company.name}
              </p>
              {doc.company.ownerName && (
                <p className="text-sm text-zinc-600">{doc.company.ownerName}</p>
              )}
              <p className="text-sm text-zinc-600">Master Electrician</p>
              {doc.company.licenseNumber && (
                <p className="text-xs text-zinc-400">
                  ECRA/ESA {doc.company.licenseNumber}
                </p>
              )}
            </div>
          </div>

          <div className="text-right">
            <p
              className="text-xs font-semibold uppercase tracking-[0.2em]"
              style={{ color: brand }}
            >
              Estimate
            </p>
            <p className="text-lg font-bold">{doc.quoteNumber}</p>
            <p className="mt-1 text-xs text-zinc-500">Date: {doc.date}</p>
            <p className="text-xs text-zinc-500">Valid until: {doc.validUntil}</p>
          </div>
        </div>

        {/* Prepared for / site */}
        <div className="mt-8 grid gap-6 border-t pt-6 sm:grid-cols-2">
          {doc.client && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                Prepared for
              </p>
              <p className="mt-1 font-medium">{doc.client.name}</p>
              {doc.client.address && (
                <p className="text-sm text-zinc-600">{doc.client.address}</p>
              )}
              {doc.client.email && (
                <p className="text-sm text-zinc-600">{doc.client.email}</p>
              )}
            </div>
          )}
          {doc.siteAddress && (
            <div className={doc.client ? "sm:text-right" : ""}>
              <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                Project site
              </p>
              <p className="mt-1 text-sm text-zinc-700">{doc.siteAddress}</p>
            </div>
          )}
        </div>

        {/* Intro */}
        <p className="mt-8 text-zinc-800">{doc.intro}</p>

        {/* Scope */}
        <div className="mt-6 flex flex-col gap-5">
          {doc.areas.map((area, i) => (
            <div key={i}>
              <p
                className="text-sm font-semibold uppercase tracking-wide"
                style={{ color: brand }}
              >
                {area.name}
              </p>
              <ul className="mt-2 flex flex-col gap-1.5">
                {area.bullets.map((b, j) => (
                  <li key={j} className="flex gap-2.5 text-zinc-800">
                    <span
                      className="mt-2 size-1.5 shrink-0 rounded-full"
                      style={{ backgroundColor: brand }}
                    />
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {doc.areas.length === 0 && (
            <p className="italic text-zinc-400">No items added yet.</p>
          )}
        </div>

        {/* Notes */}
        {doc.notes && (
          <div className="mt-6 rounded-lg bg-zinc-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
              Notes
            </p>
            <p className="mt-1 whitespace-pre-line text-sm text-zinc-700">
              {doc.notes}
            </p>
          </div>
        )}

        {/* Total */}
        <div className="mt-8 border-t pt-5">
          {doc.billingType === "tm" ? (
            <div
              className="rounded-lg border-2 p-4"
              style={{ borderColor: brand }}
            >
              <p
                className="text-sm font-bold uppercase tracking-wide"
                style={{ color: brand }}
              >
                Time &amp; Materials
              </p>
              <ul className="mt-2 space-y-1 text-sm text-zinc-800">
                <li>
                  Labour billed at{" "}
                  <span className="font-semibold">
                    {money(doc.tmLaborRate ?? 0)}/hr
                  </span>
                </li>
                <li>
                  Materials at cost
                  {doc.tmMaterialsMarkup
                    ? ` + ${pct(doc.tmMaterialsMarkup)} handling`
                    : ""}
                </li>
                <li>Plus applicable HST. Final amount based on work performed.</li>
              </ul>
            </div>
          ) : doc.showHstLine ? (
            <div className="ml-auto w-full max-w-xs space-y-1.5">
              <Row label="Subtotal" value={money(doc.amountPretax)} />
              <Row label={`HST (${pct(doc.hstRate)})`} value={money(doc.hstAmount)} />
              <div
                className="mt-1 flex items-center justify-between border-t-2 pt-2"
                style={{ borderColor: brand }}
              >
                <span className="text-base font-bold">Total</span>
                <span className="text-base font-bold">{money(doc.total)}</span>
              </div>
            </div>
          ) : (
            <div
              className="flex items-baseline justify-between border-t-2 pt-3"
              style={{ borderColor: brand }}
            >
              <span className="text-lg font-bold tracking-tight">TOTAL</span>
              <div className="text-right">
                <p className="text-2xl font-bold" style={{ color: brand }}>
                  {money(doc.amountPretax)}
                </p>
                <p className="text-xs text-zinc-500">+ HST</p>
              </div>
            </div>
          )}
        </div>

        {/* Terms */}
        <div className="mt-6 flex flex-wrap gap-x-6 gap-y-1 text-xs text-zinc-500">
          <span>
            <span className="font-medium text-zinc-700">Valid until</span>{" "}
            {doc.validUntil}
          </span>
          <span>
            <span className="font-medium text-zinc-700">Payment terms</span> Net{" "}
            {doc.netDays} days
          </span>
          <span>Prices in CAD. Estimate subject to on-site conditions.</span>
        </div>
      </div>

      {/* Footer */}
      <div
        className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 px-8 py-4 text-center text-xs text-white"
        style={{ backgroundColor: brand }}
      >
        <span className="font-semibold">{doc.company.name}</span>
        {doc.company.phone && <span>· {doc.company.phone}</span>}
        {doc.company.email && <span>· {doc.company.email}</span>}
        {doc.company.licenseNumber && (
          <span>· ECRA/ESA {doc.company.licenseNumber}</span>
        )}
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-zinc-600">{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  )
}

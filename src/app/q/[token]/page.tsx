import { notFound } from "next/navigation"
import type { CSSProperties } from "react"
import { CheckCircle2 } from "lucide-react"

import { loadPublicQuote } from "@/lib/public-quote"
import { QuoteLetter } from "@/components/quotes/quote-letter"
import { QuoteAcceptForm } from "@/components/quotes/quote-accept-form"

export const dynamic = "force-dynamic"

export default async function PublicQuotePage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const data = await loadPublicQuote(token)
  if (!data) notFound()

  const style = { ["--primary"]: data.brand.brandColor } as CSSProperties

  return (
    <div style={style} className="min-h-svh bg-muted/40 py-8 sm:py-12">
      <div className="mx-auto flex max-w-2xl flex-col gap-5 px-4">
        {/* Brand header */}
        <div className="flex items-center gap-3">
          {data.brand.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={data.brand.logoUrl}
              alt={data.brand.companyName}
              className="h-9 w-auto"
            />
          ) : (
            <div
              className="flex size-9 items-center justify-center rounded-lg text-white"
              style={{ background: data.brand.brandColor }}
            >
              ⚡
            </div>
          )}
          <span className="text-lg font-semibold tracking-tight">
            {data.brand.companyName}
          </span>
        </div>

        <QuoteLetter doc={data.doc} />

        {data.status === "accepted" ? (
          <div className="flex items-center gap-3 rounded-xl border border-green-300 bg-green-50 p-4 text-green-800">
            <CheckCircle2 className="size-5 shrink-0" />
            <p className="text-sm">
              Accepted{data.acceptedName ? ` by ${data.acceptedName}` : ""}. Thank
              you — we&apos;ll be in touch to schedule the work.
            </p>
          </div>
        ) : data.status === "declined" ? (
          <p className="text-center text-sm text-muted-foreground">
            This estimate is no longer available.
          </p>
        ) : (
          <QuoteAcceptForm token={token} />
        )}

        <p className="text-center text-xs text-muted-foreground">
          Powered by {data.brand.companyName}
        </p>
      </div>
    </div>
  )
}

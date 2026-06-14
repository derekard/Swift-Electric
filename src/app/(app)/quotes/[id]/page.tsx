import { notFound } from "next/navigation"

import { requireOwner } from "@/lib/auth"
import { loadQuote } from "@/lib/quote-load"
import { isEmailConfigured } from "@/lib/email"
import { QuoteView } from "@/components/quotes/quote-view"

export default async function QuotePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requireOwner()
  const { id } = await params
  const loaded = await loadQuote(id)
  if (!loaded) notFound()

  return (
    <QuoteView
      quote={loaded.quote}
      doc={loaded.doc}
      areas={loaded.areas}
      totals={loaded.totals}
      emailEnabled={isEmailConfigured()}
      clientHasEmail={!!loaded.client?.email}
    />
  )
}

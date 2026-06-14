import { notFound } from "next/navigation"

import { requireStaff } from "@/lib/auth"
import { createClient } from "@/lib/supabase/server"
import { loadQuote } from "@/lib/quote-load"
import { isEmailConfigured } from "@/lib/email"
import { QuoteView } from "@/components/quotes/quote-view"

export default async function QuotePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requireStaff()
  const { id } = await params
  const loaded = await loadQuote(id)
  if (!loaded) notFound()

  const supabase = await createClient()
  const { data: job } = await supabase
    .from("jobs")
    .select("id")
    .eq("quote_id", id)
    .maybeSingle()

  return (
    <QuoteView
      quote={loaded.quote}
      doc={loaded.doc}
      areas={loaded.areas}
      totals={loaded.totals}
      emailEnabled={isEmailConfigured()}
      clientHasEmail={!!loaded.client?.email}
      jobId={job?.id ?? null}
    />
  )
}

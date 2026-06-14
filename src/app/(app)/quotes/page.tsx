import { FileText } from "lucide-react"

import { requireOwner } from "@/lib/auth"
import { createClient } from "@/lib/supabase/server"
import { PageHeader } from "@/components/page-header"
import { EmptyState } from "@/components/empty-state"
import { NewQuoteButton } from "@/components/quotes/new-quote-button"
import { QuotesTable, type QuoteRow } from "@/components/quotes/quotes-table"

export default async function QuotesPage() {
  await requireOwner()
  const supabase = await createClient()

  const [{ data: quotes }, { data: totals }, { data: clients }] =
    await Promise.all([
      supabase
        .from("quotes")
        .select("*")
        .order("created_at", { ascending: false }),
      supabase.from("quote_totals").select("*"),
      supabase.from("clients").select("id, name"),
    ])

  const totalById = new Map((totals ?? []).map((t) => [t.quote_id, t.total]))
  const clientById = new Map((clients ?? []).map((c) => [c.id, c.name]))

  const rows: QuoteRow[] = (quotes ?? []).map((q) => ({
    id: q.id,
    quote_number: q.quote_number,
    status: q.status,
    client_name: q.client_id ? (clientById.get(q.client_id) ?? null) : null,
    total: totalById.get(q.id) ?? 0,
    created_at: q.created_at,
  }))

  return (
    <>
      <PageHeader
        title="Quotes"
        description="Build quotes from your price book and send them to clients."
        action={<NewQuoteButton />}
      />
      {rows.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No quotes yet"
          description="Create your first quote — add rooms, tap in items from your price book, and send it."
          action={<NewQuoteButton variant="outline" />}
        />
      ) : (
        <QuotesTable rows={rows} />
      )}
    </>
  )
}

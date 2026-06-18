import { notFound } from "next/navigation"
import Link from "next/link"
import { Lock } from "lucide-react"

import { requireStaff } from "@/lib/auth"
import { createClient } from "@/lib/supabase/server"
import { getSettings } from "@/lib/settings"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { QuoteEditor, type EditorArea } from "@/components/quotes/quote-editor"
import { QuoteStatusBadge } from "@/components/quotes/quote-status-badge"

export default async function EditQuotePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requireStaff()
  const { id } = await params
  const supabase = await createClient()

  const { data: quote } = await supabase
    .from("quotes")
    .select("*")
    .eq("id", id)
    .maybeSingle()
  if (!quote) notFound()
  if (quote.status === "accepted") {
    return <AcceptedQuoteLocked id={id} quoteNumber={quote.quote_number} />
  }

  const [{ data: areas }, { data: clients }, { data: priceBook }, settings] =
    await Promise.all([
      supabase.from("quote_areas").select("*").eq("quote_id", id).order("sort"),
      supabase.from("clients").select("*").order("name"),
      supabase
        .from("price_book_items")
        .select("*")
        .eq("active", true)
        .order("sort"),
      getSettings(),
    ])

  const areaIds = (areas ?? []).map((a) => a.id)
  const { data: lines } = areaIds.length
    ? await supabase
        .from("quote_lines")
        .select("*")
        .in("area_id", areaIds)
        .order("sort")
    : { data: [] }

  const initialAreas: EditorArea[] = (areas ?? []).map((a) => ({
    key: a.id,
    name: a.name,
    lines: (lines ?? [])
      .filter((l) => l.area_id === a.id)
      .map((l) => ({
        key: l.id,
        price_book_item_id: l.price_book_item_id,
        description: l.description,
        qty: Number(l.qty),
        unit_price: Number(l.unit_price),
      })),
  }))

  return (
    <QuoteEditor
      quote={quote}
      initialAreas={initialAreas}
      clients={clients ?? []}
      priceBook={priceBook ?? []}
      defaultIntro={settings?.quote_intro ?? ""}
      voiceEnabled={!!process.env.ANTHROPIC_API_KEY}
    />
  )
}

function AcceptedQuoteLocked({
  id,
  quoteNumber,
}: {
  id: string
  quoteNumber: string
}) {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{quoteNumber}</h1>
        <QuoteStatusBadge status="accepted" />
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Lock className="size-4" />
            <CardTitle>Quote is locked</CardTitle>
          </div>
          <CardDescription>
            This quote has been accepted, and its job and invoice were created
            from that accepted snapshot. Duplicate the quote to make a revised
            version.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button render={<Link href={`/quotes/${id}`} />}>View quote</Button>
          <Button render={<Link href="/quotes" />} variant="outline">
            Back to quotes
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

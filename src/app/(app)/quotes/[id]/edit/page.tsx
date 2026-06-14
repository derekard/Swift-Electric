import { notFound } from "next/navigation"

import { requireOwner } from "@/lib/auth"
import { createClient } from "@/lib/supabase/server"
import { getSettings } from "@/lib/settings"
import { QuoteEditor, type EditorArea } from "@/components/quotes/quote-editor"

export default async function EditQuotePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requireOwner()
  const { id } = await params
  const supabase = await createClient()

  const { data: quote } = await supabase
    .from("quotes")
    .select("*")
    .eq("id", id)
    .maybeSingle()
  if (!quote) notFound()

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

import { renderToBuffer } from "@react-pdf/renderer"

import { requireOwner } from "@/lib/auth"
import { loadQuote } from "@/lib/quote-load"
import { QuotePdfDocument } from "@/lib/pdf/quote-pdf"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  await requireOwner()
  const { id } = await params

  const loaded = await loadQuote(id)
  if (!loaded) {
    return new Response("Quote not found", { status: 404 })
  }

  const buffer = await renderToBuffer(
    <QuotePdfDocument doc={loaded.doc} />
  )

  const filename = `${loaded.quote.quote_number}.pdf`
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  })
}

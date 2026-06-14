import { requireStaff } from "@/lib/auth"
import { loadInvoiceDoc } from "@/lib/invoice-load"
import { renderInvoicePdf } from "@/lib/pdf/render"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  await requireStaff()
  const { id } = await params

  const loaded = await loadInvoiceDoc(id)
  if (!loaded) return new Response("Invoice not found", { status: 404 })

  const buffer = await renderInvoicePdf(loaded.doc)
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${loaded.invoice.invoice_number}.pdf"`,
      "Cache-Control": "no-store",
    },
  })
}

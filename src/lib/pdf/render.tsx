import { renderToBuffer } from "@react-pdf/renderer"

import type { QuoteDoc } from "@/lib/quote-doc"
import { QuotePdfDocument } from "@/lib/pdf/quote-pdf"
import { InvoicePdfDocument, type InvoiceDoc } from "@/lib/pdf/invoice-pdf"

/** Render the client-facing quote PDF to a Buffer. Server-only. */
export async function renderQuotePdf(doc: QuoteDoc): Promise<Buffer> {
  return renderToBuffer(<QuotePdfDocument doc={doc} />)
}

/** Render an invoice PDF to a Buffer. Server-only. */
export async function renderInvoicePdf(doc: InvoiceDoc): Promise<Buffer> {
  return renderToBuffer(<InvoicePdfDocument doc={doc} />)
}

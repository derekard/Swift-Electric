import { createClient } from "@/lib/supabase/server"
import { getSettings } from "@/lib/settings"
import { formatDate } from "@/lib/format"
import type { InvoiceDoc } from "@/lib/pdf/invoice-pdf"
import type { Invoice } from "@/lib/supabase/types"

export type LoadedInvoice = {
  invoice: Invoice
  doc: InvoiceDoc
  clientEmail: string | null
  clientName: string | null
}

export async function loadInvoiceDoc(id: string): Promise<LoadedInvoice | null> {
  const supabase = await createClient()

  const { data: invoice } = await supabase
    .from("invoices")
    .select("*")
    .eq("id", id)
    .maybeSingle()
  if (!invoice) return null

  const settings = await getSettings()

  let clientName: string | null = null
  let clientAddress: string | null = null
  let clientEmail: string | null = null
  if (invoice.client_id) {
    const { data } = await supabase
      .from("clients")
      .select("name, address, email")
      .eq("id", invoice.client_id)
      .maybeSingle()
    clientName = data?.name ?? null
    clientAddress = data?.address ?? null
    clientEmail = data?.email ?? null
  }

  let quoteNumber: string | null = null
  if (invoice.quote_id) {
    const { data } = await supabase
      .from("quotes")
      .select("quote_number")
      .eq("id", invoice.quote_id)
      .maybeSingle()
    quoteNumber = data?.quote_number ?? null
  }

  const doc: InvoiceDoc = {
    company: {
      name: settings?.company_name ?? "Swift Electric",
      licenseNumber: settings?.license_number ?? null,
      ownerName: settings?.owner_name ?? null,
      address: settings?.address ?? null,
      phone: settings?.phone ?? null,
      email: settings?.email ?? null,
    },
    invoiceNumber: invoice.invoice_number,
    issuedDate: formatDate(invoice.issued_date),
    dueDate: formatDate(invoice.due_date),
    isPaid: invoice.status === "paid",
    clientName,
    clientAddress,
    quoteNumber,
    billingType: invoice.billing_type,
    laborAmount: invoice.labor_amount,
    materialsAmount: invoice.materials_amount,
    amountPretax: invoice.amount_pretax,
    hstAmount: invoice.hst_amount,
    total: invoice.total,
  }

  return { invoice, doc, clientEmail, clientName }
}

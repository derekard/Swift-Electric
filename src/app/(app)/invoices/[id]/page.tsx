import { notFound } from "next/navigation"

import { requireStaff } from "@/lib/auth"
import { createClient } from "@/lib/supabase/server"
import { isEmailConfigured } from "@/lib/email"
import { InvoiceDetail } from "@/components/invoices/invoice-detail"

export default async function InvoicePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requireStaff()
  const { id } = await params
  const supabase = await createClient()

  const { data: invoice } = await supabase
    .from("invoices")
    .select("*")
    .eq("id", id)
    .maybeSingle()
  if (!invoice) notFound()

  let clientName: string | null = null
  let clientHasEmail = false
  if (invoice.client_id) {
    const { data } = await supabase
      .from("clients")
      .select("name, email")
      .eq("id", invoice.client_id)
      .maybeSingle()
    clientName = data?.name ?? null
    clientHasEmail = !!data?.email
  }

  let job: { id: string; number: string } | null = null
  if (invoice.job_id) {
    const { data } = await supabase
      .from("jobs")
      .select("id, job_number")
      .eq("id", invoice.job_id)
      .maybeSingle()
    if (data) job = { id: data.id, number: data.job_number }
  }

  let quote: { id: string; number: string } | null = null
  if (invoice.quote_id) {
    const { data } = await supabase
      .from("quotes")
      .select("id, quote_number")
      .eq("id", invoice.quote_id)
      .maybeSingle()
    if (data) quote = { id: data.id, number: data.quote_number }
  }

  return (
    <InvoiceDetail
      invoice={invoice}
      clientName={clientName}
      clientHasEmail={clientHasEmail}
      job={job}
      quote={quote}
      emailEnabled={isEmailConfigured()}
    />
  )
}

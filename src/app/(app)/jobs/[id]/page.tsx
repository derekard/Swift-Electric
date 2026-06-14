import { notFound } from "next/navigation"

import { requireOwner } from "@/lib/auth"
import { createClient } from "@/lib/supabase/server"
import { JobDetail } from "@/components/jobs/job-detail"

export default async function JobPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requireOwner()
  const { id } = await params
  const supabase = await createClient()

  const { data: job } = await supabase
    .from("jobs")
    .select("*")
    .eq("id", id)
    .maybeSingle()
  if (!job) notFound()

  const [
    { data: costs },
    { data: invoice },
    { data: assignments },
    { data: profiles },
    { data: timeEntries },
    { data: mileageEntries },
    { data: expenses },
  ] = await Promise.all([
    supabase.from("job_costs").select("*").eq("job_id", id).maybeSingle(),
    supabase
      .from("invoices")
      .select("id, invoice_number, status, total")
      .eq("job_id", id)
      .maybeSingle(),
    supabase.from("job_assignments").select("profile_id").eq("job_id", id),
    supabase
      .from("profiles")
      .select("id, full_name, email, role")
      .eq("active", true),
    supabase
      .from("time_entries")
      .select("*")
      .eq("job_id", id)
      .order("work_date", { ascending: false }),
    supabase
      .from("mileage_entries")
      .select("*")
      .eq("job_id", id)
      .order("travel_date", { ascending: false }),
    supabase
      .from("expenses")
      .select("*")
      .eq("job_id", id)
      .order("spent_date", { ascending: false }),
  ])

  let clientName: string | null = null
  if (job.client_id) {
    const { data } = await supabase
      .from("clients")
      .select("name")
      .eq("id", job.client_id)
      .maybeSingle()
    clientName = data?.name ?? null
  }

  let quote: { id: string; number: string } | null = null
  if (job.quote_id) {
    const { data } = await supabase
      .from("quotes")
      .select("id, quote_number")
      .eq("id", job.quote_id)
      .maybeSingle()
    if (data) quote = { id: data.id, number: data.quote_number }
  }

  const assignedIds = new Set((assignments ?? []).map((a) => a.profile_id))
  const allPeople = (profiles ?? []).map((p) => ({
    id: p.id,
    name: p.full_name ?? p.email,
  }))
  const assigned = allPeople.filter((p) => assignedIds.has(p.id))
  const available = allPeople.filter((p) => !assignedIds.has(p.id))
  const nameById = new Map(allPeople.map((p) => [p.id, p.name]))

  const timeRows = (timeEntries ?? []).map((t) => ({
    id: t.id,
    person: nameById.get(t.profile_id) ?? "—",
    date: t.work_date,
    amount: `${Number(t.hours)} h`,
    notes: t.notes,
    status: t.status,
  }))
  const mileageRows = (mileageEntries ?? []).map((m) => ({
    id: m.id,
    person: nameById.get(m.profile_id) ?? "—",
    date: m.travel_date,
    amount: `${Number(m.km)} km`,
    notes: m.notes,
    status: m.status,
  }))
  const expenseRows = (expenses ?? []).map((e) => ({
    id: e.id,
    person: e.profile_id ? (nameById.get(e.profile_id) ?? "—") : "—",
    date: e.spent_date,
    description: e.description,
    amount: e.amount,
  }))

  return (
    <JobDetail
      job={job}
      clientName={clientName}
      quote={quote}
      invoice={invoice}
      costs={costs}
      assigned={assigned}
      available={available}
      timeRows={timeRows}
      mileageRows={mileageRows}
      expenseRows={expenseRows}
    />
  )
}

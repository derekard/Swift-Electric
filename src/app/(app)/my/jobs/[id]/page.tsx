import { notFound } from "next/navigation"

import { requireProfile } from "@/lib/auth"
import { createClient } from "@/lib/supabase/server"
import { TechnicianJobWorkspace } from "@/components/day-hub/technician-job-workspace"

export default async function MyJobPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ date?: string }>
}) {
  const profile = await requireProfile()
  const { id } = await params
  const { date } = await searchParams
  const workDate = date || new Date().toISOString().slice(0, 10)
  const supabase = await createClient()

  // RLS limits this to jobs the user is assigned to (or owns).
  const { data: job } = await supabase
    .from("jobs")
    .select("*")
    .eq("id", id)
    .maybeSingle()
  if (!job) notFound()

  const [
    { data: time },
    { data: mileage },
    { data: expenses },
    { data: visits },
    { data: prepItems },
    { data: prepCompletions },
    { data: workflowEvents },
    { data: report },
  ] =
    await Promise.all([
      supabase
        .from("time_entries")
        .select("*")
        .eq("job_id", id)
        .eq("profile_id", profile.id)
        .order("work_date", { ascending: false }),
      supabase
        .from("mileage_entries")
        .select("*")
        .eq("job_id", id)
        .eq("profile_id", profile.id)
        .order("travel_date", { ascending: false }),
      supabase
        .from("expenses")
        .select("*")
        .eq("job_id", id)
        .eq("profile_id", profile.id)
        .order("spent_date", { ascending: false }),
      supabase
        .from("job_visits")
        .select("*")
        .eq("job_id", id)
        .order("visit_date", { ascending: true })
        .order("start_time", { ascending: true, nullsFirst: true }),
      supabase
        .from("job_prep_items")
        .select("*")
        .eq("job_id", id)
        .order("sort", { ascending: true }),
      supabase
        .from("job_prep_completions")
        .select("*")
        .eq("job_id", id)
        .eq("profile_id", profile.id)
        .eq("work_date", workDate),
      supabase
        .from("job_workflow_events")
        .select("*")
        .eq("job_id", id)
        .eq("profile_id", profile.id)
        .order("happened_at", { ascending: false })
        .limit(100),
      supabase
        .from("job_site_reports")
        .select("*")
        .eq("job_id", id)
        .eq("profile_id", profile.id)
        .eq("work_date", workDate)
        .maybeSingle(),
    ])

  const [{ data: photos }, { data: signoffs }, { data: client }] =
    await Promise.all([
      report
        ? supabase
            .from("job_site_photos")
            .select("*")
            .eq("site_report_id", report.id)
            .order("created_at", { ascending: false })
        : Promise.resolve({ data: [] }),
      report
        ? supabase
            .from("job_signoffs")
            .select("*")
            .eq("site_report_id", report.id)
            .order("signed_at", { ascending: false })
        : Promise.resolve({ data: [] }),
      job.client_id
        ? supabase.from("clients").select("name").eq("id", job.client_id).maybeSingle()
        : Promise.resolve({ data: null }),
    ])

  return (
    <TechnicianJobWorkspace
      job={job}
      clientName={client?.name ?? null}
      visits={visits ?? []}
      time={time ?? []}
      mileage={mileage ?? []}
      expenses={expenses ?? []}
      prepItems={prepItems ?? []}
      prepCompletions={prepCompletions ?? []}
      workflowEvents={workflowEvents ?? []}
      siteReport={report ?? null}
      photos={photos ?? []}
      signoffs={signoffs ?? []}
      homeAddress={profile.home_address}
      mapboxEnabled={!!process.env.MAPBOX_TOKEN}
      tenantId={profile.tenant_id ?? ""}
      profileId={profile.id}
      workDate={workDate}
    />
  )
}

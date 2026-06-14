import { notFound } from "next/navigation"

import { requireProfile } from "@/lib/auth"
import { createClient } from "@/lib/supabase/server"
import { JobWork } from "@/components/timesheets/job-work"

export default async function MyJobPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const profile = await requireProfile()
  const { id } = await params
  const supabase = await createClient()

  // RLS limits this to jobs the user is assigned to (or owns).
  const { data: job } = await supabase
    .from("jobs")
    .select("*")
    .eq("id", id)
    .maybeSingle()
  if (!job) notFound()

  const [{ data: time }, { data: mileage }, { data: expenses }] =
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
    ])

  return (
    <JobWork
      job={job}
      time={time ?? []}
      mileage={mileage ?? []}
      expenses={expenses ?? []}
      homeAddress={profile.home_address}
      mapboxEnabled={!!process.env.MAPBOX_TOKEN}
    />
  )
}

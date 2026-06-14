import Link from "next/link"
import { Briefcase, ChevronRight } from "lucide-react"

import { requireProfile } from "@/lib/auth"
import { createClient } from "@/lib/supabase/server"
import { formatDate } from "@/lib/format"
import { PageHeader } from "@/components/page-header"
import { EmptyState } from "@/components/empty-state"
import { Card } from "@/components/ui/card"
import { JobStatusBadge } from "@/components/jobs/job-status-badge"

export default async function MyJobsPage() {
  const profile = await requireProfile()
  const firstName = profile.full_name?.split(" ")[0] ?? "there"
  const supabase = await createClient()

  const { data: assignments } = await supabase
    .from("job_assignments")
    .select("job_id")
    .eq("profile_id", profile.id)
  const jobIds = (assignments ?? []).map((a) => a.job_id)

  const { data: jobs } = jobIds.length
    ? await supabase
        .from("jobs")
        .select("*")
        .in("id", jobIds)
        .neq("status", "cancelled")
        .order("scheduled_start", { ascending: true, nullsFirst: false })
    : { data: [] }

  const { data: clients } = await supabase.from("clients").select("id, name")
  const clientById = new Map((clients ?? []).map((c) => [c.id, c.name]))

  return (
    <>
      <PageHeader
        title={`Hi, ${firstName}`}
        description="Jobs you're assigned to. Tap one to log time, mileage and parts."
      />

      {(jobs ?? []).length === 0 ? (
        <EmptyState
          icon={Briefcase}
          title="No jobs assigned yet"
          description="When the owner assigns you to a job it'll show up here."
        />
      ) : (
        <div className="flex flex-col gap-3">
          {(jobs ?? []).map((j) => (
            <Card key={j.id} className="p-0">
              <Link
                href={`/my/jobs/${j.id}`}
                className="flex items-center justify-between gap-3 p-4 transition-colors hover:bg-muted/40"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{j.title}</span>
                    <JobStatusBadge status={j.status} />
                  </div>
                  <p className="mt-0.5 truncate text-sm text-muted-foreground">
                    {j.job_number}
                    {j.client_id && clientById.get(j.client_id)
                      ? ` · ${clientById.get(j.client_id)}`
                      : ""}
                    {j.scheduled_start
                      ? ` · ${formatDate(j.scheduled_start)}`
                      : ""}
                  </p>
                </div>
                <ChevronRight className="size-5 shrink-0 text-muted-foreground" />
              </Link>
            </Card>
          ))}
        </div>
      )}
    </>
  )
}

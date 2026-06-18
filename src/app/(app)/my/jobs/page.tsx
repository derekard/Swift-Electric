import Link from "next/link"
import {
  Briefcase,
  CalendarDays,
  Camera,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  FileText,
  MapPin,
  PenLine,
} from "lucide-react"

import { requireProfile } from "@/lib/auth"
import { createClient } from "@/lib/supabase/server"
import { formatDate } from "@/lib/format"
import { PageHeader } from "@/components/page-header"
import { EmptyState } from "@/components/empty-state"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { JobStatusBadge } from "@/components/jobs/job-status-badge"
import type {
  Job,
  JobPrepCompletion,
  JobPrepItem,
  JobSignoff,
  JobSitePhoto,
  JobSiteReport,
  JobVisit,
} from "@/lib/supabase/types"

type JobCardData = {
  job: Job
  clientName: string | null
  visits: JobVisit[]
  report: JobSiteReport | null
  photoCount: number
  signoffCount: number
  requiredPrep: number
  completedPrep: number
}

const todayIso = () => new Date().toISOString().slice(0, 10)

function jobDate(job: Job, visits: JobVisit[], today: string) {
  const todayVisit = visits.find((visit) => visit.visit_date === today)
  if (todayVisit) return todayVisit.visit_date

  const upcomingVisit = visits
    .filter((visit) => visit.visit_date > today)
    .sort((a, b) => a.visit_date.localeCompare(b.visit_date))[0]
  if (upcomingVisit) return upcomingVisit.visit_date

  return job.scheduled_start
}

function visitSummary(job: Job, visits: JobVisit[], today: string) {
  const visit =
    visits.find((v) => v.visit_date === today) ??
    visits
      .filter((v) => v.visit_date > today)
      .sort((a, b) => a.visit_date.localeCompare(b.visit_date))[0]

  if (!visit) return job.scheduled_start ? formatDate(job.scheduled_start) : "Unscheduled"
  const start = visit.start_time?.slice(0, 5)
  const end = visit.end_time?.slice(0, 5)
  return [formatDate(visit.visit_date), start && end ? `${start}-${end}` : start]
    .filter(Boolean)
    .join(" - ")
}

function readiness(data: JobCardData) {
  const prepared =
    data.requiredPrep === 0 || data.completedPrep >= data.requiredPrep
  const reported = data.report?.status === "submitted"
  return [
    {
      label:
        data.requiredPrep === 0
          ? "Prep"
          : `${data.completedPrep}/${data.requiredPrep}`,
      icon: ClipboardCheck,
      ready: prepared,
    },
    { label: `${data.photoCount}`, icon: Camera, ready: data.photoCount > 0 },
    { label: reported ? "Report" : "Report", icon: FileText, ready: reported },
    { label: "Sign", icon: PenLine, ready: data.signoffCount > 0 },
  ]
}

export default async function MyJobsPage() {
  const profile = await requireProfile()
  const firstName = profile.full_name?.split(" ")[0] ?? "there"
  const supabase = await createClient()
  const today = todayIso()

  const isStaff = profile.role === "admin" || profile.role === "office"

  let jobs: Job[] = []
  if (isStaff) {
    const { data } = await supabase
      .from("jobs")
      .select("*")
      .neq("status", "cancelled")
      .order("scheduled_start", { ascending: true, nullsFirst: false })
    jobs = data ?? []
  } else {
    const { data: assignments } = await supabase
      .from("job_assignments")
      .select("job_id")
      .eq("profile_id", profile.id)
    const jobIds = (assignments ?? []).map((a) => a.job_id)
    if (jobIds.length) {
      const { data } = await supabase
        .from("jobs")
        .select("*")
        .in("id", jobIds)
        .neq("status", "cancelled")
        .order("scheduled_start", { ascending: true, nullsFirst: false })
      jobs = data ?? []
    }
  }

  const jobIds = jobs.map((job) => job.id)
  const [
    { data: clients },
    { data: visits },
    { data: reports },
    { data: photos },
    { data: signoffs },
    { data: prepItems },
    { data: prepCompletions },
  ] = await Promise.all([
    supabase.from("clients").select("id, name"),
    jobIds.length
      ? supabase
          .from("job_visits")
          .select("*")
          .in("job_id", jobIds)
          .order("visit_date", { ascending: true })
      : Promise.resolve({ data: [] as JobVisit[] }),
    jobIds.length
      ? supabase
          .from("job_site_reports")
          .select("*")
          .in("job_id", jobIds)
          .eq("profile_id", profile.id)
          .eq("work_date", today)
      : Promise.resolve({ data: [] as JobSiteReport[] }),
    jobIds.length
      ? supabase
          .from("job_site_photos")
          .select("*")
          .in("job_id", jobIds)
          .eq("profile_id", profile.id)
      : Promise.resolve({ data: [] as JobSitePhoto[] }),
    jobIds.length
      ? supabase
          .from("job_signoffs")
          .select("*")
          .in("job_id", jobIds)
          .eq("profile_id", profile.id)
      : Promise.resolve({ data: [] as JobSignoff[] }),
    jobIds.length
      ? supabase.from("job_prep_items").select("*").in("job_id", jobIds)
      : Promise.resolve({ data: [] as JobPrepItem[] }),
    jobIds.length
      ? supabase
          .from("job_prep_completions")
          .select("*")
          .in("job_id", jobIds)
          .eq("profile_id", profile.id)
          .eq("work_date", today)
      : Promise.resolve({ data: [] as JobPrepCompletion[] }),
  ])

  const clientById = new Map((clients ?? []).map((c) => [c.id, c.name]))
  const visitsByJob = new Map<string, JobVisit[]>()
  for (const visit of visits ?? []) {
    visitsByJob.set(visit.job_id, [...(visitsByJob.get(visit.job_id) ?? []), visit])
  }
  const reportByJob = new Map((reports ?? []).map((report) => [report.job_id, report]))
  const photoCountByJob = new Map<string, number>()
  for (const photo of photos ?? []) {
    photoCountByJob.set(photo.job_id, (photoCountByJob.get(photo.job_id) ?? 0) + 1)
  }
  const signoffCountByJob = new Map<string, number>()
  for (const signoff of signoffs ?? []) {
    signoffCountByJob.set(
      signoff.job_id,
      (signoffCountByJob.get(signoff.job_id) ?? 0) + 1
    )
  }
  const prepByJob = new Map<string, JobPrepItem[]>()
  for (const item of prepItems ?? []) {
    prepByJob.set(item.job_id, [...(prepByJob.get(item.job_id) ?? []), item])
  }
  const prepDoneByJob = new Map<string, JobPrepCompletion[]>()
  for (const done of prepCompletions ?? []) {
    prepDoneByJob.set(done.job_id, [...(prepDoneByJob.get(done.job_id) ?? []), done])
  }

  const cards: JobCardData[] = jobs.map((job) => {
    const items = prepByJob.get(job.id) ?? []
    return {
      job,
      clientName: job.client_id ? (clientById.get(job.client_id) ?? null) : null,
      visits: visitsByJob.get(job.id) ?? [],
      report: reportByJob.get(job.id) ?? null,
      photoCount: photoCountByJob.get(job.id) ?? 0,
      signoffCount: signoffCountByJob.get(job.id) ?? 0,
      requiredPrep: items.filter((item) => item.required).length,
      completedPrep: prepDoneByJob.get(job.id)?.length ?? 0,
    }
  })

  const todayJobs = cards.filter((card) => {
    const visitsForJob = visitsByJob.get(card.job.id) ?? []
    return (
      card.job.scheduled_start === today ||
      visitsForJob.some((visit) => visit.visit_date === today)
    )
  })
  const upcomingJobs = cards.filter((card) => {
    if (todayJobs.includes(card)) return false
    const date = jobDate(card.job, card.visits, today)
    return !!date && date > today
  })
  const otherJobs = cards.filter(
    (card) => !todayJobs.includes(card) && !upcomingJobs.includes(card)
  )

  return (
    <>
      <PageHeader
        title={`Today, ${firstName}`}
        description={
          isStaff
            ? "Your field hub for logging work, photos, reports, and sign-off."
            : "Your jobs, prep, time, photos, reports, and sign-off in one place."
        }
        action={
          <Button render={<Link href="/my/timesheet" />} variant="outline">
            <CalendarDays /> Timesheet
          </Button>
        }
      />

      {cards.length === 0 ? (
        <EmptyState
          icon={Briefcase}
          title={isStaff ? "No active jobs yet" : "No jobs assigned yet"}
          description={
            isStaff
              ? "Active jobs will show up here for field logging."
              : "When the office assigns you to a job, it will show up here."
          }
        />
      ) : (
        <div className="flex flex-col gap-6">
          <JobSection title="Today" jobs={todayJobs} today={today} />
          <JobSection title="Upcoming" jobs={upcomingJobs} today={today} />
          <JobSection title="Other active jobs" jobs={otherJobs} today={today} />
        </div>
      )}
    </>
  )
}

function JobSection({
  title,
  jobs,
  today,
}: {
  title: string
  jobs: JobCardData[]
  today: string
}) {
  if (jobs.length === 0) return null
  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </h2>
        <span className="text-xs text-muted-foreground">{jobs.length}</span>
      </div>
      <div className="grid gap-3 xl:grid-cols-2">
        {jobs.map((job) => (
          <JobCard key={job.job.id} data={job} today={today} />
        ))}
      </div>
    </section>
  )
}

function JobCard({ data, today }: { data: JobCardData; today: string }) {
  const date = visitSummary(data.job, data.visits, today)
  const checks = readiness(data)
  return (
    <Card className="p-0">
      <Link
        href={`/my/jobs/${data.job.id}`}
        className="grid gap-3 p-4 transition-colors hover:bg-muted/40"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{data.job.title}</span>
              <JobStatusBadge status={data.job.status} />
            </div>
            <p className="mt-1 truncate text-sm text-muted-foreground">
              {data.job.job_number}
              {data.clientName ? ` - ${data.clientName}` : ""}
            </p>
          </div>
          <ChevronRight className="size-5 shrink-0 text-muted-foreground" />
        </div>

        <div className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
          <span className="flex min-w-0 items-center gap-2">
            <CalendarDays className="size-4 shrink-0" />
            <span className="truncate">{date}</span>
          </span>
          <span className="flex min-w-0 items-center gap-2">
            <MapPin className="size-4 shrink-0" />
            <span className="truncate">{data.job.site_address ?? "No address"}</span>
          </span>
        </div>

        <div className="flex flex-wrap gap-2">
          {checks.map((check) => {
            const Icon = check.icon
            return (
              <Badge
                key={`${data.job.id}-${check.label}`}
                variant={check.ready ? "default" : "secondary"}
                className="gap-1"
              >
                {check.ready ? <CheckCircle2 /> : <Icon />}
                {check.label}
              </Badge>
            )
          })}
        </div>
      </Link>
    </Card>
  )
}

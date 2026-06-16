import Link from "next/link"
import { startOfWeek, addDays, format, parseISO, isValid } from "date-fns"
import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react"

import { requireStaff } from "@/lib/auth"
import { createClient } from "@/lib/supabase/server"
import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { JobStatusBadge } from "@/components/jobs/job-status-badge"
import { AddJobDialog } from "@/components/jobs/add-job-dialog"
import type { JobStatus } from "@/lib/supabase/types"

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>
}) {
  await requireStaff()
  const supabase = await createClient()
  const { week } = await searchParams

  const base = week && isValid(parseISO(week)) ? parseISO(week) : new Date()
  const weekStart = startOfWeek(base, { weekStartsOn: 1 })
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
  const startStr = format(weekStart, "yyyy-MM-dd")
  const endStr = format(addDays(weekStart, 7), "yyyy-MM-dd")
  const prevWeek = format(addDays(weekStart, -7), "yyyy-MM-dd")
  const nextWeek = format(addDays(weekStart, 7), "yyyy-MM-dd")
  const todayStr = format(new Date(), "yyyy-MM-dd")

  const [
    { data: weekJobs },
    { data: weekVisits },
    { data: unscheduled },
    { data: clients },
  ] = await Promise.all([
    supabase
      .from("jobs")
      .select("id, job_number, title, status, client_id, scheduled_start")
      .gte("scheduled_start", startStr)
      .lt("scheduled_start", endStr)
      .order("scheduled_start"),
    supabase
      .from("job_visits")
      .select(
        "id, job_id, visit_date, start_time, end_time, note, job:jobs(id, title, status, client_id)"
      )
      .gte("visit_date", startStr)
      .lt("visit_date", endStr)
      .order("visit_date")
      .order("start_time", { nullsFirst: true }),
    supabase
      .from("jobs")
      .select("id, job_number, title, status, client_id")
      .is("scheduled_start", null)
      .in("status", ["scheduled", "in_progress"]),
    supabase.from("clients").select("id, name"),
  ])

  const clientById = new Map((clients ?? []).map((c) => [c.id, c.name]))

  type Event = {
    key: string // unique per event
    jobId: string
    title: string
    status: JobStatus
    clientId: string | null
    time: string | null // "HH:MM" start, or null
    note: string | null
  }
  const fmtTime = (t: string) => {
    const [h, m] = t.split(":")
    const hour = Number(h)
    const ampm = hour >= 12 ? "PM" : "AM"
    const h12 = hour % 12 === 0 ? 12 : hour % 12
    return `${h12}:${m} ${ampm}`
  }

  // Jobs that have a visit this week are represented by their visits, not by
  // their single scheduled_start (avoids double-listing).
  const jobsWithVisits = new Set((weekVisits ?? []).map((v) => v.job_id))
  const eventsByDay = new Map<string, Event[]>()
  const push = (day: string, e: Event) => {
    const arr = eventsByDay.get(day) ?? []
    arr.push(e)
    eventsByDay.set(day, arr)
  }

  for (const v of weekVisits ?? []) {
    const j = Array.isArray(v.job) ? v.job[0] : v.job
    if (!j) continue
    push(v.visit_date, {
      key: `v-${v.id}`,
      jobId: v.job_id,
      title: j.title,
      status: j.status as JobStatus,
      clientId: j.client_id,
      time: v.start_time ? fmtTime(v.start_time) : null,
      note: v.note,
    })
  }
  for (const j of weekJobs ?? []) {
    if (jobsWithVisits.has(j.id)) continue
    push(j.scheduled_start as string, {
      key: `j-${j.id}`,
      jobId: j.id,
      title: j.title,
      status: j.status as JobStatus,
      clientId: j.client_id,
      time: null,
      note: null,
    })
  }

  return (
    <>
      <PageHeader
        title="Schedule"
        description={`Week of ${format(weekStart, "MMM d, yyyy")}`}
        action={
          <div className="flex items-center gap-1">
            <Button render={<Link href={`/schedule?week=${prevWeek}`} />} variant="outline" size="icon" aria-label="Previous week">
              <ChevronLeft />
            </Button>
            <Button render={<Link href="/schedule" />} variant="outline" size="sm">
              Today
            </Button>
            <Button render={<Link href={`/schedule?week=${nextWeek}`} />} variant="outline" size="icon" aria-label="Next week">
              <ChevronRight />
            </Button>
            <AddJobDialog clients={clients ?? []} />
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-7">
        {days.map((day) => {
          const key = format(day, "yyyy-MM-dd")
          const list = eventsByDay.get(key) ?? []
          const isToday = key === todayStr
          return (
            <div
              key={key}
              className={`flex min-h-36 flex-col rounded-xl border p-2 ${
                isToday ? "border-primary bg-primary/5" : ""
              }`}
            >
              <div className="mb-2 flex items-baseline justify-between px-1">
                <span className="text-xs font-medium text-muted-foreground">
                  {DAY_LABELS[(day.getDay() + 6) % 7]}
                </span>
                <span
                  className={`text-sm font-semibold ${isToday ? "text-primary" : ""}`}
                >
                  {format(day, "d")}
                </span>
              </div>
              <div className="flex flex-col gap-1.5">
                {list.map((e) => (
                  <Link
                    key={e.key}
                    href={`/jobs/${e.jobId}`}
                    className="rounded-lg border bg-card p-2 text-xs transition-colors hover:bg-muted"
                  >
                    {e.time && (
                      <p className="font-semibold text-primary">{e.time}</p>
                    )}
                    <p className="truncate font-medium">{e.title}</p>
                    <p className="truncate text-muted-foreground">
                      {e.clientId ? (clientById.get(e.clientId) ?? "") : ""}
                    </p>
                    {e.note && (
                      <p className="truncate text-muted-foreground">{e.note}</p>
                    )}
                    <div className="mt-1">
                      <JobStatusBadge status={e.status} />
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      {/* Needs scheduling */}
      <div className="mt-8">
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">
          Needs scheduling
        </h2>
        {(unscheduled ?? []).length === 0 ? (
          <Card>
            <CardContent className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
              <CalendarDays className="size-4" /> Everything active is scheduled.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {(unscheduled ?? []).map((j) => (
              <Link
                key={j.id}
                href={`/jobs/${j.id}`}
                className="flex items-center justify-between gap-2 rounded-xl border bg-card p-3 text-sm transition-colors hover:bg-muted"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{j.title}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {j.job_number}
                    {j.client_id && clientById.get(j.client_id)
                      ? ` · ${clientById.get(j.client_id)}`
                      : ""}
                  </p>
                </div>
                <JobStatusBadge status={j.status as JobStatus} />
              </Link>
            ))}
          </div>
        )}
      </div>
    </>
  )
}

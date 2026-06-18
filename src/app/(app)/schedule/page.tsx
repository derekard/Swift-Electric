import Link from "next/link"
import {
  addDays,
  addMonths,
  differenceInCalendarDays,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  isValid,
  parseISO,
  startOfMonth,
  startOfWeek,
} from "date-fns"
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react"

import { requireStaff } from "@/lib/auth"
import { createClient } from "@/lib/supabase/server"
import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { JobStatusBadge } from "@/components/jobs/job-status-badge"
import { AddJobDialog } from "@/components/jobs/add-job-dialog"
import type { JobStatus } from "@/lib/supabase/types"
import { cn } from "@/lib/utils"

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
const SCHEDULE_VIEWS = ["day", "week", "month"] as const

type ScheduleView = (typeof SCHEDULE_VIEWS)[number]

function parseView(value?: string): ScheduleView {
  return SCHEDULE_VIEWS.includes(value as ScheduleView)
    ? (value as ScheduleView)
    : "week"
}

function parseAnchorDate(value?: string) {
  if (!value) return new Date()
  const parsed = parseISO(value)
  return isValid(parsed) ? parsed : new Date()
}

function toDateKey(value: string) {
  const parsed = parseISO(value)
  return isValid(parsed) ? format(parsed, "yyyy-MM-dd") : value.slice(0, 10)
}

function scheduleHref(view: ScheduleView, date: Date) {
  return `/schedule?view=${view}&date=${format(date, "yyyy-MM-dd")}`
}

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; view?: string; week?: string }>
}) {
  await requireStaff()
  const supabase = await createClient()
  const { date, view: viewParam, week } = await searchParams

  const view = parseView(viewParam)
  const base = parseAnchorDate(date ?? week)
  const today = new Date()
  const todayStr = format(today, "yyyy-MM-dd")

  const weekStart = startOfWeek(base, { weekStartsOn: 1 })
  const monthStart = startOfMonth(base)

  const range =
    view === "day"
      ? {
          start: base,
          end: addDays(base, 1),
          prev: addDays(base, -1),
          next: addDays(base, 1),
          description: format(base, "EEEE, MMM d, yyyy"),
        }
      : view === "month"
        ? {
            start: startOfWeek(monthStart, { weekStartsOn: 1 }),
            end: addDays(endOfWeek(endOfMonth(base), { weekStartsOn: 1 }), 1),
            prev: addMonths(monthStart, -1),
            next: addMonths(monthStart, 1),
            description: format(base, "MMMM yyyy"),
          }
        : {
            start: weekStart,
            end: addDays(weekStart, 7),
            prev: addDays(weekStart, -7),
            next: addDays(weekStart, 7),
            description: `Week of ${format(weekStart, "MMM d, yyyy")}`,
          }

  const days = Array.from(
    { length: differenceInCalendarDays(range.end, range.start) },
    (_, i) => addDays(range.start, i)
  )
  const startStr = format(range.start, "yyyy-MM-dd")
  const endStr = format(range.end, "yyyy-MM-dd")

  const [
    { data: rangeJobs },
    { data: rangeVisits },
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
    sortTime: string | null
    note: string | null
  }
  const fmtTime = (t: string) => {
    const [h, m] = t.split(":")
    const hour = Number(h)
    const ampm = hour >= 12 ? "PM" : "AM"
    const h12 = hour % 12 === 0 ? 12 : hour % 12
    return `${h12}:${m} ${ampm}`
  }

  // Jobs that have a visit in this range are represented by their visits, not by
  // their single scheduled_start (avoids double-listing).
  const jobsWithVisits = new Set((rangeVisits ?? []).map((v) => v.job_id))
  const eventsByDay = new Map<string, Event[]>()
  const push = (day: string, e: Event) => {
    const arr = eventsByDay.get(day) ?? []
    arr.push(e)
    eventsByDay.set(day, arr)
  }

  for (const v of rangeVisits ?? []) {
    const j = Array.isArray(v.job) ? v.job[0] : v.job
    if (!j) continue
    push(v.visit_date, {
      key: `v-${v.id}`,
      jobId: v.job_id,
      title: j.title,
      status: j.status as JobStatus,
      clientId: j.client_id,
      time: v.start_time ? fmtTime(v.start_time) : null,
      sortTime: v.start_time,
      note: v.note,
    })
  }
  for (const j of rangeJobs ?? []) {
    if (jobsWithVisits.has(j.id)) continue
    if (!j.scheduled_start) continue
    push(toDateKey(j.scheduled_start), {
      key: `j-${j.id}`,
      jobId: j.id,
      title: j.title,
      status: j.status as JobStatus,
      clientId: j.client_id,
      time: null,
      sortTime: null,
      note: null,
    })
  }
  for (const list of eventsByDay.values()) {
    list.sort((a, b) => {
      const timeA = a.sortTime ?? "99:99"
      const timeB = b.sortTime ?? "99:99"
      return timeA.localeCompare(timeB) || a.title.localeCompare(b.title)
    })
  }

  const compact = view === "month"

  return (
    <>
      <PageHeader
        title="Schedule"
        description={range.description}
        action={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <div className="flex items-center gap-1">
              <Button
                render={<Link href={scheduleHref(view, range.prev)} />}
                variant="outline"
                size="icon"
                aria-label={`Previous ${view}`}
              >
                <ChevronLeft />
              </Button>
              <Button
                render={<Link href={scheduleHref(view, today)} />}
                variant="outline"
                size="sm"
              >
                Today
              </Button>
              <Button
                render={<Link href={scheduleHref(view, range.next)} />}
                variant="outline"
                size="icon"
                aria-label={`Next ${view}`}
              >
                <ChevronRight />
              </Button>
            </div>
            <div
              className="flex rounded-lg border bg-background p-0.5"
              role="group"
              aria-label="Schedule view"
            >
              {SCHEDULE_VIEWS.map((option) => (
                <Button
                  key={option}
                  render={<Link href={scheduleHref(option, base)} />}
                  variant={view === option ? "default" : "ghost"}
                  size="sm"
                  className="h-7 px-3 capitalize"
                  aria-current={view === option ? "page" : undefined}
                >
                  {option}
                </Button>
              ))}
            </div>
            <AddJobDialog clients={clients ?? []} />
          </div>
        }
      />

      <div
        className={cn(
          "grid grid-cols-1 gap-2",
          view !== "day" && "sm:grid-cols-2 lg:grid-cols-7"
        )}
      >
        {days.map((day) => {
          const key = format(day, "yyyy-MM-dd")
          const list = eventsByDay.get(key) ?? []
          const isToday = key === todayStr
          const isOutsideMonth = compact && !isSameMonth(day, base)
          const visibleEvents = compact ? list.slice(0, 4) : list
          return (
            <div
              key={key}
              className={cn(
                "flex flex-col rounded-xl border p-2",
                view === "day" ? "min-h-72" : compact ? "min-h-32" : "min-h-36",
                isToday && "border-primary bg-primary/5",
                isOutsideMonth && "bg-muted/20 text-muted-foreground"
              )}
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
                {visibleEvents.map((e) => (
                  <Link
                    key={e.key}
                    href={`/jobs/${e.jobId}`}
                    className={cn(
                      "rounded-lg border bg-card text-xs transition-colors hover:bg-muted",
                      compact ? "p-1.5" : "p-2"
                    )}
                  >
                    {e.time && (
                      <p className="font-semibold text-primary">{e.time}</p>
                    )}
                    <p className="truncate font-medium">{e.title}</p>
                    {!compact && (
                      <>
                        <p className="truncate text-muted-foreground">
                          {e.clientId ? (clientById.get(e.clientId) ?? "") : ""}
                        </p>
                        {e.note && (
                          <p className="truncate text-muted-foreground">
                            {e.note}
                          </p>
                        )}
                        <div className="mt-1">
                          <JobStatusBadge status={e.status} />
                        </div>
                      </>
                    )}
                  </Link>
                ))}
                {compact && list.length > visibleEvents.length && (
                  <p className="px-1 text-xs text-muted-foreground">
                    +{list.length - visibleEvents.length} more
                  </p>
                )}
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
                      ? ` - ${clientById.get(j.client_id)}`
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

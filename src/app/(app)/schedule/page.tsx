import Link from "next/link"
import { startOfWeek, addDays, format, parseISO, isValid } from "date-fns"
import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react"

import { requireStaff } from "@/lib/auth"
import { createClient } from "@/lib/supabase/server"
import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { JobStatusBadge } from "@/components/jobs/job-status-badge"
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

  const [{ data: weekJobs }, { data: unscheduled }, { data: clients }] =
    await Promise.all([
      supabase
        .from("jobs")
        .select("id, job_number, title, status, client_id, scheduled_start")
        .gte("scheduled_start", startStr)
        .lt("scheduled_start", endStr)
        .order("scheduled_start"),
      supabase
        .from("jobs")
        .select("id, job_number, title, status, client_id")
        .is("scheduled_start", null)
        .in("status", ["scheduled", "in_progress"]),
      supabase.from("clients").select("id, name"),
    ])

  const clientById = new Map((clients ?? []).map((c) => [c.id, c.name]))
  const jobsByDay = new Map<string, NonNullable<typeof weekJobs>>()
  for (const j of weekJobs ?? []) {
    const key = j.scheduled_start as string
    const arr = jobsByDay.get(key) ?? []
    arr.push(j)
    jobsByDay.set(key, arr)
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
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-7">
        {days.map((day) => {
          const key = format(day, "yyyy-MM-dd")
          const list = jobsByDay.get(key) ?? []
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
                {list.map((j) => (
                  <Link
                    key={j.id}
                    href={`/jobs/${j.id}`}
                    className="rounded-lg border bg-card p-2 text-xs transition-colors hover:bg-muted"
                  >
                    <p className="truncate font-medium">{j.title}</p>
                    <p className="truncate text-muted-foreground">
                      {j.client_id ? (clientById.get(j.client_id) ?? "") : ""}
                    </p>
                    <div className="mt-1">
                      <JobStatusBadge status={j.status as JobStatus} />
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

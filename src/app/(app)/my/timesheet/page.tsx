import { Clock } from "lucide-react"

import { requireProfile } from "@/lib/auth"
import { createClient } from "@/lib/supabase/server"
import { getBranding } from "@/lib/settings"
import { money, formatDate, round2 } from "@/lib/format"
import { PageHeader } from "@/components/page-header"
import { EmptyState } from "@/components/empty-state"
import { Card, CardContent } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { EntryStatusBadge } from "@/components/timesheets/entry-status-badge"
import { SubmitDraftsButton } from "@/components/timesheets/submit-drafts-button"

function startOfWeekISO(): string {
  const d = new Date()
  const day = (d.getDay() + 6) % 7 // Mon = 0
  d.setDate(d.getDate() - day)
  return d.toISOString().slice(0, 10)
}

export default async function TimesheetPage() {
  const profile = await requireProfile()
  const supabase = await createClient()

  const [{ data: time }, { data: mileage }, { data: jobs }, branding] =
    await Promise.all([
      supabase
        .from("time_entries")
        .select("*")
        .eq("profile_id", profile.id)
        .order("work_date", { ascending: false })
        .limit(100),
      supabase
        .from("mileage_entries")
        .select("*")
        .eq("profile_id", profile.id)
        .order("travel_date", { ascending: false })
        .limit(100),
      supabase.from("jobs").select("id, job_number, title"),
      getBranding(),
    ])

  const jobById = new Map((jobs ?? []).map((j) => [j.id, j]))
  const rate = branding?.mileage_rate ?? 0.7
  const weekStart = startOfWeekISO()

  const times = time ?? []
  const miles = mileage ?? []

  const hoursThisWeek = times
    .filter((t) => t.work_date >= weekStart)
    .reduce((s, t) => s + Number(t.hours), 0)
  const totalHours = times.reduce((s, t) => s + Number(t.hours), 0)
  const totalKm = miles.reduce((s, m) => s + Number(m.km), 0)
  const draftCount =
    times.filter((t) => t.status === "draft").length +
    miles.filter((m) => m.status === "draft").length

  type Row = {
    id: string
    date: string
    jobLabel: string
    type: string
    value: string
    status: (typeof times)[number]["status"]
  }
  const rows: Row[] = [
    ...times.map((t) => ({
      id: `t-${t.id}`,
      date: t.work_date,
      jobLabel: jobById.get(t.job_id)?.title ?? "—",
      type: "Time",
      value: `${Number(t.hours)} h`,
      status: t.status,
    })),
    ...miles.map((m) => ({
      id: `m-${m.id}`,
      date: m.travel_date,
      jobLabel: jobById.get(m.job_id)?.title ?? "—",
      type: "Mileage",
      value: `${Number(m.km)} km`,
      status: m.status,
    })),
  ].sort((a, b) => (a.date < b.date ? 1 : -1))

  return (
    <>
      <PageHeader
        title="Timesheet"
        description="Your hours and mileage across all jobs."
        action={<SubmitDraftsButton count={draftCount} />}
      />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="This week" value={`${round2(hoursThisWeek)} h`} />
        <Stat label="Total hours" value={`${round2(totalHours)} h`} />
        <Stat label="Total mileage" value={`${round2(totalKm)} km`} />
        <Stat label="Mileage value" value={money(round2(totalKm * rate))} />
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={Clock}
          title="Nothing logged yet"
          description="Open a job from My jobs to log time and mileage."
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Job</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="text-muted-foreground">
                    {formatDate(r.date)}
                  </TableCell>
                  <TableCell>{r.jobLabel}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {r.type}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {r.value}
                  </TableCell>
                  <TableCell>
                    <EntryStatusBadge status={r.status} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="py-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
      </CardContent>
    </Card>
  )
}

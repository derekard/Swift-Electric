"use client"

import { useMemo, useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  AlertTriangle,
  ArrowLeft,
  Camera,
  Check,
  ClipboardCheck,
  Clock,
  FileText,
  ImageIcon,
  Mic,
  MapPin,
  Navigation,
  Package,
  Printer,
  Play,
  Plus,
  RotateCcw,
  Send,
  Square,
  Trash2,
  Upload,
} from "lucide-react"
import { toast } from "sonner"

import { createClient } from "@/lib/supabase/client"
import type {
  Expense,
  Job,
  JobPrepCompletion,
  JobPrepItem,
  JobSignoff,
  JobSitePhoto,
  JobSiteReport,
  JobVisit,
  JobWorkflowEvent,
  MileageEntry,
  SitePhotoLabel,
  SignoffRole,
  TimeEntry,
} from "@/lib/supabase/types"
import { cn } from "@/lib/utils"
import { money, formatDate } from "@/lib/format"
import {
  addExpenseAction,
  addMileageEntryAction,
  addSignoffAction,
  addSitePhotoAction,
  addTimeEntryAction,
  calcMileageAction,
  deleteExpenseAction,
  deleteMileageEntryAction,
  deleteSitePhotoAction,
  deleteTimeEntryAction,
  recordWorkflowEventAction,
  saveSiteReportAction,
  submitEntriesAction,
  submitSiteReportAction,
  togglePrepItemAction,
} from "@/app/(app)/my/actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { JobStatusBadge } from "@/components/jobs/job-status-badge"
import { EntryStatusBadge } from "@/components/timesheets/entry-status-badge"
import { PhotoViewerDialog } from "@/components/site-photos/photo-viewer-dialog"

type PrepRow = {
  id: string | null
  label: string
  category: string
  required: boolean
  sort: number
  completed: boolean
}

const DEFAULT_PREP: Omit<PrepRow, "id" | "completed">[] = [
  { label: "PPE", category: "Safety", required: true, sort: 10 },
  { label: "Meter / tester", category: "Tools", required: true, sort: 20 },
  { label: "Hand tools", category: "Tools", required: true, sort: 30 },
  { label: "Ladder", category: "Tools", required: true, sort: 40 },
  { label: "Job-specific parts", category: "Materials", required: true, sort: 50 },
  { label: "Drawings / permits", category: "Documents", required: false, sort: 60 },
  { label: "Access instructions", category: "Site", required: true, sort: 70 },
]

const PHOTO_LABELS: { value: SitePhotoLabel; label: string }[] = [
  { value: "before", label: "Before" },
  { value: "after", label: "After" },
  { value: "issue", label: "Issue" },
  { value: "equipment", label: "Equipment" },
  { value: "panel", label: "Panel" },
  { value: "material", label: "Material" },
  { value: "safety", label: "Safety" },
  { value: "other", label: "Other" },
]

const SIGNOFF_ROLES: { value: SignoffRole; label: string }[] = [
  { value: "customer", label: "Customer" },
  { value: "supervisor", label: "Supervisor" },
  { value: "unavailable", label: "Unavailable" },
]

type ParsedFieldReport = {
  work_performed: string
  issues: string
  materials_summary: string
  recommendations: string
}

type SpeechResultList = ArrayLike<ArrayLike<{ transcript: string }>>
type SpeechRecognitionEventLike = {
  resultIndex: number
  results: SpeechResultList
}
type SpeechRecognitionLike = {
  lang: string
  continuous: boolean
  interimResults: boolean
  start: () => void
  stop: () => void
  onresult: ((event: SpeechRecognitionEventLike) => void) | null
  onerror: ((event: { error: string }) => void) | null
  onend: (() => void) | null
}
type SpeechRecognitionConstructor = new () => SpeechRecognitionLike

const canEdit = (s: string) => s === "draft" || s === "rejected"
const inputDate = () => new Date().toISOString().slice(0, 10)

function getRecognition() {
  if (typeof window === "undefined") return null
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionConstructor
    webkitSpeechRecognition?: SpeechRecognitionConstructor
  }
  const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition
  return Ctor ? new Ctor() : null
}

function fmtTime(value: string | null | undefined) {
  if (!value) return "--"
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return "--"
  return d.toLocaleTimeString("en-CA", { hour: "numeric", minute: "2-digit" })
}

function sameDay(value: string, date: string) {
  return value.slice(0, 10) === date
}

function hoursBetween(start: string, end: string) {
  const a = new Date(start).getTime()
  const b = new Date(end).getTime()
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return 0
  return Math.round(((b - a) / 36_000) * 100) / 100
}

function onsiteHours(events: JobWorkflowEvent[], workDate: string) {
  const dayEvents = events
    .filter((event) => sameDay(event.happened_at, workDate))
    .sort((a, b) => a.happened_at.localeCompare(b.happened_at))

  let started: string | null = null
  let total = 0
  for (const event of dayEvents) {
    if (event.event_type === "arrived") started = event.happened_at
    if (event.event_type === "departed" && started) {
      total += hoursBetween(started, event.happened_at)
      started = null
    }
  }
  if (started) total += hoursBetween(started, new Date().toISOString())
  return Math.round(total * 100) / 100
}

function latestEvent(events: JobWorkflowEvent[], workDate: string) {
  return events
    .filter((event) => sameDay(event.happened_at, workDate))
    .sort((a, b) => b.happened_at.localeCompare(a.happened_at))[0]
}

function visitLabel(visits: JobVisit[], workDate: string) {
  const visit = visits.find((v) => v.visit_date === workDate)
  if (!visit) return null
  const start = visit.start_time?.slice(0, 5)
  const end = visit.end_time?.slice(0, 5)
  return [formatDate(visit.visit_date), start && end ? `${start}-${end}` : start]
    .filter(Boolean)
    .join(" - ")
}

async function compressImage(file: File) {
  const bitmap = await createImageBitmap(file)
  const maxWidth = 1600
  const scale = Math.min(1, maxWidth / bitmap.width)
  const width = Math.max(1, Math.round(bitmap.width * scale))
  const height = Math.max(1, Math.round(bitmap.height * scale))

  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("Could not prepare image")
  ctx.drawImage(bitmap, 0, 0, width, height)

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", 0.72)
  )
  bitmap.close()
  if (!blob) throw new Error("Could not compress image")
  return { blob, width, height }
}

export function TechnicianJobWorkspace({
  job,
  clientName,
  visits,
  time,
  mileage,
  expenses,
  prepItems,
  prepCompletions,
  workflowEvents,
  siteReport,
  photos,
  signoffs,
  homeAddress,
  mapboxEnabled,
  tenantId,
  profileId,
  workDate,
}: {
  job: Job
  clientName: string | null
  visits: JobVisit[]
  time: TimeEntry[]
  mileage: MileageEntry[]
  expenses: Expense[]
  prepItems: JobPrepItem[]
  prepCompletions: JobPrepCompletion[]
  workflowEvents: JobWorkflowEvent[]
  siteReport: JobSiteReport | null
  photos: JobSitePhoto[]
  signoffs: JobSignoff[]
  homeAddress: string | null
  mapboxEnabled: boolean
  tenantId: string
  profileId: string
  workDate: string
}) {
  const router = useRouter()
  const refresh = () => router.refresh()
  const prepRows = useMemo(() => {
    const completedPrep = new Set(
      prepCompletions.map((item) => item.prep_item_id)
    )
    const rows = new Map<string, PrepRow>()
    for (const item of DEFAULT_PREP) {
      rows.set(item.label, { ...item, id: null, completed: false })
    }
    for (const item of prepItems) {
      rows.set(item.label, {
        id: item.id,
        label: item.label,
        category: item.category,
        required: item.required,
        sort: item.sort,
        completed: completedPrep.has(item.id),
      })
    }
    return [...rows.values()].sort((a, b) => a.sort - b.sort)
  }, [prepCompletions, prepItems])

  const onsite = onsiteHours(workflowEvents, workDate)
  const latest = latestEvent(workflowEvents, workDate)
  const requiredPrep = prepRows.filter((item) => item.required)
  const readyCount = requiredPrep.filter((item) => item.completed).length
  const reportSubmitted = siteReport?.status === "submitted"
  const hasSignoff = signoffs.length > 0
  const hasPhotos = photos.length > 0
  const visit = visitLabel(visits, workDate)

  async function submit() {
    const res = await submitEntriesAction(job.id)
    if (!res.ok) return toast.error(res.error)
    toast.success("Submitted for approval")
    refresh()
  }

  const hasDrafts =
    time.some((t) => t.status === "draft") ||
    mileage.some((m) => m.status === "draft")

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <Button
            render={<Link href="/my/jobs" />}
            variant="ghost"
            size="icon"
            aria-label="Back"
          >
            <ArrowLeft />
          </Button>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold tracking-tight md:text-2xl">
                {job.title}
              </h1>
              <JobStatusBadge status={job.status} />
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {job.job_number}
              {clientName ? ` - ${clientName}` : ""}
              {visit ? ` - ${visit}` : ` - ${formatDate(workDate)}`}
            </p>
          </div>
        </div>
        {hasDrafts && (
          <Button onClick={submit} className="hidden sm:inline-flex">
            <Send /> Submit
          </Button>
        )}
      </div>

      <section className="grid gap-3 md:grid-cols-4">
        <StatusTile
          icon={ClipboardCheck}
          label="Prepared"
          value={`${readyCount}/${requiredPrep.length}`}
          tone={readyCount === requiredPrep.length ? "good" : "warn"}
        />
        <StatusTile
          icon={Clock}
          label="Onsite"
          value={`${onsite || 0} h`}
          tone={onsite > 0 ? "good" : "neutral"}
        />
        <StatusTile
          icon={ImageIcon}
          label="Photos"
          value={String(photos.length)}
          tone={hasPhotos ? "good" : "warn"}
        />
        <StatusTile
          icon={FileText}
          label="Closeout"
          value={hasSignoff && reportSubmitted ? "Ready" : "Open"}
          tone={hasSignoff && reportSubmitted ? "good" : "warn"}
        />
      </section>

      <section className="grid gap-5 lg:grid-cols-[1fr_360px]">
        <div className="order-2 flex flex-col gap-5 lg:order-1">
          <OverviewCard job={job} latest={latest} />
          <PrepChecklist
            jobId={job.id}
            workDate={workDate}
            rows={prepRows}
            onChange={refresh}
          />
          <TimeCard
            jobId={job.id}
            workDate={workDate}
            entries={time}
            suggestedHours={onsite}
            onChange={refresh}
          />
          <MileageCard
            jobId={job.id}
            entries={mileage}
            onChange={refresh}
            homeAddress={homeAddress}
            siteAddress={job.site_address}
            canAutoCalc={mapboxEnabled}
          />
          <ExpenseCard
            jobId={job.id}
            tenantId={tenantId}
            entries={expenses}
            onChange={refresh}
          />
        </div>

        <div className="order-1 flex flex-col gap-5 lg:order-2">
          <WorkflowCard
            jobId={job.id}
            workDate={workDate}
            latest={latest}
            events={workflowEvents}
            onsiteHours={onsite}
            onChange={refresh}
          />
          <PhotoCaptureCard
            jobId={job.id}
            workDate={workDate}
            tenantId={tenantId}
            profileId={profileId}
            photos={photos}
            siteReportId={siteReport?.id ?? null}
            onChange={refresh}
          />
          <SiteReportCard
            jobId={job.id}
            workDate={workDate}
            report={siteReport}
            onChange={refresh}
          />
          <SignoffCard
            jobId={job.id}
            workDate={workDate}
            tenantId={tenantId}
            profileId={profileId}
            siteReportId={siteReport?.id ?? null}
            signoffs={signoffs}
            onChange={refresh}
          />
        </div>
      </section>

      {hasDrafts && (
        <div className="sticky bottom-3 z-10 sm:hidden">
          <Button onClick={submit} className="h-11 w-full shadow-lg">
            <Send /> Submit time and mileage
          </Button>
        </div>
      )}
    </div>
  )
}

function StatusTile({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: React.ElementType
  label: string
  value: string
  tone: "good" | "warn" | "neutral"
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-lg border p-3",
        tone === "good" && "border-emerald-200 bg-emerald-50 text-emerald-950",
        tone === "warn" && "border-amber-200 bg-amber-50 text-amber-950",
        tone === "neutral" && "bg-card"
      )}
    >
      <Icon className="size-5 shrink-0" />
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="font-semibold">{value}</p>
      </div>
    </div>
  )
}

function OverviewCard({
  job,
  latest,
}: {
  job: Job
  latest: JobWorkflowEvent | undefined
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Job overview</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 text-sm">
        <InfoRow icon={MapPin} label="Site" value={job.site_address ?? "No address"} />
        <InfoRow
          icon={Clock}
          label="Last status"
          value={
            latest
              ? `${latest.event_type.replace("_", " ")} at ${fmtTime(latest.happened_at)}`
              : "No field status yet"
          }
        />
        {job.notes && (
          <div className="rounded-lg border bg-muted/30 p-3">
            <p className="text-xs font-medium text-muted-foreground">Notes</p>
            <p className="mt-1 whitespace-pre-wrap">{job.notes}</p>
          </div>
        )}
        {job.site_address && (
          <Button
            render={
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(job.site_address)}`}
                target="_blank"
                rel="noreferrer"
              />
            }
            variant="outline"
            className="justify-start"
          >
            <Navigation /> Navigate
          </Button>
        )}
      </CardContent>
    </Card>
  )
}

function InfoRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType
  label: string
  value: string
}) {
  return (
    <div className="flex items-start gap-3">
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p>{value}</p>
      </div>
    </div>
  )
}

function PrepChecklist({
  jobId,
  workDate,
  rows,
  onChange,
}: {
  jobId: string
  workDate: string
  rows: PrepRow[]
  onChange: () => void
}) {
  const [busy, setBusy] = useState<string | null>(null)

  async function toggle(row: PrepRow) {
    setBusy(row.label)
    const res = await togglePrepItemAction({
      job_id: jobId,
      work_date: workDate,
      label: row.label,
      category: row.category,
      required: row.required,
      sort: row.sort,
      completed: !row.completed,
    })
    setBusy(null)
    if (!res.ok) return toast.error(res.error)
    onChange()
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">What to bring</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col divide-y">
        {rows.map((row) => (
          <button
            key={row.label}
            type="button"
            disabled={busy === row.label}
            onClick={() => toggle(row)}
            className="flex min-h-12 items-center gap-3 py-2 text-left disabled:opacity-60"
          >
            <span
              className={cn(
                "flex size-6 shrink-0 items-center justify-center rounded-md border",
                row.completed && "border-emerald-600 bg-emerald-600 text-white"
              )}
            >
              {row.completed && <Check className="size-4" />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-medium">{row.label}</span>
              <span className="text-xs text-muted-foreground">
                {row.category}
                {row.required ? " - required" : ""}
              </span>
            </span>
          </button>
        ))}
      </CardContent>
    </Card>
  )
}

function WorkflowCard({
  jobId,
  workDate,
  latest,
  events,
  onsiteHours,
  onChange,
}: {
  jobId: string
  workDate: string
  latest: JobWorkflowEvent | undefined
  events: JobWorkflowEvent[]
  onsiteHours: number
  onChange: () => void
}) {
  const [busy, setBusy] = useState<string | null>(null)

  async function record(eventType: JobWorkflowEvent["event_type"], note?: string) {
    setBusy(eventType)
    const res = await recordWorkflowEventAction({
      job_id: jobId,
      work_date: workDate,
      event_type: eventType,
      note: note ?? null,
    })
    setBusy(null)
    if (!res.ok) return toast.error(res.error)
    toast.success("Status recorded")
    onChange()
  }

  const dayEvents = events
    .filter((event) => sameDay(event.happened_at, workDate))
    .sort((a, b) => b.happened_at.localeCompare(a.happened_at))

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Field status</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3">
        <div className="rounded-lg border bg-muted/30 p-3 text-sm">
          <p className="text-xs text-muted-foreground">Current</p>
          <p className="mt-1 font-medium">
            {latest ? latest.event_type.replace("_", " ") : "Not started"}
          </p>
          <p className="text-xs text-muted-foreground">
            Onsite timer estimate: {onsiteHours || 0} h
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="outline"
            onClick={() => record("travel_started")}
            disabled={busy === "travel_started"}
          >
            <Play /> Travel
          </Button>
          <Button
            onClick={() => record("arrived")}
            disabled={busy === "arrived"}
          >
            <MapPin /> Arrived
          </Button>
          <Button
            variant="outline"
            onClick={() => record("departed")}
            disabled={busy === "departed"}
          >
            <Square /> Depart
          </Button>
          <Button
            variant="outline"
            onClick={() => record("completed")}
            disabled={busy === "completed"}
          >
            <Check /> Complete
          </Button>
        </div>
        <Button
          variant="destructive"
          onClick={() => record("blocked", "Needs office follow-up")}
          disabled={busy === "blocked"}
        >
          <AlertTriangle /> Blocked
        </Button>
        <div className="flex flex-col divide-y">
          {dayEvents.length === 0 ? (
            <p className="text-sm text-muted-foreground">No events today.</p>
          ) : (
            dayEvents.map((event) => (
              <div key={event.id} className="flex items-center justify-between py-2 text-sm">
                <span className="capitalize">{event.event_type.replace("_", " ")}</span>
                <span className="text-muted-foreground">{fmtTime(event.happened_at)}</span>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function TimeCard({
  jobId,
  workDate,
  entries,
  suggestedHours,
  onChange,
}: {
  jobId: string
  workDate: string
  entries: TimeEntry[]
  suggestedHours: number
  onChange: () => void
}) {
  const [date, setDate] = useState(workDate)
  const [hours, setHours] = useState("")
  const [notes, setNotes] = useState("")
  const [busy, setBusy] = useState(false)

  async function add() {
    setBusy(true)
    const res = await addTimeEntryAction({
      job_id: jobId,
      work_date: date,
      hours: Number(hours),
      notes: notes || null,
    })
    setBusy(false)
    if (!res.ok) return toast.error(res.error)
    setHours("")
    setNotes("")
    onChange()
  }

  async function remove(id: string) {
    const res = await deleteTimeEntryAction(id)
    if (!res.ok) return toast.error(res.error)
    onChange()
  }

  const totalHours = entries.reduce((s, e) => s + Number(e.hours), 0)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          Time <span className="font-normal text-muted-foreground">- {totalHours} h</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {suggestedHours > 0 && (
          <Button
            variant="outline"
            onClick={() => {
              setDate(workDate)
              setHours(String(suggestedHours))
              setNotes("Onsite timer")
            }}
          >
            <Clock /> Use onsite time ({suggestedHours} h)
          </Button>
        )}
        <div className="grid gap-2 sm:grid-cols-[150px_100px_1fr_auto]">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <Input
            type="number"
            step="0.25"
            placeholder="Hours"
            value={hours}
            onChange={(e) => setHours(e.target.value)}
          />
          <Input
            placeholder="Notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
          <Button onClick={add} disabled={busy || !hours}>
            <Plus /> Add
          </Button>
        </div>
        <EntryList
          rows={entries.map((e) => ({
            id: e.id,
            status: e.status,
            left: formatDate(e.work_date),
            mid: `${Number(e.hours)} h`,
            note: e.notes,
          }))}
          onDelete={remove}
        />
      </CardContent>
    </Card>
  )
}

function MileageCard({
  jobId,
  entries,
  onChange,
  homeAddress,
  siteAddress,
  canAutoCalc,
}: {
  jobId: string
  entries: MileageEntry[]
  onChange: () => void
  homeAddress: string | null
  siteAddress: string | null
  canAutoCalc: boolean
}) {
  const [date, setDate] = useState(inputDate())
  const [km, setKm] = useState("")
  const [notes, setNotes] = useState("")
  const [busy, setBusy] = useState(false)
  const [calcing, setCalcing] = useState(false)

  async function calculate() {
    if (!homeAddress) return toast.error("Set your home address on the Timesheet first.")
    if (!siteAddress) return toast.error("This job has no site address.")
    setCalcing(true)
    const res = await calcMileageAction({ origin: homeAddress, destination: siteAddress })
    setCalcing(false)
    if (!res.ok) return toast.error(res.error)
    const roundTrip = Math.round(res.data.km * 2 * 10) / 10
    setKm(String(roundTrip))
    setNotes((n) => n || "Round trip")
    toast.success(`Round trip: ${roundTrip} km`)
  }

  async function add() {
    setBusy(true)
    const res = await addMileageEntryAction({
      job_id: jobId,
      travel_date: date,
      km: Number(km),
      notes: notes || null,
    })
    setBusy(false)
    if (!res.ok) return toast.error(res.error)
    setKm("")
    setNotes("")
    onChange()
  }

  async function remove(id: string) {
    const res = await deleteMileageEntryAction(id)
    if (!res.ok) return toast.error(res.error)
    onChange()
  }

  const totalKm = entries.reduce((s, e) => s + Number(e.km), 0)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          Mileage <span className="font-normal text-muted-foreground">- {totalKm} km</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="grid gap-2 sm:grid-cols-[150px_100px_1fr_auto_auto]">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <Input
            type="number"
            step="0.1"
            placeholder="KM"
            value={km}
            onChange={(e) => setKm(e.target.value)}
          />
          <Input
            placeholder="Notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
          {canAutoCalc && (
            <Button variant="outline" onClick={calculate} disabled={calcing}>
              <Navigation /> {calcing ? "Calculating" : "Calc"}
            </Button>
          )}
          <Button onClick={add} disabled={busy || !km}>
            <Plus /> Add
          </Button>
        </div>
        <EntryList
          rows={entries.map((e) => ({
            id: e.id,
            status: e.status,
            left: formatDate(e.travel_date),
            mid: `${Number(e.km)} km`,
            note: e.notes,
          }))}
          onDelete={remove}
        />
      </CardContent>
    </Card>
  )
}

function ExpenseCard({
  jobId,
  tenantId,
  entries,
  onChange,
}: {
  jobId: string
  tenantId: string
  entries: Expense[]
  onChange: () => void
}) {
  const [desc, setDesc] = useState("")
  const [amount, setAmount] = useState("")
  const [date, setDate] = useState(inputDate())
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)

  async function add() {
    setBusy(true)
    let receiptPath: string | null = null
    if (file) {
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg"
      const path = `${tenantId}/${jobId}/${crypto.randomUUID()}.${ext}`
      const supabase = createClient()
      const { error: upErr } = await supabase.storage
        .from("receipts")
        .upload(path, file, { upsert: false })
      if (upErr) {
        setBusy(false)
        return toast.error(`Upload failed: ${upErr.message}`)
      }
      receiptPath = path
    }
    const res = await addExpenseAction({
      job_id: jobId,
      description: desc,
      amount: Number(amount),
      spent_date: date || null,
      receipt_url: receiptPath,
    })
    setBusy(false)
    if (!res.ok) return toast.error(res.error)
    setDesc("")
    setAmount("")
    setFile(null)
    onChange()
  }

  async function remove(id: string) {
    const res = await deleteExpenseAction(id)
    if (!res.ok) return toast.error(res.error)
    onChange()
  }

  const total = entries.reduce((s, e) => s + Number(e.amount), 0)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          Parts & expenses{" "}
          <span className="font-normal text-muted-foreground">- {money(total)}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="grid gap-2 sm:grid-cols-[1fr_100px_150px_auto_auto]">
          <Input placeholder="Description" value={desc} onChange={(e) => setDesc(e.target.value)} />
          <Input
            type="number"
            step="0.01"
            placeholder="$"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <label className="flex h-8 cursor-pointer items-center justify-center gap-1.5 rounded-lg border px-2.5 text-sm text-muted-foreground hover:bg-muted">
            <Package className="size-4" />
            <span className="max-w-24 truncate">{file ? file.name : "Receipt"}</span>
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </label>
          <Button onClick={add} disabled={busy || !desc || !amount}>
            <Plus /> Add
          </Button>
        </div>
        <div className="flex flex-col divide-y">
          {entries.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing added yet.</p>
          ) : (
            entries.map((e) => (
              <div key={e.id} className="flex items-center gap-3 py-2 text-sm">
                <span className="flex-1">{e.description}</span>
                <span className="tabular-nums">{money(e.amount)}</span>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Delete"
                  onClick={() => remove(e.id)}
                >
                  <Trash2 />
                </Button>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function PhotoCaptureCard({
  jobId,
  workDate,
  tenantId,
  profileId,
  photos,
  siteReportId,
  onChange,
}: {
  jobId: string
  workDate: string
  tenantId: string
  profileId: string
  photos: JobSitePhoto[]
  siteReportId: string | null
  onChange: () => void
}) {
  const [label, setLabel] = useState<SitePhotoLabel>("after")
  const [caption, setCaption] = useState("")
  const [busy, setBusy] = useState(false)
  const [selectedPhoto, setSelectedPhoto] = useState<JobSitePhoto | null>(null)

  async function upload(file: File | null) {
    if (!file) return
    setBusy(true)
    try {
      const compressed = await compressImage(file)
      const path = `${tenantId}/${jobId}/${profileId}/${crypto.randomUUID()}.jpg`
      const supabase = createClient()
      const { error: uploadError } = await supabase.storage
        .from("site-photos")
        .upload(path, compressed.blob, {
          contentType: "image/jpeg",
          upsert: false,
        })
      if (uploadError) throw new Error(uploadError.message)

      const res = await addSitePhotoAction({
        job_id: jobId,
        work_date: workDate,
        site_report_id: siteReportId,
        storage_path: path,
        label,
        caption: caption || null,
        content_type: "image/jpeg",
        file_size: file.size,
        compressed_size: compressed.blob.size,
        width: compressed.width,
        height: compressed.height,
      })
      if (!res.ok) throw new Error(res.error)
      setCaption("")
      toast.success("Photo added")
      onChange()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Photo upload failed")
    } finally {
      setBusy(false)
    }
  }

  async function remove(id: string) {
    const res = await deleteSitePhotoAction(id)
    if (!res.ok) return toast.error(res.error)
    onChange()
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Photos</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3">
        <div className="grid gap-2">
          <Select value={label} onValueChange={(value) => setLabel(value as SitePhotoLabel)}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PHOTO_LABELS.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            placeholder="Caption"
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
          />
          <label className="flex h-11 cursor-pointer items-center justify-center gap-2 rounded-lg border bg-background text-sm font-medium hover:bg-muted">
            <Camera className="size-4" />
            {busy ? "Compressing and uploading" : "Add compressed photo"}
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              disabled={busy}
              onChange={(e) => upload(e.target.files?.[0] ?? null)}
            />
          </label>
          <p className="text-xs text-muted-foreground">
            Photos are resized to 1600px wide and uploaded as compressed JPEGs.
          </p>
        </div>
        {photos.length === 0 ? (
          <p className="text-sm text-muted-foreground">No photos yet.</p>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {photos.map((photo) => (
              <div key={photo.id} className="overflow-hidden rounded-lg border">
                <button
                  type="button"
                  onClick={() => setSelectedPhoto(photo)}
                  className="block w-full focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/api/site-photo/${photo.id}`}
                    alt={photo.caption ?? photo.label}
                    className="aspect-square w-full object-cover"
                  />
                </button>
                <div className="flex items-center justify-between gap-2 p-2 text-xs">
                  <span className="truncate capitalize">{photo.caption || photo.label}</span>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label="Delete photo"
                    onClick={() => remove(photo.id)}
                  >
                    <Trash2 />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
        <PhotoViewerDialog
          photo={selectedPhoto}
          onClose={() => setSelectedPhoto(null)}
        />
      </CardContent>
    </Card>
  )
}

function SiteReportCard({
  jobId,
  workDate,
  report,
  onChange,
}: {
  jobId: string
  workDate: string
  report: JobSiteReport | null
  onChange: () => void
}) {
  const [work, setWork] = useState(report?.work_performed ?? "")
  const [issues, setIssues] = useState(report?.issues ?? "")
  const [materials, setMaterials] = useState(report?.materials_summary ?? "")
  const [recommendations, setRecommendations] = useState(report?.recommendations ?? "")
  const [busy, setBusy] = useState(false)

  async function save(submit: boolean) {
    setBusy(true)
    const action = submit ? submitSiteReportAction : saveSiteReportAction
    const res = await action({
      job_id: jobId,
      work_date: workDate,
      work_performed: work || null,
      issues: issues || null,
      materials_summary: materials || null,
      recommendations: recommendations || null,
    })
    setBusy(false)
    if (!res.ok) return toast.error(res.error)
    toast.success(submit ? "Report submitted" : "Report saved")
    onChange()
  }

  function applyVoiceReport(parsed: ParsedFieldReport) {
    setWork(parsed.work_performed)
    setIssues(parsed.issues)
    setMaterials(parsed.materials_summary)
    setRecommendations(parsed.recommendations)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Site report</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={report?.status === "submitted" ? "default" : "secondary"}>
            {report?.status ?? "draft"}
          </Badge>
          <VoiceReportButton
            jobId={jobId}
            siteReportId={report?.id ?? null}
            onParsed={applyVoiceReport}
          />
          {report?.id ? (
            <Button
              render={<Link href={`/my/site-reports/${report.id}`} target="_blank" />}
              variant="outline"
            >
              <Printer /> Print
            </Button>
          ) : null}
        </div>
        <Textarea
          rows={3}
          placeholder="Work performed"
          value={work}
          onChange={(e) => setWork(e.target.value)}
        />
        <Textarea
          rows={2}
          placeholder="Issues or blockers"
          value={issues}
          onChange={(e) => setIssues(e.target.value)}
        />
        <Textarea
          rows={2}
          placeholder="Materials used"
          value={materials}
          onChange={(e) => setMaterials(e.target.value)}
        />
        <Textarea
          rows={2}
          placeholder="Recommendations / follow-up"
          value={recommendations}
          onChange={(e) => setRecommendations(e.target.value)}
        />
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" onClick={() => save(false)} disabled={busy}>
            <Upload /> Save
          </Button>
          <Button onClick={() => save(true)} disabled={busy || !work}>
            <Send /> Submit
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function VoiceReportButton({
  jobId,
  siteReportId,
  onParsed,
}: {
  jobId: string
  siteReportId: string | null
  onParsed: (parsed: ParsedFieldReport) => void
}) {
  const [listening, setListening] = useState(false)
  const [parsing, setParsing] = useState(false)
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const transcriptRef = useRef("")

  function stopListening() {
    recognitionRef.current?.stop()
    setListening(false)
  }

  async function parseTranscript(transcript: string) {
    setParsing(true)
    try {
      const res = await fetch("/api/field-report-parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job_id: jobId,
          site_report_id: siteReportId,
          transcript,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        onParsed({
          work_performed: transcript,
          issues: "",
          materials_summary: "",
          recommendations: "",
        })
        toast.error(data.error ?? "Voice parsing failed; raw transcript was added.")
        return
      }
      onParsed(data as ParsedFieldReport)
      toast.success("Voice report added")
    } catch (error) {
      onParsed({
        work_performed: transcript,
        issues: "",
        materials_summary: "",
        recommendations: "",
      })
      toast.error(error instanceof Error ? error.message : "Voice parsing failed")
    } finally {
      setParsing(false)
    }
  }

  function startListening() {
    const recognition = getRecognition()
    if (!recognition) {
      toast.error("Voice input is not supported in this browser. Try Chrome.")
      return
    }
    transcriptRef.current = ""
    recognition.lang = "en-CA"
    recognition.continuous = true
    recognition.interimResults = true
    recognition.onresult = (event) => {
      let text = ""
      for (let i = 0; i < event.results.length; i++) {
        text += event.results[i][0]?.transcript ?? ""
      }
      transcriptRef.current = text.trim()
    }
    recognition.onerror = (event) => {
      if (event.error !== "aborted") toast.error(`Mic error: ${event.error}`)
    }
    recognition.onend = () => {
      setListening(false)
      const transcript = transcriptRef.current.trim()
      if (transcript) void parseTranscript(transcript)
    }
    recognitionRef.current = recognition
    setListening(true)
    recognition.start()
  }

  return listening ? (
    <Button variant="outline" onClick={stopListening} disabled={parsing}>
      <Square /> Stop
    </Button>
  ) : (
    <Button variant="outline" onClick={startListening} disabled={parsing}>
      <Mic /> {parsing ? "Parsing" : "Dictate"}
    </Button>
  )
}

function SignoffCard({
  jobId,
  workDate,
  tenantId,
  profileId,
  siteReportId,
  signoffs,
  onChange,
}: {
  jobId: string
  workDate: string
  tenantId: string
  profileId: string
  siteReportId: string | null
  signoffs: JobSignoff[]
  onChange: () => void
}) {
  const [role, setRole] = useState<SignoffRole>("customer")
  const [name, setName] = useState("")
  const [comments, setComments] = useState("")
  const [busy, setBusy] = useState(false)
  const [hasSignature, setHasSignature] = useState(false)
  const signatureRef = useRef<HTMLCanvasElement | null>(null)
  const drawingRef = useRef(false)
  const lastPointRef = useRef<{ x: number; y: number } | null>(null)

  function signaturePoint(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = signatureRef.current
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height,
    }
  }

  function signatureContext() {
    const ctx = signatureRef.current?.getContext("2d")
    if (!ctx) return null
    ctx.lineWidth = 4
    ctx.lineCap = "round"
    ctx.lineJoin = "round"
    ctx.strokeStyle = "#111827"
    ctx.fillStyle = "#111827"
    return ctx
  }

  function beginSignature(event: React.PointerEvent<HTMLCanvasElement>) {
    if (role === "unavailable") return
    const point = signaturePoint(event)
    const ctx = signatureContext()
    if (!point || !ctx) return
    event.currentTarget.setPointerCapture(event.pointerId)
    drawingRef.current = true
    lastPointRef.current = point
    ctx.beginPath()
    ctx.arc(point.x, point.y, 2, 0, Math.PI * 2)
    ctx.fill()
    setHasSignature(true)
    event.preventDefault()
  }

  function drawSignature(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return
    const point = signaturePoint(event)
    const ctx = signatureContext()
    const last = lastPointRef.current
    if (!point || !ctx || !last) return
    ctx.beginPath()
    ctx.moveTo(last.x, last.y)
    ctx.lineTo(point.x, point.y)
    ctx.stroke()
    lastPointRef.current = point
    event.preventDefault()
  }

  function endSignature(event: React.PointerEvent<HTMLCanvasElement>) {
    drawingRef.current = false
    lastPointRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  function clearSignature() {
    const canvas = signatureRef.current
    const ctx = canvas?.getContext("2d")
    if (!canvas || !ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    setHasSignature(false)
  }

  async function signatureBlob() {
    const canvas = signatureRef.current
    if (!canvas || !hasSignature) return null
    return new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, "image/png")
    })
  }

  async function uploadSignature() {
    const blob = await signatureBlob()
    if (!blob) return null
    if (!tenantId) throw new Error("Tenant profile required.")
    const path = `${tenantId}/${jobId}/${profileId}/signatures/${crypto.randomUUID()}.png`
    const supabase = createClient()
    const { error } = await supabase.storage.from("site-photos").upload(path, blob, {
      contentType: "image/png",
      upsert: false,
    })
    if (error) throw new Error(error.message)
    return path
  }

  async function add() {
    setBusy(true)
    try {
      if (role !== "unavailable" && !hasSignature) {
        toast.error("Capture the signature before recording sign-off.")
        return
      }
      const signaturePath = role === "unavailable" ? null : await uploadSignature()
      const res = await addSignoffAction({
        job_id: jobId,
        work_date: workDate,
        site_report_id: siteReportId,
        signer_role: role,
        signer_name: name || null,
        signature_text: name || null,
        signature_image_path: signaturePath,
        signature_content_type: signaturePath ? "image/png" : null,
        comments: comments || null,
      })
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      setName("")
      setComments("")
      clearSignature()
      toast.success("Sign-off recorded")
      onChange()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Signature upload failed")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Sign-off</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3">
        {signoffs.length > 0 && (
          <div className="flex flex-col divide-y rounded-lg border px-3">
            {signoffs.map((signoff) => (
              <div key={signoff.id} className="py-2 text-sm">
                <p className="font-medium">
                  {signoff.signer_name ?? "Unavailable"}{" "}
                  <span className="text-muted-foreground">({signoff.signer_role})</span>
                </p>
                <p className="text-xs text-muted-foreground">{fmtTime(signoff.signed_at)}</p>
                {signoff.signature_image_path ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={`/api/signoff-signature/${signoff.id}`}
                    alt="Signature"
                    className="mt-2 h-16 max-w-full rounded-md border bg-white object-contain"
                  />
                ) : null}
                {signoff.comments && <p className="mt-1">{signoff.comments}</p>}
              </div>
            ))}
          </div>
        )}
        <Select value={role} onValueChange={(value) => setRole(value as SignoffRole)}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SIGNOFF_ROLES.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {role !== "unavailable" && (
          <Input
            placeholder="Signer name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        )}
        {role !== "unavailable" && (
          <div className="grid gap-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium">Signature</p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={clearSignature}
                disabled={!hasSignature || busy}
              >
                <RotateCcw /> Clear
              </Button>
            </div>
            <canvas
              ref={signatureRef}
              width={720}
              height={220}
              className="h-36 w-full touch-none rounded-lg border bg-white"
              onPointerDown={beginSignature}
              onPointerMove={drawSignature}
              onPointerUp={endSignature}
              onPointerCancel={endSignature}
              onPointerLeave={(event) => {
                if (drawingRef.current) endSignature(event)
              }}
              aria-label="Signature pad"
            />
          </div>
        )}
        <Textarea
          rows={2}
          placeholder={role === "unavailable" ? "Reason sign-off is unavailable" : "Comments"}
          value={comments}
          onChange={(e) => setComments(e.target.value)}
        />
        <Button
          onClick={add}
          disabled={
            busy ||
            (role !== "unavailable" && (!name || !hasSignature)) ||
            (role === "unavailable" && !comments.trim())
          }
        >
          <Check /> Record sign-off
        </Button>
      </CardContent>
    </Card>
  )
}

function EntryList({
  rows,
  onDelete,
}: {
  rows: {
    id: string
    status: TimeEntry["status"]
    left: string
    mid: string
    note: string | null
  }[]
  onDelete: (id: string) => void
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">Nothing logged yet.</p>
  }
  return (
    <div className="flex flex-col divide-y">
      {rows.map((r) => (
        <div key={r.id} className="flex items-center gap-3 py-2 text-sm">
          <span className="w-24 text-muted-foreground">{r.left}</span>
          <span className="w-16 font-medium tabular-nums">{r.mid}</span>
          <span className="min-w-0 flex-1 truncate text-muted-foreground">{r.note}</span>
          <EntryStatusBadge status={r.status} />
          {canEdit(r.status) && (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Delete"
              onClick={() => onDelete(r.id)}
            >
              <Trash2 />
            </Button>
          )}
        </div>
      ))}
    </div>
  )
}

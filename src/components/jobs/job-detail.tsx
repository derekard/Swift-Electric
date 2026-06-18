"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  ArrowLeft,
  Camera,
  Check,
  Clock,
  FileText,
  PenLine,
  Plus,
  Printer,
  Receipt,
  Save,
  X,
} from "lucide-react"
import { toast } from "sonner"

import type {
  EntryStatus,
  Job,
  JobCosts,
  JobSignoff,
  JobSitePhoto,
  JobSiteReport,
  JobStatus,
  JobVisit,
  JobWorkflowEvent,
  InvoiceStatus,
} from "@/lib/supabase/types"
import { money, formatDate } from "@/lib/format"
import {
  updateJobAction,
  assignTechAction,
  unassignTechAction,
  addJobVisitAction,
  deleteJobVisitAction,
  reviewTimeEntryAction,
  reviewMileageEntryAction,
  buildTmInvoiceAction,
  convertJobToTmAction,
} from "@/app/(app)/jobs/actions"
import { EntryStatusBadge } from "@/components/timesheets/entry-status-badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { JobStatusBadge } from "@/components/jobs/job-status-badge"
import { InvoiceStatusBadge } from "@/components/invoices/invoice-status-badge"

type Person = { id: string; name: string }
type EntryRow = {
  id: string
  person: string
  date: string
  amount: string
  notes: string | null
  status: EntryStatus
}
type ExpenseRow = {
  id: string
  person: string
  date: string | null
  description: string
  amount: number
  receiptUrl: string | null
}

const STATUSES: JobStatus[] = [
  "scheduled",
  "in_progress",
  "complete",
  "cancelled",
]
const STATUS_LABELS: Record<JobStatus, string> = {
  scheduled: "Scheduled",
  in_progress: "In progress",
  complete: "Complete",
  cancelled: "Cancelled",
}

/** "14:30:00" → "2:30 PM" */
function fmtTime(t: string): string {
  const [h, m] = t.split(":")
  const hour = Number(h)
  const ampm = hour >= 12 ? "PM" : "AM"
  const h12 = hour % 12 === 0 ? 12 : hour % 12
  return `${h12}:${m} ${ampm}`
}

export function JobDetail({
  job,
  clientName,
  quote,
  invoice,
  costs,
  assigned,
  available,
  visits,
  siteReports,
  sitePhotos,
  signoffs,
  workflowEvents,
  timeRows,
  mileageRows,
  expenseRows,
}: {
  job: Job
  clientName: string | null
  quote: { id: string; number: string } | null
  invoice: { id: string; invoice_number: string; status: InvoiceStatus; total: number } | null
  costs: JobCosts | null
  assigned: Person[]
  available: Person[]
  visits: JobVisit[]
  siteReports: JobSiteReport[]
  sitePhotos: JobSitePhoto[]
  signoffs: JobSignoff[]
  workflowEvents: JobWorkflowEvent[]
  timeRows: EntryRow[]
  mileageRows: EntryRow[]
  expenseRows: ExpenseRow[]
}) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [addId, setAddId] = useState<string>("")

  const [visitDate, setVisitDate] = useState("")
  const [visitStart, setVisitStart] = useState("")
  const [visitEnd, setVisitEnd] = useState("")
  const [visitNote, setVisitNote] = useState("")
  const [addingVisit, setAddingVisit] = useState(false)

  const [title, setTitle] = useState(job.title)
  const [siteAddress, setSiteAddress] = useState(job.site_address ?? "")
  const [start, setStart] = useState(job.scheduled_start ?? "")
  const [end, setEnd] = useState(job.scheduled_end ?? "")
  const [notes, setNotes] = useState(job.notes ?? "")

  async function saveDetails() {
    setSaving(true)
    const res = await updateJobAction(job.id, {
      title: title.trim() || job.title,
      site_address: siteAddress.trim() || null,
      scheduled_start: start || null,
      scheduled_end: end || null,
      notes: notes.trim() || null,
    })
    setSaving(false)
    if (!res.ok) return toast.error(res.error)
    toast.success("Job saved")
    router.refresh()
  }

  async function setStatus(status: JobStatus) {
    const res = await updateJobAction(job.id, { status })
    if (!res.ok) return toast.error(res.error)
    toast.success("Status updated")
    router.refresh()
  }

  async function assign() {
    if (!addId) return
    const res = await assignTechAction(job.id, addId)
    if (!res.ok) return toast.error(res.error)
    setAddId("")
    router.refresh()
  }

  async function unassign(profileId: string) {
    const res = await unassignTechAction(job.id, profileId)
    if (!res.ok) return toast.error(res.error)
    router.refresh()
  }

  async function addVisit() {
    if (!visitDate) return toast.error("Pick a date for the visit")
    setAddingVisit(true)
    const res = await addJobVisitAction(job.id, {
      visit_date: visitDate,
      start_time: visitStart || null,
      end_time: visitEnd || null,
      note: visitNote.trim() || null,
    })
    setAddingVisit(false)
    if (!res.ok) return toast.error(res.error)
    setVisitDate("")
    setVisitStart("")
    setVisitEnd("")
    setVisitNote("")
    toast.success("Visit booked")
    router.refresh()
  }

  async function removeVisit(visitId: string) {
    const res = await deleteJobVisitAction(job.id, visitId)
    if (!res.ok) return toast.error(res.error)
    router.refresh()
  }

  async function reviewTime(id: string, status: EntryStatus) {
    const res = await reviewTimeEntryAction(id, status, job.id)
    if (!res.ok) return toast.error(res.error)
    router.refresh()
  }
  async function reviewMileage(id: string, status: EntryStatus) {
    const res = await reviewMileageEntryAction(id, status, job.id)
    if (!res.ok) return toast.error(res.error)
    router.refresh()
  }

  const [buildingTm, setBuildingTm] = useState(false)
  async function buildTmInvoice() {
    setBuildingTm(true)
    const res = await buildTmInvoiceAction(job.id)
    setBuildingTm(false)
    if (!res.ok) return toast.error(res.error)
    toast.success(`T&M invoice built — ${money(res.data.total)}`)
    router.refresh()
  }

  const [converting, setConverting] = useState(false)
  async function convertToTm() {
    if (!confirm("Switch this job to Time & Materials billing?")) return
    setConverting(true)
    const res = await convertJobToTmAction(job.id)
    setConverting(false)
    if (!res.ok) return toast.error(res.error)
    toast.success("Switched to Time & Materials")
    router.refresh()
  }

  const [tmRate, setTmRate] = useState(String(job.tm_labor_rate ?? 0))
  const [tmMarkup, setTmMarkup] = useState(
    String(job.tm_materials_markup_pct ?? 0)
  )
  const tmDirty =
    Number(tmRate) !== Number(job.tm_labor_rate ?? 0) ||
    Number(tmMarkup) !== Number(job.tm_materials_markup_pct ?? 0)
  async function saveTmRates() {
    const res = await updateJobAction(job.id, {
      tm_labor_rate: Number(tmRate) || 0,
      tm_materials_markup_pct: Number(tmMarkup) || 0,
    })
    if (!res.ok) return toast.error(res.error)
    toast.success("Rates saved")
    router.refresh()
  }

  const nameById = new Map(
    [...assigned, ...available].map((person) => [person.id, person.name])
  )

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button
            render={<Link href="/jobs" />}
            variant="ghost"
            size="icon"
            aria-label="Back"
          >
            <ArrowLeft />
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-semibold tracking-tight">
                {job.job_number}
              </h1>
              <JobStatusBadge status={job.status} />
            </div>
            <p className="text-sm text-muted-foreground">
              {clientName ?? "No client"}
            </p>
          </div>
        </div>
        <div className="w-44">
          <Select
            value={job.status}
            onValueChange={(v) => setStatus(v as JobStatus)}
            items={STATUSES.map((s) => ({ value: s, label: STATUS_LABELS[s] }))}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {STATUS_LABELS[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        {/* Left: details + crew */}
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Details</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="grid gap-2">
                <Label>Title</Label>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} />
              </div>
              <div className="grid gap-2">
                <Label>Site address</Label>
                <Input
                  value={siteAddress}
                  onChange={(e) => setSiteAddress(e.target.value)}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label>Scheduled start</Label>
                  <Input
                    type="date"
                    value={start}
                    onChange={(e) => setStart(e.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label>Scheduled end</Label>
                  <Input
                    type="date"
                    value={end}
                    onChange={(e) => setEnd(e.target.value)}
                  />
                </div>
              </div>
              <div className="grid gap-2">
                <Label>Notes</Label>
                <Textarea
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
              <div>
                <Button onClick={saveDetails} disabled={saving}>
                  <Save /> {saving ? "Saving…" : "Save"}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Crew</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {assigned.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No one assigned yet.
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {assigned.map((p) => (
                    <Badge key={p.id} variant="secondary" className="gap-1.5">
                      {p.name}
                      <button
                        type="button"
                        onClick={() => unassign(p.id)}
                        aria-label={`Remove ${p.name}`}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        <X className="size-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
              {available.length > 0 && (
                <div className="flex items-center gap-2">
                  <Select
                    value={addId}
                    onValueChange={(v) => setAddId(v ?? "")}
                    items={available.map((p) => ({
                      value: p.id,
                      label: p.name,
                    }))}
                  >
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder="Add crew member" />
                    </SelectTrigger>
                    <SelectContent>
                      {available.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button variant="outline" onClick={assign} disabled={!addId}>
                    <Plus /> Add
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Visits — book the job across multiple site visits */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Visits</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {visits.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No visits booked yet.
                </p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {visits.map((v) => (
                    <li
                      key={v.id}
                      className="flex items-start justify-between gap-2 rounded-md border px-3 py-2 text-sm"
                    >
                      <div>
                        <div className="font-medium">
                          {formatDate(v.visit_date)}
                          {v.start_time && (
                            <span className="font-normal text-muted-foreground">
                              {" · "}
                              {fmtTime(v.start_time)}
                              {v.end_time ? `–${fmtTime(v.end_time)}` : ""}
                            </span>
                          )}
                        </div>
                        {v.note && (
                          <div className="text-muted-foreground">{v.note}</div>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Remove visit"
                        onClick={() => removeVisit(v.id)}
                      >
                        <X />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}

              <div className="grid gap-3 border-t pt-3">
                <div className="grid gap-2">
                  <Label>Date</Label>
                  <Input
                    type="date"
                    value={visitDate}
                    onChange={(e) => setVisitDate(e.target.value)}
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="grid gap-2">
                    <Label>Start</Label>
                    <Input
                      type="time"
                      value={visitStart}
                      onChange={(e) => setVisitStart(e.target.value)}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label>End</Label>
                    <Input
                      type="time"
                      value={visitEnd}
                      onChange={(e) => setVisitEnd(e.target.value)}
                    />
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label>Note</Label>
                  <Input
                    value={visitNote}
                    onChange={(e) => setVisitNote(e.target.value)}
                    placeholder="e.g. rough-in, inspection"
                  />
                </div>
                <Button
                  variant="outline"
                  onClick={addVisit}
                  disabled={addingVisit || !visitDate}
                >
                  <Plus /> {addingVisit ? "Booking…" : "Book visit"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right: costs + links */}
        <div className="flex flex-col gap-6">
          {job.billing_type === "tm" ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Time &amp; Materials</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3 text-sm">
                <div className="grid grid-cols-2 gap-2">
                  <div className="grid gap-1">
                    <Label className="text-xs">Labour ($/h)</Label>
                    <Input
                      type="number"
                      value={tmRate}
                      onChange={(e) => setTmRate(e.target.value)}
                      className="h-8"
                    />
                  </div>
                  <div className="grid gap-1">
                    <Label className="text-xs">Markup (%)</Label>
                    <Input
                      type="number"
                      value={tmMarkup}
                      onChange={(e) => setTmMarkup(e.target.value)}
                      className="h-8"
                    />
                  </div>
                </div>
                {tmDirty && (
                  <Button variant="outline" size="sm" onClick={saveTmRates}>
                    <Save /> Save rates
                  </Button>
                )}
                <Button onClick={buildTmInvoice} disabled={buildingTm}>
                  <Receipt /> {buildingTm ? "Building…" : "Build invoice from actuals"}
                </Button>
                <p className="text-xs text-muted-foreground">
                  Uses logged hours × rate + materials × (1 + markup) + HST. Re-run
                  any time as more time/parts are logged.
                </p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Billing</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2 text-sm">
                <p className="text-muted-foreground">
                  Fixed price (from the quote).
                </p>
                <Button
                  variant="outline"
                  onClick={convertToTm}
                  disabled={converting}
                >
                  {converting ? "Switching…" : "Switch to Time & Materials"}
                </Button>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Costs &amp; margin</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 text-sm">
              <CostRow
                label="Labor"
                detail={`${costs?.labor_hours ?? 0} h`}
                value={money(costs?.labor_cost ?? 0)}
              />
              <CostRow
                label="Mileage"
                detail={`${costs?.mileage_km ?? 0} km`}
                value={money(costs?.mileage_cost ?? 0)}
              />
              <CostRow label="Parts" value={money(costs?.parts_cost ?? 0)} />
              <div className="my-1 border-t" />
              <CostRow label="Revenue" value={money(costs?.revenue ?? 0)} />
              <div className="flex items-center justify-between text-base font-semibold">
                <span>Margin</span>
                <span className="tabular-nums">{money(costs?.margin ?? 0)}</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Updates as the crew logs time, mileage and parts.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Linked</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {quote && (
                <Button
                  render={<Link href={`/quotes/${quote.id}`} />}
                  variant="outline"
                  className="justify-start"
                >
                  <FileText /> Quote {quote.number}
                </Button>
              )}
              {invoice && (
                <Button
                  render={<Link href={`/invoices/${invoice.id}`} />}
                  variant="outline"
                  className="justify-between"
                >
                  <span className="flex items-center gap-1.5">
                    <Receipt /> {invoice.invoice_number}
                  </span>
                  <span className="flex items-center gap-2">
                    <InvoiceStatusBadge status={invoice.status} />
                    <span className="tabular-nums">{money(invoice.total)}</span>
                  </span>
                </Button>
              )}
              {!quote && !invoice && (
                <p className="text-sm text-muted-foreground">Nothing linked.</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <FieldReportsSection
        reports={siteReports}
        photos={sitePhotos}
        signoffs={signoffs}
        events={workflowEvents}
        nameById={nameById}
      />

      {/* Time / mileage / expense review */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Logged work</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <ReviewSection
            title="Time"
            rows={timeRows}
            onReview={reviewTime}
            emptyText="No time logged yet."
          />
          <ReviewSection
            title="Mileage"
            rows={mileageRows}
            onReview={reviewMileage}
            emptyText="No mileage logged yet."
          />
          <div>
            <p className="mb-2 text-sm font-medium">Parts &amp; expenses</p>
            {expenseRows.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No expenses logged yet.
              </p>
            ) : (
              <div className="flex flex-col divide-y">
                {expenseRows.map((e) => (
                  <div
                    key={e.id}
                    className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm"
                  >
                    <span className="w-28 text-muted-foreground">
                      {formatDate(e.date)}
                    </span>
                    <span className="flex-1">{e.description}</span>
                    {e.receiptUrl && (
                      <a
                        href={`/api/receipt?path=${encodeURIComponent(e.receiptUrl)}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-primary hover:underline"
                      >
                        Receipt
                      </a>
                    )}
                    <span className="text-muted-foreground">{e.person}</span>
                    <span className="w-20 text-right tabular-nums">
                      {money(e.amount)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function ReviewSection({
  title,
  rows,
  onReview,
  emptyText,
}: {
  title: string
  rows: EntryRow[]
  onReview: (id: string, status: EntryStatus) => void
  emptyText: string
}) {
  return (
    <div>
      <p className="mb-2 text-sm font-medium">{title}</p>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{emptyText}</p>
      ) : (
        <div className="flex flex-col divide-y">
          {rows.map((r) => (
            <div
              key={r.id}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm"
            >
              <span className="w-28 text-muted-foreground">
                {formatDate(r.date)}
              </span>
              <span className="w-16 font-medium tabular-nums">{r.amount}</span>
              <span className="min-w-24 flex-1 truncate text-muted-foreground">
                {r.person}
                {r.notes ? ` · ${r.notes}` : ""}
              </span>
              <EntryStatusBadge status={r.status} />
              {r.status !== "approved" && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Approve"
                  onClick={() => onReview(r.id, "approved")}
                >
                  <Check />
                </Button>
              )}
              {r.status !== "rejected" && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Reject"
                  onClick={() => onReview(r.id, "rejected")}
                >
                  <X />
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function FieldReportsSection({
  reports,
  photos,
  signoffs,
  events,
  nameById,
}: {
  reports: JobSiteReport[]
  photos: JobSitePhoto[]
  signoffs: JobSignoff[]
  events: JobWorkflowEvent[]
  nameById: Map<string, string>
}) {
  const photosByReport = new Map<string, JobSitePhoto[]>()
  for (const photo of photos) {
    if (!photo.site_report_id) continue
    photosByReport.set(photo.site_report_id, [
      ...(photosByReport.get(photo.site_report_id) ?? []),
      photo,
    ])
  }
  const signoffsByReport = new Map<string, JobSignoff[]>()
  for (const signoff of signoffs) {
    if (!signoff.site_report_id) continue
    signoffsByReport.set(signoff.site_report_id, [
      ...(signoffsByReport.get(signoff.site_report_id) ?? []),
      signoff,
    ])
  }
  const eventsByReport = new Map<string, JobWorkflowEvent[]>()
  for (const event of events) {
    if (!event.site_report_id) continue
    eventsByReport.set(event.site_report_id, [
      ...(eventsByReport.get(event.site_report_id) ?? []),
      event,
    ])
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Field reports</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        {reports.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No site reports submitted yet.
          </p>
        ) : (
          reports.map((report) => {
            const reportPhotos = photosByReport.get(report.id) ?? []
            const reportSignoffs = signoffsByReport.get(report.id) ?? []
            const reportEvents = eventsByReport.get(report.id) ?? []
            return (
              <div key={report.id} className="rounded-lg border p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">{formatDate(report.work_date)}</p>
                      <Badge
                        variant={
                          report.status === "submitted" ? "default" : "secondary"
                        }
                      >
                        {report.status}
                      </Badge>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {nameById.get(report.profile_id) ?? "Technician"}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      render={
                        <Link href={`/my/site-reports/${report.id}`} target="_blank" />
                      }
                      variant="outline"
                      size="sm"
                    >
                      <Printer /> Print
                    </Button>
                    <Badge variant="outline" className="gap-1">
                      <Camera /> {reportPhotos.length}
                    </Badge>
                    <Badge variant="outline" className="gap-1">
                      <PenLine /> {reportSignoffs.length}
                    </Badge>
                    <Badge variant="outline" className="gap-1">
                      <Clock /> {reportEvents.length}
                    </Badge>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 text-sm md:grid-cols-2">
                  <ReportText label="Work performed" value={report.work_performed} />
                  <ReportText label="Issues" value={report.issues} />
                  <ReportText label="Materials" value={report.materials_summary} />
                  <ReportText label="Recommendations" value={report.recommendations} />
                </div>

                {reportEvents.length > 0 && (
                  <div className="mt-4 flex flex-wrap gap-2 text-xs">
                    {reportEvents.map((event) => (
                      <Badge key={event.id} variant="secondary">
                        {event.event_type.replace("_", " ")} -{" "}
                        {new Date(event.happened_at).toLocaleTimeString("en-CA", {
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </Badge>
                    ))}
                  </div>
                )}

                {reportPhotos.length > 0 && (
                  <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {reportPhotos.map((photo) => (
                      <a
                        key={photo.id}
                        href={`/api/site-photo/${photo.id}`}
                        target="_blank"
                        rel="noreferrer"
                        className="overflow-hidden rounded-lg border"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={`/api/site-photo/${photo.id}`}
                          alt={photo.caption ?? photo.label}
                          className="aspect-square w-full object-cover"
                        />
                        <div className="truncate p-2 text-xs capitalize">
                          {photo.caption || photo.label}
                        </div>
                      </a>
                    ))}
                  </div>
                )}

                {reportSignoffs.length > 0 && (
                  <div className="mt-4 rounded-lg bg-muted/40 p-3 text-sm">
                    {reportSignoffs.map((signoff) => (
                      <div key={signoff.id}>
                        <p className="font-medium">
                          {signoff.signer_name ?? "Unavailable"}{" "}
                          <span className="text-muted-foreground">
                            ({signoff.signer_role})
                          </span>
                        </p>
                        {signoff.signature_image_path ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={`/api/signoff-signature/${signoff.id}`}
                            alt="Signature"
                            className="mt-2 h-16 max-w-full rounded border bg-white object-contain"
                          />
                        ) : null}
                        {signoff.comments && (
                          <p className="mt-1 text-muted-foreground">
                            {signoff.comments}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })
        )}
      </CardContent>
    </Card>
  )
}

function ReportText({
  label,
  value,
}: {
  label: string
  value: string | null
}) {
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 whitespace-pre-wrap">{value || "-"}</p>
    </div>
  )
}

function CostRow({
  label,
  detail,
  value,
}: {
  label: string
  detail?: string
  value: string
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">
        {label}
        {detail ? <span className="ml-1 text-xs">({detail})</span> : null}
      </span>
      <span className="tabular-nums">{value}</span>
    </div>
  )
}

"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowLeft, Check, FileText, Plus, Receipt, Save, X } from "lucide-react"
import { toast } from "sonner"

import type {
  EntryStatus,
  Job,
  JobCosts,
  JobStatus,
  InvoiceStatus,
} from "@/lib/supabase/types"
import { money, formatDate } from "@/lib/format"
import {
  updateJobAction,
  assignTechAction,
  unassignTechAction,
  reviewTimeEntryAction,
  reviewMileageEntryAction,
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

export function JobDetail({
  job,
  clientName,
  quote,
  invoice,
  costs,
  assigned,
  available,
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
  timeRows: EntryRow[]
  mileageRows: EntryRow[]
  expenseRows: ExpenseRow[]
}) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [addId, setAddId] = useState<string>("")

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
          <Select value={job.status} onValueChange={(v) => setStatus(v as JobStatus)}>
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
                  <Select value={addId} onValueChange={(v) => setAddId(v ?? "")}>
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
        </div>

        {/* Right: costs + links */}
        <div className="flex flex-col gap-6">
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

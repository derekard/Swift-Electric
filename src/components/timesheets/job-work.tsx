"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowLeft, Plus, Send, Trash2 } from "lucide-react"
import { toast } from "sonner"

import type {
  Expense,
  Job,
  MileageEntry,
  TimeEntry,
} from "@/lib/supabase/types"
import { money, formatDate } from "@/lib/format"
import {
  addTimeEntryAction,
  deleteTimeEntryAction,
  addMileageEntryAction,
  deleteMileageEntryAction,
  addExpenseAction,
  deleteExpenseAction,
  submitEntriesAction,
} from "@/app/(app)/my/actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { JobStatusBadge } from "@/components/jobs/job-status-badge"
import { EntryStatusBadge } from "@/components/timesheets/entry-status-badge"

const today = () => new Date().toISOString().slice(0, 10)
const canEdit = (s: string) => s === "draft" || s === "rejected"

export function JobWork({
  job,
  time,
  mileage,
  expenses,
}: {
  job: Job
  time: TimeEntry[]
  mileage: MileageEntry[]
  expenses: Expense[]
}) {
  const router = useRouter()
  const refresh = () => router.refresh()

  const hasDrafts =
    time.some((t) => t.status === "draft") ||
    mileage.some((m) => m.status === "draft")

  async function submit() {
    const res = await submitEntriesAction(job.id)
    if (!res.ok) return toast.error(res.error)
    toast.success("Submitted for approval")
    refresh()
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button
            render={<Link href="/my/jobs" />}
            variant="ghost"
            size="icon"
            aria-label="Back"
          >
            <ArrowLeft />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-semibold tracking-tight">
                {job.title}
              </h1>
              <JobStatusBadge status={job.status} />
            </div>
            <p className="text-sm text-muted-foreground">
              {job.job_number}
              {job.site_address ? ` · ${job.site_address}` : ""}
            </p>
          </div>
        </div>
        {hasDrafts && (
          <Button onClick={submit}>
            <Send /> Submit
          </Button>
        )}
      </div>

      <TimeCard jobId={job.id} entries={time} onChange={refresh} />
      <MileageCard jobId={job.id} entries={mileage} onChange={refresh} />
      <ExpenseCard jobId={job.id} entries={expenses} onChange={refresh} />
    </div>
  )
}

function TimeCard({
  jobId,
  entries,
  onChange,
}: {
  jobId: string
  entries: TimeEntry[]
  onChange: () => void
}) {
  const [date, setDate] = useState(today())
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
          Time{" "}
          <span className="font-normal text-muted-foreground">
            · {totalHours} h
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end gap-2">
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-40"
            aria-label="Date"
          />
          <Input
            type="number"
            step="0.25"
            placeholder="Hours"
            value={hours}
            onChange={(e) => setHours(e.target.value)}
            className="w-24"
            aria-label="Hours"
          />
          <Input
            placeholder="Notes (optional)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="min-w-40 flex-1"
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
}: {
  jobId: string
  entries: MileageEntry[]
  onChange: () => void
}) {
  const [date, setDate] = useState(today())
  const [km, setKm] = useState("")
  const [notes, setNotes] = useState("")
  const [busy, setBusy] = useState(false)

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
          Mileage{" "}
          <span className="font-normal text-muted-foreground">
            · {totalKm} km
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end gap-2">
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-40"
            aria-label="Date"
          />
          <Input
            type="number"
            step="0.1"
            placeholder="KM"
            value={km}
            onChange={(e) => setKm(e.target.value)}
            className="w-24"
            aria-label="Kilometres"
          />
          <Input
            placeholder="Notes (optional)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="min-w-40 flex-1"
          />
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
  entries,
  onChange,
}: {
  jobId: string
  entries: Expense[]
  onChange: () => void
}) {
  const [desc, setDesc] = useState("")
  const [amount, setAmount] = useState("")
  const [date, setDate] = useState(today())
  const [busy, setBusy] = useState(false)

  async function add() {
    setBusy(true)
    const res = await addExpenseAction({
      job_id: jobId,
      description: desc,
      amount: Number(amount),
      spent_date: date || null,
    })
    setBusy(false)
    if (!res.ok) return toast.error(res.error)
    setDesc("")
    setAmount("")
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
          Parts &amp; expenses{" "}
          <span className="font-normal text-muted-foreground">
            · {money(total)}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end gap-2">
          <Input
            placeholder="Description"
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            className="min-w-40 flex-1"
          />
          <Input
            type="number"
            step="0.01"
            placeholder="$"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-28"
            aria-label="Amount"
          />
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-40"
            aria-label="Date"
          />
          <Button onClick={add} disabled={busy || !desc || !amount}>
            <Plus /> Add
          </Button>
        </div>
        <div className="flex flex-col divide-y">
          {entries.length === 0 ? (
            <p className="py-2 text-sm text-muted-foreground">
              Nothing added yet.
            </p>
          ) : (
            entries.map((e) => (
              <div key={e.id} className="flex items-center gap-3 py-2 text-sm">
                <span className="flex-1">{e.description}</span>
                <span className="tabular-nums">{money(e.amount)}</span>
                <span className="text-muted-foreground">
                  {formatDate(e.spent_date)}
                </span>
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
          <span className="w-28 text-muted-foreground">{r.left}</span>
          <span className="w-16 font-medium tabular-nums">{r.mid}</span>
          <span className="flex-1 truncate text-muted-foreground">
            {r.note}
          </span>
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

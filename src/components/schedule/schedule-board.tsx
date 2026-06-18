"use client"

import { useState, type DragEvent } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { CalendarDays } from "lucide-react"
import { toast } from "sonner"

import { moveScheduleItemAction } from "@/app/(app)/schedule/actions"
import { JobStatusBadge } from "@/components/jobs/job-status-badge"
import { Card, CardContent } from "@/components/ui/card"
import type { JobStatus } from "@/lib/supabase/types"
import { cn } from "@/lib/utils"

const DRAG_TYPE = "application/x-swift-electric-schedule-item"

type ScheduleItemKind = "job" | "visit"

export type ScheduleBoardDay = {
  key: string
  weekdayLabel: string
  dayLabel: string
  isToday: boolean
  isOutsideMonth: boolean
}

export type ScheduleBoardEvent = {
  key: string
  kind: ScheduleItemKind
  itemId: string
  jobId: string
  title: string
  status: JobStatus
  clientName: string
  time: string | null
  sortTime: string | null
  note: string | null
  date: string
}

export type ScheduleBoardUnscheduledJob = {
  id: string
  jobNumber: string
  title: string
  status: JobStatus
  clientName: string
}

type DragPayload = {
  source: "calendar" | "unscheduled"
  key: string
  kind: ScheduleItemKind
  itemId: string
  jobId: string
  title: string
  status: JobStatus
  clientName: string
  time: string | null
  sortTime: string | null
  note: string | null
  date: string | null
}

type ScheduleView = "day" | "week" | "month"

function isDragPayload(value: unknown): value is DragPayload {
  if (!value || typeof value !== "object") return false
  const item = value as Partial<DragPayload>
  return (
    (item.source === "calendar" || item.source === "unscheduled") &&
    (item.kind === "job" || item.kind === "visit") &&
    typeof item.key === "string" &&
    typeof item.itemId === "string" &&
    typeof item.jobId === "string" &&
    typeof item.title === "string"
  )
}

function eventKeyForPayload(payload: DragPayload) {
  return payload.kind === "visit" ? payload.key : `j-${payload.jobId}`
}

function eventFromPayload(
  payload: DragPayload,
  targetDate: string
): ScheduleBoardEvent {
  return {
    key: eventKeyForPayload(payload),
    kind: payload.kind,
    itemId: payload.itemId,
    jobId: payload.jobId,
    title: payload.title,
    status: payload.status,
    clientName: payload.clientName,
    time: payload.time,
    sortTime: payload.sortTime,
    note: payload.note,
    date: targetDate,
  }
}

function sortEvents(events: ScheduleBoardEvent[]) {
  return [...events].sort((a, b) => {
    const timeA = a.sortTime ?? "99:99"
    const timeB = b.sortTime ?? "99:99"
    return timeA.localeCompare(timeB) || a.title.localeCompare(b.title)
  })
}

function payloadFromEvent(event: ScheduleBoardEvent): DragPayload {
  return {
    source: "calendar",
    key: event.key,
    kind: event.kind,
    itemId: event.itemId,
    jobId: event.jobId,
    title: event.title,
    status: event.status,
    clientName: event.clientName,
    time: event.time,
    sortTime: event.sortTime,
    note: event.note,
    date: event.date,
  }
}

function payloadFromUnscheduled(job: ScheduleBoardUnscheduledJob): DragPayload {
  return {
    source: "unscheduled",
    key: `u-${job.id}`,
    kind: "job",
    itemId: job.id,
    jobId: job.id,
    title: job.title,
    status: job.status,
    clientName: job.clientName,
    time: null,
    sortTime: null,
    note: null,
    date: null,
  }
}

function setTransferData(event: DragEvent, payload: DragPayload) {
  event.dataTransfer.effectAllowed = "move"
  event.dataTransfer.setData(DRAG_TYPE, JSON.stringify(payload))
  event.dataTransfer.setData("text/plain", payload.title)
}

function readTransferData(event: DragEvent, fallback: DragPayload | null) {
  const raw = event.dataTransfer.getData(DRAG_TYPE)
  if (raw) {
    try {
      const parsed = JSON.parse(raw)
      if (isDragPayload(parsed)) return parsed
    } catch {
      return fallback
    }
  }

  return fallback
}

export function ScheduleBoard({
  days,
  initialEventsByDay,
  initialUnscheduled,
  compact,
  view,
}: {
  days: ScheduleBoardDay[]
  initialEventsByDay: Record<string, ScheduleBoardEvent[]>
  initialUnscheduled: ScheduleBoardUnscheduledJob[]
  compact: boolean
  view: ScheduleView
}) {
  const router = useRouter()
  const [eventsByDay, setEventsByDay] = useState(initialEventsByDay)
  const [unscheduled, setUnscheduled] = useState(initialUnscheduled)
  const [dragging, setDragging] = useState<DragPayload | null>(null)
  const [dropTarget, setDropTarget] = useState<string | null>(null)
  const [movingKey, setMovingKey] = useState<string | null>(null)

  function moveInView(payload: DragPayload, targetDate: string) {
    setEventsByDay((current) => {
      const next: Record<string, ScheduleBoardEvent[]> = {}
      for (const day of days) {
        next[day.key] = (current[day.key] ?? []).filter(
          (event) => event.key !== eventKeyForPayload(payload)
        )
      }
      next[targetDate] = sortEvents([
        ...(next[targetDate] ?? []),
        eventFromPayload(payload, targetDate),
      ])
      return next
    })

    if (payload.source === "unscheduled") {
      setUnscheduled((current) =>
        current.filter((job) => job.id !== payload.jobId)
      )
    }
  }

  async function moveItem(payload: DragPayload, targetDate: string) {
    if (movingKey || payload.date === targetDate) return

    const previousEvents = eventsByDay
    const previousUnscheduled = unscheduled
    const optimisticKey = eventKeyForPayload(payload)

    setMovingKey(optimisticKey)
    moveInView(payload, targetDate)

    const result = await moveScheduleItemAction({
      kind: payload.kind,
      id: payload.itemId,
      date: targetDate,
    })

    setMovingKey(null)
    setDragging(null)
    setDropTarget(null)

    if (!result.ok) {
      setEventsByDay(previousEvents)
      setUnscheduled(previousUnscheduled)
      toast.error(result.error)
      return
    }

    toast.success("Schedule updated")
    router.refresh()
  }

  function handleDragStart(event: DragEvent, payload: DragPayload) {
    if (movingKey) {
      event.preventDefault()
      return
    }
    setDragging(payload)
    setTransferData(event, payload)
  }

  function handleDragOver(event: DragEvent) {
    if (!dragging || movingKey) return
    event.preventDefault()
    event.dataTransfer.dropEffect = "move"
  }

  function handleDrop(event: DragEvent, targetDate: string) {
    event.preventDefault()
    const payload = readTransferData(event, dragging)
    if (!payload) return
    void moveItem(payload, targetDate)
  }

  function handleDragLeave(event: DragEvent) {
    const nextTarget = event.relatedTarget
    if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) {
      return
    }
    setDropTarget(null)
  }

  const minHeightClass =
    view === "day" ? "min-h-72" : compact ? "min-h-32" : "min-h-36"

  return (
    <>
      <div
        className={cn(
          "grid grid-cols-1 gap-2",
          view !== "day" && "sm:grid-cols-2 lg:grid-cols-7"
        )}
      >
        {days.map((day) => {
          const list = eventsByDay[day.key] ?? []
          const visibleEvents = compact ? list.slice(0, 4) : list
          const isDropTarget = dropTarget === day.key

          return (
            <div
              key={day.key}
              onDragEnter={() => dragging && setDropTarget(day.key)}
              onDragLeave={handleDragLeave}
              onDragOver={handleDragOver}
              onDrop={(event) => handleDrop(event, day.key)}
              className={cn(
                "flex flex-col rounded-xl border p-2 transition-colors",
                minHeightClass,
                dragging && "border-dashed",
                day.isToday && "border-primary bg-primary/5",
                day.isOutsideMonth && "bg-muted/20 text-muted-foreground",
                isDropTarget && "border-primary bg-primary/10 ring-2 ring-primary/20"
              )}
            >
              <div className="mb-2 flex items-baseline justify-between px-1">
                <span className="text-xs font-medium text-muted-foreground">
                  {day.weekdayLabel}
                </span>
                <span
                  className={cn(
                    "text-sm font-semibold",
                    day.isToday && "text-primary"
                  )}
                >
                  {day.dayLabel}
                </span>
              </div>
              <div className="flex flex-col gap-1.5">
                {visibleEvents.map((scheduleEvent) => {
                  const payload = payloadFromEvent(scheduleEvent)
                  return (
                    <Link
                      key={scheduleEvent.key}
                      href={`/jobs/${scheduleEvent.jobId}`}
                      draggable
                      onDragStart={(event) => handleDragStart(event, payload)}
                      onDragEnd={() => {
                        setDragging(null)
                        setDropTarget(null)
                      }}
                      onClick={(event) => movingKey && event.preventDefault()}
                      aria-grabbed={dragging?.key === scheduleEvent.key}
                      className={cn(
                        "rounded-lg border bg-card text-xs transition-colors hover:bg-muted",
                        "cursor-grab active:cursor-grabbing",
                        compact ? "p-1.5" : "p-2",
                        movingKey === scheduleEvent.key && "cursor-wait opacity-60",
                        dragging?.key === scheduleEvent.key && "opacity-50"
                      )}
                    >
                      {scheduleEvent.time && (
                        <p className="font-semibold text-primary">
                          {scheduleEvent.time}
                        </p>
                      )}
                      <p className="truncate font-medium">{scheduleEvent.title}</p>
                      {!compact && (
                        <>
                          <p className="truncate text-muted-foreground">
                            {scheduleEvent.clientName}
                          </p>
                          {scheduleEvent.note && (
                            <p className="truncate text-muted-foreground">
                              {scheduleEvent.note}
                            </p>
                          )}
                          <div className="mt-1">
                            <JobStatusBadge status={scheduleEvent.status} />
                          </div>
                        </>
                      )}
                    </Link>
                  )
                })}
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

      <div className="mt-8">
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">
          Needs scheduling
        </h2>
        {unscheduled.length === 0 ? (
          <Card>
            <CardContent className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
              <CalendarDays className="size-4" /> Everything active is scheduled.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {unscheduled.map((job) => {
              const payload = payloadFromUnscheduled(job)
              const pending = movingKey === eventKeyForPayload(payload)
              return (
                <Link
                  key={job.id}
                  href={`/jobs/${job.id}`}
                  draggable
                  onDragStart={(event) => handleDragStart(event, payload)}
                  onDragEnd={() => {
                    setDragging(null)
                    setDropTarget(null)
                  }}
                  onClick={(event) => movingKey && event.preventDefault()}
                  aria-grabbed={dragging?.key === payload.key}
                  className={cn(
                    "flex items-center justify-between gap-2 rounded-xl border bg-card p-3 text-sm transition-colors hover:bg-muted",
                    "cursor-grab active:cursor-grabbing",
                    pending && "cursor-wait opacity-60",
                    dragging?.key === payload.key && "opacity-50"
                  )}
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{job.title}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {job.jobNumber}
                      {job.clientName ? ` - ${job.clientName}` : ""}
                    </p>
                  </div>
                  <JobStatusBadge status={job.status} />
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </>
  )
}

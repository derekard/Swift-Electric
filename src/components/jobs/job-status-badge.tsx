import type { JobStatus } from "@/lib/supabase/types"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

const styles: Record<JobStatus, { label: string; className: string }> = {
  scheduled: {
    label: "Scheduled",
    className: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  },
  in_progress: {
    label: "In progress",
    className:
      "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  },
  complete: {
    label: "Complete",
    className:
      "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300",
  },
  cancelled: {
    label: "Cancelled",
    className: "bg-muted text-muted-foreground",
  },
}

export function JobStatusBadge({ status }: { status: JobStatus }) {
  const s = styles[status]
  return (
    <Badge variant="secondary" className={cn("border-transparent", s.className)}>
      {s.label}
    </Badge>
  )
}

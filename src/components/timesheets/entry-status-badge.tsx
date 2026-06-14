import type { EntryStatus } from "@/lib/supabase/types"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

const styles: Record<EntryStatus, { label: string; className: string }> = {
  draft: { label: "Draft", className: "bg-muted text-muted-foreground" },
  submitted: {
    label: "Submitted",
    className: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  },
  approved: {
    label: "Approved",
    className:
      "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300",
  },
  rejected: {
    label: "Rejected",
    className: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
  },
}

export function EntryStatusBadge({ status }: { status: EntryStatus }) {
  const s = styles[status]
  return (
    <Badge
      variant="secondary"
      className={cn("border-transparent text-xs", s.className)}
    >
      {s.label}
    </Badge>
  )
}

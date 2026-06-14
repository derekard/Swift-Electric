import type { InvoiceStatus } from "@/lib/supabase/types"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

const styles: Record<InvoiceStatus, { label: string; className: string }> = {
  draft: { label: "Draft", className: "bg-muted text-muted-foreground" },
  sent: {
    label: "Sent",
    className: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  },
  paid: {
    label: "Paid",
    className:
      "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300",
  },
  void: {
    label: "Void",
    className: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
  },
}

export function InvoiceStatusBadge({ status }: { status: InvoiceStatus }) {
  const s = styles[status]
  return (
    <Badge variant="secondary" className={cn("border-transparent", s.className)}>
      {s.label}
    </Badge>
  )
}

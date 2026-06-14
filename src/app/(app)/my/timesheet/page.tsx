import { Clock } from "lucide-react"

import { requireProfile } from "@/lib/auth"
import { PageHeader } from "@/components/page-header"
import { EmptyState } from "@/components/empty-state"

export default async function TimesheetPage() {
  await requireProfile()
  return (
    <>
      <PageHeader
        title="Timesheet"
        description="Log your hours and mileage against a job."
      />
      <EmptyState
        icon={Clock}
        title="Time tracking coming soon"
        description="You'll log hours, claim KM and add parts/receipts here (Phase 4)."
      />
    </>
  )
}

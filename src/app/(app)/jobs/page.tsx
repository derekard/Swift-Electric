import { Briefcase } from "lucide-react"

import { requireOwner } from "@/lib/auth"
import { PageHeader } from "@/components/page-header"
import { EmptyState } from "@/components/empty-state"

export default async function JobsPage() {
  await requireOwner()
  return (
    <>
      <PageHeader
        title="Jobs"
        description="Track scheduled and active jobs, costs and assigned crew."
      />
      <EmptyState
        icon={Briefcase}
        title="No jobs yet"
        description="Accepting a quote creates a job here (Phase 3)."
      />
    </>
  )
}

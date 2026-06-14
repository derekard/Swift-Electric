import { Briefcase } from "lucide-react"

import { requireProfile } from "@/lib/auth"
import { PageHeader } from "@/components/page-header"
import { EmptyState } from "@/components/empty-state"

export default async function MyJobsPage() {
  const profile = await requireProfile()
  const firstName = profile.full_name?.split(" ")[0] ?? "there"

  return (
    <>
      <PageHeader
        title={`Hi, ${firstName}`}
        description="Jobs you're assigned to."
      />
      <EmptyState
        icon={Briefcase}
        title="No jobs assigned yet"
        description="When the owner assigns you to a job it'll show up here (Phase 4)."
      />
    </>
  )
}

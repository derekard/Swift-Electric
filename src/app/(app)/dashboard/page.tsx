import { LayoutDashboard } from "lucide-react"

import { requireOwner } from "@/lib/auth"
import { PageHeader } from "@/components/page-header"
import { EmptyState } from "@/components/empty-state"

export default async function DashboardPage() {
  const profile = await requireOwner()
  const firstName = profile.full_name?.split(" ")[0] ?? "there"

  return (
    <>
      <PageHeader
        title={`Welcome, ${firstName}`}
        description="Your business at a glance — revenue, costs and margins."
      />
      <EmptyState
        icon={LayoutDashboard}
        title="Dashboard coming together"
        description="Revenue, job costs and margins will appear here once quotes and jobs are flowing (Phase 5)."
      />
    </>
  )
}

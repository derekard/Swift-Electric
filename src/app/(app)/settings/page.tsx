import { Settings as SettingsIcon } from "lucide-react"

import { requireOwner } from "@/lib/auth"
import { PageHeader } from "@/components/page-header"
import { EmptyState } from "@/components/empty-state"

export default async function SettingsPage() {
  await requireOwner()
  return (
    <>
      <PageHeader
        title="Settings"
        description="Company details, price book, fees, mileage rate and team."
      />
      <EmptyState
        icon={SettingsIcon}
        title="Settings coming soon"
        description="Price book, fee percentages, mileage rate, branding and team invites will be editable here."
      />
    </>
  )
}

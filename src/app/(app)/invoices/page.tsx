import { Receipt } from "lucide-react"

import { requireOwner } from "@/lib/auth"
import { PageHeader } from "@/components/page-header"
import { EmptyState } from "@/components/empty-state"

export default async function InvoicesPage() {
  await requireOwner()
  return (
    <>
      <PageHeader
        title="Invoices"
        description="Convert accepted quotes to invoices and track payments."
      />
      <EmptyState
        icon={Receipt}
        title="No invoices yet"
        description="Invoicing lands in Phase 3."
      />
    </>
  )
}

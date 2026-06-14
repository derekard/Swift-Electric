import Link from "next/link"
import { Receipt } from "lucide-react"

import { requireOwner } from "@/lib/auth"
import { createClient } from "@/lib/supabase/server"
import { money, formatDate } from "@/lib/format"
import { PageHeader } from "@/components/page-header"
import { EmptyState } from "@/components/empty-state"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { InvoiceStatusBadge } from "@/components/invoices/invoice-status-badge"

export default async function InvoicesPage() {
  await requireOwner()
  const supabase = await createClient()

  const [{ data: invoices }, { data: clients }] = await Promise.all([
    supabase
      .from("invoices")
      .select("*")
      .order("created_at", { ascending: false }),
    supabase.from("clients").select("id, name"),
  ])

  const clientById = new Map((clients ?? []).map((c) => [c.id, c.name]))

  return (
    <>
      <PageHeader
        title="Invoices"
        description="Track what's owed and what's been paid."
      />
      {(invoices ?? []).length === 0 ? (
        <EmptyState
          icon={Receipt}
          title="No invoices yet"
          description="Accepting a quote creates a draft invoice for the job."
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice</TableHead>
                <TableHead>Client</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Issued</TableHead>
                <TableHead>Due</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(invoices ?? []).map((inv) => (
                <TableRow key={inv.id}>
                  <TableCell className="font-medium">
                    <Link
                      href={`/invoices/${inv.id}`}
                      className="hover:underline"
                    >
                      {inv.invoice_number}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {inv.client_id
                      ? (clientById.get(inv.client_id) ?? "—")
                      : "—"}
                  </TableCell>
                  <TableCell>
                    <InvoiceStatusBadge status={inv.status} />
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDate(inv.issued_date)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDate(inv.due_date)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {money(inv.total)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  )
}

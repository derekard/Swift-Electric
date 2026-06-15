"use client"

import { useRouter } from "next/navigation"
import Link from "next/link"
import { ChevronDown } from "lucide-react"
import { toast } from "sonner"

import type { QuoteStatus } from "@/lib/supabase/types"
import { money, formatDate } from "@/lib/format"
import {
  setQuoteStatusAction,
  deleteQuoteAction,
  duplicateQuoteAction,
} from "@/app/(app)/quotes/actions"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { QuoteStatusBadge } from "@/components/quotes/quote-status-badge"

export type QuoteRow = {
  id: string
  quote_number: string
  status: QuoteStatus
  client_name: string | null
  total: number
  created_at: string
}

export function QuotesTable({ rows }: { rows: QuoteRow[] }) {
  const router = useRouter()

  async function setStatus(id: string, status: QuoteStatus) {
    const res = await setQuoteStatusAction(id, status)
    if (!res.ok) return toast.error(res.error)
    toast.success("Status updated")
    router.refresh()
  }

  async function duplicate(id: string) {
    const res = await duplicateQuoteAction(id)
    if (!res.ok) return toast.error(res.error)
    toast.success("Quote duplicated")
    router.push(`/quotes/${res.data.id}/edit`)
  }

  async function remove(id: string, number: string) {
    if (!confirm(`Delete ${number}? This can't be undone.`)) return
    const res = await deleteQuoteAction(id)
    if (!res.ok) return toast.error(res.error)
    toast.success("Quote deleted")
    router.refresh()
  }

  return (
    <div className="overflow-x-auto rounded-xl border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Quote</TableHead>
            <TableHead>Client</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Total</TableHead>
            <TableHead>Created</TableHead>
            <TableHead className="w-10" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((q) => (
            <TableRow key={q.id}>
              <TableCell className="font-medium">
                <Link
                  href={`/quotes/${q.id}`}
                  className="hover:underline"
                >
                  {q.quote_number}
                </Link>
              </TableCell>
              <TableCell className="text-muted-foreground">
                {q.client_name ?? "—"}
              </TableCell>
              <TableCell>
                <QuoteStatusBadge status={q.status} />
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {money(q.total)}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {formatDate(q.created_at)}
              </TableCell>
              <TableCell>
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={<Button variant="outline" size="sm" />}
                  >
                    Actions <ChevronDown />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      render={<Link href={`/quotes/${q.id}/edit`} />}
                    >
                      Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      render={<Link href={`/quotes/${q.id}`} />}
                    >
                      View
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => duplicate(q.id)}>
                      Duplicate
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => setStatus(q.id, "sent")}>
                      Mark sent
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => setStatus(q.id, "accepted")}
                    >
                      Mark accepted
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => setStatus(q.id, "declined")}
                    >
                      Mark declined
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      variant="destructive"
                      onClick={() => remove(q.id, q.quote_number)}
                    >
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

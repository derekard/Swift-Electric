import Link from "next/link"
import { Download } from "lucide-react"

import { requireStaff } from "@/lib/auth"
import { createClient } from "@/lib/supabase/server"
import { money, formatDate } from "@/lib/format"
import { PageHeader } from "@/components/page-header"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { PrintButton } from "@/components/reports/print-button"

const METHOD_LABELS: Record<string, string> = {
  cash: "Cash",
  cheque: "Cheque",
  e_transfer: "E-transfer",
  card: "Card",
  other: "Other",
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>
}) {
  await requireStaff()
  const supabase = await createClient()

  const now = new Date()
  const { year: yearParam } = await searchParams
  const year = Number(yearParam) || now.getFullYear()
  const years = [0, 1, 2, 3].map((n) => now.getFullYear() - n)

  const [{ data: invoices }, { data: clients }] = await Promise.all([
    supabase
      .from("invoices")
      .select(
        "id, invoice_number, client_id, status, issued_date, paid_date, amount_pretax, hst_amount, total, payment_method"
      )
      .order("paid_date", { ascending: true }),
    supabase.from("clients").select("id, name"),
  ])
  const clientById = new Map((clients ?? []).map((c) => [c.id, c.name]))

  // Cash-basis: paid invoices whose paid_date falls in the selected year.
  const paid = (invoices ?? []).filter(
    (i) => i.status === "paid" && i.paid_date?.startsWith(String(year))
  )

  const revenue = paid.reduce((s, i) => s + Number(i.amount_pretax), 0)
  const hst = paid.reduce((s, i) => s + Number(i.hst_amount), 0)
  const collected = paid.reduce((s, i) => s + Number(i.total), 0)

  const byMethod = new Map<string, number>()
  for (const i of paid) {
    const key = i.payment_method ?? "unspecified"
    byMethod.set(key, (byMethod.get(key) ?? 0) + Number(i.total))
  }

  const outstanding = (invoices ?? [])
    .filter((i) => i.status === "draft" || i.status === "sent")
    .reduce((s, i) => s + Number(i.total), 0)

  return (
    <>
      <div className="print:hidden">
        <PageHeader
          title="Reports"
          description="Year-end financials for your accountant (cash basis — by payment date)."
          action={
            <div className="flex items-center gap-2">
              <Button
                render={<a href={`/reports/csv?year=${year}`} />}
                variant="outline"
              >
                <Download /> CSV
              </Button>
              <PrintButton />
            </div>
          }
        />
        <div className="mb-6 flex flex-wrap gap-2">
          {years.map((y) => (
            <Button
              key={y}
              render={<Link href={`/reports?year=${y}`} />}
              variant={y === year ? "default" : "outline"}
              size="sm"
            >
              {y}
            </Button>
          ))}
        </div>
      </div>

      {/* Print header */}
      <div className="mb-6 hidden print:block">
        <h1 className="text-xl font-bold">Income summary — {year}</h1>
        <p className="text-sm text-muted-foreground">Cash basis (by payment date)</p>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label={`Revenue ${year} (pre-tax)`} value={money(revenue)} />
        <Stat label="HST collected" value={money(hst)} />
        <Stat label="Total collected" value={money(collected)} />
        <Stat label="Outstanding (unpaid)" value={money(outstanding)} />
      </div>

      <Card className="mb-6">
        <CardContent className="pt-6">
          <p className="mb-3 text-sm font-medium">Collected by payment method</p>
          {byMethod.size === 0 ? (
            <p className="text-sm text-muted-foreground">
              No payments recorded for {year}.
            </p>
          ) : (
            <div className="flex flex-col gap-1.5 text-sm">
              {[...byMethod.entries()].map(([m, amt]) => (
                <div key={m} className="flex justify-between">
                  <span className="text-muted-foreground">
                    {METHOD_LABELS[m] ?? "Unspecified"}
                  </span>
                  <span className="tabular-nums">{money(amt)}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="overflow-x-auto rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Invoice</TableHead>
              <TableHead>Client</TableHead>
              <TableHead>Paid</TableHead>
              <TableHead>Method</TableHead>
              <TableHead className="text-right">Pre-tax</TableHead>
              <TableHead className="text-right">HST</TableHead>
              <TableHead className="text-right">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paid.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-6 text-center text-muted-foreground">
                  No paid invoices in {year}.
                </TableCell>
              </TableRow>
            ) : (
              paid.map((i) => (
                <TableRow key={i.id}>
                  <TableCell className="font-medium">{i.invoice_number}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {i.client_id ? (clientById.get(i.client_id) ?? "—") : "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDate(i.paid_date)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {i.payment_method ? METHOD_LABELS[i.payment_method] : "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {money(i.amount_pretax)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {money(i.hst_amount)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {money(i.total)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="py-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
      </CardContent>
    </Card>
  )
}

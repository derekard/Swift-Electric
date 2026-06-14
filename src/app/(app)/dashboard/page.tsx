import Link from "next/link"
import {
  FileText,
  Briefcase,
  Receipt,
  TrendingUp,
  ArrowRight,
} from "lucide-react"

import { requireOwner } from "@/lib/auth"
import { createClient } from "@/lib/supabase/server"
import { money, formatDate } from "@/lib/format"
import { PageHeader } from "@/components/page-header"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { QuoteStatusBadge } from "@/components/quotes/quote-status-badge"
import { InvoiceStatusBadge } from "@/components/invoices/invoice-status-badge"

export default async function DashboardPage() {
  const profile = await requireOwner()
  const firstName = profile.full_name?.split(" ")[0] ?? "there"
  const supabase = await createClient()

  const [
    { data: quotes },
    { data: jobs },
    { data: invoices },
    { data: costs },
    { data: clients },
  ] = await Promise.all([
    supabase
      .from("quotes")
      .select("id, quote_number, status, client_id, created_at")
      .order("created_at", { ascending: false }),
    supabase.from("jobs").select("id, status"),
    supabase
      .from("invoices")
      .select("id, invoice_number, status, total, due_date, client_id")
      .order("created_at", { ascending: false }),
    supabase.from("job_costs").select("job_id, margin"),
    supabase.from("clients").select("id, name"),
  ])

  const clientById = new Map((clients ?? []).map((c) => [c.id, c.name]))

  const openQuotes = (quotes ?? []).filter(
    (q) => q.status === "draft" || q.status === "sent"
  ).length
  const activeJobs = (jobs ?? []).filter(
    (j) => j.status === "scheduled" || j.status === "in_progress"
  ).length

  const unpaid = (invoices ?? []).filter(
    (i) => i.status === "draft" || i.status === "sent"
  )
  const outstanding = unpaid.reduce((s, i) => s + Number(i.total), 0)
  const paid = (invoices ?? [])
    .filter((i) => i.status === "paid")
    .reduce((s, i) => s + Number(i.total), 0)
  const totalMargin = (costs ?? []).reduce((s, c) => s + Number(c.margin), 0)

  const recentQuotes = (quotes ?? []).slice(0, 5)

  return (
    <>
      <PageHeader
        title={`Welcome, ${firstName}`}
        description="Your business at a glance."
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          icon={FileText}
          label="Open quotes"
          value={String(openQuotes)}
          href="/quotes"
        />
        <Stat
          icon={Briefcase}
          label="Active jobs"
          value={String(activeJobs)}
          href="/jobs"
        />
        <Stat
          icon={Receipt}
          label="Outstanding"
          value={money(outstanding)}
          href="/invoices"
        />
        <Stat icon={TrendingUp} label="Margin (all jobs)" value={money(totalMargin)} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Recent quotes */}
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="text-base">Recent quotes</CardTitle>
            <Link
              href="/quotes"
              className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            >
              All <ArrowRight className="size-3.5" />
            </Link>
          </CardHeader>
          <CardContent>
            {recentQuotes.length === 0 ? (
              <p className="text-sm text-muted-foreground">No quotes yet.</p>
            ) : (
              <div className="flex flex-col divide-y">
                {recentQuotes.map((q) => (
                  <Link
                    key={q.id}
                    href={`/quotes/${q.id}`}
                    className="flex items-center justify-between gap-2 py-2 text-sm hover:underline"
                  >
                    <span className="font-medium">{q.quote_number}</span>
                    <span className="flex-1 truncate text-muted-foreground">
                      {q.client_id ? (clientById.get(q.client_id) ?? "") : ""}
                    </span>
                    <QuoteStatusBadge status={q.status} />
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Outstanding invoices */}
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="text-base">Unpaid invoices</CardTitle>
            <Link
              href="/invoices"
              className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            >
              All <ArrowRight className="size-3.5" />
            </Link>
          </CardHeader>
          <CardContent>
            {unpaid.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nothing outstanding{paid > 0 ? ` — ${money(paid)} paid` : ""}.
              </p>
            ) : (
              <div className="flex flex-col divide-y">
                {unpaid.slice(0, 6).map((i) => (
                  <Link
                    key={i.id}
                    href={`/invoices/${i.id}`}
                    className="flex items-center justify-between gap-2 py-2 text-sm hover:underline"
                  >
                    <span className="font-medium">{i.invoice_number}</span>
                    <span className="flex-1 truncate text-muted-foreground">
                      {i.due_date ? `due ${formatDate(i.due_date)}` : ""}
                    </span>
                    <InvoiceStatusBadge status={i.status} />
                    <span className="w-20 text-right tabular-nums">
                      {money(i.total)}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  )
}

function Stat({
  icon: Icon,
  label,
  value,
  href,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
  href?: string
}) {
  const inner = (
    <Card className={href ? "transition-colors hover:bg-muted/40" : undefined}>
      <CardContent className="py-4">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Icon className="size-4" />
          <span className="text-xs">{label}</span>
        </div>
        <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      </CardContent>
    </Card>
  )
  return href ? <Link href={href}>{inner}</Link> : inner
}

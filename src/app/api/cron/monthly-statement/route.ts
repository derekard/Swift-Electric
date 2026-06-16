import { createServiceClient } from "@/lib/supabase/server"
import { isEmailConfigured, sendMonthlyStatementEmail } from "@/lib/email"
import { ownerRecipientEmailsByTenant } from "@/lib/notification-recipients"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
]

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return Response.json({ error: "CRON_SECRET not set" }, { status: 503 })
  }
  const auth = request.headers.get("authorization")
  const key = new URL(request.url).searchParams.get("key")
  if (auth !== `Bearer ${secret}` && key !== secret) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  // Previous calendar month [start, end)
  const now = new Date()
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1))
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  const startISO = start.toISOString().slice(0, 10)
  const endISO = end.toISOString().slice(0, 10)
  const periodLabel = `${MONTHS[start.getUTCMonth()]} ${start.getUTCFullYear()}`

  const supabase = createServiceClient()

  const { data: invoices } = await supabase
    .from("invoices")
    .select("tenant_id, amount_pretax, hst_amount, total")
    .eq("status", "paid")
    .gte("paid_date", startISO)
    .lt("paid_date", endISO)

  type Acc = { revenue: number; hst: number; collected: number; count: number }
  const byTenant = new Map<string, Acc>()
  for (const i of invoices ?? []) {
    const a = byTenant.get(i.tenant_id) ?? {
      revenue: 0,
      hst: 0,
      collected: 0,
      count: 0,
    }
    a.revenue += Number(i.amount_pretax)
    a.hst += Number(i.hst_amount)
    a.collected += Number(i.total)
    a.count += 1
    byTenant.set(i.tenant_id, a)
  }

  const tenantIds = [...byTenant.keys()]
  if (tenantIds.length === 0) {
    return Response.json({ period: periodLabel, tenants: 0, sent: 0 })
  }

  const [{ data: settings }, { data: profiles }] = await Promise.all([
    supabase
      .from("tenant_settings")
      .select("tenant_id, company_name")
      .in("tenant_id", tenantIds),
    supabase
      .from("profiles")
      .select("tenant_id, email, role, active, is_platform_admin")
      .in("tenant_id", tenantIds)
      .eq("active", true)
      .eq("is_platform_admin", false)
      .in("role", ["admin", "office"]),
  ])
  const companyByTenant = new Map(
    (settings ?? []).map((s) => [s.tenant_id, s.company_name])
  )
  const recipientsByTenant = ownerRecipientEmailsByTenant(profiles ?? [])

  let sent = 0
  for (const [tenantId, acc] of byTenant) {
    const to = recipientsByTenant.get(tenantId) ?? []
    if (to.length === 0) continue
    const res = await sendMonthlyStatementEmail({
      to,
      companyName: companyByTenant.get(tenantId) ?? "Your company",
      periodLabel,
      revenue: acc.revenue,
      hst: acc.hst,
      collected: acc.collected,
      invoiceCount: acc.count,
    })
    if (res.ok) sent++
  }

  return Response.json({
    period: periodLabel,
    tenants: tenantIds.length,
    sent,
    emailConfigured: isEmailConfigured(),
  })
}

import { createServiceClient } from "@/lib/supabase/server"
import {
  isEmailConfigured,
  sendInvoiceReminderEmail,
  sendOwnerDigestEmail,
} from "@/lib/email"
import { ownerRecipientEmailsByTenant } from "@/lib/notification-recipients"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// Client reminders fire on the due date, then +7 and +14 days overdue.
const MILESTONES = [0, 7, 14]

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}
function daysOverdue(dueISO: string, today: string) {
  return Math.floor((Date.parse(today) - Date.parse(dueISO)) / 86_400_000)
}

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

  const supabase = createServiceClient()
  const today = todayISO()

  const { data: invoices } = await supabase
    .from("invoices")
    .select(
      "id, tenant_id, invoice_number, client_id, total, due_date, last_reminder_at, reminder_count"
    )
    .eq("status", "sent")
    .not("due_date", "is", null)

  const due = (invoices ?? []).filter(
    (i) => i.due_date && daysOverdue(i.due_date, today) >= 0
  )

  // Lookups
  const tenantIds = [...new Set(due.map((i) => i.tenant_id))]
  const clientIds = [...new Set(due.map((i) => i.client_id).filter(Boolean))] as string[]

  const [{ data: settings }, { data: clients }, { data: profiles }] =
    await Promise.all([
      supabase.from("tenant_settings").select("tenant_id, company_name, owner_name").in("tenant_id", tenantIds.length ? tenantIds : ["x"]),
      supabase.from("clients").select("id, name, email").in("id", clientIds.length ? clientIds : ["x"]),
      supabase
        .from("profiles")
        .select("tenant_id, email, role, active, is_platform_admin")
        .in("tenant_id", tenantIds.length ? tenantIds : ["x"])
        .eq("active", true)
        .eq("is_platform_admin", false)
        .in("role", ["admin", "office"]),
    ])

  const settingsByTenant = new Map((settings ?? []).map((s) => [s.tenant_id, s]))
  const clientById = new Map((clients ?? []).map((c) => [c.id, c]))
  const recipientsByTenant = ownerRecipientEmailsByTenant(profiles ?? [])

  let clientReminders = 0
  const digestByTenant = new Map<
    string,
    { invoiceNumber: string; clientName: string | null; amount: number; daysOverdue: number }[]
  >()

  for (const inv of due) {
    const od = daysOverdue(inv.due_date!, today)
    const company = settingsByTenant.get(inv.tenant_id)
    const client = inv.client_id ? clientById.get(inv.client_id) : null

    // digest entry (every due/overdue invoice)
    const arr = digestByTenant.get(inv.tenant_id) ?? []
    arr.push({
      invoiceNumber: inv.invoice_number,
      clientName: client?.name ?? null,
      amount: Number(inv.total),
      daysOverdue: od,
    })
    digestByTenant.set(inv.tenant_id, arr)

    // client reminder at the next unsent milestone, once per day
    const count = inv.reminder_count ?? 0
    const alreadyToday = inv.last_reminder_at?.slice(0, 10) === today
    if (
      isEmailConfigured() &&
      client?.email &&
      count < MILESTONES.length &&
      od >= MILESTONES[count] &&
      !alreadyToday
    ) {
      const res = await sendInvoiceReminderEmail({
        to: client.email,
        companyName: company?.company_name ?? "Your contractor",
        ownerName: company?.owner_name ?? null,
        clientName: client.name,
        invoiceNumber: inv.invoice_number,
        amount: Number(inv.total),
        dueDate: inv.due_date!,
        daysOverdue: od,
      })
      if (res.ok) {
        clientReminders++
        await supabase
          .from("invoices")
          .update({
            reminder_count: count + 1,
            last_reminder_at: new Date().toISOString(),
          })
          .eq("id", inv.id)
      }
    }
  }

  // Owner digests
  let digests = 0
  for (const [tenantId, items] of digestByTenant) {
    const to = recipientsByTenant.get(tenantId) ?? []
    const company = settingsByTenant.get(tenantId)
    if (to.length === 0) continue
    const res = await sendOwnerDigestEmail({
      to,
      companyName: company?.company_name ?? "Your company",
      items,
    })
    if (res.ok) digests++
  }

  return Response.json({
    scanned: due.length,
    clientReminders,
    digests,
    emailConfigured: isEmailConfigured(),
  })
}

import { requirePlatformAdmin } from "@/lib/auth"
import { createClient } from "@/lib/supabase/server"
import { PlatformAdminView, type TenantRow } from "@/components/platform/platform-admin-view"

export default async function PlatformAdminPage() {
  await requirePlatformAdmin()
  const supabase = await createClient()

  const [{ data: tenants }, { data: profiles }] = await Promise.all([
    supabase
      .from("tenants")
      .select("*")
      .order("created_at", { ascending: false }),
    supabase.from("profiles").select("tenant_id"),
  ])

  const memberCount = new Map<string, number>()
  for (const p of profiles ?? []) {
    if (p.tenant_id)
      memberCount.set(p.tenant_id, (memberCount.get(p.tenant_id) ?? 0) + 1)
  }

  const rows: TenantRow[] = (tenants ?? []).map((t) => ({
    id: t.id,
    name: t.name,
    slug: t.slug,
    custom_domain: t.custom_domain,
    status: t.status,
    plan: t.plan,
    members: memberCount.get(t.id) ?? 0,
  }))

  return (
    <PlatformAdminView
      rows={rows}
      appDomain={process.env.NEXT_PUBLIC_APP_DOMAIN ?? null}
    />
  )
}

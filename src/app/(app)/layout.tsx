import type { CSSProperties } from "react"
import { redirect } from "next/navigation"

import { requireTenantMember } from "@/lib/auth"
import { getSettings } from "@/lib/settings"
import { getSiteTenant } from "@/lib/tenant"
import { AppShell } from "@/components/app-shell"

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const profile = await requireTenantMember()

  // White-label: a company's branded host only serves that company's members.
  const site = await getSiteTenant()
  if (site && site.id !== profile.tenant_id) redirect("/no-access")

  const settings = await getSettings()
  const brandColor = settings?.brand_color ?? "#C49A2C"
  const style = { ["--primary"]: brandColor } as CSSProperties

  return (
    <div style={style}>
      <AppShell
        profile={{
          full_name: profile.full_name,
          email: profile.email,
          role: profile.role,
          is_platform_admin: profile.is_platform_admin,
        }}
        brand={{
          companyName: settings?.company_name ?? "Swift Electric",
          logoUrl: settings?.logo_url ?? null,
        }}
      >
        {children}
      </AppShell>
    </div>
  )
}

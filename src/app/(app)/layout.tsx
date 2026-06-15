import type { CSSProperties } from "react"
import { redirect } from "next/navigation"

import { requireTenantMember } from "@/lib/auth"
import { getBranding } from "@/lib/settings"
import { getSiteTenant } from "@/lib/tenant"
import { AppShell } from "@/components/app-shell"
import { IdleLogout } from "@/components/idle-logout"

// Per-user, session-bound pages: always render fresh and never cache, so one
// user's rendered data can never be served to another visitor.
export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const profile = await requireTenantMember()

  // White-label: a company's branded host only serves that company's members.
  const site = await getSiteTenant()
  if (site && site.id !== profile.tenant_id) redirect("/no-access")

  const branding = await getBranding()
  const brandColor = branding?.brand_color ?? "#C49A2C"
  const style = { ["--primary"]: brandColor } as CSSProperties

  return (
    <div style={style}>
      <IdleLogout />
      <AppShell
        profile={{
          full_name: profile.full_name,
          email: profile.email,
          role: profile.role,
          is_platform_admin: profile.is_platform_admin,
        }}
        brand={{
          companyName: branding?.company_name ?? "Swift Electric",
          logoUrl: branding?.logo_url ?? null,
        }}
      >
        {children}
      </AppShell>
    </div>
  )
}

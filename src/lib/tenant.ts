import { headers } from "next/headers"
import { cache } from "react"

import { createServiceClient } from "@/lib/supabase/server"

export type SiteTenant = {
  id: string
  name: string
  slug: string | null
  companyName: string
  brandColor: string
  logoUrl: string | null
}

/** Parse the request host into a candidate custom domain + subdomain slug. */
function parseHost(host: string): { hostname: string; sub: string | null } {
  const hostname = host.split(":")[0].toLowerCase()
  const appDomain = (process.env.NEXT_PUBLIC_APP_DOMAIN ?? "").toLowerCase()
  let sub: string | null = null
  if (appDomain && hostname.endsWith(`.${appDomain}`)) {
    const label = hostname.slice(0, hostname.length - appDomain.length - 1)
    if (label && label !== "www") sub = label
  }
  return { hostname, sub }
}

/**
 * Resolve the company ("tenant") for the current request from its host:
 * custom domain → subdomain slug → dev override. Branding only — uses the
 * service-role client so the anonymous (pre-login) branded page can read it
 * without exposing tenant data via RLS. Returns null on the apex/marketing host.
 */
export const getSiteTenant = cache(async (): Promise<SiteTenant | null> => {
  const h = await headers()
  const host = h.get("host") ?? ""
  const { hostname, sub } = parseHost(host)
  const devSlug = process.env.DEV_TENANT_SLUG || null

  let supabase: ReturnType<typeof createServiceClient>
  try {
    supabase = createServiceClient()
  } catch {
    return null
  }

  // 1) Custom domain
  const byDomain = await supabase
    .from("tenants")
    .select("id, name, slug, status")
    .eq("custom_domain", hostname)
    .maybeSingle()

  let tenant = byDomain.data
  // 2) Subdomain slug (or dev override)
  if (!tenant) {
    const useSlug = sub ?? devSlug
    if (!useSlug) return null
    const bySlug = await supabase
      .from("tenants")
      .select("id, name, slug, status")
      .eq("slug", useSlug)
      .maybeSingle()
    tenant = bySlug.data
  }

  if (!tenant || tenant.status !== "active") return null

  const { data: settings } = await supabase
    .from("tenant_settings")
    .select("company_name, logo_url, brand_color")
    .eq("tenant_id", tenant.id)
    .maybeSingle()

  return {
    id: tenant.id,
    name: tenant.name,
    slug: tenant.slug,
    companyName: settings?.company_name ?? tenant.name,
    brandColor: settings?.brand_color ?? "#C49A2C",
    logoUrl: settings?.logo_url ?? null,
  }
})

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

const DOMAIN_LABEL_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/
const IPV4_RE = /^\d{1,3}(?:\.\d{1,3}){3}$/

type CustomDomainResult =
  | { ok: true; domain: string | null }
  | { ok: false; error: string }

export function normalizeHostname(host: string): string {
  const trimmed = host.trim().toLowerCase()
  if (!trimmed) return ""

  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) {
    try {
      return normalizeHostname(new URL(trimmed).hostname)
    } catch {
      return ""
    }
  }

  if (trimmed.startsWith("[")) {
    return trimmed.slice(1).split("]")[0].replace(/\.$/, "")
  }

  return trimmed.split(":")[0].replace(/\.$/, "")
}

function isValidCustomDomain(domain: string): boolean {
  if (!domain || domain.length > 253 || !domain.includes(".")) return false
  if (IPV4_RE.test(domain) || domain.includes("..")) return false

  return domain.split(".").every((label) => DOMAIN_LABEL_RE.test(label))
}

export function normalizeCustomDomain(
  input: string | null | undefined
): CustomDomainResult {
  const raw = input?.trim()
  if (!raw) return { ok: true, domain: null }

  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw)
    ? raw
    : `https://${raw}`

  let url: URL
  try {
    url = new URL(withScheme)
  } catch {
    return { ok: false, error: "Enter a valid custom domain." }
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, error: "Custom domain must use http or https." }
  }

  if (url.username || url.password || url.port) {
    return {
      ok: false,
      error: "Enter only a domain name, without credentials or port.",
    }
  }

  if ((url.pathname && url.pathname !== "/") || url.search || url.hash) {
    return { ok: false, error: "Enter only a domain name, not a URL path." }
  }

  const domain = normalizeHostname(url.hostname)
  if (!isValidCustomDomain(domain)) {
    return { ok: false, error: "Enter a valid custom domain." }
  }

  return { ok: true, domain }
}

/** Parse the request host into a candidate custom domain + subdomain slug. */
function parseHost(host: string): { hostname: string; sub: string | null } {
  const hostname = normalizeHostname(host)
  const appDomain = normalizeHostname(process.env.NEXT_PUBLIC_APP_DOMAIN ?? "")
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

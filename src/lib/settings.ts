import { createClient } from "@/lib/supabase/server"
import type { TenantBranding, TenantSettings } from "@/lib/supabase/types"

/**
 * The caller's tenant settings (company branding + fee defaults).
 * RLS scopes tenant_settings to the caller's tenant, so a single-row read
 * returns their company's settings.
 */
export async function getSettings(): Promise<TenantSettings | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from("tenant_settings")
    .select("*")
    .limit(1)
    .maybeSingle()
  return data
}

/**
 * Non-financial branding (logo/colour/name + mileage/HST) for the caller's
 * tenant — readable by ALL members (techs included) without exposing fee %s.
 * Backed by the `tenant_branding()` SECURITY DEFINER function.
 */
export async function getBranding(): Promise<TenantBranding | null> {
  const supabase = await createClient()
  const { data } = await supabase.rpc("tenant_branding")
  return (data?.[0] as TenantBranding | undefined) ?? null
}

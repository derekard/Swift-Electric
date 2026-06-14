import { createClient } from "@/lib/supabase/server"
import type { TenantSettings } from "@/lib/supabase/types"

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

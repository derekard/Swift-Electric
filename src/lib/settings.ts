import { createClient } from "@/lib/supabase/server"
import type { AppSettings } from "@/lib/supabase/types"

/** The single app_settings row (company branding + fee defaults). */
export async function getSettings(): Promise<AppSettings | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from("app_settings")
    .select("*")
    .eq("id", 1)
    .maybeSingle()
  return data
}

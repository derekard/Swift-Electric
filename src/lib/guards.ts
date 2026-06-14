import { getCurrentProfile } from "@/lib/auth"
import { createClient } from "@/lib/supabase/server"
import type { Profile } from "@/lib/supabase/types"
import { fail, type ActionResult } from "@/lib/actions"

type Ctx = {
  profile: Profile
  supabase: Awaited<ReturnType<typeof createClient>>
}

type GuardResult =
  | { ok: true; ctx: Ctx }
  | { ok: false; result: ActionResult<never> }

async function context(check: (p: Profile) => boolean): Promise<GuardResult> {
  const profile = await getCurrentProfile()
  if (!profile || !profile.active || !check(profile)) {
    return { ok: false, result: fail("You don't have permission to do that.") }
  }
  const supabase = await createClient()
  return { ok: true, ctx: { profile, supabase } }
}

/** Tenant admin only (settings, team, price book, billing). RLS is the real gate. */
export function adminContext(): Promise<GuardResult> {
  return context((p) => !!p.tenant_id && p.role === "admin")
}

/** Staff = admin or office (clients, quotes, jobs, invoices). */
export function staffContext(): Promise<GuardResult> {
  return context((p) => !!p.tenant_id && (p.role === "admin" || p.role === "office"))
}

/** Any active tenant member (techs logging their own time/mileage/expenses). */
export function userContext(): Promise<GuardResult> {
  return context((p) => !!p.tenant_id)
}

/** Platform admin (manages all companies). */
export function platformContext(): Promise<GuardResult> {
  return context((p) => p.is_platform_admin)
}

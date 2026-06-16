import { redirect } from "next/navigation"

import { createClient } from "@/lib/supabase/server"
import type { Profile } from "@/lib/supabase/types"

/** The signed-in user's profile, or null if not authenticated. */
export async function getCurrentProfile(): Promise<Profile | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle()

  return data
}

/** Require an active profile; redirect to login / no-access otherwise. */
export async function requireProfile(): Promise<Profile> {
  const profile = await getCurrentProfile()
  if (!profile) redirect("/login")
  if (!profile.active) redirect("/no-access")
  return profile
}

/** Require a tenant member (not a platform admin). Platform admins are sent to /platform. */
export async function requireTenantMember(): Promise<Profile> {
  const profile = await requireProfile()
  // Platform admins belong in /platform, never inside a tenant app — route them
  // out regardless of any (now-forbidden) tenant_id on the row.
  if (profile.is_platform_admin) redirect("/platform/admin")
  if (!profile.tenant_id) redirect("/no-access")
  return profile
}

/** Require staff (admin or office) within a tenant. */
export async function requireStaff(): Promise<Profile> {
  const profile = await requireTenantMember()
  if (profile.role !== "admin" && profile.role !== "office") redirect("/my/jobs")
  return profile
}

/** Require a tenant admin (full access incl. settings/team). */
export async function requireAdmin(): Promise<Profile> {
  const profile = await requireTenantMember()
  if (profile.role !== "admin") redirect("/dashboard")
  return profile
}

/** Require a platform admin (manages all companies). */
export async function requirePlatformAdmin(): Promise<Profile> {
  const profile = await requireProfile()
  if (!profile.is_platform_admin) redirect("/")
  return profile
}

/** Landing path for a profile after login. */
export function homePathForProfile(profile: Profile): string {
  if (profile.is_platform_admin) return "/platform/admin"
  return profile.role === "tech" ? "/my/jobs" : "/dashboard"
}

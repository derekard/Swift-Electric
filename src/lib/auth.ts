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

/** Require an owner; techs are bounced to their own area. */
export async function requireOwner(): Promise<Profile> {
  const profile = await requireProfile()
  if (profile.role !== "owner") redirect("/my/jobs")
  return profile
}

/** Home path for a role. */
export function homePathForRole(role: Profile["role"]): string {
  return role === "owner" ? "/dashboard" : "/my/jobs"
}

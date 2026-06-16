import "server-only"

import { createServiceClient } from "@/lib/supabase/server"
import {
  normalizeEmail,
  profileInsertForAuthUser,
  profilePatchForAuthUser,
  type AuthIdentity,
  type InviteForProvisioning,
} from "@/lib/auth-identity"

/**
 * Ensures the just-authenticated Supabase user has exactly one matching profile.
 * The identity anchor is always auth.users.id; allowlist email only decides
 * initial tenant/role activation for a verified Google identity.
 */
export async function ensureProfileForAuthUser(user: AuthIdentity) {
  const email = normalizeEmail(user.email)
  if (!email) return

  const supabase = createServiceClient()

  const [{ data: profile, error: profileErr }, { data: invites, error: inviteErr }] =
    await Promise.all([
      supabase
        .from("profiles")
        .select(
          "id, tenant_id, email, full_name, role, hourly_wage, is_platform_admin, active"
        )
        .eq("id", user.id)
        .maybeSingle(),
      supabase
        .from("allowlist")
        .select(
          "email, tenant_id, role, full_name, hourly_wage, is_platform_admin"
        )
        .eq("email", email)
        .limit(2),
    ])

  if (profileErr) throw profileErr
  if (inviteErr) throw inviteErr
  if ((invites?.length ?? 0) > 1) {
    throw new Error(`Ambiguous invite rows for ${email}`)
  }

  const invite = (invites?.[0] ?? null) as InviteForProvisioning | null

  if (profile) {
    const patch = profilePatchForAuthUser(profile, user, invite)
    if (!patch) return

    const { error } = await supabase
      .from("profiles")
      .update(patch)
      .eq("id", user.id)
    if (error) throw error
    return
  }

  const insert = profileInsertForAuthUser(user, invite)
  if (!insert) return

  const { error } = await supabase.from("profiles").insert(insert)
  if (error) throw error
}

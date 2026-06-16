import type { Role } from "./supabase/types"

export type TenantRecipientProfile = {
  tenant_id: string | null
  email: string | null
  role: Role
  active: boolean
  is_platform_admin: boolean
}

export function ownerRecipientEmailsByTenant(
  profiles: TenantRecipientProfile[]
): Map<string, string[]> {
  const recipients = new Map<string, string[]>()

  for (const profile of profiles) {
    if (
      !profile.active ||
      profile.is_platform_admin ||
      !profile.tenant_id ||
      !profile.email ||
      (profile.role !== "admin" && profile.role !== "office")
    ) {
      continue
    }

    const emails = recipients.get(profile.tenant_id) ?? []
    emails.push(profile.email)
    recipients.set(profile.tenant_id, emails)
  }

  return recipients
}

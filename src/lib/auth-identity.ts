import type { Profile, Role } from "./supabase/types"

export const SESSION_RESPONSE_CACHE_CONTROL =
  "private, no-store, must-revalidate"
export const LOCAL_DEV_SITE_ORIGIN = "http://localhost:3000"

export type AuthIdentity = {
  id: string
  email?: string | null
  app_metadata?: Record<string, unknown> | null
  user_metadata?: Record<string, unknown> | null
}

export type InviteForProvisioning = {
  email: string
  tenant_id: string | null
  role: Role
  full_name: string | null
  hourly_wage: number
  is_platform_admin: boolean
}

type ProfileForProvisioning = Pick<
  Profile,
  | "id"
  | "tenant_id"
  | "email"
  | "full_name"
  | "role"
  | "hourly_wage"
  | "is_platform_admin"
  | "active"
>

export type ProfileInsertForProvisioning = ProfileForProvisioning

export function normalizeEmail(email: string | null | undefined): string | null {
  const normalized = email?.trim().toLowerCase()
  return normalized || null
}

export function safeRedirectPath(
  rawTarget: string | null | undefined,
  fallback = "/dashboard"
): string {
  if (
    rawTarget?.startsWith("/") &&
    !rawTarget.startsWith("//") &&
    !rawTarget.startsWith("/\\")
  ) {
    return rawTarget
  }
  return fallback
}

function httpOrigin(rawOrigin: string | null | undefined): string | null {
  if (!rawOrigin) return null

  try {
    const url = new URL(rawOrigin)
    if (url.protocol !== "http:" && url.protocol !== "https:") return null
    return url.origin
  } catch {
    return null
  }
}

function isLocalOrigin(origin: string): boolean {
  try {
    const hostname = new URL(origin).hostname
    return (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "::1" ||
      hostname === "[::1]"
    )
  } catch {
    return false
  }
}

export function oauthRedirectOrigin({
  requestOrigin,
  siteUrl,
  nodeEnv,
}: {
  requestOrigin: string
  siteUrl: string | null | undefined
  nodeEnv: string | undefined
}): string | null {
  const configuredOrigin = httpOrigin(siteUrl)

  if (nodeEnv === "production") {
    if (!configuredOrigin || isLocalOrigin(configuredOrigin)) return null
    return configuredOrigin
  }

  return configuredOrigin ?? httpOrigin(requestOrigin) ?? LOCAL_DEV_SITE_ORIGIN
}

export function applySessionNoStoreHeaders(headers: Headers): Headers {
  headers.set("Cache-Control", SESSION_RESPONSE_CACHE_CONTROL)
  headers.append("Vary", "Cookie")
  return headers
}

export function hasGoogleProvider(
  appMetadata: Record<string, unknown> | null | undefined
): boolean {
  if (!appMetadata) return false
  if (appMetadata.provider === "google") return true

  const providers = appMetadata.providers
  return Array.isArray(providers) && providers.includes("google")
}

export function authDisplayName(user: AuthIdentity): string | null {
  const metadata = user.user_metadata ?? {}
  const fullName = metadata.full_name
  if (typeof fullName === "string" && fullName.trim()) return fullName.trim()

  const name = metadata.name
  if (typeof name === "string" && name.trim()) return name.trim()

  return null
}

export function isPlatformProfile(
  profile: Pick<Profile, "is_platform_admin" | "tenant_id">
): boolean {
  return profile.is_platform_admin && profile.tenant_id === null
}

export function isTenantProfile(
  profile: Pick<Profile, "is_platform_admin" | "tenant_id">
): boolean {
  return !!profile.tenant_id && !profile.is_platform_admin
}

function inviteAppliesToUser(
  user: AuthIdentity,
  invite: InviteForProvisioning | null
): invite is InviteForProvisioning {
  return (
    !!invite &&
    hasGoogleProvider(user.app_metadata) &&
    normalizeEmail(invite.email) === normalizeEmail(user.email)
  )
}

function pendingUninvitedProfile(profile: ProfileForProvisioning): boolean {
  return !profile.active && !profile.tenant_id && !profile.is_platform_admin
}

export function profileInsertForAuthUser(
  user: AuthIdentity,
  invite: InviteForProvisioning | null
): ProfileInsertForProvisioning | null {
  const email = normalizeEmail(user.email)
  if (!email) return null

  const canUseInvite = inviteAppliesToUser(user, invite)
  const isPlatformAdmin = canUseInvite && invite.is_platform_admin

  return {
    id: user.id,
    tenant_id: canUseInvite && !isPlatformAdmin ? invite.tenant_id : null,
    email,
    full_name: (canUseInvite ? invite.full_name : null) ?? authDisplayName(user),
    role: canUseInvite ? invite.role : "tech",
    hourly_wage: canUseInvite ? invite.hourly_wage : 0,
    is_platform_admin: isPlatformAdmin,
    active: canUseInvite,
  }
}

export function profilePatchForAuthUser(
  existing: ProfileForProvisioning,
  user: AuthIdentity,
  invite: InviteForProvisioning | null
): Partial<ProfileForProvisioning> | null {
  const email = normalizeEmail(user.email)
  const patch: Partial<ProfileForProvisioning> = {}

  if (email && existing.email !== email) patch.email = email

  const displayName = authDisplayName(user)
  if (!existing.full_name && displayName) patch.full_name = displayName

  if (pendingUninvitedProfile(existing) && inviteAppliesToUser(user, invite)) {
    patch.tenant_id = invite.is_platform_admin ? null : invite.tenant_id
    patch.role = invite.role
    patch.hourly_wage = invite.hourly_wage
    patch.is_platform_admin = invite.is_platform_admin
    patch.active = true
    patch.full_name = invite.full_name ?? patch.full_name ?? existing.full_name
  }

  return Object.keys(patch).length ? patch : null
}

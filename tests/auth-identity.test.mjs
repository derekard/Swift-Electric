import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { test } from "node:test"
import ts from "typescript"

async function importTs(path) {
  const source = await readFile(new URL(path, import.meta.url), "utf8")
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
    },
  })

  const url = `data:text/javascript;base64,${Buffer.from(outputText).toString(
    "base64"
  )}`
  return import(url)
}

const {
  SESSION_RESPONSE_CACHE_CONTROL,
  applySessionNoStoreHeaders,
  hasGoogleProvider,
  isPlatformProfile,
  isTenantProfile,
  normalizeEmail,
  oauthRedirectOrigin,
  profileInsertForAuthUser,
  profilePatchForAuthUser,
  safeRedirectPath,
} = await importTs("../src/lib/auth-identity.ts")
const { ownerRecipientEmailsByTenant } = await importTs(
  "../src/lib/notification-recipients.ts"
)

test("safeRedirectPath only accepts same-origin paths", () => {
  assert.equal(safeRedirectPath("/dashboard"), "/dashboard")
  assert.equal(safeRedirectPath("/my/jobs?tab=today"), "/my/jobs?tab=today")
  assert.equal(safeRedirectPath(null), "/dashboard")
  assert.equal(safeRedirectPath("dashboard"), "/dashboard")
  assert.equal(safeRedirectPath("https://evil.example"), "/dashboard")
  assert.equal(safeRedirectPath("//evil.example"), "/dashboard")
  assert.equal(safeRedirectPath("/\\evil.example"), "/dashboard")
})

test("oauthRedirectOrigin uses the configured public origin in production", () => {
  assert.equal(
    oauthRedirectOrigin({
      requestOrigin: "https://attacker.example",
      siteUrl: "https://app.swiftelectric.ca/some/path",
      nodeEnv: "production",
    }),
    "https://app.swiftelectric.ca"
  )
})

test("oauthRedirectOrigin fails closed without a public production origin", () => {
  assert.equal(
    oauthRedirectOrigin({
      requestOrigin: "https://swift-electric.onrender.com:10000",
      siteUrl: null,
      nodeEnv: "production",
    }),
    null
  )
  assert.equal(
    oauthRedirectOrigin({
      requestOrigin: "https://swift-electric.onrender.com",
      siteUrl: "http://localhost:3000",
      nodeEnv: "production",
    }),
    null
  )
  assert.equal(
    oauthRedirectOrigin({
      requestOrigin: "https://swift-electric.onrender.com",
      siteUrl: "http://[::1]:3000",
      nodeEnv: "production",
    }),
    null
  )
})

test("oauthRedirectOrigin falls back to the request origin outside production", () => {
  assert.equal(
    oauthRedirectOrigin({
      requestOrigin: "http://localhost:3001",
      siteUrl: null,
      nodeEnv: "development",
    }),
    "http://localhost:3001"
  )
})

test("session responses are marked private and cookie-varying", () => {
  const headers = new Headers()
  applySessionNoStoreHeaders(headers)

  assert.equal(headers.get("Cache-Control"), SESSION_RESPONSE_CACHE_CONTROL)
  assert.equal(headers.get("Vary"), "Cookie")
})

test("google provider detection handles Supabase app metadata shapes", () => {
  assert.equal(hasGoogleProvider({ provider: "google" }), true)
  assert.equal(hasGoogleProvider({ providers: ["email", "google"] }), true)
  assert.equal(hasGoogleProvider({ provider: "email" }), false)
  assert.equal(hasGoogleProvider(null), false)
})

test("new profile provisioning is anchored to the authenticated user id", () => {
  const derek = profileInsertForAuthUser(
    {
      id: "auth-user-derek",
      email: "DerekArd@Gmail.com",
      app_metadata: { provider: "google" },
      user_metadata: { name: "Google Derek" },
    },
    {
      email: "derekard@gmail.com",
      tenant_id: "tenant-swift",
      role: "admin",
      full_name: "Derek Ard",
      hourly_wage: 75,
      is_platform_admin: false,
    }
  )
  const matthew = profileInsertForAuthUser(
    {
      id: "auth-user-matthew",
      email: "matthew@swiftelectric.ca",
      app_metadata: { provider: "google" },
      user_metadata: { name: "Matthew Swift" },
    },
    {
      email: "matthew@swiftelectric.ca",
      tenant_id: "tenant-swift",
      role: "admin",
      full_name: "Matthew Swift",
      hourly_wage: 80,
      is_platform_admin: false,
    }
  )

  assert.equal(derek?.id, "auth-user-derek")
  assert.equal(derek?.email, "derekard@gmail.com")
  assert.equal(derek?.full_name, "Derek Ard")
  assert.equal(matthew?.id, "auth-user-matthew")
  assert.equal(matthew?.email, "matthew@swiftelectric.ca")
  assert.equal(matthew?.full_name, "Matthew Swift")
})

test("allowlist activation only applies to Google-authenticated users", () => {
  const invite = {
    email: "invited@example.com",
    tenant_id: "tenant-a",
    role: "office",
    full_name: "Invited User",
    hourly_wage: 50,
    is_platform_admin: false,
  }

  const profile = profileInsertForAuthUser(
    {
      id: "auth-email-user",
      email: "invited@example.com",
      app_metadata: { provider: "email" },
      user_metadata: { name: "Spoofable Email User" },
    },
    invite
  )

  assert.equal(profile?.active, false)
  assert.equal(profile?.tenant_id, null)
  assert.equal(profile?.role, "tech")
})

test("allowlist activation requires the invite email to match the auth email", () => {
  const profile = profileInsertForAuthUser(
    {
      id: "auth-google-user",
      email: "actual@example.com",
      app_metadata: { provider: "google" },
      user_metadata: { name: "Actual User" },
    },
    {
      email: "other@example.com",
      tenant_id: "tenant-a",
      role: "admin",
      full_name: "Other User",
      hourly_wage: 100,
      is_platform_admin: false,
    }
  )

  assert.equal(profile?.active, false)
  assert.equal(profile?.tenant_id, null)
  assert.equal(profile?.role, "tech")
})

test("new invites activate only pending uninvited profiles", () => {
  const invite = {
    email: "late-invite@example.com",
    tenant_id: "tenant-a",
    role: "tech",
    full_name: "Late Invite",
    hourly_wage: 40,
    is_platform_admin: false,
  }
  const user = {
    id: "late-auth-user",
    email: "late-invite@example.com",
    app_metadata: { providers: ["google"] },
    user_metadata: { name: "Google Name" },
  }

  const pendingPatch = profilePatchForAuthUser(
    {
      id: user.id,
      tenant_id: null,
      email: "late-invite@example.com",
      full_name: null,
      role: "tech",
      hourly_wage: 0,
      is_platform_admin: false,
      active: false,
    },
    user,
    invite
  )

  assert.equal(pendingPatch?.active, true)
  assert.equal(pendingPatch?.tenant_id, "tenant-a")
  assert.equal(pendingPatch?.full_name, "Late Invite")

  const deactivatedPatch = profilePatchForAuthUser(
    {
      id: user.id,
      tenant_id: "tenant-a",
      email: "late-invite@example.com",
      full_name: "Late Invite",
      role: "tech",
      hourly_wage: 40,
      is_platform_admin: false,
      active: false,
    },
    user,
    invite
  )

  assert.equal(deactivatedPatch, null)
})

test("platform and tenant predicates reject invalid both-set rows", () => {
  assert.equal(
    isPlatformProfile({ is_platform_admin: true, tenant_id: null }),
    true
  )
  assert.equal(
    isPlatformProfile({ is_platform_admin: true, tenant_id: "tenant-a" }),
    false
  )
  assert.equal(
    isTenantProfile({ is_platform_admin: false, tenant_id: "tenant-a" }),
    true
  )
  assert.equal(
    isTenantProfile({ is_platform_admin: true, tenant_id: "tenant-a" }),
    false
  )
})

test("normalizeEmail lowercases and trims emails", () => {
  assert.equal(normalizeEmail("  User@Example.COM "), "user@example.com")
  assert.equal(normalizeEmail(" "), null)
  assert.equal(normalizeEmail(null), null)
})

test("service provisioning uses exact normalized invite lookup", async () => {
  const source = await readFile(
    new URL("../src/lib/auth-provisioning.ts", import.meta.url),
    "utf8"
  )

  assert.match(source, /\.eq\("email", email\)/)
  assert.doesNotMatch(source, /\.ilike\("email"/)
})

test("tenant financial email recipients exclude platform and invalid rows", () => {
  const recipients = ownerRecipientEmailsByTenant([
    {
      tenant_id: "tenant-a",
      email: "admin@example.com",
      role: "admin",
      active: true,
      is_platform_admin: false,
    },
    {
      tenant_id: "tenant-a",
      email: "office@example.com",
      role: "office",
      active: true,
      is_platform_admin: false,
    },
    {
      tenant_id: "tenant-a",
      email: "both-set@example.com",
      role: "admin",
      active: true,
      is_platform_admin: true,
    },
    {
      tenant_id: null,
      email: "platform@example.com",
      role: "admin",
      active: true,
      is_platform_admin: true,
    },
    {
      tenant_id: "tenant-a",
      email: "inactive@example.com",
      role: "admin",
      active: false,
      is_platform_admin: false,
    },
    {
      tenant_id: "tenant-a",
      email: "tech@example.com",
      role: "tech",
      active: true,
      is_platform_admin: false,
    },
  ])

  assert.deepEqual(recipients.get("tenant-a"), [
    "admin@example.com",
    "office@example.com",
  ])
})

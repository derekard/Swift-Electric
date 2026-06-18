"use server"

import { revalidatePath } from "next/cache"
import type { SupabaseClient } from "@supabase/supabase-js"
import { z } from "zod"

import { normalizeEmail } from "@/lib/auth-identity"
import { platformContext } from "@/lib/guards"
import { ok, fail, type ActionResult } from "@/lib/actions"
import { normalizeCustomDomain, normalizeHostname } from "@/lib/tenant"
import type { Database, TenantStatus } from "@/lib/supabase/types"

type AppSupabase = SupabaseClient<Database>

// Standard electrical price book copied into each new company.
const STANDARD_PRICE_BOOK: Array<[string, number, string, number]> = [
  ["Receptacle", 75, "Devices", 10],
  ["Switch", 75, "Devices", 20],
  ["Dimmer", 125, "Devices", 30],
  ["GFI / GFCI", 125, "Devices", 40],
  ["20 Amp", 150, "Devices", 50],
  ["20 Amp GFI", 175, "Devices", 60],
  ["Pot light", 135, "Lighting", 70],
  ["Light fixture", 125, "Lighting", 80],
  ["Exhaust fan", 350, "Fans", 90],
  ["Timer", 150, "Devices", 100],
]

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

function reservedAppDomain(customDomain: string | null): boolean {
  const appDomain = normalizeHostname(process.env.NEXT_PUBLIC_APP_DOMAIN ?? "")
  return (
    !!customDomain &&
    !!appDomain &&
    (customDomain === appDomain || customDomain.endsWith(`.${appDomain}`))
  )
}

const createSchema = z.object({
  name: z.string().trim().min(1, "Company name required"),
  slug: z.string().trim().optional(),
  custom_domain: z.string().trim().optional(),
  admin_email: z.string().trim().email("Valid admin email required"),
  admin_name: z.string().trim().optional(),
})

async function preflightTenantCreate(
  supabase: AppSupabase,
  {
    slug,
    customDomain,
    adminEmail,
  }: { slug: string; customDomain: string | null; adminEmail: string }
): Promise<string | null> {
  const { data: slugMatches, error: slugErr } = await supabase
    .from("tenants")
    .select("id")
    .eq("slug", slug)
    .limit(1)
  if (slugErr) return slugErr.message
  if ((slugMatches?.length ?? 0) > 0) {
    return "A company with that subdomain already exists."
  }

  if (customDomain) {
    const { data: domainMatches, error: domainErr } = await supabase
      .from("tenants")
      .select("id")
      .eq("custom_domain", customDomain)
      .limit(1)
    if (domainErr) return domainErr.message
    if ((domainMatches?.length ?? 0) > 0) {
      return "A company with that custom domain already exists."
    }
  }

  const { data: inviteMatches, error: inviteErr } = await supabase
    .from("allowlist")
    .select("email")
    .eq("email", adminEmail)
    .limit(1)
  if (inviteErr) return inviteErr.message
  if ((inviteMatches?.length ?? 0) > 0) {
    return "That admin email is already invited."
  }

  const { data: profileMatches, error: profileErr } = await supabase
    .from("profiles")
    .select("tenant_id, is_platform_admin, active")
    .eq("email", adminEmail)
    .limit(2)
  if (profileErr) return profileErr.message
  if (
    (profileMatches ?? []).some(
      (profile) =>
        profile.active || profile.tenant_id || profile.is_platform_admin
    )
  ) {
    return "That admin email already belongs to another active account."
  }

  return null
}

async function cleanupTenantCreation(
  supabase: AppSupabase,
  tenantId: string,
  adminEmail: string
): Promise<string[]> {
  const failures: string[] = []
  const steps = [
    {
      label: "admin invite",
      run: () =>
        supabase
          .from("allowlist")
          .delete()
          .eq("tenant_id", tenantId)
          .eq("email", adminEmail),
    },
    {
      label: "price book",
      run: () =>
        supabase.from("price_book_items").delete().eq("tenant_id", tenantId),
    },
    {
      label: "settings",
      run: () =>
        supabase.from("tenant_settings").delete().eq("tenant_id", tenantId),
    },
    {
      label: "tenant",
      run: () => supabase.from("tenants").delete().eq("id", tenantId),
    },
  ]

  for (const step of steps) {
    const { error } = await step.run()
    if (error) failures.push(`${step.label}: ${error.message}`)
  }

  return failures
}

function failTenantCreation(
  step: string,
  error: string,
  cleanupFailures: string[]
): ActionResult<never> {
  if (cleanupFailures.length > 0) {
    return fail(
      `${step}: ${error}. Cleanup also failed (${cleanupFailures.join(
        "; "
      )}); verify the partial company before retrying.`
    )
  }

  return fail(
    `${step}: ${error}. The partial company was cleaned up; please retry.`
  )
}

export async function createTenantAction(
  input: z.infer<typeof createSchema>
): Promise<ActionResult<{ id: string }>> {
  const parsed = createSchema.safeParse(input)
  if (!parsed.success) return fail(parsed.error.issues[0].message)

  const guard = await platformContext()
  if (!guard.ok) return guard.result
  const { supabase } = guard.ctx

  const slug = slugify(parsed.data.slug || parsed.data.name)
  if (!slug) return fail("Could not derive a slug from the name")

  const domain = normalizeCustomDomain(parsed.data.custom_domain)
  if (!domain.ok) return fail(domain.error)

  const adminEmail = normalizeEmail(parsed.data.admin_email)
  if (!adminEmail) return fail("Valid admin email required")

  const customDomain = domain.domain
  if (reservedAppDomain(customDomain)) {
    return fail("Use the subdomain field for app-domain addresses.")
  }

  const adminName = parsed.data.admin_name?.trim() || null
  const preflightError = await preflightTenantCreate(supabase, {
    slug,
    customDomain,
    adminEmail,
  })
  if (preflightError) return fail(preflightError)

  const { data: tenant, error: tErr } = await supabase
    .from("tenants")
    .insert({
      name: parsed.data.name,
      slug,
      custom_domain: customDomain,
    })
    .select("id")
    .single()
  if (tErr) return fail(tErr.message)

  // Supabase JS does not expose a multi-table transaction here. Keep dependent
  // inserts sequential and clean up the tenant on any later failure.
  const { error: sErr } = await supabase.from("tenant_settings").insert({
    tenant_id: tenant.id,
    company_name: parsed.data.name,
  })
  if (sErr) {
    const cleanup = await cleanupTenantCreation(supabase, tenant.id, adminEmail)
    return failTenantCreation(
      "Company settings could not be initialized",
      sErr.message,
      cleanup
    )
  }

  const { error: pErr } = await supabase.from("price_book_items").insert(
    STANDARD_PRICE_BOOK.map(([name, unit_price, category, sort]) => ({
      tenant_id: tenant.id,
      name,
      unit_price,
      category,
      sort,
    }))
  )
  if (pErr) {
    const cleanup = await cleanupTenantCreation(supabase, tenant.id, adminEmail)
    return failTenantCreation(
      "Price book could not be initialized",
      pErr.message,
      cleanup
    )
  }

  const { error: aErr } = await supabase.from("allowlist").insert({
    email: adminEmail,
    tenant_id: tenant.id,
    role: "admin",
    full_name: adminName,
  })
  if (aErr) {
    const cleanup = await cleanupTenantCreation(supabase, tenant.id, adminEmail)
    return failTenantCreation(
      "Admin invite could not be created",
      aErr.message,
      cleanup
    )
  }

  revalidatePath("/platform/admin")
  return ok({ id: tenant.id })
}

export async function setTenantStatusAction(
  id: string,
  status: TenantStatus
): Promise<ActionResult> {
  const guard = await platformContext()
  if (!guard.ok) return guard.result

  const { error } = await guard.ctx.supabase
    .from("tenants")
    .update({ status })
    .eq("id", id)
  if (error) return fail(error.message)

  revalidatePath("/platform/admin")
  return ok()
}

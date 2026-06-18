"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { adminContext } from "@/lib/guards"
import { ok, fail, type ActionResult } from "@/lib/actions"
import type { TenantSettings, PriceBookItem, Profile } from "@/lib/supabase/types"

// ---------------------------------------------------------------------------
// Company + fee settings
// ---------------------------------------------------------------------------
const settingsSchema = z.object({
  company_name: z.string().trim().min(1),
  owner_name: z.string().trim().nullable(),
  license_number: z.string().trim().nullable(),
  address: z.string().trim().nullable(),
  phone: z.string().trim().nullable(),
  email: z.string().trim().email().or(z.literal("")).nullable(),
  logo_url: z
    .preprocess(
      (value) => (typeof value === "string" ? value.trim() : value),
      z.string().url("Logo URL must be a valid URL.").or(z.literal("")).nullable()
    ),
  brand_color: z.string().trim().min(1),
  hst_rate: z.number().min(0).max(100),
  jic_pct: z.number().min(0).max(100),
  admin_pct: z.number().min(0).max(100),
  small_parts_pct: z.number().min(0).max(100),
  permit_fee: z.number().min(0),
  mileage_rate: z.number().min(0),
  net_days: z.number().int().min(0).max(365),
  tm_labor_rate: z.number().min(0),
  tm_materials_markup_pct: z.number().min(0).max(100),
  quote_intro: z.string().trim().min(1),
  show_hst_line: z.boolean(),
})

export type SettingsInput = z.infer<typeof settingsSchema>

export async function updateSettingsAction(
  input: SettingsInput
): Promise<ActionResult> {
  const parsed = settingsSchema.safeParse(input)
  if (!parsed.success) return fail(parsed.error.issues[0].message)

  const guard = await adminContext()
  if (!guard.ok) return guard.result

  const patch: Partial<TenantSettings> = {
    ...parsed.data,
    email: parsed.data.email || null,
    logo_url: parsed.data.logo_url || null,
  }
  const { error } = await guard.ctx.supabase
    .from("tenant_settings")
    .update(patch)
    .eq("tenant_id", guard.ctx.profile.tenant_id!)
  if (error) return fail(error.message)

  revalidatePath("/settings")
  return ok()
}

// ---------------------------------------------------------------------------
// Price book
// ---------------------------------------------------------------------------
const priceItemSchema = z.object({
  name: z.string().trim().min(1),
  unit_price: z.number().min(0),
  category: z.string().trim().nullable(),
})
const priceItemUpdateSchema = priceItemSchema
  .extend({ active: z.boolean() })
  .partial()
  .refine((data) => Object.values(data).some((value) => value !== undefined), {
    message: "Enter at least one price book change.",
  })
const priceItemIdSchema = z.string().uuid("Invalid price book item.")

export async function addPriceItemAction(
  input: z.infer<typeof priceItemSchema>
): Promise<ActionResult> {
  const parsed = priceItemSchema.safeParse(input)
  if (!parsed.success) return fail(parsed.error.issues[0].message)

  const guard = await adminContext()
  if (!guard.ok) return guard.result

  const { error } = await guard.ctx.supabase.from("price_book_items").insert({
    name: parsed.data.name,
    unit_price: parsed.data.unit_price,
    category: parsed.data.category || null,
  })
  if (error) return fail(error.message)

  revalidatePath("/settings")
  return ok()
}

export async function updatePriceItemAction(
  id: string,
  input: z.infer<typeof priceItemUpdateSchema>
): Promise<ActionResult> {
  const parsedId = priceItemIdSchema.safeParse(id)
  if (!parsedId.success) return fail(parsedId.error.issues[0].message)

  const parsed = priceItemUpdateSchema.safeParse(input)
  if (!parsed.success) return fail(parsed.error.issues[0].message)

  const guard = await adminContext()
  if (!guard.ok) return guard.result
  const tenantId = guard.ctx.profile.tenant_id!

  const patch: Partial<PriceBookItem> = {}
  if (parsed.data.name !== undefined) patch.name = parsed.data.name
  if (parsed.data.unit_price !== undefined)
    patch.unit_price = parsed.data.unit_price
  if (parsed.data.category !== undefined)
    patch.category = parsed.data.category || null
  if (parsed.data.active !== undefined) patch.active = parsed.data.active

  const { error } = await guard.ctx.supabase
    .from("price_book_items")
    .update(patch)
    .eq("id", parsedId.data)
    .eq("tenant_id", tenantId)
  if (error) return fail(error.message)

  revalidatePath("/settings")
  return ok()
}

export async function deletePriceItemAction(id: string): Promise<ActionResult> {
  const parsedId = priceItemIdSchema.safeParse(id)
  if (!parsedId.success) return fail(parsedId.error.issues[0].message)

  const guard = await adminContext()
  if (!guard.ok) return guard.result
  const tenantId = guard.ctx.profile.tenant_id!

  const { error } = await guard.ctx.supabase
    .from("price_book_items")
    .update({ active: false })
    .eq("id", parsedId.data)
    .eq("tenant_id", tenantId)
  if (error) return fail(error.message)
  revalidatePath("/settings")
  return ok()
}

// ---------------------------------------------------------------------------
// Team (profiles) + invite allowlist
// ---------------------------------------------------------------------------
const profileSchema = z.object({
  full_name: z.string().trim().nullable().optional(),
  role: z.enum(["admin", "office", "tech"]).optional(),
  hourly_wage: z.number().min(0).optional(),
  home_address: z.string().trim().nullable().optional(),
  active: z.boolean().optional(),
})

export async function updateProfileAction(
  id: string,
  input: z.infer<typeof profileSchema>
): Promise<ActionResult> {
  const parsed = profileSchema.safeParse(input)
  if (!parsed.success) return fail(parsed.error.issues[0].message)

  const guard = await adminContext()
  if (!guard.ok) return guard.result
  const tenantId = guard.ctx.profile.tenant_id!

  const patch: Partial<Profile> = {}
  if (parsed.data.full_name !== undefined)
    patch.full_name = parsed.data.full_name
  if (parsed.data.role !== undefined) patch.role = parsed.data.role
  if (parsed.data.hourly_wage !== undefined)
    patch.hourly_wage = parsed.data.hourly_wage
  if (parsed.data.home_address !== undefined)
    patch.home_address = parsed.data.home_address || null
  if (parsed.data.active !== undefined) patch.active = parsed.data.active
  if (Object.keys(patch).length === 0) return ok()

  const { data: current, error: currentErr } = await guard.ctx.supabase
    .from("profiles")
    .select("id, role, active")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .maybeSingle()
  if (currentErr) return fail(currentErr.message)
  if (!current) return fail("Team member not found.")

  const nextRole = patch.role ?? current.role
  const nextActive = patch.active ?? current.active
  const removesActiveAdmin =
    current.role === "admin" &&
    current.active &&
    (nextRole !== "admin" || !nextActive)

  if (removesActiveAdmin) {
    const { count, error: countErr } = await guard.ctx.supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("role", "admin")
      .eq("active", true)
    if (countErr) return fail(countErr.message)
    if ((count ?? 0) <= 1) {
      return fail("At least one active admin is required.")
    }
  }

  const { error } = await guard.ctx.supabase
    .from("profiles")
    .update(patch)
    .eq("id", id)
    .eq("tenant_id", tenantId)
  if (error) return fail(error.message)

  revalidatePath("/settings")
  return ok()
}

const inviteSchema = z.object({
  email: z.string().trim().email(),
  role: z.enum(["admin", "office", "tech"]),
  full_name: z.string().trim().nullable().optional(),
  hourly_wage: z.number().min(0).optional(),
})

export async function addInviteAction(
  input: z.infer<typeof inviteSchema>
): Promise<ActionResult> {
  const parsed = inviteSchema.safeParse(input)
  if (!parsed.success) return fail(parsed.error.issues[0].message)

  const guard = await adminContext()
  if (!guard.ok) return guard.result

  const { error } = await guard.ctx.supabase.from("allowlist").insert({
    email: parsed.data.email.toLowerCase(),
    tenant_id: guard.ctx.profile.tenant_id,
    role: parsed.data.role,
    full_name: parsed.data.full_name || null,
    hourly_wage: parsed.data.hourly_wage ?? 0,
  })
  if (error) return fail(error.message)

  revalidatePath("/settings")
  return ok()
}

export async function removeInviteAction(email: string): Promise<ActionResult> {
  const guard = await adminContext()
  if (!guard.ok) return guard.result
  const { error } = await guard.ctx.supabase
    .from("allowlist")
    .delete()
    .eq("email", email)
  if (error) return fail(error.message)
  revalidatePath("/settings")
  return ok()
}

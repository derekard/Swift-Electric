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
  brand_color: z.string().trim().min(1),
  hst_rate: z.number().min(0).max(100),
  jic_pct: z.number().min(0).max(100),
  admin_pct: z.number().min(0).max(100),
  small_parts_pct: z.number().min(0).max(100),
  permit_fee: z.number().min(0),
  mileage_rate: z.number().min(0),
  net_days: z.number().int().min(0).max(365),
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
  input: Partial<z.infer<typeof priceItemSchema>> & { active?: boolean }
): Promise<ActionResult> {
  const guard = await adminContext()
  if (!guard.ok) return guard.result

  const patch: Partial<PriceBookItem> = {}
  if (input.name !== undefined) patch.name = input.name.trim()
  if (input.unit_price !== undefined) patch.unit_price = input.unit_price
  if (input.category !== undefined) patch.category = input.category || null
  if (input.active !== undefined) patch.active = input.active

  const { error } = await guard.ctx.supabase
    .from("price_book_items")
    .update(patch)
    .eq("id", id)
  if (error) return fail(error.message)

  revalidatePath("/settings")
  return ok()
}

export async function deletePriceItemAction(id: string): Promise<ActionResult> {
  const guard = await adminContext()
  if (!guard.ok) return guard.result
  const { error } = await guard.ctx.supabase
    .from("price_book_items")
    .delete()
    .eq("id", id)
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

  const patch: Partial<Profile> = {}
  if (parsed.data.full_name !== undefined)
    patch.full_name = parsed.data.full_name
  if (parsed.data.role !== undefined) patch.role = parsed.data.role
  if (parsed.data.hourly_wage !== undefined)
    patch.hourly_wage = parsed.data.hourly_wage
  if (parsed.data.active !== undefined) patch.active = parsed.data.active

  const { error } = await guard.ctx.supabase
    .from("profiles")
    .update(patch)
    .eq("id", id)
    .eq("tenant_id", guard.ctx.profile.tenant_id!)
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

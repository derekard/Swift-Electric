"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { platformContext } from "@/lib/guards"
import { ok, fail, type ActionResult } from "@/lib/actions"
import type { TenantStatus } from "@/lib/supabase/types"

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

const createSchema = z.object({
  name: z.string().trim().min(1, "Company name required"),
  slug: z.string().trim().optional(),
  custom_domain: z.string().trim().optional(),
  admin_email: z.string().trim().email("Valid admin email required"),
  admin_name: z.string().trim().optional(),
})

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

  const { data: tenant, error: tErr } = await supabase
    .from("tenants")
    .insert({
      name: parsed.data.name,
      slug,
      custom_domain: parsed.data.custom_domain || null,
    })
    .select("id")
    .single()
  if (tErr) return fail(tErr.message)

  const { error: sErr } = await supabase.from("tenant_settings").insert({
    tenant_id: tenant.id,
    company_name: parsed.data.name,
  })
  if (sErr) return fail(sErr.message)

  const { error: pErr } = await supabase.from("price_book_items").insert(
    STANDARD_PRICE_BOOK.map(([name, unit_price, category, sort]) => ({
      tenant_id: tenant.id,
      name,
      unit_price,
      category,
      sort,
    }))
  )
  if (pErr) return fail(pErr.message)

  const { error: aErr } = await supabase.from("allowlist").insert({
    email: parsed.data.admin_email.toLowerCase(),
    tenant_id: tenant.id,
    role: "admin",
    full_name: parsed.data.admin_name || null,
  })
  if (aErr) return fail(aErr.message)

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

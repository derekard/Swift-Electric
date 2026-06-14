"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { ownerContext } from "@/lib/guards"
import { ok, fail, type ActionResult } from "@/lib/actions"

const clientSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  email: z.string().trim().email("Invalid email").or(z.literal("")).optional(),
  phone: z.string().trim().optional(),
  address: z.string().trim().optional(),
  notes: z.string().trim().optional(),
})

export type ClientInput = z.infer<typeof clientSchema>

function clean(input: ClientInput) {
  return {
    name: input.name,
    email: input.email || null,
    phone: input.phone || null,
    address: input.address || null,
    notes: input.notes || null,
  }
}

export async function createClientAction(
  input: ClientInput
): Promise<ActionResult<{ id: string }>> {
  const parsed = clientSchema.safeParse(input)
  if (!parsed.success) return fail(parsed.error.issues[0].message)

  const guard = await ownerContext()
  if (!guard.ok) return guard.result
  const { supabase, profile } = guard.ctx

  const { data, error } = await supabase
    .from("clients")
    .insert({ ...clean(parsed.data), created_by: profile.id })
    .select("id")
    .single()

  if (error) return fail(error.message)
  revalidatePath("/clients")
  return ok({ id: data.id })
}

export async function updateClientAction(
  id: string,
  input: ClientInput
): Promise<ActionResult> {
  const parsed = clientSchema.safeParse(input)
  if (!parsed.success) return fail(parsed.error.issues[0].message)

  const guard = await ownerContext()
  if (!guard.ok) return guard.result

  const { error } = await guard.ctx.supabase
    .from("clients")
    .update(clean(parsed.data))
    .eq("id", id)

  if (error) return fail(error.message)
  revalidatePath("/clients")
  return ok()
}

export async function deleteClientAction(id: string): Promise<ActionResult> {
  const guard = await ownerContext()
  if (!guard.ok) return guard.result

  const { error } = await guard.ctx.supabase
    .from("clients")
    .delete()
    .eq("id", id)

  if (error) return fail(error.message)
  revalidatePath("/clients")
  return ok()
}

"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { userContext } from "@/lib/guards"
import { ok, fail, type ActionResult } from "@/lib/actions"

// ---------------------------------------------------------------------------
// Home address (for mileage) + Mapbox distance auto-calc
// ---------------------------------------------------------------------------
export async function setHomeAddressAction(
  address: string
): Promise<ActionResult> {
  const guard = await userContext()
  if (!guard.ok) return guard.result
  const { error } = await guard.ctx.supabase.rpc("update_my_home_address", {
    addr: address,
  })
  if (error) return fail(error.message)
  revalidatePath("/my/timesheet")
  return ok()
}

async function geocode(token: string, q: string): Promise<[number, number] | null> {
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(
    q
  )}.json?limit=1&country=CA&access_token=${token}`
  const res = await fetch(url)
  if (!res.ok) return null
  const data = await res.json()
  const center = data?.features?.[0]?.center
  return Array.isArray(center) ? [center[0], center[1]] : null
}

/** One-way driving distance (km) between two addresses via Mapbox. */
export async function calcMileageAction(input: {
  origin: string
  destination: string
}): Promise<ActionResult<{ km: number }>> {
  const guard = await userContext()
  if (!guard.ok) return guard.result

  const token = process.env.MAPBOX_TOKEN
  if (!token) return fail("Distance lookup isn't configured (no MAPBOX_TOKEN).")
  if (!input.origin.trim() || !input.destination.trim()) {
    return fail("Both a home address and a site address are needed.")
  }

  try {
    const [a, b] = await Promise.all([
      geocode(token, input.origin),
      geocode(token, input.destination),
    ])
    if (!a) return fail("Couldn't find your home address on the map.")
    if (!b) return fail("Couldn't find the job site address on the map.")

    const dir = await fetch(
      `https://api.mapbox.com/directions/v5/mapbox/driving/${a[0]},${a[1]};${b[0]},${b[1]}?overview=false&access_token=${token}`
    )
    if (!dir.ok) return fail("Distance lookup failed. Enter KM manually.")
    const data = await dir.json()
    const meters = data?.routes?.[0]?.distance
    if (typeof meters !== "number") return fail("No route found between the addresses.")
    return ok({ km: Math.round((meters / 1000) * 10) / 10 })
  } catch {
    return fail("Distance lookup failed. Enter KM manually.")
  }
}

// ---------------------------------------------------------------------------
// Time entries
// ---------------------------------------------------------------------------
const timeSchema = z.object({
  job_id: z.string().uuid(),
  work_date: z.string().min(1),
  hours: z.number().positive("Hours must be greater than 0"),
  notes: z.string().trim().nullable().optional(),
})

export async function addTimeEntryAction(
  input: z.infer<typeof timeSchema>
): Promise<ActionResult> {
  const parsed = timeSchema.safeParse(input)
  if (!parsed.success) return fail(parsed.error.issues[0].message)

  const guard = await userContext()
  if (!guard.ok) return guard.result

  const { error } = await guard.ctx.supabase.from("time_entries").insert({
    ...parsed.data,
    notes: parsed.data.notes || null,
    profile_id: guard.ctx.profile.id,
    status: "draft",
  })
  if (error) return fail(error.message)

  revalidatePath(`/my/jobs/${parsed.data.job_id}`)
  revalidatePath("/my/timesheet")
  revalidatePath(`/jobs/${parsed.data.job_id}`)
  return ok()
}

export async function deleteTimeEntryAction(id: string): Promise<ActionResult> {
  const guard = await userContext()
  if (!guard.ok) return guard.result
  const { error } = await guard.ctx.supabase
    .from("time_entries")
    .delete()
    .eq("id", id)
  if (error) return fail(error.message)
  revalidatePath("/my/timesheet")
  return ok()
}

// ---------------------------------------------------------------------------
// Mileage entries
// ---------------------------------------------------------------------------
const mileageSchema = z.object({
  job_id: z.string().uuid(),
  travel_date: z.string().min(1),
  km: z.number().positive("KM must be greater than 0"),
  notes: z.string().trim().nullable().optional(),
})

export async function addMileageEntryAction(
  input: z.infer<typeof mileageSchema>
): Promise<ActionResult> {
  const parsed = mileageSchema.safeParse(input)
  if (!parsed.success) return fail(parsed.error.issues[0].message)

  const guard = await userContext()
  if (!guard.ok) return guard.result

  const { error } = await guard.ctx.supabase.from("mileage_entries").insert({
    ...parsed.data,
    notes: parsed.data.notes || null,
    profile_id: guard.ctx.profile.id,
    status: "draft",
  })
  if (error) return fail(error.message)

  revalidatePath(`/my/jobs/${parsed.data.job_id}`)
  revalidatePath("/my/timesheet")
  revalidatePath(`/jobs/${parsed.data.job_id}`)
  return ok()
}

export async function deleteMileageEntryAction(
  id: string
): Promise<ActionResult> {
  const guard = await userContext()
  if (!guard.ok) return guard.result
  const { error } = await guard.ctx.supabase
    .from("mileage_entries")
    .delete()
    .eq("id", id)
  if (error) return fail(error.message)
  revalidatePath("/my/timesheet")
  return ok()
}

// ---------------------------------------------------------------------------
// Expenses
// ---------------------------------------------------------------------------
const expenseSchema = z.object({
  job_id: z.string().uuid(),
  description: z.string().trim().min(1, "Description required"),
  amount: z.number().min(0),
  spent_date: z.string().nullable().optional(),
  receipt_url: z.string().nullable().optional(),
})

export async function addExpenseAction(
  input: z.infer<typeof expenseSchema>
): Promise<ActionResult> {
  const parsed = expenseSchema.safeParse(input)
  if (!parsed.success) return fail(parsed.error.issues[0].message)

  const guard = await userContext()
  if (!guard.ok) return guard.result

  const { error } = await guard.ctx.supabase.from("expenses").insert({
    job_id: parsed.data.job_id,
    description: parsed.data.description,
    amount: parsed.data.amount,
    spent_date: parsed.data.spent_date || null,
    receipt_url: parsed.data.receipt_url || null,
    profile_id: guard.ctx.profile.id,
  })
  if (error) return fail(error.message)

  revalidatePath(`/my/jobs/${parsed.data.job_id}`)
  revalidatePath(`/jobs/${parsed.data.job_id}`)
  return ok()
}

export async function deleteExpenseAction(id: string): Promise<ActionResult> {
  const guard = await userContext()
  if (!guard.ok) return guard.result
  const { error } = await guard.ctx.supabase
    .from("expenses")
    .delete()
    .eq("id", id)
  if (error) return fail(error.message)
  revalidatePath("/my/timesheet")
  return ok()
}

// ---------------------------------------------------------------------------
// Submit drafts for approval
// ---------------------------------------------------------------------------
export async function submitEntriesAction(
  jobId?: string
): Promise<ActionResult> {
  const guard = await userContext()
  if (!guard.ok) return guard.result
  const { supabase, profile } = guard.ctx

  let timeQ = supabase
    .from("time_entries")
    .update({ status: "submitted" })
    .eq("profile_id", profile.id)
    .eq("status", "draft")
  let mileageQ = supabase
    .from("mileage_entries")
    .update({ status: "submitted" })
    .eq("profile_id", profile.id)
    .eq("status", "draft")

  if (jobId) {
    timeQ = timeQ.eq("job_id", jobId)
    mileageQ = mileageQ.eq("job_id", jobId)
  }

  const [t, m] = await Promise.all([timeQ, mileageQ])
  if (t.error) return fail(t.error.message)
  if (m.error) return fail(m.error.message)

  revalidatePath("/my/timesheet")
  if (jobId) revalidatePath(`/my/jobs/${jobId}`)
  return ok()
}

"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { userContext } from "@/lib/guards"
import { ok, fail, type ActionResult } from "@/lib/actions"

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

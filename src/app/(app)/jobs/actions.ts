"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { ownerContext } from "@/lib/guards"
import { ok, fail, type ActionResult } from "@/lib/actions"
import type { EntryStatus, Job } from "@/lib/supabase/types"

const updateSchema = z.object({
  title: z.string().trim().min(1).optional(),
  status: z
    .enum(["scheduled", "in_progress", "complete", "cancelled"])
    .optional(),
  site_address: z.string().trim().nullable().optional(),
  scheduled_start: z.string().nullable().optional(),
  scheduled_end: z.string().nullable().optional(),
  notes: z.string().trim().nullable().optional(),
})

export type JobUpdateInput = z.infer<typeof updateSchema>

export async function updateJobAction(
  id: string,
  input: JobUpdateInput
): Promise<ActionResult> {
  const parsed = updateSchema.safeParse(input)
  if (!parsed.success) return fail(parsed.error.issues[0].message)

  const guard = await ownerContext()
  if (!guard.ok) return guard.result

  const patch: Partial<Job> = {}
  for (const [k, v] of Object.entries(parsed.data)) {
    // empty date strings -> null
    ;(patch as Record<string, unknown>)[k] = v === "" ? null : v
  }

  const { error } = await guard.ctx.supabase
    .from("jobs")
    .update(patch)
    .eq("id", id)
  if (error) return fail(error.message)

  revalidatePath("/jobs")
  revalidatePath(`/jobs/${id}`)
  return ok()
}

export async function assignTechAction(
  jobId: string,
  profileId: string
): Promise<ActionResult> {
  const guard = await ownerContext()
  if (!guard.ok) return guard.result

  const { error } = await guard.ctx.supabase
    .from("job_assignments")
    .insert({ job_id: jobId, profile_id: profileId })
  if (error) return fail(error.message)

  revalidatePath(`/jobs/${jobId}`)
  return ok()
}

export async function unassignTechAction(
  jobId: string,
  profileId: string
): Promise<ActionResult> {
  const guard = await ownerContext()
  if (!guard.ok) return guard.result

  const { error } = await guard.ctx.supabase
    .from("job_assignments")
    .delete()
    .eq("job_id", jobId)
    .eq("profile_id", profileId)
  if (error) return fail(error.message)

  revalidatePath(`/jobs/${jobId}`)
  return ok()
}

// Owner approves / rejects a tech's time or mileage entry.
type ReviewPatch = {
  status: EntryStatus
  approved_by: string | null
  approved_at: string | null
}

function reviewPatch(status: EntryStatus, ownerId: string): ReviewPatch {
  const approved = status === "approved"
  return {
    status,
    approved_by: approved ? ownerId : null,
    approved_at: approved ? new Date().toISOString() : null,
  }
}

export async function reviewTimeEntryAction(
  id: string,
  status: EntryStatus,
  jobId: string
): Promise<ActionResult> {
  const guard = await ownerContext()
  if (!guard.ok) return guard.result

  const { error } = await guard.ctx.supabase
    .from("time_entries")
    .update(reviewPatch(status, guard.ctx.profile.id))
    .eq("id", id)
  if (error) return fail(error.message)

  revalidatePath(`/jobs/${jobId}`)
  return ok()
}

export async function reviewMileageEntryAction(
  id: string,
  status: EntryStatus,
  jobId: string
): Promise<ActionResult> {
  const guard = await ownerContext()
  if (!guard.ok) return guard.result

  const { error } = await guard.ctx.supabase
    .from("mileage_entries")
    .update(reviewPatch(status, guard.ctx.profile.id))
    .eq("id", id)
  if (error) return fail(error.message)

  revalidatePath(`/jobs/${jobId}`)
  return ok()
}

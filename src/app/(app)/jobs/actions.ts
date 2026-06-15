"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { staffContext } from "@/lib/guards"
import { getSettings } from "@/lib/settings"
import { round2 } from "@/lib/format"
import { ok, fail, type ActionResult } from "@/lib/actions"
import type { EntryStatus, Invoice, Job } from "@/lib/supabase/types"

const updateSchema = z.object({
  title: z.string().trim().min(1).optional(),
  status: z
    .enum(["scheduled", "in_progress", "complete", "cancelled"])
    .optional(),
  site_address: z.string().trim().nullable().optional(),
  scheduled_start: z.string().nullable().optional(),
  scheduled_end: z.string().nullable().optional(),
  notes: z.string().trim().nullable().optional(),
  tm_labor_rate: z.number().min(0).nullable().optional(),
  tm_materials_markup_pct: z.number().min(0).max(100).nullable().optional(),
})

export type JobUpdateInput = z.infer<typeof updateSchema>

export async function updateJobAction(
  id: string,
  input: JobUpdateInput
): Promise<ActionResult> {
  const parsed = updateSchema.safeParse(input)
  if (!parsed.success) return fail(parsed.error.issues[0].message)

  const guard = await staffContext()
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

const createSchema = z.object({
  title: z.string().trim().min(1, "Job title is required"),
  client_id: z.string().uuid().nullable().optional(),
  site_address: z.string().trim().nullable().optional(),
  scheduled_start: z.string().nullable().optional(),
})

// Create a job directly (not from a quote) — e.g. scheduling work straight in.
export async function createJobAction(
  input: z.infer<typeof createSchema>
): Promise<ActionResult<{ id: string }>> {
  const parsed = createSchema.safeParse(input)
  if (!parsed.success) return fail(parsed.error.issues[0].message)

  const guard = await staffContext()
  if (!guard.ok) return guard.result

  const { data, error } = await guard.ctx.supabase
    .from("jobs")
    .insert({
      title: parsed.data.title,
      client_id: parsed.data.client_id ?? null,
      site_address: parsed.data.site_address || null,
      scheduled_start: parsed.data.scheduled_start || null,
      status: "scheduled",
      created_by: guard.ctx.profile.id,
    })
    .select("id")
    .single()
  if (error) return fail(error.message)

  revalidatePath("/jobs")
  revalidatePath("/schedule")
  return ok({ id: data.id })
}

export async function assignTechAction(
  jobId: string,
  profileId: string
): Promise<ActionResult> {
  const guard = await staffContext()
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
  const guard = await staffContext()
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
  const guard = await staffContext()
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
  const guard = await staffContext()
  if (!guard.ok) return guard.result

  const { error } = await guard.ctx.supabase
    .from("mileage_entries")
    .update(reviewPatch(status, guard.ctx.profile.id))
    .eq("id", id)
  if (error) return fail(error.message)

  revalidatePath(`/jobs/${jobId}`)
  return ok()
}

// Build (or rebuild) a Time & Materials invoice from the job's logged actuals:
// labour = hours × billing rate, materials = expenses × (1 + markup), + HST.
export async function buildTmInvoiceAction(
  jobId: string
): Promise<ActionResult<{ total: number }>> {
  const guard = await staffContext()
  if (!guard.ok) return guard.result
  const { supabase } = guard.ctx

  const { data: job } = await supabase
    .from("jobs")
    .select("id, billing_type, tm_labor_rate, tm_materials_markup_pct")
    .eq("id", jobId)
    .maybeSingle()
  if (!job) return fail("Job not found")
  if (job.billing_type !== "tm") return fail("This job isn't Time & Materials.")

  const [{ data: time }, { data: expenses }, { data: invoice }, settings] =
    await Promise.all([
      supabase
        .from("time_entries")
        .select("hours, status")
        .eq("job_id", jobId),
      supabase.from("expenses").select("amount").eq("job_id", jobId),
      supabase
        .from("invoices")
        .select("id")
        .eq("job_id", jobId)
        .maybeSingle(),
      getSettings(),
    ])
  if (!invoice) return fail("No invoice found for this job.")

  const rate = Number(job.tm_labor_rate ?? 0)
  const markup = Number(job.tm_materials_markup_pct ?? 0)
  const hstRate = Number(settings?.hst_rate ?? 13)

  const hours = (time ?? [])
    .filter((t) => t.status !== "rejected")
    .reduce((s, t) => s + Number(t.hours), 0)
  const materialsCost = (expenses ?? []).reduce((s, e) => s + Number(e.amount), 0)

  const labor = round2(hours * rate)
  const materials = round2(materialsCost * (1 + markup / 100))
  const pretax = round2(labor + materials)
  const hst = round2((pretax * hstRate) / 100)
  const total = round2(pretax + hst)

  const patch: Partial<Invoice> = {
    billing_type: "tm",
    labor_amount: labor,
    materials_amount: materials,
    items_subtotal: 0,
    jic_amount: 0,
    admin_amount: 0,
    small_parts_amount: 0,
    permit_amount: 0,
    amount_pretax: pretax,
    hst_amount: hst,
    total,
  }
  const { error } = await supabase
    .from("invoices")
    .update(patch)
    .eq("id", invoice.id)
  if (error) return fail(error.message)

  revalidatePath(`/jobs/${jobId}`)
  revalidatePath(`/invoices/${invoice.id}`)
  revalidatePath("/invoices")
  return ok({ total })
}

// Convert an existing fixed-price job to Time & Materials (seeds rates from
// company defaults; admin can fine-tune them after). Flips the linked invoice too.
export async function convertJobToTmAction(
  jobId: string
): Promise<ActionResult> {
  const guard = await staffContext()
  if (!guard.ok) return guard.result
  const { supabase } = guard.ctx

  const settings = await getSettings()
  const { error } = await supabase
    .from("jobs")
    .update({
      billing_type: "tm",
      tm_labor_rate: settings?.tm_labor_rate ?? 0,
      tm_materials_markup_pct: settings?.tm_materials_markup_pct ?? 0,
    })
    .eq("id", jobId)
  if (error) return fail(error.message)

  await supabase
    .from("invoices")
    .update({ billing_type: "tm" })
    .eq("job_id", jobId)

  revalidatePath(`/jobs/${jobId}`)
  revalidatePath("/jobs")
  return ok()
}

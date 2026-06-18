"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { userContext } from "@/lib/guards"
import { ok, fail, type ActionResult } from "@/lib/actions"
import type { SupabaseClient } from "@supabase/supabase-js"
import type {
  Database,
  Profile,
  SitePhotoLabel,
  SignoffRole,
} from "@/lib/supabase/types"

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
// Technician Day Hub: prep, workflow events, photos, report, sign-off
// ---------------------------------------------------------------------------
type UserActionContext = {
  profile: Profile
  supabase: SupabaseClient<Database>
}

const today = () => new Date().toISOString().slice(0, 10)

async function ensureSiteReport(
  ctx: UserActionContext,
  input: {
    job_id: string
    work_date: string
    job_visit_id?: string | null
  }
): Promise<ActionResult<{ id: string }>> {
  const { data, error } = await ctx.supabase
    .from("job_site_reports")
    .upsert(
      {
        job_id: input.job_id,
        job_visit_id: input.job_visit_id || null,
        profile_id: ctx.profile.id,
        work_date: input.work_date,
        status: "draft",
      },
      { onConflict: "job_id,profile_id,work_date" }
    )
    .select("id")
    .single()
  if (error) return fail(error.message)
  return ok({ id: data.id })
}

const prepSchema = z.object({
  job_id: z.string().uuid(),
  work_date: z.string().min(1).default(today),
  job_visit_id: z.string().uuid().nullable().optional(),
  label: z.string().trim().min(1, "Checklist item required"),
  category: z.string().trim().min(1).default("general"),
  required: z.boolean().default(true),
  sort: z.number().int().default(0),
  completed: z.boolean(),
})

export async function togglePrepItemAction(
  input: z.infer<typeof prepSchema>
): Promise<ActionResult> {
  const parsed = prepSchema.safeParse(input)
  if (!parsed.success) return fail(parsed.error.issues[0].message)

  const guard = await userContext()
  if (!guard.ok) return guard.result
  const { supabase, profile } = guard.ctx as UserActionContext

  let prepItemId: string | null = null
  const { data: existing, error: findError } = await supabase
    .from("job_prep_items")
    .select("id")
    .eq("job_id", parsed.data.job_id)
    .eq("label", parsed.data.label)
    .maybeSingle()
  if (findError) return fail(findError.message)
  prepItemId = existing?.id ?? null

  if (!prepItemId) {
    const { data: created, error: createError } = await supabase
      .from("job_prep_items")
      .insert({
        job_id: parsed.data.job_id,
        label: parsed.data.label,
        category: parsed.data.category,
        required: parsed.data.required,
        sort: parsed.data.sort,
        created_by: profile.id,
      })
      .select("id")
      .single()
    if (createError) return fail(createError.message)
    prepItemId = created.id
  }

  const report = await ensureSiteReport({ supabase, profile }, parsed.data)
  if (!report.ok) return report

  if (parsed.data.completed) {
    const { error } = await supabase.from("job_prep_completions").upsert(
      {
        job_id: parsed.data.job_id,
        prep_item_id: prepItemId,
        site_report_id: report.data.id,
        profile_id: profile.id,
        work_date: parsed.data.work_date,
        completed_at: new Date().toISOString(),
      },
      { onConflict: "prep_item_id,profile_id,work_date" }
    )
    if (error) return fail(error.message)
  } else {
    const { error } = await supabase
      .from("job_prep_completions")
      .delete()
      .eq("prep_item_id", prepItemId)
      .eq("profile_id", profile.id)
      .eq("work_date", parsed.data.work_date)
    if (error) return fail(error.message)
  }

  revalidatePath("/my/jobs")
  revalidatePath(`/my/jobs/${parsed.data.job_id}`)
  revalidatePath(`/jobs/${parsed.data.job_id}`)
  return ok()
}

const workflowEventSchema = z.object({
  job_id: z.string().uuid(),
  work_date: z.string().min(1).default(today),
  event_type: z.enum([
    "travel_started",
    "arrived",
    "departed",
    "blocked",
    "completed",
  ]),
  note: z.string().trim().nullable().optional(),
  latitude: z.number().nullable().optional(),
  longitude: z.number().nullable().optional(),
})

export async function recordWorkflowEventAction(
  input: z.infer<typeof workflowEventSchema>
): Promise<ActionResult<{ id: string }>> {
  const parsed = workflowEventSchema.safeParse(input)
  if (!parsed.success) return fail(parsed.error.issues[0].message)

  const guard = await userContext()
  if (!guard.ok) return guard.result

  const { data, error } = await guard.ctx.supabase.rpc(
    "record_job_workflow_event",
    {
      p_job_id: parsed.data.job_id,
      p_event_type: parsed.data.event_type,
      p_work_date: parsed.data.work_date,
      p_note: parsed.data.note || null,
      p_latitude: parsed.data.latitude ?? null,
      p_longitude: parsed.data.longitude ?? null,
    }
  )
  if (error) return fail(error.message)

  revalidatePath("/my/jobs")
  revalidatePath(`/my/jobs/${parsed.data.job_id}`)
  revalidatePath("/jobs")
  revalidatePath(`/jobs/${parsed.data.job_id}`)
  return ok({ id: data })
}

const reportSchema = z.object({
  job_id: z.string().uuid(),
  work_date: z.string().min(1).default(today),
  job_visit_id: z.string().uuid().nullable().optional(),
  work_performed: z.string().trim().nullable().optional(),
  issues: z.string().trim().nullable().optional(),
  recommendations: z.string().trim().nullable().optional(),
  materials_summary: z.string().trim().nullable().optional(),
})

async function upsertSiteReport(
  ctx: UserActionContext,
  input: z.infer<typeof reportSchema>,
  submit: boolean
): Promise<ActionResult<{ id: string }>> {
  const now = new Date().toISOString()
  const { data, error } = await ctx.supabase
    .from("job_site_reports")
    .upsert(
      {
        job_id: input.job_id,
        job_visit_id: input.job_visit_id || null,
        profile_id: ctx.profile.id,
        work_date: input.work_date,
        work_performed: input.work_performed || null,
        issues: input.issues || null,
        recommendations: input.recommendations || null,
        materials_summary: input.materials_summary || null,
        status: submit ? "submitted" : "draft",
        submitted_at: submit ? now : null,
      },
      { onConflict: "job_id,profile_id,work_date" }
    )
    .select("id")
    .single()
  if (error) return fail(error.message)

  revalidatePath("/my/jobs")
  revalidatePath(`/my/jobs/${input.job_id}`)
  revalidatePath(`/jobs/${input.job_id}`)
  return ok({ id: data.id })
}

export async function saveSiteReportAction(
  input: z.infer<typeof reportSchema>
): Promise<ActionResult<{ id: string }>> {
  const parsed = reportSchema.safeParse(input)
  if (!parsed.success) return fail(parsed.error.issues[0].message)

  const guard = await userContext()
  if (!guard.ok) return guard.result
  return upsertSiteReport(guard.ctx as UserActionContext, parsed.data, false)
}

export async function submitSiteReportAction(
  input: z.infer<typeof reportSchema>
): Promise<ActionResult<{ id: string }>> {
  const parsed = reportSchema.safeParse(input)
  if (!parsed.success) return fail(parsed.error.issues[0].message)

  const guard = await userContext()
  if (!guard.ok) return guard.result
  return upsertSiteReport(guard.ctx as UserActionContext, parsed.data, true)
}

const photoSchema = z.object({
  job_id: z.string().uuid(),
  work_date: z.string().min(1).default(today),
  job_visit_id: z.string().uuid().nullable().optional(),
  site_report_id: z.string().uuid().nullable().optional(),
  storage_path: z.string().trim().min(1),
  thumbnail_path: z.string().trim().nullable().optional(),
  label: z.enum([
    "before",
    "after",
    "issue",
    "equipment",
    "panel",
    "material",
    "safety",
    "other",
  ]),
  caption: z.string().trim().nullable().optional(),
  content_type: z.string().trim().nullable().optional(),
  file_size: z.number().int().nonnegative().nullable().optional(),
  compressed_size: z.number().int().nonnegative().nullable().optional(),
  width: z.number().int().positive().nullable().optional(),
  height: z.number().int().positive().nullable().optional(),
})

export async function addSitePhotoAction(
  input: z.infer<typeof photoSchema>
): Promise<ActionResult<{ id: string; site_report_id: string }>> {
  const parsed = photoSchema.safeParse(input)
  if (!parsed.success) return fail(parsed.error.issues[0].message)

  const guard = await userContext()
  if (!guard.ok) return guard.result
  const { supabase, profile } = guard.ctx as UserActionContext
  if (!profile.tenant_id) return fail("Tenant profile required.")

  const pathPrefix = `${profile.tenant_id}/${parsed.data.job_id}/${profile.id}/`
  if (!parsed.data.storage_path.startsWith(pathPrefix)) {
    return fail("Photo path is outside this job.")
  }
  if (
    parsed.data.thumbnail_path &&
    !parsed.data.thumbnail_path.startsWith(pathPrefix)
  ) {
    return fail("Thumbnail path is outside this job.")
  }

  let report = parsed.data.site_report_id ?? null
  if (!report) {
    const ensured = await ensureSiteReport({ supabase, profile }, parsed.data)
    if (!ensured.ok) return ensured
    report = ensured.data.id
  }

  const { data, error } = await supabase
    .from("job_site_photos")
    .insert({
      job_id: parsed.data.job_id,
      profile_id: profile.id,
      site_report_id: report,
      storage_bucket: "site-photos",
      storage_path: parsed.data.storage_path,
      thumbnail_path: parsed.data.thumbnail_path || null,
      label: parsed.data.label as SitePhotoLabel,
      caption: parsed.data.caption || null,
      content_type: parsed.data.content_type || null,
      file_size: parsed.data.file_size ?? null,
      compressed_size: parsed.data.compressed_size ?? null,
      width: parsed.data.width ?? null,
      height: parsed.data.height ?? null,
    })
    .select("id")
    .single()
  if (error) return fail(error.message)

  revalidatePath("/my/jobs")
  revalidatePath(`/my/jobs/${parsed.data.job_id}`)
  revalidatePath(`/jobs/${parsed.data.job_id}`)
  return ok({ id: data.id, site_report_id: report })
}

export async function deleteSitePhotoAction(
  id: string
): Promise<ActionResult> {
  const guard = await userContext()
  if (!guard.ok) return guard.result
  const { supabase } = guard.ctx

  const { data: photo, error: findError } = await supabase
    .from("job_site_photos")
    .select("job_id, storage_path, thumbnail_path")
    .eq("id", id)
    .maybeSingle()
  if (findError) return fail(findError.message)
  if (!photo) return fail("Photo not found.")

  const { error } = await supabase.from("job_site_photos").delete().eq("id", id)
  if (error) return fail(error.message)

  const paths = [photo.storage_path, photo.thumbnail_path].filter(Boolean) as string[]
  if (paths.length) {
    await supabase.storage.from("site-photos").remove(paths)
  }

  revalidatePath(`/my/jobs/${photo.job_id}`)
  revalidatePath(`/jobs/${photo.job_id}`)
  return ok()
}

const signoffSchema = z.object({
  job_id: z.string().uuid(),
  work_date: z.string().min(1).default(today),
  job_visit_id: z.string().uuid().nullable().optional(),
  site_report_id: z.string().uuid().nullable().optional(),
  signer_name: z.string().trim().nullable().optional(),
  signer_role: z.enum(["customer", "supervisor", "unavailable"]),
  signature_text: z.string().trim().nullable().optional(),
  comments: z.string().trim().nullable().optional(),
})

export async function addSignoffAction(
  input: z.infer<typeof signoffSchema>
): Promise<ActionResult<{ id: string; site_report_id: string }>> {
  const parsed = signoffSchema.safeParse(input)
  if (!parsed.success) return fail(parsed.error.issues[0].message)
  if (parsed.data.signer_role !== "unavailable" && !parsed.data.signer_name) {
    return fail("Signer name is required.")
  }
  if (parsed.data.signer_role === "unavailable" && !parsed.data.comments) {
    return fail("Add a reason when sign-off is unavailable.")
  }

  const guard = await userContext()
  if (!guard.ok) return guard.result
  const { supabase, profile } = guard.ctx as UserActionContext

  let report = parsed.data.site_report_id ?? null
  if (!report) {
    const ensured = await ensureSiteReport({ supabase, profile }, parsed.data)
    if (!ensured.ok) return ensured
    report = ensured.data.id
  }

  const { data, error } = await supabase
    .from("job_signoffs")
    .insert({
      job_id: parsed.data.job_id,
      profile_id: profile.id,
      site_report_id: report,
      signer_name: parsed.data.signer_name || null,
      signer_role: parsed.data.signer_role as SignoffRole,
      signature_text: parsed.data.signature_text || parsed.data.signer_name || null,
      comments: parsed.data.comments || null,
    })
    .select("id")
    .single()
  if (error) return fail(error.message)

  revalidatePath("/my/jobs")
  revalidatePath(`/my/jobs/${parsed.data.job_id}`)
  revalidatePath(`/jobs/${parsed.data.job_id}`)
  return ok({ id: data.id, site_report_id: report })
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

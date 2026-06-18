"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { ok, fail, type ActionResult } from "@/lib/actions"
import { staffContext } from "@/lib/guards"

const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a valid date")
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`)
    return (
      !Number.isNaN(date.getTime()) &&
      date.toISOString().slice(0, 10) === value
    )
  }, "Pick a valid date")

const moveSchema = z.object({
  kind: z.enum(["job", "visit"]),
  id: z.string().uuid(),
  date: dateSchema,
})

export type ScheduleMoveInput = z.infer<typeof moveSchema>

export async function moveScheduleItemAction(
  input: ScheduleMoveInput
): Promise<ActionResult> {
  const parsed = moveSchema.safeParse(input)
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Invalid schedule item")
  }

  const guard = await staffContext()
  if (!guard.ok) return guard.result

  const { kind, id, date } = parsed.data

  if (kind === "job") {
    const { data, error } = await guard.ctx.supabase
      .from("jobs")
      .update({ scheduled_start: date })
      .eq("id", id)
      .select("id")
      .maybeSingle()

    if (error) return fail(error.message)
    if (!data) return fail("Job not found")

    revalidatePath("/schedule")
    revalidatePath("/jobs")
    revalidatePath(`/jobs/${data.id}`)
    return ok()
  }

  const { data, error } = await guard.ctx.supabase
    .from("job_visits")
    .update({ visit_date: date })
    .eq("id", id)
    .select("job_id")
    .maybeSingle()

  if (error) return fail(error.message)
  if (!data) return fail("Visit not found")

  revalidatePath("/schedule")
  revalidatePath(`/jobs/${data.job_id}`)
  return ok()
}

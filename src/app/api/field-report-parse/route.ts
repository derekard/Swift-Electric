import Anthropic from "@anthropic-ai/sdk"
import { z } from "zod"

import { isTenantProfile } from "@/lib/auth-identity"
import { getCurrentProfile } from "@/lib/auth"
import { createClient } from "@/lib/supabase/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const requestSchema = z.object({
  job_id: z.string().uuid(),
  site_report_id: z.string().uuid().nullable().optional(),
  transcript: z.string().trim().min(1),
})

const fieldReportSchema = z.object({
  work_performed: z.string(),
  issues: z.string(),
  materials_summary: z.string(),
  recommendations: z.string(),
})

const TOOL_SCHEMA = {
  type: "object" as const,
  properties: {
    work_performed: {
      type: "string",
      description: "Concise summary of completed electrical work.",
    },
    issues: {
      type: "string",
      description: "Problems, blockers, access issues, safety concerns, or empty string.",
    },
    materials_summary: {
      type: "string",
      description: "Parts/materials used or empty string.",
    },
    recommendations: {
      type: "string",
      description: "Follow-up work, next steps, or empty string.",
    },
  },
  required: [
    "work_performed",
    "issues",
    "materials_summary",
    "recommendations",
  ],
}

export async function POST(request: Request) {
  const profile = await getCurrentProfile()
  if (!profile || !profile.active || !isTenantProfile(profile)) {
    return Response.json({ error: "Not authorized" }, { status: 403 })
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json(
      { error: "Voice report parsing isn't configured (no ANTHROPIC_API_KEY)." },
      { status: 501 }
    )
  }

  const body = await request.json().catch(() => null)
  const parsed = requestSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: "Bad request" }, { status: 400 })
  }

  const supabase = await createClient()
  const { data: job, error: jobError } = await supabase
    .from("jobs")
    .select("id, tenant_id")
    .eq("id", parsed.data.job_id)
    .maybeSingle()
  if (jobError) {
    return Response.json({ error: jobError.message }, { status: 400 })
  }
  if (!job || job.tenant_id !== profile.tenant_id) {
    return Response.json({ error: "Job not found" }, { status: 404 })
  }

  if (parsed.data.site_report_id) {
    const { data: report, error: reportError } = await supabase
      .from("job_site_reports")
      .select("id, job_id, tenant_id")
      .eq("id", parsed.data.site_report_id)
      .maybeSingle()
    if (reportError) {
      return Response.json({ error: reportError.message }, { status: 400 })
    }
    if (
      !report ||
      report.job_id !== job.id ||
      report.tenant_id !== job.tenant_id
    ) {
      return Response.json({ error: "Site report not found" }, { status: 404 })
    }
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  try {
    const msg = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 700,
      tool_choice: { type: "tool", name: "build_field_report" },
      tools: [
        {
          name: "build_field_report",
          description:
            "Convert an electrician's spoken field notes into a concise site report.",
          input_schema: TOOL_SCHEMA,
        },
      ],
      messages: [
        {
          role: "user",
          content:
            `Turn these spoken field notes into a clean site report.\n\n` +
            `Rules:\n` +
            `- Keep wording practical and specific.\n` +
            `- Do not invent details that are not spoken.\n` +
            `- Put unresolved work in recommendations, not work performed.\n` +
            `- If a section was not mentioned, return an empty string for it.\n\n` +
            `Transcript:\n"${parsed.data.transcript}"`,
        },
      ],
    })

    const toolUse = msg.content.find((c) => c.type === "tool_use")
    if (!toolUse || toolUse.type !== "tool_use") {
      return Response.json({
        work_performed: parsed.data.transcript,
        issues: "",
        materials_summary: "",
        recommendations: "",
      })
    }
    const toolResult = fieldReportSchema.safeParse(toolUse.input)
    if (!toolResult.success) {
      return Response.json({
        work_performed: parsed.data.transcript,
        issues: "",
        materials_summary: "",
        recommendations: "",
      })
    }
    return Response.json(toolResult.data)
  } catch (err) {
    const message = err instanceof Error ? err.message : "Voice parsing failed"
    return Response.json({ error: message }, { status: 502 })
  }
}

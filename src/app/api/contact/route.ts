import { z } from "zod"

import { sendContactRequestEmail } from "@/lib/email"
import { createServiceClient } from "@/lib/supabase/server"
import { getSiteTenant } from "@/lib/tenant"

export const runtime = "nodejs"

const contactSchema = z.object({
  name: z.string().trim().min(1).max(120),
  phone: z.string().trim().min(1).max(40),
  email: z.string().trim().email().max(180).or(z.literal("")).optional(),
  service: z.string().trim().max(120).optional(),
  message: z.string().trim().max(3000).optional(),
  botcheck: z.string().trim().optional(),
})

const emailSchema = z.string().trim().email()
const WINDOW_MS = 10 * 60 * 1000
const MAX_SUBMISSIONS = 5
const buckets = new Map<string, { count: number; resetAt: number }>()

function json(
  body: { success: boolean; error?: string },
  init?: ResponseInit
) {
  return Response.json(body, init)
}

function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")
  return (
    forwarded?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  )
}

function isRateLimited(key: string): boolean {
  const now = Date.now()
  const current = buckets.get(key)
  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS })
    return false
  }

  current.count += 1
  return current.count > MAX_SUBMISSIONS
}

function hasAllowedOrigin(request: Request): boolean {
  const origin = request.headers.get("origin")
  if (!origin) return true

  try {
    return new URL(origin).host === new URL(request.url).host
  } catch {
    return false
  }
}

async function resolveRecipient(): Promise<{
  email: string | null
  companyName: string
}> {
  const tenant = await getSiteTenant().catch(() => null)
  if (tenant) {
    try {
      const supabase = createServiceClient()
      const { data } = await supabase
        .from("tenant_settings")
        .select("email")
        .eq("tenant_id", tenant.id)
        .maybeSingle()

      const parsed = emailSchema.safeParse(data?.email ?? "")
      if (parsed.success) {
        return { email: parsed.data, companyName: tenant.companyName }
      }
    } catch {
      // Fall through to CONTACT_TO_EMAIL if tenant lookup is unavailable.
    }
  }

  const fallback = emailSchema.safeParse(process.env.CONTACT_TO_EMAIL ?? "")
  return {
    email: fallback.success ? fallback.data : null,
    companyName: tenant?.companyName ?? "Swift Electric",
  }
}

export async function POST(request: Request) {
  if (!hasAllowedOrigin(request)) {
    return json({ success: false, error: "Bad request." }, { status: 403 })
  }

  const ip = clientIp(request)
  if (isRateLimited(ip)) {
    return json(
      { success: false, error: "Too many requests. Please try again soon." },
      { status: 429 }
    )
  }

  const body = await request.json().catch(() => null)
  const parsed = contactSchema.safeParse(body)
  if (!parsed.success) {
    return json(
      { success: false, error: "Please check the required fields." },
      { status: 400 }
    )
  }

  const data = parsed.data
  if (data.botcheck) {
    return json({ success: true })
  }

  const recipient = await resolveRecipient()
  if (!recipient.email) {
    return json(
      { success: false, error: "Contact email is not configured." },
      { status: 500 }
    )
  }

  const sent = await sendContactRequestEmail({
    to: recipient.email,
    companyName: recipient.companyName,
    name: data.name,
    phone: data.phone,
    email: data.email || null,
    service: data.service || null,
    message: data.message || null,
    sourceUrl: request.headers.get("referer"),
  })

  if (!sent.ok) {
    console.error("[contact] failed to send request:", sent.error)
    return json(
      { success: false, error: "Could not send your request." },
      { status: 500 }
    )
  }

  return json({ success: true })
}

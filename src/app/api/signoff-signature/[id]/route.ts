import { NextResponse } from "next/server"

import { isPlatformProfile, isTenantProfile } from "@/lib/auth-identity"
import { getCurrentProfile } from "@/lib/auth"
import { createClient } from "@/lib/supabase/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const profile = await getCurrentProfile()
  if (!profile || !profile.active) {
    return new Response("Unauthorized", { status: 401 })
  }

  const { id } = await ctx.params
  const supabase = await createClient()
  const { data: signoff, error } = await supabase
    .from("job_signoffs")
    .select("tenant_id, signature_image_path")
    .eq("id", id)
    .maybeSingle()
  if (error) return new Response(error.message, { status: 400 })
  if (!signoff?.signature_image_path) {
    return new Response("Not found", { status: 404 })
  }

  const canRead =
    isPlatformProfile(profile) ||
    (isTenantProfile(profile) && signoff.tenant_id === profile.tenant_id)
  if (!canRead) return new Response("Forbidden", { status: 403 })

  const { data, error: signError } = await supabase.storage
    .from("site-photos")
    .createSignedUrl(signoff.signature_image_path, 120)
  if (signError || !data) return new Response("Not found", { status: 404 })

  return NextResponse.redirect(data.signedUrl)
}

import { NextResponse } from "next/server"

import { getCurrentProfile } from "@/lib/auth"
import { createClient } from "@/lib/supabase/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Returns a short-lived signed URL for a receipt image and redirects to it.
 * Receipts live at `<tenant_id>/<job_id>/<file>` in the private `receipts`
 * bucket; we only sign paths inside the caller's own tenant.
 */
export async function GET(request: Request) {
  const profile = await getCurrentProfile()
  if (!profile || !profile.active) {
    return new Response("Unauthorized", { status: 401 })
  }

  const path = new URL(request.url).searchParams.get("path")
  if (!path) return new Response("Missing path", { status: 400 })

  const tenantPrefix = path.split("/")[0]
  if (!profile.is_platform_admin && tenantPrefix !== profile.tenant_id) {
    return new Response("Forbidden", { status: 403 })
  }

  const supabase = await createClient()
  const { data, error } = await supabase.storage
    .from("receipts")
    .createSignedUrl(path, 120)
  if (error || !data) return new Response("Not found", { status: 404 })

  return NextResponse.redirect(data.signedUrl)
}

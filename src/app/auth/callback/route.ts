import { NextResponse } from "next/server"

import { createClient } from "@/lib/supabase/server"

/**
 * OAuth callback — exchanges the code for a session, then sends the user on.
 * Role-based routing + the no-access gate happen at the destination (root page).
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get("code")
  const redirectTo = searchParams.get("redirectTo") ?? "/dashboard"

  // Behind a reverse proxy (Render, Vercel, …) `request.url` carries the
  // INTERNAL host/port the app binds to (e.g. …onrender.com:10000), so
  // redirecting to its origin sends the browser to a port that isn't exposed
  // → ERR_CONNECTION_REFUSED. Prefer the public host the proxy forwards, and
  // honor the original scheme. Falls back to the request origin for local dev.
  const forwardedHost = request.headers.get("x-forwarded-host")
  const forwardedProto = request.headers.get("x-forwarded-proto") ?? "https"
  const isLocal = process.env.NODE_ENV === "development"
  const base =
    !isLocal && forwardedHost ? `${forwardedProto}://${forwardedHost}` : origin

  // This response mints a brand-new session (Set-Cookie). It must never be
  // stored by a shared cache, or the next visitor could be handed this user's
  // freshly-minted session — the same cross-user leak class as the login fix.
  const redirect = (to: string) => {
    const res = NextResponse.redirect(`${base}${to}`)
    res.headers.set("Cache-Control", "private, no-store, must-revalidate")
    res.headers.append("Vary", "Cookie")
    return res
  }

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return redirect(redirectTo)
    }
  }

  return redirect("/login?error=auth")
}

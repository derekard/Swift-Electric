import { NextResponse } from "next/server"

import {
  applySessionNoStoreHeaders,
  oauthRedirectOrigin,
  safeRedirectPath,
} from "@/lib/auth-identity"
import { ensureProfileForAuthUser } from "@/lib/auth-provisioning"
import { createClient } from "@/lib/supabase/server"

/**
 * OAuth callback — exchanges the code for a session, then sends the user on.
 * Role-based routing + the no-access gate happen at the destination (root page).
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get("code")

  // Only ever redirect to a same-origin path. An attacker-supplied
  // `redirectTo` like `@evil.com` or `//evil.com` would otherwise become an
  // absolute off-site URL (post-auth open redirect / phishing). Require a
  // single leading slash that isn't the start of a host (`//`, `/\`).
  const redirectTo = safeRedirectPath(searchParams.get("redirectTo"))

  // Production redirects must use the configured public origin instead of
  // proxy-forwarded hosts. Local development can fall back to the request URL.
  const base = oauthRedirectOrigin({
    requestOrigin: origin,
    siteUrl: process.env.NEXT_PUBLIC_SITE_URL,
    nodeEnv: process.env.NODE_ENV,
  })
  if (!base) {
    const res = Response.json(
      { error: "NEXT_PUBLIC_SITE_URL must be a public http(s) origin" },
      { status: 500 }
    )
    applySessionNoStoreHeaders(res.headers)
    return res
  }

  // This response mints a brand-new session (Set-Cookie). It must never be
  // stored by a shared cache, or the next visitor could be handed this user's
  // freshly-minted session — the same cross-user leak class as the login fix.
  const redirect = (to: string) => {
    const res = NextResponse.redirect(new URL(to, base))
    applySessionNoStoreHeaders(res.headers)
    return res
  }

  if (code) {
    const supabase = await createClient()
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      try {
        if (data.user) await ensureProfileForAuthUser(data.user)
      } catch (err) {
        console.error("Profile provisioning failed after OAuth callback", err)
        return redirect("/no-access")
      }
      return redirect(redirectTo)
    }
  }

  return redirect("/login?error=auth")
}

import { NextResponse, type NextRequest } from "next/server"
import { createServerClient } from "@supabase/ssr"

import type { Database } from "./types"

/** Routes that an unauthenticated user is allowed to reach. */
const PUBLIC_PATHS = [
  "/login",
  "/auth",
  "/api/auth",
  "/api/cron",
  "/no-access",
  // public marketing site
  "/services",
  "/about",
  "/contact",
  "/site",
  // public client quote accept link
  "/q",
]

function isPublic(pathname: string) {
  if (pathname === "/") return true // public marketing landing
  return PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  )
}

/**
 * Public, anonymous marketing pages. These are served with a cacheable
 * `Cache-Control: public`, so they must NEVER carry a `Set-Cookie`: if a
 * logged-in user loaded one and the response (with their refreshed Supabase
 * auth cookie) were stored by any shared cache, the next visitor would be
 * handed that session. We skip session refresh entirely for them.
 */
const MARKETING_PATHS = new Set(["/", "/services", "/about", "/contact"])

/** Mark a response as never-cacheable (carries, or is gated by, a session). */
function noStore(response: NextResponse): NextResponse {
  response.headers.set("Cache-Control", "private, no-store, must-revalidate")
  response.headers.append("Vary", "Cookie")
  return response
}

/**
 * Refreshes the Supabase session on every request and gates protected routes.
 * Must run in middleware so cookies stay fresh for Server Components.
 */
export async function updateSession(request: NextRequest) {
  // Never touch the session on cacheable marketing pages — keeps a logged-in
  // user's auth cookie off a publicly-cached response (cross-user leak).
  if (MARKETING_PATHS.has(request.nextUrl.pathname)) {
    return NextResponse.next({ request })
  }

  let response = NextResponse.next({ request })

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // IMPORTANT: do not run code between createServerClient and getUser().
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl

  if (!user && !isPublic(pathname)) {
    const url = request.nextUrl.clone()
    url.pathname = "/login"
    url.searchParams.set("redirectTo", pathname)
    return NextResponse.redirect(url)
  }

  if (user && pathname === "/login") {
    const url = request.nextUrl.clone()
    url.pathname = "/dashboard"
    url.search = ""
    return noStore(NextResponse.redirect(url))
  }

  // Any response for a signed-in user must not be stored by a shared cache.
  // `/auth/*` is included unconditionally: it mints the session cookie before
  // getUser() can observe a user, so it would otherwise slip through.
  const sensitive = user || pathname.startsWith("/auth")
  return sensitive ? noStore(response) : response
}

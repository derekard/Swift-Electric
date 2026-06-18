import { type NextRequest } from "next/server"

import { updateSession } from "@/lib/supabase/middleware"

export async function proxy(request: NextRequest) {
  return updateSession(request)
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static, _next/image (build assets)
     * - metadata files
     * - favicon, icons, manifest, and image files
     */
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|manifest.webmanifest|sw.js|icons/|site/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
}

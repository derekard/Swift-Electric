import { createBrowserClient } from "@supabase/ssr"

import type { Database } from "./types"

/**
 * Supabase client for use in Client Components (browser).
 * Reads the public env vars; safe to ship to the browser.
 */
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

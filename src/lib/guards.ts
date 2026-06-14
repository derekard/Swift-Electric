import { getCurrentProfile } from "@/lib/auth"
import { createClient } from "@/lib/supabase/server"
import type { Profile } from "@/lib/supabase/types"
import { fail, type ActionResult } from "@/lib/actions"

type OwnerContext = {
  profile: Profile
  supabase: Awaited<ReturnType<typeof createClient>>
}

/**
 * For server actions: returns the owner's profile + a Supabase client, or an
 * ActionResult error if the caller isn't an active owner. RLS is the real gate;
 * this gives a friendly message instead of a database error.
 */
export async function ownerContext(): Promise<
  { ok: true; ctx: OwnerContext } | { ok: false; result: ActionResult<never> }
> {
  const profile = await getCurrentProfile()
  if (!profile || !profile.active || profile.role !== "owner") {
    return { ok: false, result: fail("You don't have permission to do that.") }
  }
  const supabase = await createClient()
  return { ok: true, ctx: { profile, supabase } }
}

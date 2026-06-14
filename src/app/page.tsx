import { redirect } from "next/navigation"

import { requireProfile, homePathForRole } from "@/lib/auth"

export default async function Home() {
  const profile = await requireProfile()
  redirect(homePathForRole(profile.role))
}

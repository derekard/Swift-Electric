"use client"

import { useState } from "react"
import { LogOut } from "lucide-react"

import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"

export function SignOutButton({
  variant = "default",
  className,
  withIcon = false,
}: {
  variant?: "default" | "outline" | "ghost"
  className?: string
  withIcon?: boolean
}) {
  const [loading, setLoading] = useState(false)

  async function signOut() {
    setLoading(true)
    const supabase = createClient()
    await supabase.auth.signOut()
    window.location.href = "/login"
  }

  return (
    <Button
      onClick={signOut}
      disabled={loading}
      variant={variant}
      className={className}
    >
      {withIcon && <LogOut />}
      {loading ? "Signing out…" : "Sign out"}
    </Button>
  )
}

"use client"

import { useState } from "react"
import { LogOut } from "lucide-react"

import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"

export function SignOutButton({
  variant = "default",
  className,
  withIcon = false,
  iconOnly = false,
}: {
  variant?: "default" | "outline" | "ghost"
  className?: string
  withIcon?: boolean
  /** Render just the logout icon — for tight spots like the sidebar footer. */
  iconOnly?: boolean
}) {
  const [loading, setLoading] = useState(false)

  async function signOut() {
    setLoading(true)
    const supabase = createClient()
    await supabase.auth.signOut()
    window.location.href = "/login"
  }

  if (iconOnly) {
    return (
      <Button
        onClick={signOut}
        disabled={loading}
        variant={variant}
        size="icon-sm"
        aria-label="Sign out"
        title="Sign out"
        className={className}
      >
        <LogOut />
      </Button>
    )
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

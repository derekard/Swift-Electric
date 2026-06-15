"use client"

import { useEffect, useRef } from "react"
import { toast } from "sonner"

import { createClient } from "@/lib/supabase/client"

// Sign a user out after a stretch of no interaction, so an unattended (or
// shared) device doesn't stay logged into financial data. Activity is shared
// across tabs via localStorage; a tab that was frozen/backgrounded past the
// limit is caught on resume. A fresh page load counts as activity, so logging
// back in never bounces you straight out.
const IDLE_LIMIT_MS = 30 * 60 * 1000 // 30 minutes
const WARN_BEFORE_MS = 60 * 1000 // warn 1 minute before
const CHECK_EVERY_MS = 15 * 1000
const STORAGE_KEY = "se:last-activity"

export function IdleLogout({ limitMs = IDLE_LIMIT_MS }: { limitMs?: number }) {
  const warned = useRef(false)

  useEffect(() => {
    const readLast = () => {
      const v = Number(localStorage.getItem(STORAGE_KEY))
      return Number.isFinite(v) && v > 0 ? v : 0
    }
    const markActive = () => {
      try {
        localStorage.setItem(STORAGE_KEY, String(Date.now()))
      } catch {
        /* private mode / storage disabled — fall back to in-tab timing */
      }
      warned.current = false
    }

    // A fresh mount (login, reload, navigation) counts as activity.
    markActive()

    let lastThrottle = 0
    const onActivity = () => {
      const now = Date.now()
      if (now - lastThrottle < 5000) return
      lastThrottle = now
      markActive()
    }

    const events = [
      "mousemove",
      "mousedown",
      "keydown",
      "touchstart",
      "scroll",
      "click",
    ]
    events.forEach((e) =>
      window.addEventListener(e, onActivity, { passive: true })
    )

    let signingOut = false
    const check = async () => {
      const last = readLast() || Date.now()
      const idle = Date.now() - last

      if (idle >= limitMs && !signingOut) {
        signingOut = true
        cleanup()
        await createClient().auth.signOut()
        window.location.href = "/login?reason=timeout"
        return
      }
      if (idle >= limitMs - WARN_BEFORE_MS && !warned.current) {
        warned.current = true
        toast.warning("You'll be signed out shortly due to inactivity.", {
          duration: WARN_BEFORE_MS,
        })
      }
    }

    const interval = setInterval(check, CHECK_EVERY_MS)
    const onWake = () => {
      if (document.visibilityState === "visible") void check()
    }
    document.addEventListener("visibilitychange", onWake)
    window.addEventListener("focus", onWake)

    function cleanup() {
      clearInterval(interval)
      events.forEach((e) => window.removeEventListener(e, onActivity))
      document.removeEventListener("visibilitychange", onWake)
      window.removeEventListener("focus", onWake)
    }
    return cleanup
  }, [limitMs])

  return null
}

"use client"

import { useEffect } from "react"

/** Registers the PWA service worker (production only). */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (
      process.env.NODE_ENV === "production" &&
      "serviceWorker" in navigator
    ) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // registration failures are non-fatal
      })
    }
  }, [])
  return null
}

import type { CSSProperties } from "react"

import { getSiteTenant } from "@/lib/tenant"
import { LoginForm } from "@/components/login-form"

export default async function LoginPage() {
  const site = await getSiteTenant()
  const companyName = site?.companyName ?? "Swift Electric"
  const brandStyle = site?.brandColor
    ? ({ "--primary": site.brandColor } as CSSProperties)
    : undefined

  return (
    <div style={brandStyle}>
      <LoginForm companyName={companyName} logoUrl={site?.logoUrl ?? null} />
    </div>
  )
}

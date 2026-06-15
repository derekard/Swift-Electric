import { Building2 } from "lucide-react"

import { requirePlatformAdmin } from "@/lib/auth"
import { SignOutButton } from "@/components/sign-out-button"

// Per-user, session-bound pages: always render fresh and never cache.
export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"

export default async function PlatformLayout({
  children,
}: {
  children: React.ReactNode
}) {
  await requirePlatformAdmin()

  return (
    <div className="flex min-h-svh flex-col">
      <header className="flex items-center justify-between border-b px-5 py-3">
        <div className="flex items-center gap-2">
          <div className="flex size-7 items-center justify-center rounded-lg bg-foreground text-background">
            <Building2 className="size-4" />
          </div>
          <span className="font-semibold tracking-tight">Platform admin</span>
        </div>
        <SignOutButton variant="ghost" />
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 md:px-8">
        {children}
      </main>
    </div>
  )
}

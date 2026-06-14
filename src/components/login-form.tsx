"use client"

import { Suspense, useState } from "react"
import { useSearchParams } from "next/navigation"
import { Zap } from "lucide-react"

import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1Z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.99.66-2.26 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84Z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.3 9.14 5.38 12 5.38Z"
      />
    </svg>
  )
}

function LoginInner({
  companyName,
  logoUrl,
}: {
  companyName: string
  logoUrl: string | null
}) {
  const searchParams = useSearchParams()
  const [loading, setLoading] = useState(false)
  const authError = searchParams.get("error")

  async function signInWithGoogle() {
    setLoading(true)
    const supabase = createClient()
    const redirectTo = searchParams.get("redirectTo") ?? "/"
    const callback = new URL("/auth/callback", window.location.origin)
    callback.searchParams.set("redirectTo", redirectTo)

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: callback.toString() },
    })
    if (error) setLoading(false)
  }

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-8 bg-muted/30 p-6">
      <div className="flex flex-col items-center gap-3 text-center">
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt={companyName} className="h-14 w-auto" />
        ) : (
          <div className="flex size-14 items-center justify-center rounded-2xl bg-primary text-white shadow-sm">
            <Zap className="size-7" />
          </div>
        )}
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{companyName}</h1>
          <p className="text-sm text-muted-foreground">Quoting &amp; job management</p>
        </div>
      </div>

      <Card className="w-full max-w-sm">
        <CardContent className="flex flex-col gap-4 pt-6">
          <p className="text-center text-sm text-muted-foreground">
            Sign in with your invited Google account to continue.
          </p>

          {authError && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-center text-sm text-destructive">
              Sign-in failed. Please try again.
            </p>
          )}

          <Button
            onClick={signInWithGoogle}
            disabled={loading}
            variant="outline"
            className="w-full gap-2"
            size="lg"
          >
            <GoogleIcon />
            {loading ? "Redirecting…" : "Continue with Google"}
          </Button>
        </CardContent>
      </Card>

      <p className="max-w-xs text-center text-xs text-muted-foreground">
        Access is invite-only. If you can&apos;t get in, ask your administrator to
        add your email.
      </p>
    </div>
  )
}

export function LoginForm(props: { companyName: string; logoUrl: string | null }) {
  return (
    <Suspense>
      <LoginInner {...props} />
    </Suspense>
  )
}

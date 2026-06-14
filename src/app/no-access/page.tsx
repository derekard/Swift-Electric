import Link from "next/link"
import { ShieldAlert } from "lucide-react"

import { createClient } from "@/lib/supabase/server"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { SignOutButton } from "@/components/sign-out-button"

export default async function NoAccessPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 bg-muted/30 p-6">
      <Card className="w-full max-w-md">
        <CardContent className="flex flex-col items-center gap-4 pt-6 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-amber-100 text-amber-700">
            <ShieldAlert className="size-6" />
          </div>
          <div>
            <h1 className="text-lg font-semibold">No access yet</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {user?.email ? (
                <>
                  <span className="font-medium">{user.email}</span> isn&apos;t on
                  the invite list.
                </>
              ) : (
                "Your account isn't on the invite list."
              )}{" "}
              Ask the owner to add you, then sign in again.
            </p>
          </div>
          <div className="flex gap-2">
            <SignOutButton />
            <Button render={<Link href="/login" />} variant="outline">
              Back to sign in
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

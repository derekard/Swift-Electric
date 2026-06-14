"use client"

import { useState } from "react"
import { CheckCircle2, Loader2 } from "lucide-react"

import { acceptQuoteTokenAction } from "@/app/q/[token]/actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export function QuoteAcceptForm({ token }: { token: string }) {
  const [name, setName] = useState("")
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function accept() {
    setBusy(true)
    setError(null)
    const res = await acceptQuoteTokenAction(token, name)
    setBusy(false)
    if (!res.ok) {
      setError(res.error ?? "Something went wrong.")
      return
    }
    setDone(true)
  }

  if (done) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-green-300 bg-green-50 p-4 text-green-800">
        <CheckCircle2 className="size-5 shrink-0" />
        <p className="text-sm">
          Thank you, {name.trim()}! Your acceptance is recorded — we&apos;ll be in
          touch to schedule the work.
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-xl border bg-white p-5">
      <p className="text-sm font-medium text-zinc-900">Accept this estimate</p>
      <p className="mt-1 text-sm text-zinc-500">
        Type your full name to approve the work above. This acts as your
        signature.
      </p>
      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <Label className="text-xs text-zinc-600">Your full name</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Jane Doe"
            className="mt-1"
          />
        </div>
        <Button onClick={accept} disabled={busy || !name.trim()} size="lg">
          {busy ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
          {busy ? "Accepting…" : "Accept estimate"}
        </Button>
      </div>
      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
    </div>
  )
}

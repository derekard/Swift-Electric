"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Send } from "lucide-react"
import { toast } from "sonner"

import { submitEntriesAction } from "@/app/(app)/my/actions"
import { Button } from "@/components/ui/button"

export function SubmitDraftsButton({ count }: { count: number }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  async function submit() {
    setBusy(true)
    const res = await submitEntriesAction()
    setBusy(false)
    if (!res.ok) return toast.error(res.error)
    toast.success("Submitted for approval")
    router.refresh()
  }

  return (
    <Button onClick={submit} disabled={busy || count === 0}>
      <Send /> {busy ? "Submitting…" : `Submit ${count} draft${count === 1 ? "" : "s"}`}
    </Button>
  )
}

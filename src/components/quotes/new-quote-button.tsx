"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Plus } from "lucide-react"
import { toast } from "sonner"

import { createQuoteAction } from "@/app/(app)/quotes/actions"
import { Button } from "@/components/ui/button"

export function NewQuoteButton({
  variant = "default",
}: {
  variant?: "default" | "outline"
}) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  async function create() {
    setLoading(true)
    const res = await createQuoteAction({})
    if (!res.ok) {
      setLoading(false)
      toast.error(res.error)
      return
    }
    router.push(`/quotes/${res.data.id}/edit`)
  }

  return (
    <Button onClick={create} disabled={loading} variant={variant}>
      <Plus /> {loading ? "Creating…" : "New quote"}
    </Button>
  )
}

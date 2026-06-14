"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Home, Save } from "lucide-react"
import { toast } from "sonner"

import { setHomeAddressAction } from "@/app/(app)/my/actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"

export function HomeAddressCard({ current }: { current: string | null }) {
  const router = useRouter()
  const [address, setAddress] = useState(current ?? "")
  const [saving, setSaving] = useState(false)

  async function save() {
    setSaving(true)
    const res = await setHomeAddressAction(address)
    setSaving(false)
    if (!res.ok) return toast.error(res.error)
    toast.success("Home address saved")
    router.refresh()
  }

  return (
    <Card className="mb-6">
      <CardContent className="flex flex-wrap items-end gap-2 py-4">
        <div className="grid flex-1 gap-1.5">
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Home className="size-3.5" /> Home address (for mileage)
          </label>
          <Input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Street, City, Province"
            className="min-w-56"
          />
        </div>
        <Button onClick={save} disabled={saving} variant="outline">
          <Save /> {saving ? "Saving…" : "Save"}
        </Button>
      </CardContent>
    </Card>
  )
}

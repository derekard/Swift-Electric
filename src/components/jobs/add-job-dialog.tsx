"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Plus } from "lucide-react"
import { toast } from "sonner"

import { createJobAction } from "@/app/(app)/jobs/actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

type ClientOption = { id: string; name: string }

export function AddJobDialog({
  clients,
  defaultDate,
  variant = "default",
}: {
  clients: ClientOption[]
  defaultDate?: string
  variant?: "default" | "outline"
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [title, setTitle] = useState("")
  const [clientId, setClientId] = useState("")
  const [address, setAddress] = useState("")
  const [date, setDate] = useState(defaultDate ?? "")

  function reset() {
    setTitle("")
    setClientId("")
    setAddress("")
    setDate(defaultDate ?? "")
  }

  async function create() {
    if (!title.trim()) return toast.error("Give the job a title.")
    setBusy(true)
    const res = await createJobAction({
      title: title.trim(),
      client_id: clientId || null,
      site_address: address.trim() || null,
      scheduled_start: date || null,
    })
    if (!res.ok) {
      setBusy(false)
      return toast.error(res.error)
    }
    router.push(`/jobs/${res.data.id}`)
  }

  return (
    <>
      <Button
        variant={variant}
        onClick={() => {
          reset()
          setOpen(true)
        }}
      >
        <Plus /> Add job
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add job</DialogTitle>
          </DialogHeader>

          <div className="grid gap-3">
            <div className="grid gap-2">
              <Label>Job title</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Kitchen pot lights — Smith"
                autoFocus
              />
            </div>
            <div className="grid gap-2">
              <Label>Customer (optional)</Label>
              <Select
                value={clientId}
                onValueChange={(v) => setClientId(v ?? "")}
                items={clients.map((c) => ({ value: c.id, label: c.name }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="No customer" />
                </SelectTrigger>
                <SelectContent>
                  {clients.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label>Scheduled date</Label>
                <Input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label>Site address</Label>
                <Input
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Street, City"
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={create} disabled={busy || !title.trim()}>
              {busy ? "Creating…" : "Create job"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

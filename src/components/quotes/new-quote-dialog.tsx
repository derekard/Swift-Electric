"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Plus, UserPlus, Users } from "lucide-react"
import { toast } from "sonner"

import { createQuoteAction } from "@/app/(app)/quotes/actions"
import { createClientAction } from "@/app/(app)/clients/actions"
import { cn } from "@/lib/utils"
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

export function NewQuoteDialog({
  clients,
  variant = "default",
}: {
  clients: ClientOption[]
  variant?: "default" | "outline"
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<"existing" | "new">(
    clients.length ? "existing" : "new"
  )
  const [busy, setBusy] = useState(false)

  // existing
  const [clientId, setClientId] = useState<string>("")
  // new
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [phone, setPhone] = useState("")
  const [address, setAddress] = useState("")

  function reset() {
    setMode(clients.length ? "existing" : "new")
    setClientId("")
    setName("")
    setEmail("")
    setPhone("")
    setAddress("")
  }

  async function start() {
    setBusy(true)
    let useClientId: string | null = null
    let siteAddress: string | null = null

    if (mode === "existing") {
      useClientId = clientId || null
    } else {
      if (!name.trim()) {
        setBusy(false)
        return toast.error("Customer name is required.")
      }
      const c = await createClientAction({
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim(),
        address: address.trim(),
        notes: "",
      })
      if (!c.ok) {
        setBusy(false)
        return toast.error(c.error)
      }
      useClientId = c.data.id
      siteAddress = address.trim() || null
    }

    const res = await createQuoteAction({
      client_id: useClientId,
      site_address: siteAddress,
    })
    if (!res.ok) {
      setBusy(false)
      return toast.error(res.error)
    }
    router.push(`/quotes/${res.data.id}/edit`)
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
        <Plus /> New quote
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New quote</DialogTitle>
          </DialogHeader>

          {/* mode toggle */}
          <div className="grid grid-cols-2 gap-2">
            <ModeButton
              active={mode === "existing"}
              disabled={clients.length === 0}
              onClick={() => setMode("existing")}
              icon={<Users className="size-4" />}
              label="Existing customer"
            />
            <ModeButton
              active={mode === "new"}
              onClick={() => setMode("new")}
              icon={<UserPlus className="size-4" />}
              label="New customer"
            />
          </div>

          {mode === "existing" ? (
            <div className="grid gap-2">
              <Label>Customer</Label>
              <Select value={clientId} onValueChange={(v) => setClientId(v ?? "")}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a customer" />
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
          ) : (
            <div className="grid gap-3">
              <div className="grid gap-2">
                <Label>Customer name</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Jane Doe"
                  autoFocus
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label>Email</Label>
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label>Phone</Label>
                  <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
                </div>
              </div>
              <div className="grid gap-2">
                <Label>Site address</Label>
                <Input
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Street, City, Province"
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button
              onClick={start}
              disabled={
                busy || (mode === "existing" ? !clientId : !name.trim())
              }
            >
              {busy ? "Creating…" : "Start quote"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

function ModeButton({
  active,
  disabled,
  onClick,
  icon,
  label,
}: {
  active: boolean
  disabled?: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors disabled:opacity-40",
        active
          ? "border-primary bg-primary/10 text-primary"
          : "hover:bg-muted"
      )}
    >
      {icon}
      {label}
    </button>
  )
}

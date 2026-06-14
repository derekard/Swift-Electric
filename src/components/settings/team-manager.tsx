"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Plus, Save, Trash2 } from "lucide-react"
import { toast } from "sonner"

import type { Allowlist, Profile, Role } from "@/lib/supabase/types"
import {
  updateProfileAction,
  addInviteAction,
  removeInviteAction,
} from "@/app/(app)/settings/actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

export function TeamManager({
  profiles,
  invites,
}: {
  profiles: Profile[]
  invites: Allowlist[]
}) {
  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Team members</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {profiles.length === 0 ? (
            <p className="text-sm text-muted-foreground">No one has signed in yet.</p>
          ) : (
            profiles.map((p) => <ProfileRow key={p.id} profile={p} />)
          )}
        </CardContent>
      </Card>

      <InviteCard invites={invites} />
    </div>
  )
}

function ProfileRow({ profile }: { profile: Profile }) {
  const router = useRouter()
  const [role, setRole] = useState<Role>(profile.role)
  const [wage, setWage] = useState(String(profile.hourly_wage))
  const [active, setActive] = useState(profile.active)
  const [busy, setBusy] = useState(false)

  const dirty =
    role !== profile.role ||
    Number(wage) !== profile.hourly_wage ||
    active !== profile.active

  async function save() {
    setBusy(true)
    const res = await updateProfileAction(profile.id, {
      role,
      hourly_wage: Number(wage) || 0,
      active,
    })
    setBusy(false)
    if (!res.ok) return toast.error(res.error)
    toast.success("Saved")
    router.refresh()
  }

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-lg border p-3">
      <div className="min-w-40 flex-1">
        <p className="font-medium">{profile.full_name ?? profile.email}</p>
        <p className="text-xs text-muted-foreground">{profile.email}</p>
      </div>
      <div className="grid gap-1">
        <Label className="text-xs">Role</Label>
        <Select value={role} onValueChange={(v) => setRole((v as Role) ?? "tech")}>
          <SelectTrigger className="w-28">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="owner">Owner</SelectItem>
            <SelectItem value="tech">Tech</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-1">
        <Label className="text-xs">Wage ($/h)</Label>
        <Input
          type="number"
          step="0.5"
          value={wage}
          onChange={(e) => setWage(e.target.value)}
          className="w-24"
        />
      </div>
      <label className="flex items-center gap-2 pb-2 text-sm">
        <input
          type="checkbox"
          checked={active}
          onChange={(e) => setActive(e.target.checked)}
          className="size-4 accent-primary"
        />
        Active
      </label>
      <Button onClick={save} disabled={busy || !dirty} variant="outline">
        <Save /> Save
      </Button>
    </div>
  )
}

function InviteCard({ invites }: { invites: Allowlist[] }) {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [name, setName] = useState("")
  const [role, setRole] = useState<Role>("tech")
  const [busy, setBusy] = useState(false)

  async function add() {
    setBusy(true)
    const res = await addInviteAction({
      email: email.trim(),
      role,
      full_name: name.trim() || null,
    })
    setBusy(false)
    if (!res.ok) return toast.error(res.error)
    toast.success("Invite added")
    setEmail("")
    setName("")
    router.refresh()
  }

  async function remove(e: string) {
    const res = await removeInviteAction(e)
    if (!res.ok) return toast.error(res.error)
    router.refresh()
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Invites</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">
          Add a Google email here so that person can sign in. They become active on
          first login.
        </p>

        <div className="flex flex-wrap items-end gap-2">
          <div className="grid gap-1">
            <Label className="text-xs">Email</Label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@gmail.com"
              className="w-56"
            />
          </div>
          <div className="grid gap-1">
            <Label className="text-xs">Name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-40"
            />
          </div>
          <div className="grid gap-1">
            <Label className="text-xs">Role</Label>
            <Select value={role} onValueChange={(v) => setRole((v as Role) ?? "tech")}>
              <SelectTrigger className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="owner">Owner</SelectItem>
                <SelectItem value="tech">Tech</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button onClick={add} disabled={busy || !email.trim()}>
            <Plus /> Invite
          </Button>
        </div>

        {invites.length > 0 && (
          <div className="flex flex-col divide-y">
            {invites.map((inv) => (
              <div
                key={inv.email}
                className="flex items-center gap-3 py-2 text-sm"
              >
                <span className="flex-1">{inv.email}</span>
                <span className="text-muted-foreground capitalize">
                  {inv.role}
                </span>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Remove invite"
                  onClick={() => remove(inv.email)}
                >
                  <Trash2 />
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

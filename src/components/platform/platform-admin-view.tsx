"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Building2, MoreHorizontal, Plus } from "lucide-react"
import { toast } from "sonner"

import type { TenantStatus } from "@/lib/supabase/types"
import {
  createTenantAction,
  setTenantStatusAction,
} from "@/app/platform/admin/actions"
import { PageHeader } from "@/components/page-header"
import { EmptyState } from "@/components/empty-state"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

export type TenantRow = {
  id: string
  name: string
  slug: string
  custom_domain: string | null
  status: TenantStatus
  plan: string
  members: number
}

export function PlatformAdminView({
  rows,
  appDomain,
}: {
  rows: TenantRow[]
  appDomain: string | null
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)

  function urlFor(t: TenantRow) {
    if (t.custom_domain) return t.custom_domain
    if (appDomain) return `${t.slug}.${appDomain}`
    return t.slug
  }

  async function toggle(t: TenantRow) {
    const next: TenantStatus = t.status === "active" ? "suspended" : "active"
    const res = await setTenantStatusAction(t.id, next)
    if (!res.ok) return toast.error(res.error)
    toast.success(next === "active" ? "Company activated" : "Company suspended")
    router.refresh()
  }

  return (
    <>
      <PageHeader
        title="Companies"
        description="Each company is an isolated tenant with its own users, data and branding."
        action={
          <Button onClick={() => setOpen(true)}>
            <Plus /> New company
          </Button>
        }
      />

      {rows.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="No companies yet"
          description="Create your first company to onboard a contractor."
          action={
            <Button variant="outline" onClick={() => setOpen(true)}>
              <Plus /> New company
            </Button>
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Company</TableHead>
                <TableHead>Site</TableHead>
                <TableHead className="text-right">Members</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="font-medium">{t.name}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {urlFor(t)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {t.members}
                  </TableCell>
                  <TableCell className="text-muted-foreground capitalize">
                    {t.plan}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="secondary"
                      className={
                        t.status === "active"
                          ? "border-transparent bg-green-100 text-green-700"
                          : "border-transparent bg-red-100 text-red-700"
                      }
                    >
                      {t.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={
                          <Button variant="ghost" size="icon-sm" aria-label="Actions" />
                        }
                      >
                        <MoreHorizontal />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => toggle(t)}>
                          {t.status === "active" ? "Suspend" : "Activate"}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <NewCompanyDialog
        open={open}
        onOpenChange={setOpen}
        appDomain={appDomain}
        onCreated={() => router.refresh()}
      />
    </>
  )
}

function NewCompanyDialog({
  open,
  onOpenChange,
  appDomain,
  onCreated,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  appDomain: string | null
  onCreated: () => void
}) {
  const [name, setName] = useState("")
  const [slug, setSlug] = useState("")
  const [customDomain, setCustomDomain] = useState("")
  const [adminEmail, setAdminEmail] = useState("")
  const [adminName, setAdminName] = useState("")
  const [busy, setBusy] = useState(false)

  async function create() {
    setBusy(true)
    const res = await createTenantAction({
      name: name.trim(),
      slug: slug.trim() || undefined,
      custom_domain: customDomain.trim() || undefined,
      admin_email: adminEmail.trim(),
      admin_name: adminName.trim() || undefined,
    })
    setBusy(false)
    if (!res.ok) return toast.error(res.error)
    toast.success("Company created — invite the admin to sign in")
    onOpenChange(false)
    setName("")
    setSlug("")
    setCustomDomain("")
    setAdminEmail("")
    setAdminName("")
    onCreated()
  }

  const slugPreview = (slug || name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New company</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label>Company name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label>Subdomain (optional)</Label>
            <Input
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder={slugPreview || "acme-electric"}
            />
            {appDomain && slugPreview && (
              <p className="text-xs text-muted-foreground">
                {slugPreview}.{appDomain}
              </p>
            )}
          </div>
          <div className="grid gap-2">
            <Label>Custom domain (optional)</Label>
            <Input
              value={customDomain}
              onChange={(e) => setCustomDomain(e.target.value)}
              placeholder="acmeelectric.ca"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>Admin email</Label>
              <Input
                type="email"
                value={adminEmail}
                onChange={(e) => setAdminEmail(e.target.value)}
                placeholder="owner@company.com"
              />
            </div>
            <div className="grid gap-2">
              <Label>Admin name</Label>
              <Input
                value={adminName}
                onChange={(e) => setAdminName(e.target.value)}
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={create} disabled={busy || !name.trim() || !adminEmail.trim()}>
            {busy ? "Creating…" : "Create company"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

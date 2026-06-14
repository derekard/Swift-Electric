"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { MoreHorizontal, Plus, Users } from "lucide-react"
import { toast } from "sonner"

import type { Client } from "@/lib/supabase/types"
import { deleteClientAction } from "@/app/(app)/clients/actions"
import { PageHeader } from "@/components/page-header"
import { EmptyState } from "@/components/empty-state"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ClientFormDialog } from "@/components/clients/client-form-dialog"

export function ClientsView({ clients }: { clients: Client[] }) {
  const router = useRouter()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Client | null>(null)

  function openNew() {
    setEditing(null)
    setDialogOpen(true)
  }
  function openEdit(client: Client) {
    setEditing(client)
    setDialogOpen(true)
  }

  async function onDelete(client: Client) {
    if (!confirm(`Delete ${client.name}? This can't be undone.`)) return
    const res = await deleteClientAction(client.id)
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    toast.success("Client deleted")
    router.refresh()
  }

  return (
    <>
      <PageHeader
        title="Clients"
        description="Your customer list and contact details."
        action={
          <Button onClick={openNew}>
            <Plus /> New client
          </Button>
        }
      />

      {clients.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No clients yet"
          description="Add your first client to start building quotes."
          action={
            <Button onClick={openNew} variant="outline">
              <Plus /> New client
            </Button>
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Address</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {clients.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.name}</TableCell>
                  <TableCell className="text-muted-foreground">
                    <div className="flex flex-col">
                      {c.email && <span>{c.email}</span>}
                      {c.phone && <span>{c.phone}</span>}
                      {!c.email && !c.phone && <span>—</span>}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {c.address ?? "—"}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label="Actions"
                          />
                        }
                      >
                        <MoreHorizontal />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openEdit(c)}>
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          variant="destructive"
                          onClick={() => onDelete(c)}
                        >
                          Delete
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

      <ClientFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        client={editing}
        onSaved={() => router.refresh()}
      />
    </>
  )
}

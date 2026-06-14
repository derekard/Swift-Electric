"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { MoreHorizontal, Plus } from "lucide-react"
import { toast } from "sonner"

import type { PriceBookItem } from "@/lib/supabase/types"
import { money } from "@/lib/format"
import {
  addPriceItemAction,
  updatePriceItemAction,
  deletePriceItemAction,
} from "@/app/(app)/settings/actions"
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

export function PriceBookManager({ items }: { items: PriceBookItem[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<PriceBookItem | null>(null)

  async function toggleActive(item: PriceBookItem) {
    const res = await updatePriceItemAction(item.id, { active: !item.active })
    if (!res.ok) return toast.error(res.error)
    router.refresh()
  }

  async function remove(item: PriceBookItem) {
    if (!confirm(`Delete "${item.name}"?`)) return
    const res = await deletePriceItemAction(item.id)
    if (!res.ok) return toast.error(res.error)
    toast.success("Item deleted")
    router.refresh()
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button
          onClick={() => {
            setEditing(null)
            setOpen(true)
          }}
        >
          <Plus /> Add item
        </Button>
      </div>

      <div className="overflow-x-auto rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Category</TableHead>
              <TableHead className="text-right">Price</TableHead>
              <TableHead>Active</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item.id}>
                <TableCell className="font-medium">{item.name}</TableCell>
                <TableCell className="text-muted-foreground">
                  {item.category ?? "—"}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {money(item.unit_price)}
                </TableCell>
                <TableCell>
                  {item.active ? (
                    <Badge variant="secondary" className="border-transparent bg-green-100 text-green-700">
                      Active
                    </Badge>
                  ) : (
                    <Badge variant="secondary">Hidden</Badge>
                  )}
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
                      <DropdownMenuItem
                        onClick={() => {
                          setEditing(item)
                          setOpen(true)
                        }}
                      >
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => toggleActive(item)}>
                        {item.active ? "Hide" : "Show"}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        variant="destructive"
                        onClick={() => remove(item)}
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

      <PriceItemDialog
        open={open}
        onOpenChange={setOpen}
        item={editing}
        onSaved={() => router.refresh()}
      />
    </div>
  )
}

function PriceItemDialog({
  open,
  onOpenChange,
  item,
  onSaved,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  item: PriceBookItem | null
  onSaved: () => void
}) {
  const editing = !!item
  const [name, setName] = useState("")
  const [category, setCategory] = useState("")
  const [price, setPrice] = useState("")
  const [busy, setBusy] = useState(false)

  // reset when opening
  function onOpenChangeWrap(o: boolean) {
    if (o) {
      setName(item?.name ?? "")
      setCategory(item?.category ?? "")
      setPrice(item ? String(item.unit_price) : "")
    }
    onOpenChange(o)
  }

  async function save() {
    setBusy(true)
    const payload = {
      name: name.trim(),
      unit_price: Number(price) || 0,
      category: category.trim() || null,
    }
    const res = editing
      ? await updatePriceItemAction(item!.id, payload)
      : await addPriceItemAction(payload)
    setBusy(false)
    if (!res.ok) return toast.error(res.error)
    toast.success(editing ? "Item updated" : "Item added")
    onOpenChange(false)
    onSaved()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChangeWrap}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? "Edit item" : "New item"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>Category</Label>
              <Input
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label>Price ($)</Label>
              <Input
                type="number"
                step="0.01"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={save} disabled={busy || !name.trim()}>
            {busy ? "Saving…" : editing ? "Save" : "Add"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

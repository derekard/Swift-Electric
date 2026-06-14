"use client"

import { useMemo, useState } from "react"
import { Pencil, Search } from "lucide-react"

import type { PriceBookItem } from "@/lib/supabase/types"
import { money } from "@/lib/format"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"

export function PriceBookPicker({
  open,
  onOpenChange,
  items,
  onPick,
  onCustom,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  items: PriceBookItem[]
  onPick: (item: PriceBookItem) => void
  onCustom: () => void
}) {
  const [query, setQuery] = useState("")

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return items
    return items.filter(
      (i) =>
        i.name.toLowerCase().includes(q) ||
        (i.category ?? "").toLowerCase().includes(q)
    )
  }, [items, query])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add an item</DialogTitle>
        </DialogHeader>

        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            autoFocus
            placeholder="Search price book…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-8"
          />
        </div>

        <div className="-mx-1 max-h-72 overflow-y-auto px-1">
          <div className="flex flex-col gap-1">
            {filtered.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  onPick(item)
                  onOpenChange(false)
                }}
                className="flex items-center justify-between rounded-lg border px-3 py-2 text-left text-sm transition-colors hover:bg-muted"
              >
                <span className="font-medium">{item.name}</span>
                <span className="text-muted-foreground">
                  {money(item.unit_price)}
                </span>
              </button>
            ))}
            {filtered.length === 0 && (
              <p className="px-1 py-6 text-center text-sm text-muted-foreground">
                No items match “{query}”.
              </p>
            )}
          </div>
        </div>

        <Button
          variant="outline"
          onClick={() => {
            onCustom()
            onOpenChange(false)
          }}
        >
          <Pencil /> Custom line
        </Button>
      </DialogContent>
    </Dialog>
  )
}

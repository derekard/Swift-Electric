"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Eye, Plus, Save, Trash2, X } from "lucide-react"
import { toast } from "sonner"

import type { Client, PriceBookItem, Quote } from "@/lib/supabase/types"
import { money } from "@/lib/format"
import { computeQuoteTotals } from "@/lib/quote-totals"
import { saveQuoteAction } from "@/app/(app)/quotes/actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { PriceBookPicker } from "@/components/quotes/price-book-picker"
import { QuoteStatusBadge } from "@/components/quotes/quote-status-badge"
import { VoiceButton, type VoiceArea } from "@/components/quotes/voice-button"

export type EditorLine = {
  key: string
  price_book_item_id: string | null
  description: string
  qty: number
  unit_price: number
}
export type EditorArea = {
  key: string
  name: string
  lines: EditorLine[]
}

const uid = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2)

export function QuoteEditor({
  quote,
  initialAreas,
  clients,
  priceBook,
  defaultIntro,
  voiceEnabled = false,
}: {
  quote: Quote
  initialAreas: EditorArea[]
  clients: Client[]
  priceBook: PriceBookItem[]
  defaultIntro: string
  voiceEnabled?: boolean
}) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)

  const [clientId, setClientId] = useState<string | null>(quote.client_id)
  const [siteAddress, setSiteAddress] = useState(quote.site_address ?? "")
  const [billingType, setBillingType] = useState<"fixed" | "tm">(
    quote.billing_type
  )
  const [tmRate, setTmRate] = useState(quote.tm_labor_rate ?? 0)
  const [tmMarkup, setTmMarkup] = useState(quote.tm_materials_markup_pct ?? 0)
  const [intro, setIntro] = useState(quote.intro ?? "")
  const [notes, setNotes] = useState(quote.notes ?? "")
  const [jicPct, setJicPct] = useState(quote.jic_pct)
  const [adminPct, setAdminPct] = useState(quote.admin_pct)
  const [smallPartsPct, setSmallPartsPct] = useState(quote.small_parts_pct)
  const [permitFee, setPermitFee] = useState(quote.permit_fee)
  const [hstRate, setHstRate] = useState(quote.hst_rate)
  const [showHstLine, setShowHstLine] = useState(quote.show_hst_line)

  const [areas, setAreas] = useState<EditorArea[]>(
    initialAreas.length
      ? initialAreas
      : [{ key: uid(), name: "", lines: [] }]
  )

  const [pickerArea, setPickerArea] = useState<string | null>(null)

  // ---- area / line mutations -------------------------------------------
  function addArea() {
    setAreas((a) => [...a, { key: uid(), name: "", lines: [] }])
  }
  function removeArea(key: string) {
    setAreas((a) => a.filter((x) => x.key !== key))
  }
  function renameArea(key: string, name: string) {
    setAreas((a) => a.map((x) => (x.key === key ? { ...x, name } : x)))
  }
  function addLine(areaKey: string, line: Omit<EditorLine, "key">) {
    setAreas((a) =>
      a.map((x) =>
        x.key === areaKey
          ? { ...x, lines: [...x.lines, { ...line, key: uid() }] }
          : x
      )
    )
  }
  function updateLine(
    areaKey: string,
    lineKey: string,
    patch: Partial<EditorLine>
  ) {
    setAreas((a) =>
      a.map((x) =>
        x.key === areaKey
          ? {
              ...x,
              lines: x.lines.map((l) =>
                l.key === lineKey ? { ...l, ...patch } : l
              ),
            }
          : x
      )
    )
  }
  function removeLine(areaKey: string, lineKey: string) {
    setAreas((a) =>
      a.map((x) =>
        x.key === areaKey
          ? { ...x, lines: x.lines.filter((l) => l.key !== lineKey) }
          : x
      )
    )
  }

  // Merge dictated areas/lines into the builder, reusing rooms by name and
  // pulling unit prices from the price book for matched items.
  function mergeVoiceAreas(voiceAreas: VoiceArea[]) {
    const priceById = new Map(priceBook.map((p) => [p.id, Number(p.unit_price)]))
    setAreas((current) => {
      const next = current
        .filter((a) => a.name.trim() || a.lines.length) // drop the empty seed
        .map((a) => ({ ...a, lines: [...a.lines] }))

      for (const va of voiceAreas) {
        const name = va.name.trim() || "General"
        let target = next.find(
          (a) => a.name.trim().toLowerCase() === name.toLowerCase()
        )
        if (!target) {
          target = { key: uid(), name, lines: [] }
          next.push(target)
        }
        for (const l of va.lines) {
          target.lines.push({
            key: uid(),
            price_book_item_id: l.price_book_item_id,
            description: l.description,
            qty: l.qty || 1,
            unit_price: l.price_book_item_id
              ? (priceById.get(l.price_book_item_id) ?? 0)
              : 0,
          })
        }
      }
      return next.length ? next : current
    })
  }

  // ---- totals ----------------------------------------------------------
  const itemsSubtotal = areas.reduce(
    (sum, area) =>
      sum + area.lines.reduce((s, l) => s + (l.qty || 0) * (l.unit_price || 0), 0),
    0
  )
  const totals = computeQuoteTotals(itemsSubtotal, {
    jic_pct: jicPct,
    admin_pct: adminPct,
    small_parts_pct: smallPartsPct,
    permit_fee: permitFee,
    hst_rate: hstRate,
  })

  // ---- save ------------------------------------------------------------
  function buildPayload() {
    return {
      meta: {
        client_id: clientId,
        site_address: siteAddress.trim() || null,
        intro: intro.trim() || null,
        notes: notes.trim() || null,
        billing_type: billingType,
        tm_labor_rate: billingType === "tm" ? tmRate : null,
        tm_materials_markup_pct: billingType === "tm" ? tmMarkup : null,
        jic_pct: jicPct,
        admin_pct: adminPct,
        small_parts_pct: smallPartsPct,
        permit_fee: permitFee,
        hst_rate: hstRate,
        show_hst_line: showHstLine,
      },
      areas: areas
        .map((area) => ({
          name: area.name.trim(),
          lines: area.lines
            .filter((l) => l.description.trim())
            .map((l) => ({
              price_book_item_id: l.price_book_item_id,
              description: l.description.trim(),
              qty: l.qty || 0,
              unit_price: l.unit_price || 0,
            })),
        }))
        .filter((area) => area.name && area.lines.length > 0),
    }
  }

  async function save(): Promise<boolean> {
    setSaving(true)
    const res = await saveQuoteAction(quote.id, buildPayload())
    setSaving(false)
    if (!res.ok) {
      toast.error(res.error)
      return false
    }
    toast.success("Quote saved")
    router.refresh()
    return true
  }

  async function saveAndPreview() {
    if (await save()) router.push(`/quotes/${quote.id}`)
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">
            {quote.quote_number}
          </h1>
          <QuoteStatusBadge status={quote.status} />
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={saveAndPreview} disabled={saving}>
            <Eye /> Preview
          </Button>
          <Button onClick={save} disabled={saving}>
            <Save /> {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        {/* Left: builder */}
        <div className="flex flex-col gap-6">
          {/* Client + site */}
          <Card>
            <CardContent className="grid gap-4 pt-6 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label>Client</Label>
                <Select
                  value={clientId ?? ""}
                  onValueChange={(v) => setClientId(v || null)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a client" />
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
              <div className="grid gap-2">
                <Label>Site address</Label>
                <Input
                  value={siteAddress}
                  onChange={(e) => setSiteAddress(e.target.value)}
                  placeholder="Street, City, Province"
                />
              </div>
            </CardContent>
          </Card>

          {/* Billing type */}
          <Card>
            <CardContent className="flex flex-col gap-3 pt-6">
              <Label>Billing type</Label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setBillingType("fixed")}
                  className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                    billingType === "fixed"
                      ? "border-primary bg-primary/10 text-primary"
                      : "hover:bg-muted"
                  }`}
                >
                  Fixed price
                </button>
                <button
                  type="button"
                  onClick={() => setBillingType("tm")}
                  className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                    billingType === "tm"
                      ? "border-primary bg-primary/10 text-primary"
                      : "hover:bg-muted"
                  }`}
                >
                  Time &amp; Materials
                </button>
              </div>
              {billingType === "tm" && (
                <p className="text-xs text-muted-foreground">
                  The rooms/items below describe the scope. Final billing is from
                  actual hours + materials on the job (set the rates on the right).
                </p>
              )}
            </CardContent>
          </Card>

          {/* Areas */}
          {areas.map((area) => (
            <Card key={area.key}>
              <CardContent className="flex flex-col gap-3 pt-6">
                <div className="flex items-center gap-2">
                  <Input
                    value={area.name}
                    onChange={(e) => renameArea(area.key, e.target.value)}
                    placeholder="Room / area (e.g. Kitchen)"
                    className="font-medium"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Remove area"
                    onClick={() => removeArea(area.key)}
                  >
                    <Trash2 />
                  </Button>
                </div>

                {area.lines.length > 0 && (
                  <div className="flex flex-col gap-2">
                    {area.lines.map((line) => (
                      <LineRow
                        key={line.key}
                        line={line}
                        onChange={(patch) =>
                          updateLine(area.key, line.key, patch)
                        }
                        onRemove={() => removeLine(area.key, line.key)}
                      />
                    ))}
                  </div>
                )}

                <div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPickerArea(area.key)}
                  >
                    <Plus /> Add item
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}

          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={addArea}>
              <Plus /> Add room / area
            </Button>
            {voiceEnabled && (
              <VoiceButton priceBook={priceBook} onAreas={mergeVoiceAreas} />
            )}
          </div>

          {/* Letter details */}
          <Card>
            <CardContent className="grid gap-4 pt-6">
              <div className="grid gap-2">
                <Label>Intro line</Label>
                <Textarea
                  rows={2}
                  value={intro}
                  onChange={(e) => setIntro(e.target.value)}
                  placeholder={defaultIntro}
                />
              </div>
              <div className="grid gap-2">
                <Label>Notes (shown to client)</Label>
                <Textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g. Electrical permit included"
                />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right: totals */}
        <div className="lg:sticky lg:top-20 lg:self-start">
          <Card>
            {billingType === "tm" ? (
            <CardContent className="flex flex-col gap-4 pt-6">
              <p className="text-sm font-medium text-muted-foreground">
                Time &amp; Materials
              </p>
              <div className="grid gap-2">
                <Label>Labour rate ($/hr)</Label>
                <Input
                  type="number"
                  value={tmRate}
                  onChange={(e) => setTmRate(Number(e.target.value) || 0)}
                  className="h-8"
                />
              </div>
              <div className="grid gap-2">
                <Label>Materials markup (%)</Label>
                <Input
                  type="number"
                  value={tmMarkup}
                  onChange={(e) => setTmMarkup(Number(e.target.value) || 0)}
                  className="h-8"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Invoice is built on the job from logged hours × rate + materials ×
                (1 + markup), plus HST.
              </p>
              <Badge variant="secondary" className="mt-1 w-fit">
                Client sees: Time &amp; Materials
              </Badge>
            </CardContent>
            ) : (
            <CardContent className="flex flex-col gap-3 pt-6">
              <p className="text-sm font-medium text-muted-foreground">
                Internal pricing
              </p>

              <TotalRow label="Items subtotal" value={money(totals.items_subtotal)} />

              <FeeRow
                label="Contingency (JIC)"
                pct={jicPct}
                onPct={setJicPct}
                amount={totals.jic_amount}
              />
              <FeeRow
                label="Admin / overhead"
                pct={adminPct}
                onPct={setAdminPct}
                amount={totals.admin_amount}
              />
              <FeeRow
                label="Small parts"
                pct={smallPartsPct}
                onPct={setSmallPartsPct}
                amount={totals.small_parts_amount}
              />

              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="flex items-center gap-1.5">
                  Permit
                  <span className="text-muted-foreground">$</span>
                  <Input
                    type="number"
                    value={permitFee}
                    onChange={(e) => setPermitFee(Number(e.target.value) || 0)}
                    className="h-7 w-20"
                  />
                </span>
                <span>{money(totals.permit_amount)}</span>
              </div>

              <div className="my-1 border-t" />
              <TotalRow
                label="Subtotal"
                value={money(totals.amount_pretax)}
                strong
              />
              <FeeRow
                label="HST"
                pct={hstRate}
                onPct={setHstRate}
                amount={totals.hst_amount}
              />
              <div className="my-1 border-t" />
              <TotalRow label="Total" value={money(totals.total)} big />

              <label className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={showHstLine}
                  onChange={(e) => setShowHstLine(e.target.checked)}
                  className="size-3.5 accent-primary"
                />
                Show HST on the client quote (off = &ldquo;HST extra&rdquo;)
              </label>

              <Badge variant="secondary" className="mt-1 w-fit">
                Client sees {money(showHstLine ? totals.total : totals.amount_pretax)}
                {showHstLine ? "" : " + HST"}
              </Badge>
            </CardContent>
            )}
          </Card>

          <Button
            render={<Link href="/quotes" />}
            variant="ghost"
            className="mt-3 w-full"
          >
            <X /> Back to quotes
          </Button>
        </div>
      </div>

      <PriceBookPicker
        open={pickerArea !== null}
        onOpenChange={(o) => !o && setPickerArea(null)}
        items={priceBook}
        onPick={(item) => {
          if (pickerArea)
            addLine(pickerArea, {
              price_book_item_id: item.id,
              description: item.name,
              qty: 1,
              unit_price: item.unit_price,
            })
        }}
        onCustom={() => {
          if (pickerArea)
            addLine(pickerArea, {
              price_book_item_id: null,
              description: "",
              qty: 1,
              unit_price: 0,
            })
        }}
      />
    </div>
  )
}

function LineRow({
  line,
  onChange,
  onRemove,
}: {
  line: EditorLine
  onChange: (patch: Partial<EditorLine>) => void
  onRemove: () => void
}) {
  const lineTotal = (line.qty || 0) * (line.unit_price || 0)
  return (
    <div className="flex items-center gap-2">
      <Input
        value={line.description}
        onChange={(e) => onChange({ description: e.target.value })}
        placeholder="Description"
        className="flex-1"
      />
      <Input
        type="number"
        value={line.qty}
        onChange={(e) => onChange({ qty: Number(e.target.value) || 0 })}
        className="w-16"
        aria-label="Quantity"
      />
      <Input
        type="number"
        value={line.unit_price}
        onChange={(e) => onChange({ unit_price: Number(e.target.value) || 0 })}
        className="w-24"
        aria-label="Unit price"
      />
      <span className="w-20 shrink-0 text-right text-sm tabular-nums">
        {money(lineTotal)}
      </span>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Remove line"
        onClick={onRemove}
      >
        <X />
      </Button>
    </div>
  )
}

function TotalRow({
  label,
  value,
  strong,
  big,
}: {
  label: string
  value: string
  strong?: boolean
  big?: boolean
}) {
  return (
    <div
      className={`flex items-center justify-between ${
        big ? "text-base font-semibold" : "text-sm"
      } ${strong ? "font-medium" : ""}`}
    >
      <span className={strong || big ? "" : "text-muted-foreground"}>
        {label}
      </span>
      <span className="tabular-nums">{value}</span>
    </div>
  )
}

function FeeRow({
  label,
  pct,
  onPct,
  amount,
}: {
  label: string
  pct: number
  onPct: (n: number) => void
  amount: number
}) {
  return (
    <div className="flex items-center justify-between gap-2 text-sm">
      <span className="flex items-center gap-1.5 text-muted-foreground">
        {label}
        <Input
          type="number"
          value={pct}
          onChange={(e) => onPct(Number(e.target.value) || 0)}
          className="h-7 w-16"
          aria-label={`${label} percent`}
        />
        <span>%</span>
      </span>
      <span className="tabular-nums">{money(amount)}</span>
    </div>
  )
}

"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Save } from "lucide-react"
import { toast } from "sonner"

import type { TenantSettings } from "@/lib/supabase/types"
import { updateSettingsAction } from "@/app/(app)/settings/actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export function CompanyForm({ settings }: { settings: TenantSettings }) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [s, setS] = useState({
    company_name: settings.company_name,
    owner_name: settings.owner_name ?? "",
    license_number: settings.license_number ?? "",
    address: settings.address ?? "",
    phone: settings.phone ?? "",
    email: settings.email ?? "",
    logo_url: settings.logo_url ?? "",
    brand_color: settings.brand_color,
    hst_rate: settings.hst_rate,
    jic_pct: settings.jic_pct,
    admin_pct: settings.admin_pct,
    small_parts_pct: settings.small_parts_pct,
    permit_fee: settings.permit_fee,
    mileage_rate: settings.mileage_rate,
    net_days: settings.net_days,
    tm_labor_rate: settings.tm_labor_rate,
    tm_materials_markup_pct: settings.tm_materials_markup_pct,
    quote_intro: settings.quote_intro,
    show_hst_line: settings.show_hst_line,
  })

  function set<K extends keyof typeof s>(key: K, value: (typeof s)[K]) {
    setS((prev) => ({ ...prev, [key]: value }))
  }

  async function save() {
    setSaving(true)
    const res = await updateSettingsAction({
      company_name: s.company_name.trim(),
      owner_name: s.owner_name.trim() || null,
      license_number: s.license_number.trim() || null,
      address: s.address.trim() || null,
      phone: s.phone.trim() || null,
      email: s.email.trim() || null,
      logo_url: s.logo_url.trim() || null,
      brand_color: s.brand_color.trim() || "#C49A2C",
      hst_rate: s.hst_rate,
      jic_pct: s.jic_pct,
      admin_pct: s.admin_pct,
      small_parts_pct: s.small_parts_pct,
      permit_fee: s.permit_fee,
      mileage_rate: s.mileage_rate,
      net_days: s.net_days,
      tm_labor_rate: s.tm_labor_rate,
      tm_materials_markup_pct: s.tm_materials_markup_pct,
      quote_intro: s.quote_intro.trim(),
      show_hst_line: s.show_hst_line,
    })
    setSaving(false)
    if (!res.ok) return toast.error(res.error)
    toast.success("Settings saved")
    router.refresh()
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Company</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Company name">
            <Input
              value={s.company_name}
              onChange={(e) => set("company_name", e.target.value)}
            />
          </Field>
          <Field label="Owner name">
            <Input
              value={s.owner_name}
              onChange={(e) => set("owner_name", e.target.value)}
            />
          </Field>
          <Field label="ECRA/ESA license #">
            <Input
              value={s.license_number}
              onChange={(e) => set("license_number", e.target.value)}
            />
          </Field>
          <Field label="Phone">
            <Input
              value={s.phone}
              onChange={(e) => set("phone", e.target.value)}
            />
          </Field>
          <Field label="Email">
            <Input
              type="email"
              value={s.email}
              onChange={(e) => set("email", e.target.value)}
            />
          </Field>
          <Field label="Logo URL">
            <Input
              type="url"
              value={s.logo_url}
              onChange={(e) => set("logo_url", e.target.value)}
              placeholder="https://example.com/logo.png"
            />
          </Field>
          <Field label="Address">
            <Input
              value={s.address}
              onChange={(e) => set("address", e.target.value)}
            />
          </Field>
          <Field label="Brand colour">
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={s.brand_color}
                onChange={(e) => set("brand_color", e.target.value)}
                className="h-9 w-12 cursor-pointer rounded-md border"
                aria-label="Brand colour"
              />
              <Input
                value={s.brand_color}
                onChange={(e) => set("brand_color", e.target.value)}
                className="w-32"
              />
            </div>
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Pricing defaults</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <Field label="HST %">
            <NumberInput value={s.hst_rate} onChange={(v) => set("hst_rate", v)} />
          </Field>
          <Field label="Contingency (JIC) %">
            <NumberInput value={s.jic_pct} onChange={(v) => set("jic_pct", v)} />
          </Field>
          <Field label="Admin / overhead %">
            <NumberInput
              value={s.admin_pct}
              onChange={(v) => set("admin_pct", v)}
            />
          </Field>
          <Field label="Small parts %">
            <NumberInput
              value={s.small_parts_pct}
              onChange={(v) => set("small_parts_pct", v)}
            />
          </Field>
          <Field label="Permit fee ($)">
            <NumberInput
              value={s.permit_fee}
              onChange={(v) => set("permit_fee", v)}
            />
          </Field>
          <Field label="Mileage rate ($/km)">
            <NumberInput
              step="0.01"
              value={s.mileage_rate}
              onChange={(v) => set("mileage_rate", v)}
            />
          </Field>
          <Field label="Invoice terms (Net days)">
            <NumberInput
              step="1"
              value={s.net_days}
              onChange={(v) => set("net_days", v)}
            />
          </Field>
          <Field label="T&M labour rate ($/h)">
            <NumberInput
              step="1"
              value={s.tm_labor_rate}
              onChange={(v) => set("tm_labor_rate", v)}
            />
          </Field>
          <Field label="T&M materials markup (%)">
            <NumberInput
              value={s.tm_materials_markup_pct}
              onChange={(v) => set("tm_materials_markup_pct", v)}
            />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Quote letter</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <Field label="Intro line">
            <Textarea
              rows={2}
              value={s.quote_intro}
              onChange={(e) => set("quote_intro", e.target.value)}
            />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={s.show_hst_line}
              onChange={(e) => set("show_hst_line", e.target.checked)}
              className="size-4 accent-primary"
            />
            Show HST as a line on quotes (off = &ldquo;HST extra&rdquo;)
          </label>
        </CardContent>
      </Card>

      <div>
        <Button onClick={save} disabled={saving}>
          <Save /> {saving ? "Saving…" : "Save settings"}
        </Button>
      </div>
    </div>
  )
}

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="grid gap-2">
      <Label>{label}</Label>
      {children}
    </div>
  )
}

function NumberInput({
  value,
  onChange,
  step = "0.1",
}: {
  value: number
  onChange: (v: number) => void
  step?: string
}) {
  return (
    <Input
      type="number"
      step={step}
      value={value}
      onChange={(e) => onChange(Number(e.target.value) || 0)}
    />
  )
}

"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  ArrowLeft,
  Briefcase,
  CheckCircle2,
  Download,
  FileText,
  Save,
  Send,
} from "lucide-react"
import { toast } from "sonner"

import type {
  Invoice,
  InvoiceStatus,
  PaymentMethod,
} from "@/lib/supabase/types"
import { money } from "@/lib/format"
import {
  updateInvoiceAction,
  sendInvoiceAction,
  setInvoiceTaxExemptAction,
} from "@/app/(app)/invoices/actions"
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
import { InvoiceStatusBadge } from "@/components/invoices/invoice-status-badge"

const STATUSES: InvoiceStatus[] = ["draft", "sent", "paid", "void"]
const STATUS_LABELS: Record<InvoiceStatus, string> = {
  draft: "Draft",
  sent: "Sent",
  paid: "Paid",
  void: "Void",
}

const PAYMENT_METHODS: PaymentMethod[] = [
  "cash",
  "cheque",
  "e_transfer",
  "card",
  "other",
]
const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  cash: "Cash",
  cheque: "Cheque",
  e_transfer: "E-transfer",
  card: "Card",
  other: "Other",
}

const today = () => new Date().toISOString().slice(0, 10)

export function InvoiceDetail({
  invoice,
  clientName,
  clientHasEmail,
  job,
  quote,
  emailEnabled,
}: {
  invoice: Invoice
  clientName: string | null
  clientHasEmail: boolean
  job: { id: string; number: string } | null
  quote: { id: string; number: string } | null
  emailEnabled: boolean
}) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [sending, setSending] = useState(false)
  const [taxSaving, setTaxSaving] = useState(false)
  const [issued, setIssued] = useState(invoice.issued_date ?? "")
  const [due, setDue] = useState(invoice.due_date ?? "")
  const [paid, setPaid] = useState(invoice.paid_date ?? "")
  const [method, setMethod] = useState<PaymentMethod | "">(
    invoice.payment_method ?? ""
  )

  async function patch(input: Parameters<typeof updateInvoiceAction>[1], msg: string) {
    const res = await updateInvoiceAction(invoice.id, input)
    if (!res.ok) return toast.error(res.error)
    toast.success(msg)
    router.refresh()
  }

  async function saveDates() {
    setSaving(true)
    await patch(
      {
        issued_date: issued || null,
        due_date: due || null,
        paid_date: paid || null,
        payment_method: method || null,
      },
      "Invoice saved"
    )
    setSaving(false)
  }

  async function toggleTaxExempt(exempt: boolean) {
    setTaxSaving(true)
    const res = await setInvoiceTaxExemptAction(invoice.id, exempt)
    setTaxSaving(false)
    if (!res.ok) return toast.error(res.error)
    toast.success(exempt ? "HST removed from invoice" : "HST applied")
    router.refresh()
  }

  async function send() {
    if (!confirm(`Email this invoice to ${clientName ?? "the client"}?`)) return
    setSending(true)
    const res = await sendInvoiceAction(invoice.id)
    setSending(false)
    if (!res.ok) return toast.error(res.error)
    toast.success("Invoice emailed to client")
    router.refresh()
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button
            render={<Link href="/invoices" />}
            variant="ghost"
            size="icon"
            aria-label="Back"
          >
            <ArrowLeft />
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-semibold tracking-tight">
                {invoice.invoice_number}
              </h1>
              <InvoiceStatusBadge status={invoice.status} />
            </div>
            <p className="text-sm text-muted-foreground">
              {clientName ?? "No client"}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {invoice.status !== "paid" && (
            <Button
              variant="outline"
              onClick={() => {
                setPaid(today())
                patch(
                  {
                    status: "paid",
                    paid_date: today(),
                    payment_method: method || null,
                  },
                  "Marked paid"
                )
              }}
            >
              <CheckCircle2 /> Mark paid
            </Button>
          )}
          <Button
            render={<a href={`/invoices/${invoice.id}/pdf`} target="_blank" />}
            variant="outline"
          >
            <Download /> PDF
          </Button>
          {emailEnabled && (
            <Button
              variant="outline"
              onClick={send}
              disabled={sending || !clientHasEmail}
              title={clientHasEmail ? undefined : "Client has no email"}
            >
              <Send /> {sending ? "Sending…" : "Send"}
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        {/* Amounts */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Amount</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="ml-auto w-full max-w-sm space-y-1.5 text-sm">
              {invoice.billing_type === "tm" ? (
                <>
                  <Row label="Labour" value={money(invoice.labor_amount)} />
                  <Row label="Materials" value={money(invoice.materials_amount)} />
                </>
              ) : (
                <>
                  <Row label="Items subtotal" value={money(invoice.items_subtotal)} />
                  <Row label="Contingency (JIC)" value={money(invoice.jic_amount)} />
                  <Row label="Admin / overhead" value={money(invoice.admin_amount)} />
                  <Row label="Small parts" value={money(invoice.small_parts_amount)} />
                  <Row label="Permit" value={money(invoice.permit_amount)} />
                </>
              )}
              <div className="border-t pt-1.5">
                <Row label="Subtotal" value={money(invoice.amount_pretax)} strong />
              </div>
              <Row
                label={invoice.tax_exempt ? "HST (exempt)" : "HST"}
                value={money(invoice.hst_amount)}
              />
              <div className="border-t pt-1.5">
                <Row label="Total" value={money(invoice.total)} big />
              </div>

              <label className="mt-3 flex items-center gap-2 border-t pt-3 text-sm">
                <input
                  type="checkbox"
                  className="size-4 accent-primary"
                  checked={invoice.tax_exempt}
                  disabled={taxSaving}
                  onChange={(e) => toggleTaxExempt(e.target.checked)}
                />
                <span className="text-muted-foreground">
                  Tax exempt — don&apos;t charge HST on this invoice
                </span>
              </label>
            </div>
          </CardContent>
        </Card>

        {/* Dates + status + links */}
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Status &amp; dates</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="grid gap-2">
                <Label>Status</Label>
                <Select
                  value={invoice.status}
                  onValueChange={(v) =>
                    patch({ status: v as InvoiceStatus }, "Status updated")
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {STATUS_LABELS[s]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Issued</Label>
                <Input
                  type="date"
                  value={issued}
                  onChange={(e) => setIssued(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label>Due</Label>
                <Input
                  type="date"
                  value={due}
                  onChange={(e) => setDue(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label>Paid</Label>
                <Input
                  type="date"
                  value={paid}
                  onChange={(e) => setPaid(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label>Payment method</Label>
                <Select
                  value={method}
                  onValueChange={(v) => setMethod((v as PaymentMethod) ?? "")}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="How was it paid?" />
                  </SelectTrigger>
                  <SelectContent>
                    {PAYMENT_METHODS.map((m) => (
                      <SelectItem key={m} value={m}>
                        {PAYMENT_LABELS[m]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={saveDates} disabled={saving}>
                <Save /> {saving ? "Saving…" : "Save dates"}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Linked</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {job && (
                <Button
                  render={<Link href={`/jobs/${job.id}`} />}
                  variant="outline"
                  className="justify-start"
                >
                  <Briefcase /> Job {job.number}
                </Button>
              )}
              {quote && (
                <Button
                  render={<Link href={`/quotes/${quote.id}`} />}
                  variant="outline"
                  className="justify-start"
                >
                  <FileText /> Quote {quote.number}
                </Button>
              )}
              {!job && !quote && (
                <p className="text-sm text-muted-foreground">Nothing linked.</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

function Row({
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
        big ? "text-base font-semibold" : ""
      } ${strong ? "font-medium" : ""}`}
    >
      <span className={strong || big ? "" : "text-muted-foreground"}>
        {label}
      </span>
      <span className="tabular-nums">{value}</span>
    </div>
  )
}

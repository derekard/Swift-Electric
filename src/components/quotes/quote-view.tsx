"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
import {
  ArrowLeft,
  Briefcase,
  CheckCircle2,
  ChevronDown,
  Download,
  Pencil,
  Send,
} from "lucide-react"
import { toast } from "sonner"

import type { Quote, QuoteStatus, QuoteTotals } from "@/lib/supabase/types"
import type { QuoteDoc, AreaWithLines } from "@/lib/quote-doc"
import {
  setQuoteStatusAction,
  sendQuoteAction,
  acceptQuoteAction,
} from "@/app/(app)/quotes/actions"
import { Button } from "@/components/ui/button"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { QuoteStatusBadge } from "@/components/quotes/quote-status-badge"
import { QuoteLetter } from "@/components/quotes/quote-letter"
import { InternalSheet } from "@/components/quotes/internal-sheet"

export function QuoteView({
  quote,
  doc,
  areas,
  totals,
  emailEnabled,
  clientHasEmail,
  jobId,
}: {
  quote: Quote
  doc: QuoteDoc
  areas: AreaWithLines[]
  totals: QuoteTotals
  emailEnabled: boolean
  clientHasEmail: boolean
  jobId: string | null
}) {
  const router = useRouter()
  const [sending, setSending] = useState(false)
  const [accepting, setAccepting] = useState(false)

  async function setStatus(status: QuoteStatus) {
    const res = await setQuoteStatusAction(quote.id, status)
    if (!res.ok) return toast.error(res.error)
    toast.success("Status updated")
    router.refresh()
  }

  async function send() {
    if (!confirm(`Email this quote to ${doc.client?.name ?? "the client"}?`))
      return
    setSending(true)
    const res = await sendQuoteAction(quote.id)
    setSending(false)
    if (!res.ok) return toast.error(res.error)
    toast.success("Quote emailed to client")
    router.refresh()
  }

  async function accept() {
    setAccepting(true)
    const res = await acceptQuoteAction(quote.id)
    setAccepting(false)
    if (!res.ok) return toast.error(res.error)
    toast.success("Quote accepted — job & invoice created")
    router.push(`/jobs/${res.data.jobId}`)
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button
            render={<Link href="/quotes" />}
            variant="ghost"
            size="icon"
            aria-label="Back"
          >
            <ArrowLeft />
          </Button>
          <h1 className="text-2xl font-semibold tracking-tight">
            {quote.quote_number}
          </h1>
          <QuoteStatusBadge status={quote.status} />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="outline" />}>
              Status <ChevronDown />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setStatus("draft")}>
                Draft
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setStatus("sent")}>
                Sent
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setStatus("accepted")}>
                Accepted
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setStatus("declined")}>
                Declined
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button render={<a href={`/quotes/${quote.id}/pdf`} target="_blank" />} variant="outline">
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
          <Button render={<Link href={`/quotes/${quote.id}/edit`} />} variant="outline">
            <Pencil /> Edit
          </Button>
          {jobId ? (
            <Button render={<Link href={`/jobs/${jobId}`} />}>
              <Briefcase /> View job
            </Button>
          ) : (
            <Button onClick={accept} disabled={accepting}>
              <CheckCircle2 /> {accepting ? "Accepting…" : "Accept"}
            </Button>
          )}
        </div>
      </div>

      <Tabs defaultValue="client">
        <TabsList>
          <TabsTrigger value="client">Client view</TabsTrigger>
          <TabsTrigger value="internal">Internal</TabsTrigger>
        </TabsList>
        <TabsContent value="client" className="pt-4">
          <QuoteLetter doc={doc} />
        </TabsContent>
        <TabsContent value="internal" className="pt-4">
          <InternalSheet quote={quote} areas={areas} totals={totals} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

import type { ElementType, ReactNode } from "react"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, Camera, CheckCircle2, Clock, PenLine } from "lucide-react"

import { requireProfile } from "@/lib/auth"
import { createClient } from "@/lib/supabase/server"
import { getBranding } from "@/lib/settings"
import { formatDate } from "@/lib/format"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { PrintButton } from "@/components/reports/print-button"

function fmtTime(value: string | null | undefined) {
  if (!value) return "--"
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return "--"
  return d.toLocaleTimeString("en-CA", { hour: "numeric", minute: "2-digit" })
}

function hoursBetween(start: string, end: string) {
  const a = new Date(start).getTime()
  const b = new Date(end).getTime()
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return 0
  return Math.round(((b - a) / 36_000) * 100) / 100
}

function onsiteHours(events: { event_type: string; happened_at: string }[]) {
  const sorted = [...events].sort((a, b) => a.happened_at.localeCompare(b.happened_at))
  let started: string | null = null
  let total = 0
  for (const event of sorted) {
    if (event.event_type === "arrived") started = event.happened_at
    if (event.event_type === "departed" && started) {
      total += hoursBetween(started, event.happened_at)
      started = null
    }
  }
  return Math.round(total * 100) / 100
}

export default async function SiteReportPrintPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requireProfile()
  const { id } = await params
  const supabase = await createClient()

  const { data: report } = await supabase
    .from("job_site_reports")
    .select("*")
    .eq("id", id)
    .maybeSingle()
  if (!report) notFound()

  const [
    { data: job },
    { data: tech },
    { data: photos },
    { data: signoffs },
    { data: events },
    { data: prepDone },
    { data: time },
    { data: mileage },
    { data: expenses },
    branding,
  ] = await Promise.all([
    supabase.from("jobs").select("*").eq("id", report.job_id).maybeSingle(),
    supabase
      .from("profiles")
      .select("id, full_name, email")
      .eq("id", report.profile_id)
      .maybeSingle(),
    supabase
      .from("job_site_photos")
      .select("*")
      .eq("site_report_id", report.id)
      .order("created_at", { ascending: true }),
    supabase
      .from("job_signoffs")
      .select("*")
      .eq("site_report_id", report.id)
      .order("signed_at", { ascending: true }),
    supabase
      .from("job_workflow_events")
      .select("*")
      .eq("site_report_id", report.id)
      .order("happened_at", { ascending: true }),
    supabase
      .from("job_prep_completions")
      .select("*")
      .eq("site_report_id", report.id),
    supabase
      .from("time_entries")
      .select("*")
      .eq("job_id", report.job_id)
      .eq("profile_id", report.profile_id)
      .eq("work_date", report.work_date),
    supabase
      .from("mileage_entries")
      .select("*")
      .eq("job_id", report.job_id)
      .eq("profile_id", report.profile_id)
      .eq("travel_date", report.work_date),
    supabase
      .from("expenses")
      .select("*")
      .eq("job_id", report.job_id)
      .eq("profile_id", report.profile_id)
      .eq("spent_date", report.work_date),
    getBranding(),
  ])
  if (!job) notFound()

  const { data: client } = job.client_id
    ? await supabase
        .from("clients")
        .select("name, address, email, phone")
        .eq("id", job.client_id)
        .maybeSingle()
    : { data: null }

  const prepIds = (prepDone ?? []).map((row) => row.prep_item_id)
  const { data: prepItems } = prepIds.length
    ? await supabase
        .from("job_prep_items")
        .select("*")
        .in("id", prepIds)
        .order("sort", { ascending: true })
    : { data: [] }

  const timeHours = (time ?? []).reduce((sum, row) => sum + Number(row.hours), 0)
  const mileageKm = (mileage ?? []).reduce((sum, row) => sum + Number(row.km), 0)
  const onsite = onsiteHours(events ?? [])
  const company = branding?.company_name ?? "Swift Electric"
  const companyDetails = [
    branding?.license_number,
    branding?.phone,
    branding?.email,
  ].filter(Boolean)

  return (
    <main className="mx-auto max-w-4xl bg-background print:max-w-none">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Button render={<Link href={`/my/jobs/${job.id}`} />} variant="ghost">
          <ArrowLeft /> Job
        </Button>
        <PrintButton />
      </div>

      <section className="rounded-lg border bg-card p-6 print:border-0 print:p-0">
        <header className="flex flex-wrap justify-between gap-4 border-b pb-5">
          <div className="flex items-start gap-3">
            {branding?.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={branding.logo_url}
                alt={company}
                className="h-12 w-auto object-contain"
              />
            ) : null}
            <div>
              <p className="text-sm font-medium text-muted-foreground">{company}</p>
              <h1 className="mt-1 text-3xl font-semibold tracking-tight">
                Site Report
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {job.job_number} - {job.title}
              </p>
              {companyDetails.length ? (
                <p className="mt-2 max-w-md text-xs text-muted-foreground">
                  {companyDetails.join(" | ")}
                </p>
              ) : null}
              {branding?.address ? (
                <p className="mt-1 text-xs text-muted-foreground">{branding.address}</p>
              ) : null}
            </div>
          </div>
          <div className="text-left text-sm sm:text-right">
            <p className="font-medium">{formatDate(report.work_date)}</p>
            <p className="text-muted-foreground">
              {tech?.full_name ?? tech?.email ?? "Technician"}
            </p>
            <Badge className="mt-2" variant={report.status === "submitted" ? "default" : "secondary"}>
              {report.status}
            </Badge>
          </div>
        </header>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <SummaryCard
            label="Client"
            value={
              <span>
                {client?.name ?? "No client"}
                {client?.phone ? (
                  <span className="block text-muted-foreground">{client.phone}</span>
                ) : null}
                {client?.email ? (
                  <span className="block text-muted-foreground">{client.email}</span>
                ) : null}
                {client?.address ? (
                  <span className="block text-muted-foreground">{client.address}</span>
                ) : null}
              </span>
            }
          />
          <SummaryCard label="Site" value={job.site_address ?? "No site address"} />
          <SummaryCard label="Onsite time" value={`${onsite || timeHours || 0} h`} />
          <SummaryCard label="Logged mileage" value={`${mileageKm || 0} km`} />
        </div>

        <section className="mt-6 grid gap-5">
          <ReportBlock title="Work performed" value={report.work_performed} />
          <ReportBlock title="Materials used" value={report.materials_summary} />
          <ReportBlock title="Issues / blockers" value={report.issues} />
          <ReportBlock title="Recommendations / follow-up" value={report.recommendations} />
        </section>

        <section className="mt-6 grid gap-4 sm:grid-cols-3">
          <MiniPanel icon={CheckCircle2} title="Prepared">
            {prepItems?.length ? (
              <ul className="space-y-1">
                {prepItems.map((item) => (
                  <li key={item.id}>{item.label}</li>
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground">No prep checklist recorded.</p>
            )}
          </MiniPanel>
          <MiniPanel icon={Clock} title="Timeline">
            {events?.length ? (
              <ul className="space-y-1">
                {events.map((event) => (
                  <li key={event.id} className="capitalize">
                    {event.event_type.replace("_", " ")} - {fmtTime(event.happened_at)}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground">No status events recorded.</p>
            )}
          </MiniPanel>
          <MiniPanel icon={PenLine} title="Sign-off">
            {signoffs?.length ? (
              <ul className="space-y-3">
                {signoffs.map((signoff) => (
                  <li key={signoff.id}>
                    <p className="font-medium">
                      {signoff.signer_name ?? "Unavailable"} ({signoff.signer_role})
                    </p>
                    {signoff.signature_image_path ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={`/api/signoff-signature/${signoff.id}`}
                        alt="Signature"
                        className="mt-2 h-16 max-w-full rounded border bg-white object-contain"
                      />
                    ) : null}
                    {signoff.comments ? (
                      <p className="mt-1 text-muted-foreground">{signoff.comments}</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground">No sign-off recorded.</p>
            )}
          </MiniPanel>
        </section>

        {expenses?.length ? (
          <section className="mt-6">
            <h2 className="mb-2 text-lg font-semibold">Parts / expenses</h2>
            <div className="divide-y rounded-lg border">
              {expenses.map((expense) => (
                <div key={expense.id} className="flex justify-between gap-3 p-3 text-sm">
                  <span>{expense.description}</span>
                  <span className="text-muted-foreground">{formatDate(expense.spent_date)}</span>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {photos?.length ? (
          <section className="mt-6">
            <div className="mb-3 flex items-center gap-2">
              <Camera className="size-5" />
              <h2 className="text-lg font-semibold">Photos</h2>
            </div>
            <div className="grid grid-cols-2 gap-3 print:grid-cols-3">
              {photos.map((photo) => (
                <figure key={photo.id} className="overflow-hidden rounded-lg border">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/api/site-photo/${photo.id}`}
                    alt={photo.caption ?? photo.label}
                    className="aspect-square w-full object-cover"
                  />
                  <figcaption className="p-2 text-xs capitalize">
                    {photo.caption || photo.label}
                  </figcaption>
                </figure>
              ))}
            </div>
          </section>
        ) : null}
      </section>
    </main>
  )
}

function SummaryCard({ label, value }: { label: string; value: ReactNode }) {
  return (
    <Card className="rounded-lg">
      <CardContent className="p-3">
        <p className="text-xs font-medium uppercase text-muted-foreground">{label}</p>
        <div className="mt-1 text-sm">{value}</div>
      </CardContent>
    </Card>
  )
}

function ReportBlock({
  title,
  value,
}: {
  title: string
  value: string | null
}) {
  return (
    <div>
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="mt-2 whitespace-pre-wrap rounded-lg border bg-muted/20 p-3 text-sm">
        {value || "-"}
      </p>
    </div>
  )
}

function MiniPanel({
  icon: Icon,
  title,
  children,
}: {
  icon: ElementType
  title: string
  children: ReactNode
}) {
  return (
    <div className="rounded-lg border p-3 text-sm">
      <div className="mb-2 flex items-center gap-2 font-medium">
        <Icon className="size-4" />
        {title}
      </div>
      {children}
    </div>
  )
}

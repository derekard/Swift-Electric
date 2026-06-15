import Link from "next/link"
import { Briefcase } from "lucide-react"

import { requireStaff } from "@/lib/auth"
import { createClient } from "@/lib/supabase/server"
import { money, formatDate } from "@/lib/format"
import { PageHeader } from "@/components/page-header"
import { EmptyState } from "@/components/empty-state"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { JobStatusBadge } from "@/components/jobs/job-status-badge"
import { AddJobDialog } from "@/components/jobs/add-job-dialog"

export default async function JobsPage() {
  await requireStaff()
  const supabase = await createClient()

  const [{ data: jobs }, { data: costs }, { data: clients }] =
    await Promise.all([
      supabase.from("jobs").select("*").order("created_at", { ascending: false }),
      supabase.from("job_costs").select("*"),
      supabase.from("clients").select("id, name"),
    ])

  const marginByJob = new Map((costs ?? []).map((c) => [c.job_id, c]))
  const clientById = new Map((clients ?? []).map((c) => [c.id, c.name]))

  return (
    <>
      <PageHeader
        title="Jobs"
        description="Scheduled and active work, crew and costs."
        action={<AddJobDialog clients={clients ?? []} />}
      />
      {(jobs ?? []).length === 0 ? (
        <EmptyState
          icon={Briefcase}
          title="No jobs yet"
          description="Accept a quote to create a job and a draft invoice."
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Job</TableHead>
                <TableHead>Client</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Scheduled</TableHead>
                <TableHead className="text-right">Revenue</TableHead>
                <TableHead className="text-right">Margin</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(jobs ?? []).map((j) => {
                const c = marginByJob.get(j.id)
                return (
                  <TableRow key={j.id}>
                    <TableCell className="font-medium">
                      <Link href={`/jobs/${j.id}`} className="hover:underline">
                        {j.job_number}
                      </Link>
                      <div className="text-xs text-muted-foreground">
                        {j.title}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {j.client_id ? (clientById.get(j.client_id) ?? "—") : "—"}
                    </TableCell>
                    <TableCell>
                      <JobStatusBadge status={j.status} />
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDate(j.scheduled_start)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {money(c?.revenue ?? 0)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {money(c?.margin ?? 0)}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  )
}

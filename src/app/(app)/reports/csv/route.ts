import { requireStaff } from "@/lib/auth"
import { createClient } from "@/lib/supabase/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const METHOD_LABELS: Record<string, string> = {
  cash: "Cash",
  cheque: "Cheque",
  e_transfer: "E-transfer",
  card: "Card",
  other: "Other",
}

function csvCell(v: string | number | null): string {
  const s = v === null || v === undefined ? "" : String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export async function GET(request: Request) {
  await requireStaff()
  const supabase = await createClient()

  const year =
    Number(new URL(request.url).searchParams.get("year")) ||
    new Date().getFullYear()

  const [{ data: invoices }, { data: clients }] = await Promise.all([
    supabase
      .from("invoices")
      .select(
        "invoice_number, client_id, status, issued_date, paid_date, amount_pretax, hst_amount, total, payment_method"
      )
      .order("paid_date", { ascending: true }),
    supabase.from("clients").select("id, name"),
  ])
  const clientById = new Map((clients ?? []).map((c) => [c.id, c.name]))

  const paid = (invoices ?? []).filter(
    (i) => i.status === "paid" && i.paid_date?.startsWith(String(year))
  )

  const header = [
    "Invoice",
    "Client",
    "Issued",
    "Paid",
    "Payment method",
    "Pre-tax",
    "HST",
    "Total",
  ]
  const rows = paid.map((i) => [
    i.invoice_number,
    i.client_id ? (clientById.get(i.client_id) ?? "") : "",
    i.issued_date ?? "",
    i.paid_date ?? "",
    i.payment_method ? (METHOD_LABELS[i.payment_method] ?? "") : "",
    Number(i.amount_pretax).toFixed(2),
    Number(i.hst_amount).toFixed(2),
    Number(i.total).toFixed(2),
  ])

  // Totals row
  const sum = (k: "amount_pretax" | "hst_amount" | "total") =>
    paid.reduce((s, i) => s + Number(i[k]), 0).toFixed(2)
  rows.push([])
  rows.push(["TOTALS", "", "", "", "", sum("amount_pretax"), sum("hst_amount"), sum("total")])

  const csv = [header, ...rows]
    .map((r) => r.map(csvCell).join(","))
    .join("\n")

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="income-${year}.csv"`,
      "Cache-Control": "no-store",
    },
  })
}

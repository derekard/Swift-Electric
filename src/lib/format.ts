const CAD = new Intl.NumberFormat("en-CA", {
  style: "currency",
  currency: "CAD",
})

/** "$1,234.50" */
export function money(value: number | string | null | undefined): string {
  const n = typeof value === "string" ? Number(value) : (value ?? 0)
  return CAD.format(Number.isFinite(n) ? n : 0)
}

/** "10%" / "5.5%" — trims trailing zeros. */
export function pct(value: number | string | null | undefined): string {
  const n = typeof value === "string" ? Number(value) : (value ?? 0)
  return `${parseFloat((Number.isFinite(n) ? n : 0).toFixed(3))}%`
}

/** Round to 2 decimals (matches Postgres round(x, 2)). */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

/** "Jun 13, 2026" */
export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return "—"
  const d = typeof value === "string" ? new Date(value) : value
  if (Number.isNaN(d.getTime())) return "—"
  return d.toLocaleDateString("en-CA", {
    year: "numeric",
    month: "short",
    day: "numeric",
  })
}

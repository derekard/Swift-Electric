/**
 * Database types — hand-maintained to match supabase/migrations/0001_init.sql.
 * Regenerate later with: npx supabase gen types typescript --linked
 *
 * NOTE: these are `type` aliases, not `interface`s, on purpose — Supabase's
 * GenericTable requires `Row extends Record<string, unknown>`, and interfaces
 * are not assignable to that (they'd degrade Insert/Update to `never`).
 */

export type Role = "admin" | "office" | "tech"
export type TenantStatus = "active" | "suspended"
export type QuoteStatus = "draft" | "sent" | "accepted" | "declined"
export type JobStatus = "scheduled" | "in_progress" | "complete" | "cancelled"
export type InvoiceStatus = "draft" | "sent" | "paid" | "void"
export type PaymentMethod = "cash" | "cheque" | "e_transfer" | "card" | "other"
export type EntryStatus = "draft" | "submitted" | "approved" | "rejected"

type Timestamps = { created_at: string }
type Tenanted = { tenant_id: string }

export type Tenant = {
  id: string
  name: string
  slug: string
  custom_domain: string | null
  status: TenantStatus
  plan: string
  subscription_status: string | null
  created_at: string
}

export type Profile = Timestamps & {
  id: string
  tenant_id: string | null
  email: string
  full_name: string | null
  role: Role
  is_platform_admin: boolean
  hourly_wage: number
  active: boolean
  updated_at: string
}

export type Allowlist = {
  email: string
  tenant_id: string | null
  role: Role
  full_name: string | null
  hourly_wage: number
  is_platform_admin: boolean
  invited_at: string
}

export type TenantSettings = {
  tenant_id: string
  company_name: string
  owner_name: string | null
  license_number: string | null
  address: string | null
  phone: string | null
  email: string | null
  logo_url: string | null
  brand_color: string
  hst_rate: number
  jic_pct: number
  admin_pct: number
  small_parts_pct: number
  permit_fee: number
  mileage_rate: number
  net_days: number
  quote_intro: string
  show_hst_line: boolean
  updated_at: string
}

export type PriceBookItem = Timestamps & Tenanted & {
  id: string
  name: string
  unit_price: number
  category: string | null
  sort: number
  active: boolean
}

export type Client = Timestamps & Tenanted & {
  id: string
  name: string
  email: string | null
  phone: string | null
  address: string | null
  notes: string | null
  created_by: string | null
  updated_at: string
}

export type Quote = Timestamps & Tenanted & {
  id: string
  quote_number: string
  client_id: string | null
  site_address: string | null
  status: QuoteStatus
  intro: string | null
  notes: string | null
  jic_pct: number
  admin_pct: number
  small_parts_pct: number
  permit_fee: number
  hst_rate: number
  show_hst_line: boolean
  created_by: string | null
  share_token: string
  accepted_name: string | null
  updated_at: string
  sent_at: string | null
  accepted_at: string | null
}

export type QuoteArea = Tenanted & {
  id: string
  quote_id: string
  name: string
  sort: number
}

export type QuoteLine = Tenanted & {
  id: string
  area_id: string
  price_book_item_id: string | null
  description: string
  qty: number
  unit_price: number
  line_total: number
  sort: number
}

export type QuoteTotals = {
  quote_id: string
  items_subtotal: number
  jic_amount: number
  admin_amount: number
  small_parts_amount: number
  permit_amount: number
  amount_pretax: number
  hst_amount: number
  total: number
}

export type Job = Timestamps & Tenanted & {
  id: string
  job_number: string
  quote_id: string | null
  client_id: string | null
  title: string
  status: JobStatus
  site_address: string | null
  scheduled_start: string | null
  scheduled_end: string | null
  notes: string | null
  created_by: string | null
  updated_at: string
}

export type JobAssignment = Tenanted & {
  job_id: string
  profile_id: string
}

export type Invoice = Timestamps & Tenanted & {
  id: string
  invoice_number: string
  job_id: string | null
  quote_id: string | null
  client_id: string | null
  status: InvoiceStatus
  issued_date: string | null
  due_date: string | null
  paid_date: string | null
  items_subtotal: number
  jic_amount: number
  admin_amount: number
  small_parts_amount: number
  permit_amount: number
  amount_pretax: number
  hst_amount: number
  total: number
  notes: string | null
  payment_method: PaymentMethod | null
  last_reminder_at: string | null
  reminder_count: number
  created_by: string | null
  updated_at: string
}

export type TimeEntry = Timestamps & Tenanted & {
  id: string
  profile_id: string
  job_id: string
  work_date: string
  hours: number
  notes: string | null
  status: EntryStatus
  approved_by: string | null
  approved_at: string | null
}

export type MileageEntry = Timestamps & Tenanted & {
  id: string
  profile_id: string
  job_id: string
  travel_date: string
  km: number
  notes: string | null
  status: EntryStatus
  approved_by: string | null
  approved_at: string | null
}

export type Expense = Timestamps & Tenanted & {
  id: string
  job_id: string
  profile_id: string | null
  description: string
  amount: number
  receipt_url: string | null
  spent_date: string | null
}

export type JobCosts = {
  job_id: string
  labor_hours: number
  labor_cost: number
  mileage_km: number
  mileage_cost: number
  parts_cost: number
  revenue: number
  margin: number
}

/** Generic table shape for the typed Supabase client. */
type Table<Row, Insert = Partial<Row>, Update = Partial<Row>> = {
  Row: Row
  Insert: Insert
  Update: Update
  Relationships: []
}

type View<Row> = {
  Row: Row
  Relationships: []
}

export type Database = {
  public: {
    Tables: {
      tenants: Table<Tenant>
      profiles: Table<Profile>
      allowlist: Table<Allowlist>
      tenant_settings: Table<TenantSettings>
      price_book_items: Table<PriceBookItem>
      clients: Table<Client>
      quotes: Table<Quote>
      quote_areas: Table<QuoteArea>
      quote_lines: Table<QuoteLine>
      jobs: Table<Job>
      job_assignments: Table<JobAssignment>
      invoices: Table<Invoice>
      time_entries: Table<TimeEntry>
      mileage_entries: Table<MileageEntry>
      expenses: Table<Expense>
    }
    Views: {
      quote_totals: View<QuoteTotals>
      job_costs: View<JobCosts>
    }
    Functions: {
      current_tenant_id: { Args: Record<string, never>; Returns: string }
      is_platform_admin: { Args: Record<string, never>; Returns: boolean }
      is_admin: { Args: Record<string, never>; Returns: boolean }
      is_staff: { Args: Record<string, never>; Returns: boolean }
    }
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}

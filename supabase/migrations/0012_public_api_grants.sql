-- ============================================================================
-- Explicit Data API grants for Supabase projects where new public objects are
-- not auto-exposed. These grants only make the objects reachable to PostgREST;
-- the existing RLS policies still decide which rows each user can read/write.
--
-- Assumptions:
-- - Browser/app users access tenant data as `authenticated`.
-- - Server-only routes that need cross-tenant or public-link access use the
--   `service_role` key.
-- - Anonymous visitors do not need direct table/view access; public pages use
--   server-side code or Supabase Auth endpoints instead.
-- ============================================================================

grant usage on schema public to anon, authenticated, service_role;

-- Keep unauthenticated Data API access closed for the app-owned public schema.
revoke all on table
  public.tenants,
  public.profiles,
  public.allowlist,
  public.tenant_settings,
  public.price_book_items,
  public.clients,
  public.quotes,
  public.quote_areas,
  public.quote_lines,
  public.jobs,
  public.job_assignments,
  public.job_visits,
  public.invoices,
  public.time_entries,
  public.mileage_entries,
  public.expenses,
  public.quote_totals,
  public.job_costs
from anon, PUBLIC;

grant select, insert, update, delete on table
  public.tenants,
  public.profiles,
  public.allowlist,
  public.tenant_settings,
  public.price_book_items,
  public.clients,
  public.quotes,
  public.quote_areas,
  public.quote_lines,
  public.jobs,
  public.job_assignments,
  public.job_visits,
  public.invoices,
  public.time_entries,
  public.mileage_entries,
  public.expenses
to authenticated, service_role;

grant select on table
  public.quote_totals,
  public.job_costs
to authenticated, service_role;

revoke all on sequence
  public.quote_seq,
  public.job_seq,
  public.invoice_seq
from anon, PUBLIC;

grant usage, select on sequence
  public.quote_seq,
  public.job_seq,
  public.invoice_seq
to authenticated, service_role;

-- RLS policies call these context helpers; the two RPC helpers are used by app
-- code. Trigger-only/internal functions are intentionally not exposed here.
revoke execute on function public.current_tenant_id() from anon, PUBLIC;
revoke execute on function public.is_platform_admin() from anon, PUBLIC;
revoke execute on function public.is_admin() from anon, PUBLIC;
revoke execute on function public.is_staff() from anon, PUBLIC;
revoke execute on function public.is_active_user() from anon, PUBLIC;
revoke execute on function public.tenant_branding() from anon, PUBLIC;
revoke execute on function public.update_my_home_address(text) from anon, PUBLIC;

grant execute on function public.current_tenant_id() to authenticated, service_role;
grant execute on function public.is_platform_admin() to authenticated, service_role;
grant execute on function public.is_admin() to authenticated, service_role;
grant execute on function public.is_staff() to authenticated, service_role;
grant execute on function public.is_active_user() to authenticated, service_role;
grant execute on function public.tenant_branding() to authenticated, service_role;
grant execute on function public.update_my_home_address(text) to authenticated, service_role;

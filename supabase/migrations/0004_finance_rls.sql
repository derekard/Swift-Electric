-- Harden financial data against technicians at the DATABASE level (not just UI).
-- Run in the Supabase SQL editor (live DB).

-- 1) Wages: a tech may read ONLY their own profile; staff/admin read the team
--    (needed for crew assignment). Closes the hourly_wage leak.
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select
  using (
    id = auth.uid()
    or public.is_platform_admin()
    or (tenant_id = public.current_tenant_id() and public.is_staff())
  );

-- 2) Price book (selling prices): staff only.
drop policy if exists pricebook_select on public.price_book_items;
create policy pricebook_select on public.price_book_items for select
  using (
    public.is_platform_admin()
    or (tenant_id = public.current_tenant_id() and public.is_staff())
  );

-- 3) Company settings: the fee/markup %s are sensitive, but everyone needs the
--    branding (logo/colour/name) + mileage rate. So restrict the table to staff
--    and expose ONLY the non-financial columns to all members via a function.
drop policy if exists settings_select on public.tenant_settings;
create policy settings_select on public.tenant_settings for select
  using (
    public.is_platform_admin()
    or (tenant_id = public.current_tenant_id() and public.is_staff())
  );

create or replace function public.tenant_branding()
returns table (
  company_name   text,
  owner_name     text,
  license_number text,
  address        text,
  phone          text,
  email          text,
  logo_url       text,
  brand_color    text,
  hst_rate       numeric,
  mileage_rate   numeric,
  net_days       integer,
  quote_intro    text,
  show_hst_line  boolean
)
language sql security definer stable set search_path = public as $$
  select company_name, owner_name, license_number, address, phone, email,
         logo_url, brand_color, hst_rate, mileage_rate, net_days,
         quote_intro, show_hst_line
  from public.tenant_settings
  where tenant_id = public.current_tenant_id();
$$;

grant execute on function public.tenant_branding() to authenticated;

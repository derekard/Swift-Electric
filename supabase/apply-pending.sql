-- ============================================================================
-- Swift Electric — apply all pending DB changes (migrations 0002–0005).
-- Safe to run on the live database, and safe to re-run (idempotent).
-- HOW: Supabase dashboard → SQL Editor → New query → paste this whole file → Run.
-- This adds the columns the app needs (payment method, wages, Time & Materials,
-- mileage home address) and the finance-privacy rules. Fixes the
-- "could not find the 'tm_labor_rate' column" error on Start quote.
-- ============================================================================

-- 0002 — invoice payment method ----------------------------------------------
alter table public.invoices
  add column if not exists payment_method text
    check (payment_method in ('cash', 'cheque', 'e_transfer', 'card', 'other'));

-- 0003 — wage at invite, carried to profile on first login -------------------
alter table public.allowlist
  add column if not exists hourly_wage numeric(10, 2) not null default 0;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  allow public.allowlist%rowtype;
begin
  select * into allow from public.allowlist where lower(email) = lower(new.email);

  insert into public.profiles
    (id, tenant_id, email, full_name, role, hourly_wage, is_platform_admin, active)
  values (
    new.id,
    allow.tenant_id,
    new.email,
    coalesce(allow.full_name,
             new.raw_user_meta_data ->> 'full_name',
             new.raw_user_meta_data ->> 'name'),
    coalesce(allow.role, 'tech'),
    coalesce(allow.hourly_wage, 0),
    coalesce(allow.is_platform_admin, false),
    allow.email is not null
  );
  return new;
end;
$$;

-- 0004 — keep financials out of technicians' reach ---------------------------
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select
  using (
    id = auth.uid()
    or public.is_platform_admin()
    or (tenant_id = public.current_tenant_id() and public.is_staff())
  );

drop policy if exists pricebook_select on public.price_book_items;
create policy pricebook_select on public.price_book_items for select
  using (
    public.is_platform_admin()
    or (tenant_id = public.current_tenant_id() and public.is_staff())
  );

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

-- 0005 — mileage home address + Time & Materials -----------------------------
alter table public.profiles
  add column if not exists home_address text;

create or replace function public.update_my_home_address(addr text)
returns void language sql security definer set search_path = public as $$
  update public.profiles set home_address = nullif(btrim(addr), '') where id = auth.uid();
$$;
grant execute on function public.update_my_home_address(text) to authenticated;

alter table public.tenant_settings
  add column if not exists tm_labor_rate numeric(10, 2) not null default 0,
  add column if not exists tm_materials_markup_pct numeric(6, 3) not null default 0;

alter table public.quotes
  add column if not exists billing_type text not null default 'fixed'
    check (billing_type in ('fixed', 'tm')),
  add column if not exists tm_labor_rate numeric(10, 2),
  add column if not exists tm_materials_markup_pct numeric(6, 3);

alter table public.jobs
  add column if not exists billing_type text not null default 'fixed'
    check (billing_type in ('fixed', 'tm')),
  add column if not exists tm_labor_rate numeric(10, 2),
  add column if not exists tm_materials_markup_pct numeric(6, 3);

alter table public.invoices
  add column if not exists billing_type text not null default 'fixed'
    check (billing_type in ('fixed', 'tm')),
  add column if not exists labor_amount numeric(14, 2) not null default 0,
  add column if not exists materials_amount numeric(14, 2) not null default 0;

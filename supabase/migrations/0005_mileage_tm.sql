-- Mileage auto-calc (home address) + Time & Materials billing.
-- Run in the Supabase SQL editor (live DB).

-- ---- Mileage: each tech's home address (origin for home→site→home) ----------
alter table public.profiles
  add column if not exists home_address text;

-- Let a user set ONLY their own home address (profiles_update is admin-only).
create or replace function public.update_my_home_address(addr text)
returns void language sql security definer set search_path = public as $$
  update public.profiles set home_address = nullif(btrim(addr), '') where id = auth.uid();
$$;
grant execute on function public.update_my_home_address(text) to authenticated;

-- ---- Time & Materials --------------------------------------------------------
-- Company defaults (staff-only, since tenant_settings is staff-read).
alter table public.tenant_settings
  add column if not exists tm_labor_rate numeric(10, 2) not null default 0,
  add column if not exists tm_materials_markup_pct numeric(6, 3) not null default 0;

-- A quote / job can be fixed-price (default) or time & materials.
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

-- Invoices: label the breakdown + store T&M labour/materials amounts.
alter table public.invoices
  add column if not exists billing_type text not null default 'fixed'
    check (billing_type in ('fixed', 'tm')),
  add column if not exists labor_amount numeric(14, 2) not null default 0,
  add column if not exists materials_amount numeric(14, 2) not null default 0;

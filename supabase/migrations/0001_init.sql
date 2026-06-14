-- Swift Electric — multi-tenant schema
-- One shared database; every company is a "tenant". Data is isolated by
-- tenant_id + RLS. Roles per tenant: admin | office | tech. A platform admin
-- (is_platform_admin) sits above all tenants to onboard/manage companies.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Shared helpers
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Tenants (companies)
-- ---------------------------------------------------------------------------
create table public.tenants (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null,
  slug                text unique not null,           -- <slug>.<APP_DOMAIN> subdomain
  custom_domain       text unique,                    -- optional vanity domain (theircompany.ca)
  status              text not null default 'active' check (status in ('active', 'suspended')),
  plan                text not null default 'trial',  -- placeholder for future billing
  subscription_status text,                            -- placeholder for future billing
  created_at          timestamptz not null default now()
);
-- Host→tenant branding lookup for the anonymous login page is done server-side
-- with the service-role client (see src/lib/tenant.ts), so no anon RLS needed.

-- ---------------------------------------------------------------------------
-- Identity: profiles + invite allowlist
-- ---------------------------------------------------------------------------
create table public.profiles (
  id                uuid primary key references auth.users (id) on delete cascade,
  tenant_id         uuid references public.tenants (id) on delete cascade,  -- null for platform admins
  email             text not null,
  full_name         text,
  role              text not null default 'tech' check (role in ('admin', 'office', 'tech')),
  is_platform_admin boolean not null default false,
  hourly_wage       numeric(10, 2) not null default 0,
  active            boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index on public.profiles (tenant_id);

-- Emails invited to a tenant (or platform). First Google login provisions a profile.
create table public.allowlist (
  email             text primary key,
  tenant_id         uuid references public.tenants (id) on delete cascade,
  role              text not null default 'tech' check (role in ('admin', 'office', 'tech')),
  full_name         text,
  is_platform_admin boolean not null default false,
  invited_at        timestamptz not null default now()
);

-- Role / tenant helpers (security definer => bypass RLS, no policy recursion).
create or replace function public.current_tenant_id()
returns uuid language sql security definer stable set search_path = public as $$
  select tenant_id from public.profiles where id = auth.uid();
$$;

create or replace function public.is_platform_admin()
returns boolean language sql security definer stable set search_path = public as $$
  select coalesce(
    (select is_platform_admin from public.profiles where id = auth.uid() and active),
    false
  );
$$;

create or replace function public.is_admin()
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and active and role = 'admin' and tenant_id is not null
  );
$$;

create or replace function public.is_staff()
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and active and role in ('admin', 'office') and tenant_id is not null
  );
$$;

create or replace function public.is_active_user()
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and active);
$$;

-- Provision a profile on first login, honouring the allowlist.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  allow public.allowlist%rowtype;
begin
  select * into allow from public.allowlist where lower(email) = lower(new.email);

  insert into public.profiles (id, tenant_id, email, full_name, role, is_platform_admin, active)
  values (
    new.id,
    allow.tenant_id,
    new.email,
    coalesce(allow.full_name,
             new.raw_user_meta_data ->> 'full_name',
             new.raw_user_meta_data ->> 'name'),
    coalesce(allow.role, 'tech'),
    coalesce(allow.is_platform_admin, false),
    allow.email is not null              -- only allowlisted users start active
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Stamp tenant_id from the caller on insert (so app code rarely sets it).
create or replace function public.set_tenant_id()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.tenant_id is null then
    new.tenant_id := public.current_tenant_id();
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Per-tenant settings + price book
-- ---------------------------------------------------------------------------
create table public.tenant_settings (
  tenant_id        uuid primary key references public.tenants (id) on delete cascade,
  company_name     text not null default 'Swift Electric',
  owner_name       text,
  license_number   text,                                  -- ECRA/ESA #
  address          text,
  phone            text,
  email            text,
  logo_url         text,
  brand_color      text not null default '#C49A2C',       -- per-tenant accent
  hst_rate         numeric(6, 3) not null default 13,
  jic_pct          numeric(6, 3) not null default 10,
  admin_pct        numeric(6, 3) not null default 10,
  small_parts_pct  numeric(6, 3) not null default 3,
  permit_fee       numeric(12, 2) not null default 200,
  mileage_rate     numeric(8, 3) not null default 0.70,
  net_days         int not null default 15,               -- invoice payment terms
  quote_intro      text not null default
    'I am pleased to submit an estimate for the following electrical work',
  show_hst_line    boolean not null default false,
  updated_at       timestamptz not null default now()
);

create table public.price_book_items (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants (id) on delete cascade,
  name       text not null,
  unit_price numeric(12, 2) not null default 0,
  category   text,
  sort       int not null default 0,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);
create index on public.price_book_items (tenant_id);

-- ---------------------------------------------------------------------------
-- Clients
-- ---------------------------------------------------------------------------
create table public.clients (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants (id) on delete cascade,
  name       text not null,
  email      text,
  phone      text,
  address    text,
  notes      text,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.clients (tenant_id);

-- ---------------------------------------------------------------------------
-- Quotes + areas + lines
-- ---------------------------------------------------------------------------
create sequence if not exists public.quote_seq start 1001;
create sequence if not exists public.job_seq start 1001;
create sequence if not exists public.invoice_seq start 1001;

create table public.quotes (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants (id) on delete cascade,
  quote_number    text not null unique default ('Q-' || nextval('public.quote_seq')),
  client_id       uuid references public.clients (id),
  site_address    text,
  status          text not null default 'draft'
                    check (status in ('draft', 'sent', 'accepted', 'declined')),
  intro           text,
  notes           text,
  jic_pct         numeric(6, 3) not null default 10,
  admin_pct       numeric(6, 3) not null default 10,
  small_parts_pct numeric(6, 3) not null default 3,
  permit_fee      numeric(12, 2) not null default 200,
  hst_rate        numeric(6, 3) not null default 13,
  show_hst_line   boolean not null default false,
  created_by      uuid references public.profiles (id),
  share_token     uuid not null unique default gen_random_uuid(),  -- public accept link
  accepted_name   text,                                            -- typed e-signature
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  sent_at         timestamptz,
  accepted_at     timestamptz
);
create index on public.quotes (tenant_id);
create index on public.quotes (share_token);

create table public.quote_areas (
  id        uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  quote_id  uuid not null references public.quotes (id) on delete cascade,
  name      text not null,
  sort      int not null default 0
);
create index on public.quote_areas (quote_id);

create table public.quote_lines (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references public.tenants (id) on delete cascade,
  area_id            uuid not null references public.quote_areas (id) on delete cascade,
  price_book_item_id uuid references public.price_book_items (id),
  description        text not null,
  qty                numeric(10, 2) not null default 1,
  unit_price         numeric(12, 2) not null default 0,
  line_total         numeric(14, 2) generated always as (round(qty * unit_price, 2)) stored,
  sort               int not null default 0
);
create index on public.quote_lines (area_id);

-- ---------------------------------------------------------------------------
-- Jobs + assignments
-- ---------------------------------------------------------------------------
create table public.jobs (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants (id) on delete cascade,
  job_number      text not null unique default ('JOB-' || nextval('public.job_seq')),
  quote_id        uuid references public.quotes (id),
  client_id       uuid references public.clients (id),
  title           text not null,
  status          text not null default 'scheduled'
                    check (status in ('scheduled', 'in_progress', 'complete', 'cancelled')),
  site_address    text,
  scheduled_start date,
  scheduled_end   date,
  notes           text,
  created_by      uuid references public.profiles (id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index on public.jobs (tenant_id);

create table public.job_assignments (
  tenant_id  uuid not null references public.tenants (id) on delete cascade,
  job_id     uuid not null references public.jobs (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  primary key (job_id, profile_id)
);

-- ---------------------------------------------------------------------------
-- Invoices (totals snapshotted; Net-N terms + reminder tracking)
-- ---------------------------------------------------------------------------
create table public.invoices (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references public.tenants (id) on delete cascade,
  invoice_number     text not null unique default ('INV-' || nextval('public.invoice_seq')),
  job_id             uuid references public.jobs (id),
  quote_id           uuid references public.quotes (id),
  client_id          uuid references public.clients (id),
  status             text not null default 'draft'
                       check (status in ('draft', 'sent', 'paid', 'void')),
  issued_date        date,
  due_date           date,
  paid_date          date,
  items_subtotal     numeric(14, 2) not null default 0,
  jic_amount         numeric(14, 2) not null default 0,
  admin_amount       numeric(14, 2) not null default 0,
  small_parts_amount numeric(14, 2) not null default 0,
  permit_amount      numeric(14, 2) not null default 0,
  amount_pretax      numeric(14, 2) not null default 0,
  hst_amount         numeric(14, 2) not null default 0,
  total              numeric(14, 2) not null default 0,
  notes              text,
  last_reminder_at   timestamptz,
  reminder_count     int not null default 0,
  created_by         uuid references public.profiles (id),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index on public.invoices (tenant_id);

-- ---------------------------------------------------------------------------
-- Team: time, mileage, expenses
-- ---------------------------------------------------------------------------
create table public.time_entries (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants (id) on delete cascade,
  profile_id  uuid not null references public.profiles (id),
  job_id      uuid not null references public.jobs (id),
  work_date   date not null,
  hours       numeric(6, 2) not null check (hours > 0),
  notes       text,
  status      text not null default 'draft'
                check (status in ('draft', 'submitted', 'approved', 'rejected')),
  approved_by uuid references public.profiles (id),
  approved_at timestamptz,
  created_at  timestamptz not null default now()
);

create table public.mileage_entries (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants (id) on delete cascade,
  profile_id  uuid not null references public.profiles (id),
  job_id      uuid not null references public.jobs (id),
  travel_date date not null,
  km          numeric(8, 2) not null check (km > 0),
  notes       text,
  status      text not null default 'draft'
                check (status in ('draft', 'submitted', 'approved', 'rejected')),
  approved_by uuid references public.profiles (id),
  approved_at timestamptz,
  created_at  timestamptz not null default now()
);

create table public.expenses (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants (id) on delete cascade,
  job_id      uuid not null references public.jobs (id),
  profile_id  uuid references public.profiles (id),
  description text not null,
  amount      numeric(12, 2) not null check (amount >= 0),
  receipt_url text,
  spent_date  date,
  created_at  timestamptz not null default now()
);

create index on public.time_entries (profile_id);
create index on public.time_entries (job_id);
create index on public.mileage_entries (profile_id);
create index on public.mileage_entries (job_id);
create index on public.expenses (job_id);

-- ---------------------------------------------------------------------------
-- tenant_id auto-stamp (BEFORE INSERT) on every tenant-scoped data table
-- ---------------------------------------------------------------------------
create trigger trg_pricebook_tenant  before insert on public.price_book_items for each row execute function public.set_tenant_id();
create trigger trg_clients_tenant     before insert on public.clients         for each row execute function public.set_tenant_id();
create trigger trg_quotes_tenant      before insert on public.quotes          for each row execute function public.set_tenant_id();
create trigger trg_areas_tenant       before insert on public.quote_areas     for each row execute function public.set_tenant_id();
create trigger trg_lines_tenant       before insert on public.quote_lines     for each row execute function public.set_tenant_id();
create trigger trg_jobs_tenant        before insert on public.jobs            for each row execute function public.set_tenant_id();
create trigger trg_assign_tenant      before insert on public.job_assignments for each row execute function public.set_tenant_id();
create trigger trg_invoices_tenant    before insert on public.invoices        for each row execute function public.set_tenant_id();
create trigger trg_time_tenant        before insert on public.time_entries    for each row execute function public.set_tenant_id();
create trigger trg_mileage_tenant     before insert on public.mileage_entries for each row execute function public.set_tenant_id();
create trigger trg_expenses_tenant    before insert on public.expenses        for each row execute function public.set_tenant_id();

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
create trigger trg_profiles_updated before update on public.profiles        for each row execute function public.set_updated_at();
create trigger trg_settings_updated before update on public.tenant_settings for each row execute function public.set_updated_at();
create trigger trg_clients_updated  before update on public.clients         for each row execute function public.set_updated_at();
create trigger trg_quotes_updated   before update on public.quotes          for each row execute function public.set_updated_at();
create trigger trg_jobs_updated     before update on public.jobs            for each row execute function public.set_updated_at();
create trigger trg_invoices_updated before update on public.invoices        for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Reporting views (security_invoker => respect caller RLS / tenant scoping)
-- ---------------------------------------------------------------------------
create view public.quote_totals with (security_invoker = true) as
with line_sums as (
  select qa.quote_id, coalesce(sum(ql.line_total), 0) as items_subtotal
  from public.quote_areas qa
  left join public.quote_lines ql on ql.area_id = qa.id
  group by qa.quote_id
),
fees as (
  select
    q.id as quote_id,
    coalesce(ls.items_subtotal, 0) as items_subtotal,
    round(coalesce(ls.items_subtotal, 0) * q.jic_pct / 100, 2) as jic_amount,
    round(coalesce(ls.items_subtotal, 0) * q.admin_pct / 100, 2) as admin_amount,
    round(coalesce(ls.items_subtotal, 0) * q.small_parts_pct / 100, 2) as small_parts_amount,
    q.permit_fee as permit_amount,
    q.hst_rate
  from public.quotes q
  left join line_sums ls on ls.quote_id = q.id
)
select
  quote_id,
  items_subtotal,
  jic_amount,
  admin_amount,
  small_parts_amount,
  permit_amount,
  (items_subtotal + jic_amount + admin_amount + small_parts_amount + permit_amount) as amount_pretax,
  round((items_subtotal + jic_amount + admin_amount + small_parts_amount + permit_amount) * hst_rate / 100, 2) as hst_amount,
  (items_subtotal + jic_amount + admin_amount + small_parts_amount + permit_amount)
    + round((items_subtotal + jic_amount + admin_amount + small_parts_amount + permit_amount) * hst_rate / 100, 2) as total
from fees;

create view public.job_costs with (security_invoker = true) as
with labor as (
  select te.job_id, sum(te.hours) as hours, sum(te.hours * p.hourly_wage) as cost
  from public.time_entries te
  join public.profiles p on p.id = te.profile_id
  where te.status <> 'rejected'
  group by te.job_id
),
miles as (
  select job_id, sum(km) as km
  from public.mileage_entries
  where status <> 'rejected'
  group by job_id
),
parts as (
  select job_id, sum(amount) as amt from public.expenses group by job_id
),
rev as (
  select job_id, sum(amount_pretax) as pretax
  from public.invoices
  where status <> 'void'
  group by job_id
)
select
  j.id as job_id,
  coalesce(l.hours, 0) as labor_hours,
  coalesce(l.cost, 0) as labor_cost,
  coalesce(m.km, 0) as mileage_km,
  round(coalesce(m.km, 0) * coalesce(s.mileage_rate, 0), 2) as mileage_cost,
  coalesce(pt.amt, 0) as parts_cost,
  coalesce(r.pretax, 0) as revenue,
  coalesce(r.pretax, 0)
    - (coalesce(l.cost, 0) + round(coalesce(m.km, 0) * coalesce(s.mileage_rate, 0), 2) + coalesce(pt.amt, 0)) as margin
from public.jobs j
left join public.tenant_settings s on s.tenant_id = j.tenant_id
left join labor l on l.job_id = j.id
left join miles m on m.job_id = j.id
left join parts pt on pt.job_id = j.id
left join rev r on r.job_id = j.id;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.tenants          enable row level security;
alter table public.profiles         enable row level security;
alter table public.allowlist        enable row level security;
alter table public.tenant_settings  enable row level security;
alter table public.price_book_items enable row level security;
alter table public.clients          enable row level security;
alter table public.quotes           enable row level security;
alter table public.quote_areas      enable row level security;
alter table public.quote_lines      enable row level security;
alter table public.jobs             enable row level security;
alter table public.job_assignments  enable row level security;
alter table public.invoices         enable row level security;
alter table public.time_entries     enable row level security;
alter table public.mileage_entries  enable row level security;
alter table public.expenses         enable row level security;

-- tenants: platform admin manages; members read their own
create policy tenants_select on public.tenants for select
  using (public.is_platform_admin() or id = public.current_tenant_id());
create policy tenants_write on public.tenants for all
  using (public.is_platform_admin()) with check (public.is_platform_admin());

-- profiles: self + teammates read; admin (or platform) writes
create policy profiles_select on public.profiles for select
  using (
    id = auth.uid()
    or public.is_platform_admin()
    or (tenant_id is not null and tenant_id = public.current_tenant_id())
  );
create policy profiles_insert on public.profiles for insert
  with check (public.is_platform_admin());
create policy profiles_update on public.profiles for update
  using (public.is_platform_admin() or (tenant_id = public.current_tenant_id() and public.is_admin()))
  with check (public.is_platform_admin() or (tenant_id = public.current_tenant_id() and public.is_admin()));

-- allowlist: platform admin, or a tenant admin for their tenant
create policy allowlist_all on public.allowlist for all
  using (public.is_platform_admin() or (tenant_id = public.current_tenant_id() and public.is_admin()))
  with check (public.is_platform_admin() or (tenant_id = public.current_tenant_id() and public.is_admin()));

-- tenant_settings: members read; admin writes
create policy settings_select on public.tenant_settings for select
  using (public.is_platform_admin() or tenant_id = public.current_tenant_id());
create policy settings_insert on public.tenant_settings for insert
  with check (public.is_platform_admin());
create policy settings_update on public.tenant_settings for update
  using (public.is_platform_admin() or (tenant_id = public.current_tenant_id() and public.is_admin()))
  with check (public.is_platform_admin() or (tenant_id = public.current_tenant_id() and public.is_admin()));

-- Generic tenant-scoped helpers used below:
--   read  = platform OR same tenant
--   staff = platform OR (same tenant AND is_staff())
--   admin = platform OR (same tenant AND is_admin())

-- price book: members read, admin writes
create policy pricebook_select on public.price_book_items for select
  using (public.is_platform_admin() or tenant_id = public.current_tenant_id());
create policy pricebook_write on public.price_book_items for all
  using (public.is_platform_admin() or (tenant_id = public.current_tenant_id() and public.is_admin()))
  with check (public.is_platform_admin() or (tenant_id = public.current_tenant_id() and public.is_admin()));

-- clients: members read, staff write
create policy clients_select on public.clients for select
  using (public.is_platform_admin() or tenant_id = public.current_tenant_id());
create policy clients_write on public.clients for all
  using (public.is_platform_admin() or (tenant_id = public.current_tenant_id() and public.is_staff()))
  with check (public.is_platform_admin() or (tenant_id = public.current_tenant_id() and public.is_staff()));

-- quotes + areas + lines: staff only (techs don't see pricing)
create policy quotes_all on public.quotes for all
  using (public.is_platform_admin() or (tenant_id = public.current_tenant_id() and public.is_staff()))
  with check (public.is_platform_admin() or (tenant_id = public.current_tenant_id() and public.is_staff()));
create policy quote_areas_all on public.quote_areas for all
  using (public.is_platform_admin() or (tenant_id = public.current_tenant_id() and public.is_staff()))
  with check (public.is_platform_admin() or (tenant_id = public.current_tenant_id() and public.is_staff()));
create policy quote_lines_all on public.quote_lines for all
  using (public.is_platform_admin() or (tenant_id = public.current_tenant_id() and public.is_staff()))
  with check (public.is_platform_admin() or (tenant_id = public.current_tenant_id() and public.is_staff()));

-- jobs: staff manage; assigned tech reads
create policy jobs_select on public.jobs for select
  using (
    public.is_platform_admin()
    or (
      tenant_id = public.current_tenant_id()
      and (
        public.is_staff()
        or exists (
          select 1 from public.job_assignments ja
          where ja.job_id = jobs.id and ja.profile_id = auth.uid()
        )
      )
    )
  );
create policy jobs_write on public.jobs for all
  using (public.is_platform_admin() or (tenant_id = public.current_tenant_id() and public.is_staff()))
  with check (public.is_platform_admin() or (tenant_id = public.current_tenant_id() and public.is_staff()));

create policy assignments_select on public.job_assignments for select
  using (
    public.is_platform_admin()
    or (tenant_id = public.current_tenant_id() and (public.is_staff() or profile_id = auth.uid()))
  );
create policy assignments_write on public.job_assignments for all
  using (public.is_platform_admin() or (tenant_id = public.current_tenant_id() and public.is_staff()))
  with check (public.is_platform_admin() or (tenant_id = public.current_tenant_id() and public.is_staff()));

-- invoices: staff only
create policy invoices_all on public.invoices for all
  using (public.is_platform_admin() or (tenant_id = public.current_tenant_id() and public.is_staff()))
  with check (public.is_platform_admin() or (tenant_id = public.current_tenant_id() and public.is_staff()));

-- time entries: staff (all in tenant) or tech (own)
create policy time_select on public.time_entries for select
  using (
    public.is_platform_admin()
    or (tenant_id = public.current_tenant_id() and (public.is_staff() or profile_id = auth.uid()))
  );
create policy time_insert on public.time_entries for insert
  with check (
    tenant_id = public.current_tenant_id()
    and (profile_id = auth.uid() or public.is_staff())
  );
create policy time_update on public.time_entries for update
  using (
    public.is_platform_admin()
    or (tenant_id = public.current_tenant_id()
        and (public.is_staff() or (profile_id = auth.uid() and status in ('draft', 'rejected'))))
  )
  with check (tenant_id = public.current_tenant_id());
create policy time_delete on public.time_entries for delete
  using (
    public.is_platform_admin()
    or (tenant_id = public.current_tenant_id()
        and (public.is_staff() or (profile_id = auth.uid() and status in ('draft', 'rejected'))))
  );

-- mileage entries: same pattern
create policy mileage_select on public.mileage_entries for select
  using (
    public.is_platform_admin()
    or (tenant_id = public.current_tenant_id() and (public.is_staff() or profile_id = auth.uid()))
  );
create policy mileage_insert on public.mileage_entries for insert
  with check (
    tenant_id = public.current_tenant_id()
    and (profile_id = auth.uid() or public.is_staff())
  );
create policy mileage_update on public.mileage_entries for update
  using (
    public.is_platform_admin()
    or (tenant_id = public.current_tenant_id()
        and (public.is_staff() or (profile_id = auth.uid() and status in ('draft', 'rejected'))))
  )
  with check (tenant_id = public.current_tenant_id());
create policy mileage_delete on public.mileage_entries for delete
  using (
    public.is_platform_admin()
    or (tenant_id = public.current_tenant_id()
        and (public.is_staff() or (profile_id = auth.uid() and status in ('draft', 'rejected'))))
  );

-- expenses: staff (all in tenant) or tech (own)
create policy expenses_select on public.expenses for select
  using (
    public.is_platform_admin()
    or (tenant_id = public.current_tenant_id() and (public.is_staff() or profile_id = auth.uid()))
  );
create policy expenses_insert on public.expenses for insert
  with check (
    tenant_id = public.current_tenant_id()
    and (profile_id = auth.uid() or public.is_staff())
  );
create policy expenses_update on public.expenses for update
  using (
    public.is_platform_admin()
    or (tenant_id = public.current_tenant_id() and (public.is_staff() or profile_id = auth.uid()))
  )
  with check (tenant_id = public.current_tenant_id());
create policy expenses_delete on public.expenses for delete
  using (
    public.is_platform_admin()
    or (tenant_id = public.current_tenant_id() and (public.is_staff() or profile_id = auth.uid()))
  );

-- ---------------------------------------------------------------------------
-- Storage buckets + policies (per-tenant path isolation is future work)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('branding', 'branding', true),
       ('documents', 'documents', false),
       ('receipts', 'receipts', false)
on conflict (id) do nothing;

create policy branding_read on storage.objects for select
  using (bucket_id = 'branding');
create policy branding_write on storage.objects for insert
  with check (bucket_id = 'branding' and public.is_admin());
create policy branding_update on storage.objects for update
  using (bucket_id = 'branding' and public.is_admin());

create policy docs_select on storage.objects for select
  using (bucket_id in ('documents', 'receipts') and public.is_active_user());
create policy docs_insert on storage.objects for insert
  with check (bucket_id in ('documents', 'receipts') and public.is_active_user());
create policy docs_update on storage.objects for update
  using (bucket_id in ('documents', 'receipts') and public.is_active_user());
create policy docs_delete on storage.objects for delete
  using (bucket_id in ('documents', 'receipts') and public.is_staff());

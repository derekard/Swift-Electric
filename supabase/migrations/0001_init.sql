-- Swift Electric — initial schema
-- Tables, RLS, helper functions, reporting views, storage buckets.

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
-- Identity: profiles + invite allowlist
-- ---------------------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text not null,
  full_name   text,
  role        text not null default 'tech' check (role in ('owner', 'tech')),
  hourly_wage numeric(10, 2) not null default 0,   -- used to cost timesheets
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Emails invited to the app. First Google login provisions a profile from here.
create table public.allowlist (
  email      text primary key,
  role       text not null default 'tech' check (role in ('owner', 'tech')),
  full_name  text,
  invited_at timestamptz not null default now()
);

-- Role helpers (security definer => bypass RLS, no policy recursion).
create or replace function public.is_owner()
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'owner' and active
  );
$$;

create or replace function public.is_active_user()
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and active
  );
$$;

-- Provision a profile on first login, honouring the allowlist.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  allow public.allowlist%rowtype;
begin
  select * into allow from public.allowlist where lower(email) = lower(new.email);

  insert into public.profiles (id, email, full_name, role, active)
  values (
    new.id,
    new.email,
    coalesce(allow.full_name,
             new.raw_user_meta_data ->> 'full_name',
             new.raw_user_meta_data ->> 'name'),
    coalesce(allow.role, 'tech'),
    allow.email is not null        -- only allowlisted users start active
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Company settings (single row) + price book
-- ---------------------------------------------------------------------------
create table public.app_settings (
  id               smallint primary key default 1 check (id = 1),
  company_name     text not null default 'Swift Electric',
  owner_name       text,
  license_number   text,                                  -- ECRA/ESA #
  address          text,
  phone            text,
  email            text,
  logo_url         text,
  hst_rate         numeric(6, 3) not null default 13,     -- Ontario HST %
  jic_pct          numeric(6, 3) not null default 10,     -- "just in case" contingency %
  admin_pct        numeric(6, 3) not null default 10,     -- overhead / admin %
  small_parts_pct  numeric(6, 3) not null default 3,      -- small parts %
  permit_fee       numeric(12, 2) not null default 200,   -- flat permit fee
  mileage_rate     numeric(8, 3) not null default 0.70,   -- $ per km
  quote_intro      text not null default
    'I am pleased to submit an estimate for the following electrical work',
  show_hst_line    boolean not null default false,        -- false => "HST extra" wording
  updated_at       timestamptz not null default now()
);

create table public.price_book_items (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  unit_price numeric(12, 2) not null default 0,
  category   text,
  sort       int not null default 0,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Clients
-- ---------------------------------------------------------------------------
create table public.clients (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  email      text,
  phone      text,
  address    text,
  notes      text,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Quotes (internal pricing) + areas + lines
-- ---------------------------------------------------------------------------
create sequence if not exists public.quote_seq start 1001;
create sequence if not exists public.job_seq start 1001;
create sequence if not exists public.invoice_seq start 1001;

create table public.quotes (
  id              uuid primary key default gen_random_uuid(),
  quote_number    text not null unique default ('Q-' || nextval('public.quote_seq')),
  client_id       uuid references public.clients (id),
  site_address    text,
  status          text not null default 'draft'
                    check (status in ('draft', 'sent', 'accepted', 'declined')),
  intro           text,            -- overrides app_settings.quote_intro when set
  notes           text,            -- client-facing NOTES (e.g. "Permit included")
  -- fee snapshot so historical quotes don't change when settings change
  jic_pct         numeric(6, 3) not null default 10,
  admin_pct       numeric(6, 3) not null default 10,
  small_parts_pct numeric(6, 3) not null default 3,
  permit_fee      numeric(12, 2) not null default 200,
  hst_rate        numeric(6, 3) not null default 13,
  show_hst_line   boolean not null default false,
  created_by      uuid references public.profiles (id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  sent_at         timestamptz,
  accepted_at     timestamptz
);

create table public.quote_areas (
  id       uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.quotes (id) on delete cascade,
  name     text not null,                    -- "Living room", "Kitchen", ...
  sort     int not null default 0
);

create table public.quote_lines (
  id                 uuid primary key default gen_random_uuid(),
  area_id            uuid not null references public.quote_areas (id) on delete cascade,
  price_book_item_id uuid references public.price_book_items (id),
  description        text not null,          -- client-facing bullet text
  qty                numeric(10, 2) not null default 1,
  unit_price         numeric(12, 2) not null default 0,
  line_total         numeric(14, 2) generated always as (round(qty * unit_price, 2)) stored,
  sort               int not null default 0
);

create index on public.quote_areas (quote_id);
create index on public.quote_lines (area_id);

-- ---------------------------------------------------------------------------
-- Jobs + assignments
-- ---------------------------------------------------------------------------
create table public.jobs (
  id              uuid primary key default gen_random_uuid(),
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

create table public.job_assignments (
  job_id     uuid not null references public.jobs (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  primary key (job_id, profile_id)
);

-- ---------------------------------------------------------------------------
-- Invoices (totals snapshotted from the quote at creation)
-- ---------------------------------------------------------------------------
create table public.invoices (
  id              uuid primary key default gen_random_uuid(),
  invoice_number  text not null unique default ('INV-' || nextval('public.invoice_seq')),
  job_id          uuid references public.jobs (id),
  quote_id        uuid references public.quotes (id),
  client_id       uuid references public.clients (id),
  status          text not null default 'draft'
                    check (status in ('draft', 'sent', 'paid', 'void')),
  issued_date     date,
  due_date        date,
  paid_date       date,
  items_subtotal  numeric(14, 2) not null default 0,
  jic_amount      numeric(14, 2) not null default 0,
  admin_amount    numeric(14, 2) not null default 0,
  small_parts_amount numeric(14, 2) not null default 0,
  permit_amount   numeric(14, 2) not null default 0,
  amount_pretax   numeric(14, 2) not null default 0,
  hst_amount      numeric(14, 2) not null default 0,
  total           numeric(14, 2) not null default 0,
  notes           text,
  created_by      uuid references public.profiles (id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Team: time, mileage, expenses (all tie back to a job)
-- ---------------------------------------------------------------------------
create table public.time_entries (
  id          uuid primary key default gen_random_uuid(),
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
-- updated_at triggers
-- ---------------------------------------------------------------------------
create trigger trg_profiles_updated   before update on public.profiles   for each row execute function public.set_updated_at();
create trigger trg_settings_updated   before update on public.app_settings for each row execute function public.set_updated_at();
create trigger trg_clients_updated    before update on public.clients    for each row execute function public.set_updated_at();
create trigger trg_quotes_updated     before update on public.quotes     for each row execute function public.set_updated_at();
create trigger trg_jobs_updated       before update on public.jobs       for each row execute function public.set_updated_at();
create trigger trg_invoices_updated   before update on public.invoices   for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Reporting views (security_invoker => respect caller RLS)
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
  round(coalesce(m.km, 0) * s.mileage_rate, 2) as mileage_cost,
  coalesce(pt.amt, 0) as parts_cost,
  coalesce(r.pretax, 0) as revenue,
  coalesce(r.pretax, 0)
    - (coalesce(l.cost, 0) + round(coalesce(m.km, 0) * s.mileage_rate, 2) + coalesce(pt.amt, 0)) as margin
from public.jobs j
cross join (select mileage_rate from public.app_settings where id = 1) s
left join labor l on l.job_id = j.id
left join miles m on m.job_id = j.id
left join parts pt on pt.job_id = j.id
left join rev r on r.job_id = j.id;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.profiles         enable row level security;
alter table public.allowlist        enable row level security;
alter table public.app_settings     enable row level security;
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

-- profiles: self-read, owner reads/writes all
create policy profiles_select on public.profiles for select
  using (id = auth.uid() or public.is_owner());
create policy profiles_update on public.profiles for update
  using (public.is_owner()) with check (public.is_owner());

-- allowlist: owner only
create policy allowlist_all on public.allowlist for all
  using (public.is_owner()) with check (public.is_owner());

-- app_settings: all active users read, owner writes
create policy settings_select on public.app_settings for select
  using (public.is_active_user());
create policy settings_update on public.app_settings for update
  using (public.is_owner()) with check (public.is_owner());

-- price book: all read, owner writes
create policy pricebook_select on public.price_book_items for select
  using (public.is_active_user());
create policy pricebook_write on public.price_book_items for all
  using (public.is_owner()) with check (public.is_owner());

-- clients: all read, owner writes
create policy clients_select on public.clients for select
  using (public.is_active_user());
create policy clients_write on public.clients for all
  using (public.is_owner()) with check (public.is_owner());

-- quotes + areas + lines: owner only
create policy quotes_all on public.quotes for all
  using (public.is_owner()) with check (public.is_owner());
create policy quote_areas_all on public.quote_areas for all
  using (public.is_owner()) with check (public.is_owner());
create policy quote_lines_all on public.quote_lines for all
  using (public.is_owner()) with check (public.is_owner());

-- jobs: owner all; assigned tech reads
create policy jobs_select on public.jobs for select
  using (
    public.is_owner()
    or exists (
      select 1 from public.job_assignments ja
      where ja.job_id = jobs.id and ja.profile_id = auth.uid()
    )
  );
create policy jobs_write on public.jobs for all
  using (public.is_owner()) with check (public.is_owner());

create policy assignments_select on public.job_assignments for select
  using (public.is_owner() or profile_id = auth.uid());
create policy assignments_write on public.job_assignments for all
  using (public.is_owner()) with check (public.is_owner());

-- invoices: owner only
create policy invoices_all on public.invoices for all
  using (public.is_owner()) with check (public.is_owner());

-- time entries: owner all; tech manages own drafts
create policy time_select on public.time_entries for select
  using (public.is_owner() or profile_id = auth.uid());
create policy time_insert on public.time_entries for insert
  with check (profile_id = auth.uid() or public.is_owner());
create policy time_update on public.time_entries for update
  using (public.is_owner() or (profile_id = auth.uid() and status in ('draft', 'rejected')))
  with check (public.is_owner() or profile_id = auth.uid());
create policy time_delete on public.time_entries for delete
  using (public.is_owner() or (profile_id = auth.uid() and status in ('draft', 'rejected')));

-- mileage entries: same pattern
create policy mileage_select on public.mileage_entries for select
  using (public.is_owner() or profile_id = auth.uid());
create policy mileage_insert on public.mileage_entries for insert
  with check (profile_id = auth.uid() or public.is_owner());
create policy mileage_update on public.mileage_entries for update
  using (public.is_owner() or (profile_id = auth.uid() and status in ('draft', 'rejected')))
  with check (public.is_owner() or profile_id = auth.uid());
create policy mileage_delete on public.mileage_entries for delete
  using (public.is_owner() or (profile_id = auth.uid() and status in ('draft', 'rejected')));

-- expenses: owner all; tech manages own
create policy expenses_select on public.expenses for select
  using (public.is_owner() or profile_id = auth.uid());
create policy expenses_insert on public.expenses for insert
  with check (profile_id = auth.uid() or public.is_owner());
create policy expenses_update on public.expenses for update
  using (public.is_owner() or profile_id = auth.uid())
  with check (public.is_owner() or profile_id = auth.uid());
create policy expenses_delete on public.expenses for delete
  using (public.is_owner() or profile_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Storage buckets + policies
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('branding', 'branding', true),
       ('documents', 'documents', false),
       ('receipts', 'receipts', false)
on conflict (id) do nothing;

create policy branding_read on storage.objects for select
  using (bucket_id = 'branding');
create policy branding_write on storage.objects for insert
  with check (bucket_id = 'branding' and public.is_owner());
create policy branding_update on storage.objects for update
  using (bucket_id = 'branding' and public.is_owner());

create policy docs_select on storage.objects for select
  using (bucket_id in ('documents', 'receipts') and public.is_active_user());
create policy docs_insert on storage.objects for insert
  with check (bucket_id in ('documents', 'receipts') and public.is_active_user());
create policy docs_update on storage.objects for update
  using (bucket_id in ('documents', 'receipts') and public.is_active_user());
create policy docs_delete on storage.objects for delete
  using (bucket_id in ('documents', 'receipts') and public.is_owner());

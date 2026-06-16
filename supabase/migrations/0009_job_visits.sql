-- ============================================================================
-- Multiple visits per job — schedule a job across several site visits, each
-- with a date, optional time window, and a note. Crew is the job's crew.
-- Additive + idempotent. Auto-applies on deploy via scripts/migrate.mjs.
-- ============================================================================

create table if not exists public.job_visits (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants (id) on delete cascade,
  job_id      uuid not null references public.jobs (id) on delete cascade,
  visit_date  date not null,
  start_time  time,
  end_time    time,
  note        text,
  created_by  uuid references public.profiles (id),
  created_at  timestamptz not null default now()
);
create index if not exists job_visits_tenant_idx on public.job_visits (tenant_id);
create index if not exists job_visits_job_idx on public.job_visits (job_id);
create index if not exists job_visits_date_idx on public.job_visits (visit_date);

-- Auto-stamp tenant_id from the caller's tenant (same pattern as other tables).
drop trigger if exists trg_job_visits_tenant on public.job_visits;
create trigger trg_job_visits_tenant
  before insert on public.job_visits
  for each row execute function public.set_tenant_id();

alter table public.job_visits enable row level security;

-- Staff manage visits; an assigned tech can read the visits for their jobs
-- (so the crew can see when they're due on site).
drop policy if exists visits_select on public.job_visits;
create policy visits_select on public.job_visits for select
  using (
    public.is_platform_admin()
    or (
      tenant_id = public.current_tenant_id()
      and (
        public.is_staff()
        or exists (
          select 1 from public.job_assignments ja
          where ja.job_id = job_visits.job_id and ja.profile_id = auth.uid()
        )
      )
    )
  );

drop policy if exists visits_write on public.job_visits;
create policy visits_write on public.job_visits for all
  using (
    public.is_platform_admin()
    or (tenant_id = public.current_tenant_id() and public.is_staff())
  )
  with check (
    public.is_platform_admin()
    or (tenant_id = public.current_tenant_id() and public.is_staff())
  );

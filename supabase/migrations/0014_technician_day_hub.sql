-- ============================================================================
-- Technician Day Hub
--
-- Field workflow records for assigned technicians: preparation checklist,
-- arrival/departure events, low-data site photo metadata, per-day site reports,
-- and customer/supervisor sign-off. Additive and RLS-aligned with jobs.
-- ============================================================================

create table if not exists public.job_prep_items (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants (id) on delete cascade,
  job_id     uuid not null references public.jobs (id) on delete cascade,
  label      text not null,
  category   text not null default 'general',
  required   boolean not null default true,
  sort       int not null default 0,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (job_id, label),
  unique (id, tenant_id)
);
create index if not exists job_prep_items_tenant_idx on public.job_prep_items (tenant_id);
create index if not exists job_prep_items_job_idx on public.job_prep_items (job_id);

create table if not exists public.job_site_reports (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references public.tenants (id) on delete cascade,
  job_id            uuid not null references public.jobs (id) on delete cascade,
  job_visit_id      uuid references public.job_visits (id) on delete set null,
  profile_id        uuid not null references public.profiles (id),
  work_date         date not null default current_date,
  work_performed    text,
  issues            text,
  recommendations   text,
  materials_summary text,
  status            text not null default 'draft' check (status in ('draft', 'submitted')),
  submitted_at      timestamptz,
  locked_at         timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (job_id, profile_id, work_date),
  unique (id, tenant_id)
);
create index if not exists job_site_reports_tenant_idx on public.job_site_reports (tenant_id);
create index if not exists job_site_reports_job_idx on public.job_site_reports (job_id);
create index if not exists job_site_reports_profile_idx on public.job_site_reports (profile_id);
create index if not exists job_site_reports_visit_idx on public.job_site_reports (job_visit_id);

create table if not exists public.job_prep_completions (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants (id) on delete cascade,
  job_id         uuid not null references public.jobs (id) on delete cascade,
  prep_item_id   uuid not null references public.job_prep_items (id) on delete cascade,
  site_report_id uuid references public.job_site_reports (id) on delete set null,
  profile_id     uuid not null references public.profiles (id),
  work_date      date not null default current_date,
  completed_at   timestamptz not null default now(),
  created_at     timestamptz not null default now(),
  unique (prep_item_id, profile_id, work_date)
);
create index if not exists job_prep_completions_tenant_idx on public.job_prep_completions (tenant_id);
create index if not exists job_prep_completions_job_idx on public.job_prep_completions (job_id);
create index if not exists job_prep_completions_report_idx on public.job_prep_completions (site_report_id);
create index if not exists job_prep_completions_profile_idx on public.job_prep_completions (profile_id);

create table if not exists public.job_workflow_events (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants (id) on delete cascade,
  job_id         uuid not null references public.jobs (id) on delete cascade,
  site_report_id uuid references public.job_site_reports (id) on delete set null,
  profile_id     uuid not null references public.profiles (id),
  event_type     text not null check (
    event_type in (
      'travel_started',
      'arrived',
      'departed',
      'blocked',
      'completed'
    )
  ),
  note           text,
  latitude       numeric(10, 7),
  longitude      numeric(10, 7),
  happened_at    timestamptz not null default now(),
  created_at     timestamptz not null default now()
);
create index if not exists job_workflow_events_tenant_idx on public.job_workflow_events (tenant_id);
create index if not exists job_workflow_events_job_idx on public.job_workflow_events (job_id);
create index if not exists job_workflow_events_report_idx on public.job_workflow_events (site_report_id);
create index if not exists job_workflow_events_profile_idx on public.job_workflow_events (profile_id);

create table if not exists public.job_site_photos (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants (id) on delete cascade,
  job_id          uuid not null references public.jobs (id) on delete cascade,
  profile_id      uuid not null references public.profiles (id),
  site_report_id  uuid references public.job_site_reports (id) on delete set null,
  storage_bucket  text not null default 'site-photos',
  storage_path    text not null unique,
  thumbnail_path  text,
  label           text not null default 'other' check (
    label in ('before', 'after', 'issue', 'equipment', 'panel', 'material', 'safety', 'other')
  ),
  caption         text,
  content_type    text,
  file_size       int,
  compressed_size int,
  width           int,
  height          int,
  taken_at        timestamptz not null default now(),
  created_at      timestamptz not null default now()
);
create index if not exists job_site_photos_tenant_idx on public.job_site_photos (tenant_id);
create index if not exists job_site_photos_job_idx on public.job_site_photos (job_id);
create index if not exists job_site_photos_report_idx on public.job_site_photos (site_report_id);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'job_visits_id_tenant_id_unique'
      and conrelid = 'public.job_visits'::regclass
  ) then
    alter table public.job_visits
      add constraint job_visits_id_tenant_id_unique unique (id, tenant_id);
  end if;
end $$;

create table if not exists public.job_signoffs (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants (id) on delete cascade,
  job_id         uuid not null references public.jobs (id) on delete cascade,
  site_report_id uuid references public.job_site_reports (id) on delete set null,
  profile_id     uuid not null references public.profiles (id),
  signer_name    text,
  signer_role    text not null default 'customer' check (signer_role in ('customer', 'supervisor', 'unavailable')),
  signature_text text,
  comments       text,
  signed_at      timestamptz not null default now(),
  created_at     timestamptz not null default now()
);
create index if not exists job_signoffs_tenant_idx on public.job_signoffs (tenant_id);
create index if not exists job_signoffs_job_idx on public.job_signoffs (job_id);
create index if not exists job_signoffs_report_idx on public.job_signoffs (site_report_id);

drop trigger if exists trg_job_prep_items_tenant on public.job_prep_items;
create trigger trg_job_prep_items_tenant
  before insert on public.job_prep_items
  for each row execute function public.set_tenant_id();

drop trigger if exists trg_job_site_reports_tenant on public.job_site_reports;
create trigger trg_job_site_reports_tenant
  before insert on public.job_site_reports
  for each row execute function public.set_tenant_id();

drop trigger if exists trg_job_prep_completions_tenant on public.job_prep_completions;
create trigger trg_job_prep_completions_tenant
  before insert on public.job_prep_completions
  for each row execute function public.set_tenant_id();

drop trigger if exists trg_job_workflow_events_tenant on public.job_workflow_events;
create trigger trg_job_workflow_events_tenant
  before insert on public.job_workflow_events
  for each row execute function public.set_tenant_id();

drop trigger if exists trg_job_site_photos_tenant on public.job_site_photos;
create trigger trg_job_site_photos_tenant
  before insert on public.job_site_photos
  for each row execute function public.set_tenant_id();

drop trigger if exists trg_job_signoffs_tenant on public.job_signoffs;
create trigger trg_job_signoffs_tenant
  before insert on public.job_signoffs
  for each row execute function public.set_tenant_id();

drop trigger if exists trg_job_prep_items_updated on public.job_prep_items;
create trigger trg_job_prep_items_updated
  before update on public.job_prep_items
  for each row execute function public.set_updated_at();

drop trigger if exists trg_job_site_reports_updated on public.job_site_reports;
create trigger trg_job_site_reports_updated
  before update on public.job_site_reports
  for each row execute function public.set_updated_at();

alter table public.job_prep_items       enable row level security;
alter table public.job_site_reports     enable row level security;
alter table public.job_prep_completions enable row level security;
alter table public.job_workflow_events  enable row level security;
alter table public.job_site_photos      enable row level security;
alter table public.job_signoffs         enable row level security;

drop policy if exists job_prep_items_select on public.job_prep_items;
create policy job_prep_items_select on public.job_prep_items for select
  using (
    public.is_platform_admin()
    or (
      tenant_id = public.current_tenant_id()
      and (
        public.is_staff()
        or exists (
          select 1 from public.job_assignments ja
          where ja.job_id = job_prep_items.job_id and ja.profile_id = auth.uid()
        )
      )
    )
  );

drop policy if exists job_prep_items_insert on public.job_prep_items;
create policy job_prep_items_insert on public.job_prep_items for insert
  with check (
    tenant_id = public.current_tenant_id()
    and (
      public.is_staff()
      or exists (
        select 1 from public.job_assignments ja
        where ja.job_id = job_prep_items.job_id and ja.profile_id = auth.uid()
      )
    )
  );

drop policy if exists job_prep_items_staff_update on public.job_prep_items;
create policy job_prep_items_staff_update on public.job_prep_items for update
  using (public.is_platform_admin() or (tenant_id = public.current_tenant_id() and public.is_staff()))
  with check (public.is_platform_admin() or (tenant_id = public.current_tenant_id() and public.is_staff()));

drop policy if exists job_prep_items_staff_delete on public.job_prep_items;
create policy job_prep_items_staff_delete on public.job_prep_items for delete
  using (public.is_platform_admin() or (tenant_id = public.current_tenant_id() and public.is_staff()));

drop policy if exists job_site_reports_select on public.job_site_reports;
create policy job_site_reports_select on public.job_site_reports for select
  using (
    public.is_platform_admin()
    or (
      tenant_id = public.current_tenant_id()
      and (
        public.is_staff()
        or profile_id = auth.uid()
        or exists (
          select 1 from public.job_assignments ja
          where ja.job_id = job_site_reports.job_id and ja.profile_id = auth.uid()
        )
      )
    )
  );

drop policy if exists job_site_reports_write on public.job_site_reports;
create policy job_site_reports_write on public.job_site_reports for all
  using (
    public.is_platform_admin()
    or (
      tenant_id = public.current_tenant_id()
      and (public.is_staff() or profile_id = auth.uid())
      and locked_at is null
    )
  )
  with check (
    tenant_id = public.current_tenant_id()
    and (profile_id = auth.uid() or public.is_staff())
    and locked_at is null
    and (
      public.is_staff()
      or exists (
        select 1 from public.job_assignments ja
        where ja.job_id = job_site_reports.job_id and ja.profile_id = auth.uid()
      )
    )
  );

drop policy if exists job_prep_completions_select on public.job_prep_completions;
create policy job_prep_completions_select on public.job_prep_completions for select
  using (
    public.is_platform_admin()
    or (
      tenant_id = public.current_tenant_id()
      and (
        public.is_staff()
        or exists (
          select 1 from public.job_assignments ja
          where ja.job_id = job_prep_completions.job_id and ja.profile_id = auth.uid()
        )
      )
    )
  );

drop policy if exists job_prep_completions_insert on public.job_prep_completions;
create policy job_prep_completions_insert on public.job_prep_completions for insert
  with check (
    tenant_id = public.current_tenant_id()
    and (profile_id = auth.uid() or public.is_staff())
    and (
      public.is_staff()
      or exists (
        select 1 from public.job_assignments ja
        where ja.job_id = job_prep_completions.job_id and ja.profile_id = auth.uid()
      )
    )
  );

drop policy if exists job_prep_completions_delete on public.job_prep_completions;
create policy job_prep_completions_delete on public.job_prep_completions for delete
  using (
    public.is_platform_admin()
    or (
      tenant_id = public.current_tenant_id()
      and (public.is_staff() or profile_id = auth.uid())
    )
  );

drop policy if exists job_workflow_events_select on public.job_workflow_events;
create policy job_workflow_events_select on public.job_workflow_events for select
  using (
    public.is_platform_admin()
    or (
      tenant_id = public.current_tenant_id()
      and (
        public.is_staff()
        or exists (
          select 1 from public.job_assignments ja
          where ja.job_id = job_workflow_events.job_id and ja.profile_id = auth.uid()
        )
      )
    )
  );

drop policy if exists job_workflow_events_insert on public.job_workflow_events;
create policy job_workflow_events_insert on public.job_workflow_events for insert
  with check (
    tenant_id = public.current_tenant_id()
    and (profile_id = auth.uid() or public.is_staff())
    and (
      public.is_staff()
      or exists (
        select 1 from public.job_assignments ja
        where ja.job_id = job_workflow_events.job_id and ja.profile_id = auth.uid()
      )
    )
  );

drop policy if exists job_site_photos_select on public.job_site_photos;
create policy job_site_photos_select on public.job_site_photos for select
  using (
    public.is_platform_admin()
    or (
      tenant_id = public.current_tenant_id()
      and (
        public.is_staff()
        or exists (
          select 1 from public.job_assignments ja
          where ja.job_id = job_site_photos.job_id and ja.profile_id = auth.uid()
        )
      )
    )
  );

drop policy if exists job_site_photos_write on public.job_site_photos;
create policy job_site_photos_write on public.job_site_photos for all
  using (
    public.is_platform_admin()
    or (
      tenant_id = public.current_tenant_id()
      and (public.is_staff() or profile_id = auth.uid())
    )
  )
  with check (
    tenant_id = public.current_tenant_id()
    and storage_bucket = 'site-photos'
    and (profile_id = auth.uid() or public.is_staff())
    and (
      public.is_staff()
      or exists (
        select 1 from public.job_assignments ja
        where ja.job_id = job_site_photos.job_id and ja.profile_id = auth.uid()
      )
    )
  );

drop policy if exists job_signoffs_select on public.job_signoffs;
create policy job_signoffs_select on public.job_signoffs for select
  using (
    public.is_platform_admin()
    or (
      tenant_id = public.current_tenant_id()
      and (
        public.is_staff()
        or exists (
          select 1 from public.job_assignments ja
          where ja.job_id = job_signoffs.job_id and ja.profile_id = auth.uid()
        )
      )
    )
  );

drop policy if exists job_signoffs_insert on public.job_signoffs;
create policy job_signoffs_insert on public.job_signoffs for insert
  with check (
    tenant_id = public.current_tenant_id()
    and (profile_id = auth.uid() or public.is_staff())
    and (
      public.is_staff()
      or exists (
        select 1 from public.job_assignments ja
        where ja.job_id = job_signoffs.job_id and ja.profile_id = auth.uid()
      )
    )
  );

drop policy if exists job_signoffs_staff_delete on public.job_signoffs;
create policy job_signoffs_staff_delete on public.job_signoffs for delete
  using (public.is_platform_admin() or (tenant_id = public.current_tenant_id() and public.is_staff()));

create or replace function public.record_job_workflow_event(
  p_job_id uuid,
  p_event_type text,
  p_work_date date default current_date,
  p_note text default null,
  p_latitude numeric default null,
  p_longitude numeric default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid;
  v_report_id uuid;
  v_event_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if p_event_type not in ('travel_started', 'arrived', 'departed', 'blocked', 'completed') then
    raise exception 'Invalid workflow event';
  end if;

  select j.tenant_id into v_tenant_id
  from public.jobs j
  where j.id = p_job_id
    and (
      public.is_platform_admin()
      or (
        j.tenant_id = public.current_tenant_id()
        and (
          public.is_staff()
          or exists (
            select 1 from public.job_assignments ja
            where ja.job_id = j.id and ja.profile_id = auth.uid()
          )
        )
      )
    );

  if v_tenant_id is null then
    raise exception 'Job not found or not permitted';
  end if;

  insert into public.job_site_reports (tenant_id, job_id, profile_id, work_date)
  values (v_tenant_id, p_job_id, auth.uid(), coalesce(p_work_date, current_date))
  on conflict (job_id, profile_id, work_date) do update
    set work_date = excluded.work_date
  returning id into v_report_id;

  insert into public.job_workflow_events (
    tenant_id,
    job_id,
    site_report_id,
    profile_id,
    event_type,
    note,
    latitude,
    longitude
  )
  values (
    v_tenant_id,
    p_job_id,
    v_report_id,
    auth.uid(),
    p_event_type,
    nullif(trim(p_note), ''),
    p_latitude,
    p_longitude
  )
  returning id into v_event_id;

  if p_event_type = 'arrived' then
    update public.jobs
    set status = 'in_progress'
    where id = p_job_id and status = 'scheduled';
  elsif p_event_type = 'completed' then
    update public.jobs
    set status = 'complete'
    where id = p_job_id and status <> 'cancelled';
  end if;

  return v_event_id;
end;
$$;

insert into storage.buckets (id, name, public)
values ('site-photos', 'site-photos', false)
on conflict (id) do nothing;

-- Photo paths are `<tenant_id>/<job_id>/<profile_id>/<file>`. Reads in the app
-- go through the metadata-checked API route, but storage RLS is still tightened
-- so direct client calls cannot cross tenants or write into unassigned jobs.
drop policy if exists site_photos_select on storage.objects;
create policy site_photos_select on storage.objects for select
  using (
    bucket_id = 'site-photos'
    and (
      public.is_platform_admin()
      or (
        (storage.foldername(name))[1] = public.current_tenant_id()::text
        and (storage.foldername(name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        and (
          public.is_staff()
          or exists (
            select 1 from public.job_assignments ja
            where ja.job_id = ((storage.foldername(name))[2])::uuid
              and ja.profile_id = auth.uid()
          )
        )
      )
    )
  );

drop policy if exists site_photos_insert on storage.objects;
create policy site_photos_insert on storage.objects for insert
  with check (
    bucket_id = 'site-photos'
    and (
      public.is_platform_admin()
      or (
        (storage.foldername(name))[1] = public.current_tenant_id()::text
        and (storage.foldername(name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        and (
          public.is_staff()
          or (
            (storage.foldername(name))[3] = auth.uid()::text
            and exists (
              select 1 from public.job_assignments ja
              where ja.job_id = ((storage.foldername(name))[2])::uuid
                and ja.profile_id = auth.uid()
            )
          )
        )
      )
    )
  );

drop policy if exists site_photos_update on storage.objects;
create policy site_photos_update on storage.objects for update
  using (
    bucket_id = 'site-photos'
    and (
      public.is_platform_admin()
      or (
        (storage.foldername(name))[1] = public.current_tenant_id()::text
        and (public.is_staff() or (storage.foldername(name))[3] = auth.uid()::text)
      )
    )
  )
  with check (
    bucket_id = 'site-photos'
    and (
      public.is_platform_admin()
      or (
        (storage.foldername(name))[1] = public.current_tenant_id()::text
        and (public.is_staff() or (storage.foldername(name))[3] = auth.uid()::text)
      )
    )
  );

drop policy if exists site_photos_delete on storage.objects;
create policy site_photos_delete on storage.objects for delete
  using (
    bucket_id = 'site-photos'
    and (
      public.is_platform_admin()
      or (
        (storage.foldername(name))[1] = public.current_tenant_id()::text
        and (public.is_staff() or (storage.foldername(name))[3] = auth.uid()::text)
      )
    )
  );

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'job_prep_items_job_same_tenant_fk' and conrelid = 'public.job_prep_items'::regclass) then
    alter table public.job_prep_items
      add constraint job_prep_items_job_same_tenant_fk
      foreign key (job_id, tenant_id)
      references public.jobs (id, tenant_id)
      on delete cascade
      not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'job_site_reports_job_same_tenant_fk' and conrelid = 'public.job_site_reports'::regclass) then
    alter table public.job_site_reports
      add constraint job_site_reports_job_same_tenant_fk
      foreign key (job_id, tenant_id)
      references public.jobs (id, tenant_id)
      on delete cascade
      not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'job_site_reports_visit_same_tenant_fk' and conrelid = 'public.job_site_reports'::regclass) then
    alter table public.job_site_reports
      add constraint job_site_reports_visit_same_tenant_fk
      foreign key (job_visit_id, tenant_id)
      references public.job_visits (id, tenant_id)
      not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'job_site_reports_profile_same_tenant_fk' and conrelid = 'public.job_site_reports'::regclass) then
    alter table public.job_site_reports
      add constraint job_site_reports_profile_same_tenant_fk
      foreign key (profile_id, tenant_id)
      references public.profiles (id, tenant_id)
      not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'job_prep_completions_job_same_tenant_fk' and conrelid = 'public.job_prep_completions'::regclass) then
    alter table public.job_prep_completions
      add constraint job_prep_completions_job_same_tenant_fk
      foreign key (job_id, tenant_id)
      references public.jobs (id, tenant_id)
      on delete cascade
      not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'job_prep_completions_item_same_tenant_fk' and conrelid = 'public.job_prep_completions'::regclass) then
    alter table public.job_prep_completions
      add constraint job_prep_completions_item_same_tenant_fk
      foreign key (prep_item_id, tenant_id)
      references public.job_prep_items (id, tenant_id)
      on delete cascade
      not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'job_prep_completions_report_same_tenant_fk' and conrelid = 'public.job_prep_completions'::regclass) then
    alter table public.job_prep_completions
      add constraint job_prep_completions_report_same_tenant_fk
      foreign key (site_report_id, tenant_id)
      references public.job_site_reports (id, tenant_id)
      not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'job_prep_completions_profile_same_tenant_fk' and conrelid = 'public.job_prep_completions'::regclass) then
    alter table public.job_prep_completions
      add constraint job_prep_completions_profile_same_tenant_fk
      foreign key (profile_id, tenant_id)
      references public.profiles (id, tenant_id)
      not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'job_workflow_events_job_same_tenant_fk' and conrelid = 'public.job_workflow_events'::regclass) then
    alter table public.job_workflow_events
      add constraint job_workflow_events_job_same_tenant_fk
      foreign key (job_id, tenant_id)
      references public.jobs (id, tenant_id)
      on delete cascade
      not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'job_workflow_events_report_same_tenant_fk' and conrelid = 'public.job_workflow_events'::regclass) then
    alter table public.job_workflow_events
      add constraint job_workflow_events_report_same_tenant_fk
      foreign key (site_report_id, tenant_id)
      references public.job_site_reports (id, tenant_id)
      not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'job_workflow_events_profile_same_tenant_fk' and conrelid = 'public.job_workflow_events'::regclass) then
    alter table public.job_workflow_events
      add constraint job_workflow_events_profile_same_tenant_fk
      foreign key (profile_id, tenant_id)
      references public.profiles (id, tenant_id)
      not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'job_site_photos_job_same_tenant_fk' and conrelid = 'public.job_site_photos'::regclass) then
    alter table public.job_site_photos
      add constraint job_site_photos_job_same_tenant_fk
      foreign key (job_id, tenant_id)
      references public.jobs (id, tenant_id)
      on delete cascade
      not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'job_site_photos_profile_same_tenant_fk' and conrelid = 'public.job_site_photos'::regclass) then
    alter table public.job_site_photos
      add constraint job_site_photos_profile_same_tenant_fk
      foreign key (profile_id, tenant_id)
      references public.profiles (id, tenant_id)
      not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'job_site_photos_report_same_tenant_fk' and conrelid = 'public.job_site_photos'::regclass) then
    alter table public.job_site_photos
      add constraint job_site_photos_report_same_tenant_fk
      foreign key (site_report_id, tenant_id)
      references public.job_site_reports (id, tenant_id)
      not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'job_signoffs_job_same_tenant_fk' and conrelid = 'public.job_signoffs'::regclass) then
    alter table public.job_signoffs
      add constraint job_signoffs_job_same_tenant_fk
      foreign key (job_id, tenant_id)
      references public.jobs (id, tenant_id)
      on delete cascade
      not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'job_signoffs_profile_same_tenant_fk' and conrelid = 'public.job_signoffs'::regclass) then
    alter table public.job_signoffs
      add constraint job_signoffs_profile_same_tenant_fk
      foreign key (profile_id, tenant_id)
      references public.profiles (id, tenant_id)
      not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'job_signoffs_report_same_tenant_fk' and conrelid = 'public.job_signoffs'::regclass) then
    alter table public.job_signoffs
      add constraint job_signoffs_report_same_tenant_fk
      foreign key (site_report_id, tenant_id)
      references public.job_site_reports (id, tenant_id)
      not valid;
  end if;
end $$;

revoke all on table
  public.job_prep_items,
  public.job_site_reports,
  public.job_prep_completions,
  public.job_workflow_events,
  public.job_site_photos,
  public.job_signoffs
from anon, public;

grant select, insert, update, delete on table
  public.job_prep_items,
  public.job_site_reports,
  public.job_prep_completions,
  public.job_workflow_events,
  public.job_site_photos,
  public.job_signoffs
to authenticated, service_role;

revoke execute on function public.record_job_workflow_event(uuid, text, date, text, numeric, numeric) from anon, public;
grant execute on function public.record_job_workflow_event(uuid, text, date, text, numeric, numeric) to authenticated, service_role;

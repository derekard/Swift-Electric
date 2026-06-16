-- ============================================================================
-- Security hardening — close cross-tenant and within-tenant authorization gaps
-- found in the auth/isolation audit. Additive + idempotent (drop/recreate
-- policies). Auto-applies on deploy via scripts/migrate.mjs.
-- ============================================================================

-- 1) Storage: per-tenant path isolation for the private buckets ---------------
-- Receipts/documents are stored at `<tenant_id>/<job_id>/<file>`. The original
-- policies gated only on bucket + is_active_user(), so ANY active user could
-- read/overwrite/delete ANOTHER tenant's files via direct client Storage calls.
-- Require the object's first path segment to equal the caller's tenant_id
-- (platform admins, whose current_tenant_id() is null, keep cross-tenant access).
drop policy if exists docs_select on storage.objects;
create policy docs_select on storage.objects for select
  using (
    bucket_id in ('documents', 'receipts')
    and (
      public.is_platform_admin()
      or (
        public.is_active_user()
        and (storage.foldername(name))[1] = public.current_tenant_id()::text
      )
    )
  );

drop policy if exists docs_insert on storage.objects;
create policy docs_insert on storage.objects for insert
  with check (
    bucket_id in ('documents', 'receipts')
    and (
      public.is_platform_admin()
      or (
        public.is_active_user()
        and (storage.foldername(name))[1] = public.current_tenant_id()::text
      )
    )
  );

drop policy if exists docs_update on storage.objects;
create policy docs_update on storage.objects for update
  using (
    bucket_id in ('documents', 'receipts')
    and (
      public.is_platform_admin()
      or (
        public.is_active_user()
        and (storage.foldername(name))[1] = public.current_tenant_id()::text
      )
    )
  )
  with check (
    bucket_id in ('documents', 'receipts')
    and (
      public.is_platform_admin()
      or (
        public.is_active_user()
        and (storage.foldername(name))[1] = public.current_tenant_id()::text
      )
    )
  );

drop policy if exists docs_delete on storage.objects;
create policy docs_delete on storage.objects for delete
  using (
    bucket_id in ('documents', 'receipts')
    and (
      public.is_platform_admin()
      or (
        public.is_staff()
        and (storage.foldername(name))[1] = public.current_tenant_id()::text
      )
    )
  );

-- 2) Time/mileage/expense: a tech may only log against jobs they're assigned to
-- The original insert policies let any tenant member attach entries to ANY
-- job_id in the tenant (polluting another job's costs/margins). Require either
-- staff, or an existing job_assignments row for the caller on that job.
drop policy if exists time_insert on public.time_entries;
create policy time_insert on public.time_entries for insert
  with check (
    tenant_id = public.current_tenant_id()
    and (profile_id = auth.uid() or public.is_staff())
    and (
      public.is_staff()
      or exists (
        select 1 from public.job_assignments ja
        where ja.job_id = time_entries.job_id and ja.profile_id = auth.uid()
      )
    )
  );

drop policy if exists mileage_insert on public.mileage_entries;
create policy mileage_insert on public.mileage_entries for insert
  with check (
    tenant_id = public.current_tenant_id()
    and (profile_id = auth.uid() or public.is_staff())
    and (
      public.is_staff()
      or exists (
        select 1 from public.job_assignments ja
        where ja.job_id = mileage_entries.job_id and ja.profile_id = auth.uid()
      )
    )
  );

drop policy if exists expenses_insert on public.expenses;
create policy expenses_insert on public.expenses for insert
  with check (
    tenant_id = public.current_tenant_id()
    and (profile_id = auth.uid() or public.is_staff())
    and (
      public.is_staff()
      or exists (
        select 1 from public.job_assignments ja
        where ja.job_id = expenses.job_id and ja.profile_id = auth.uid()
      )
    )
  );

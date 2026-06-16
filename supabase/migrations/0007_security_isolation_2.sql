-- ============================================================================
-- Security hardening (round 2) — branding-bucket tenant isolation + lock down
-- the platform-admin flag so it can't grant silent cross-tenant access.
-- Additive + idempotent. Auto-applies on deploy via scripts/migrate.mjs.
-- ============================================================================

-- 1) Branding bucket: per-tenant path isolation (mirror 0006 for docs) --------
-- branding_write/branding_update gated only on is_admin(), so any tenant's
-- admin could overwrite another tenant's logo path. Scope writes to the
-- caller's tenant prefix (platform admin keeps cross-tenant access).
drop policy if exists branding_write on storage.objects;
create policy branding_write on storage.objects for insert
  with check (
    bucket_id = 'branding'
    and (
      public.is_platform_admin()
      or (public.is_admin() and (storage.foldername(name))[1] = public.current_tenant_id()::text)
    )
  );

drop policy if exists branding_update on storage.objects;
create policy branding_update on storage.objects for update
  using (
    bucket_id = 'branding'
    and (
      public.is_platform_admin()
      or (public.is_admin() and (storage.foldername(name))[1] = public.current_tenant_id()::text)
    )
  )
  with check (
    bucket_id = 'branding'
    and (
      public.is_platform_admin()
      or (public.is_admin() and (storage.foldername(name))[1] = public.current_tenant_id()::text)
    )
  );

-- 2) Lock down the platform-admin flag --------------------------------------
-- Every tenant RLS policy is `is_platform_admin() OR (tenant_id = current...)`.
-- A profile that is BOTH is_platform_admin=true AND has a tenant_id would pass
-- the platform branch on every table → silent cross-tenant superuser. Close it
-- on three fronts:

-- (a) A real platform admin has NO tenant. Make the helper require that, so a
--     stray both-set row can never satisfy the platform branch.
create or replace function public.is_platform_admin()
returns boolean language sql security definer stable set search_path = public as $$
  select coalesce(
    (select is_platform_admin from public.profiles
     where id = auth.uid() and active and tenant_id is null),
    false
  );
$$;

-- (b) A tenant admin must not be able to mint a platform admin via PostgREST:
--     forbid setting is_platform_admin on the non-platform write branch.
drop policy if exists allowlist_all on public.allowlist;
create policy allowlist_all on public.allowlist for all
  using (
    public.is_platform_admin()
    or (tenant_id = public.current_tenant_id() and public.is_admin())
  )
  with check (
    public.is_platform_admin()
    or (
      tenant_id = public.current_tenant_id()
      and public.is_admin()
      and not is_platform_admin
    )
  );

-- (c) Hard invariant: platform admins are tenant-less. Backstop against any
--     path (manual edit, future code, bad seed) creating a both-set row.
do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'allowlist_platform_no_tenant'
  ) then
    alter table public.allowlist
      add constraint allowlist_platform_no_tenant
      check (not (is_platform_admin and tenant_id is not null));
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_platform_no_tenant'
  ) then
    alter table public.profiles
      add constraint profiles_platform_no_tenant
      check (not (is_platform_admin and tenant_id is not null));
  end if;
end $$;

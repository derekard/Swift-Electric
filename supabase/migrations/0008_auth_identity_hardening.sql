-- ============================================================================
-- Auth identity hardening
-- - Make invite matching deterministic and case-insensitive.
-- - Only activate invite-matched profiles for Google-authenticated users.
-- - Apply new invites to existing pending profiles created before invitation.
-- ============================================================================

do $$
begin
  if exists (
    select 1
    from public.allowlist
    group by lower(btrim(email))
    having count(*) > 1
  ) then
    raise exception
      'Duplicate allowlist emails differing only by case; normalize them before applying 0008_auth_identity_hardening.sql';
  end if;
end $$;

update public.allowlist
set email = lower(btrim(email))
where email <> lower(btrim(email));

create unique index if not exists allowlist_email_lower_key
  on public.allowlist ((lower(email)));

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'allowlist_email_normalized'
  ) then
    alter table public.allowlist
      add constraint allowlist_email_normalized
      check (email = lower(btrim(email))) not valid;
  end if;
end $$;

alter table public.allowlist validate constraint allowlist_email_normalized;

create or replace function public.is_google_auth_user(app_meta jsonb)
returns boolean language sql immutable as $$
  select coalesce(app_meta ->> 'provider', '') = 'google'
    or coalesce(app_meta -> 'providers', '[]'::jsonb) ? 'google';
$$;

-- Tenant helpers must never grant RLS access to inactive users or invalid
-- rows that are both platform-admin and tenant-bound.
create or replace function public.current_tenant_id()
returns uuid language sql security definer stable set search_path = public as $$
  select tenant_id
  from public.profiles
  where id = auth.uid()
    and active
    and not is_platform_admin;
$$;

create or replace function public.is_admin()
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and active
      and not is_platform_admin
      and role = 'admin'
      and tenant_id is not null
  );
$$;

create or replace function public.is_staff()
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and active
      and not is_platform_admin
      and role in ('admin', 'office')
      and tenant_id is not null
  );
$$;

create or replace function public.is_active_user()
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and active
      and (not is_platform_admin or tenant_id is null)
  );
$$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  allow public.allowlist%rowtype;
  normalized_email text := lower(btrim(new.email));
  is_google boolean := public.is_google_auth_user(new.raw_app_meta_data);
  invited boolean;
begin
  select * into allow from public.allowlist where email = normalized_email;
  invited := allow.email is not null and is_google;

  insert into public.profiles
    (id, tenant_id, email, full_name, role, hourly_wage, is_platform_admin, active)
  values (
    new.id,
    case
      when invited and allow.is_platform_admin then null
      when invited then allow.tenant_id
      else null
    end,
    normalized_email,
    coalesce(
      case when invited then allow.full_name end,
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name'
    ),
    case when invited then coalesce(allow.role, 'tech') else 'tech' end,
    case when invited then coalesce(allow.hourly_wage, 0) else 0 end,
    invited and coalesce(allow.is_platform_admin, false),
    invited
  );
  return new;
end;
$$;

create or replace function public.apply_allowlist_to_existing_profile()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.profiles p
  set
    tenant_id = case when new.is_platform_admin then null else new.tenant_id end,
    full_name = coalesce(new.full_name, p.full_name),
    role = new.role,
    hourly_wage = new.hourly_wage,
    is_platform_admin = new.is_platform_admin,
    active = true,
    email = new.email
  from auth.users u
  where p.id = u.id
    and lower(btrim(p.email)) = new.email
    and p.active = false
    and p.tenant_id is null
    and p.is_platform_admin = false
    and public.is_google_auth_user(u.raw_app_meta_data);

  return new;
end;
$$;

drop trigger if exists on_allowlist_applied_to_profile on public.allowlist;
create trigger on_allowlist_applied_to_profile
  after insert or update of tenant_id, role, full_name, hourly_wage, is_platform_admin
  on public.allowlist
  for each row execute function public.apply_allowlist_to_existing_profile();

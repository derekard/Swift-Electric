-- Capture an employee's hourly wage at invite time, and copy it onto their
-- profile when they first sign in. Run in the Supabase SQL editor (live DB).

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
    allow.email is not null              -- only allowlisted users start active
  );
  return new;
end;
$$;

-- Swift Electric — seed data (idempotent, multi-tenant)

-- Demo tenant: Swift Electric (customer #1). Fixed id for stable references.
insert into public.tenants (id, name, slug)
values ('00000000-0000-0000-0000-0000000000aa', 'Swift Electric', 'swift-electric')
on conflict (id) do nothing;

insert into public.tenant_settings (tenant_id, company_name, owner_name, license_number)
values ('00000000-0000-0000-0000-0000000000aa', 'Swift Electric', 'Matthew Swift', '7005396')
on conflict (tenant_id) do nothing;

-- Standard price book for Swift Electric (only when empty for that tenant).
insert into public.price_book_items (tenant_id, name, unit_price, category, sort)
select '00000000-0000-0000-0000-0000000000aa', name, unit_price, category, sort
from (values
  ('Receptacle',       75.00, 'Devices',  10),
  ('Switch',           75.00, 'Devices',  20),
  ('Dimmer',          125.00, 'Devices',  30),
  ('GFI / GFCI',      125.00, 'Devices',  40),
  ('20 Amp',          150.00, 'Devices',  50),
  ('20 Amp GFI',      175.00, 'Devices',  60),
  ('Pot light',       135.00, 'Lighting', 70),
  ('Light fixture',   125.00, 'Lighting', 80),
  ('Exhaust fan',     350.00, 'Fans',     90),
  ('Timer',           150.00, 'Devices', 100)
) as v(name, unit_price, category, sort)
where not exists (
  select 1 from public.price_book_items
  where tenant_id = '00000000-0000-0000-0000-0000000000aa'
);

-- Invite allowlist. No default admin accounts are seeded. Adding a real email
-- here grants app access on first login, so add deployment-specific rows only
-- after the owner confirms the addresses.
--
-- Example tenant admin, intentionally commented and using .invalid:
-- insert into public.allowlist (email, tenant_id, role, full_name, is_platform_admin)
-- values ('owner-admin@example.invalid', '00000000-0000-0000-0000-0000000000aa', 'admin', 'Owner Admin', false)
-- on conflict (email) do nothing;

-- To add a PLATFORM admin (manages ALL companies at /platform/admin), use a
-- DIFFERENT confirmed email (one email = one account):
-- insert into public.allowlist (email, tenant_id, role, is_platform_admin)
-- values ('platform-admin@example.invalid', null, 'admin', true)
-- on conflict (email) do nothing;

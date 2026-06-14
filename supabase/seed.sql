-- Swift Electric — seed data (idempotent)

-- Company settings (single row)
insert into public.app_settings (id, company_name, owner_name, license_number)
values (1, 'Swift Electric', 'Matthew Swift', '7005396')
on conflict (id) do nothing;

-- Standard price book (all-in installed prices). Only seeded when table is empty.
insert into public.price_book_items (name, unit_price, category, sort)
select * from (values
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
where not exists (select 1 from public.price_book_items);

-- Invite allowlist. First Google login with one of these emails provisions a
-- profile with the given role. EDIT these to the real addresses.
insert into public.allowlist (email, role, full_name) values
  ('derekard@gmail.com',        'owner', 'Derek Ard'),
  ('matthew@swiftelectric.ca',  'owner', 'Matthew Swift')   -- TODO: real email
on conflict (email) do nothing;

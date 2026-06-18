@AGENTS.md

# Swift Electric — project notes

Quoting + job-management PWA for an Ontario electrical contractor. See `README.md` for setup
and the plan file for the phased roadmap.

## Stack & conventions that bite

- **Next.js 16, App Router.** The root middleware convention is `src/proxy.ts` (export
  `proxy`), NOT `middleware.ts`. It refreshes the Supabase session and gates routes.
- **shadcn/ui is on Base UI, not Radix.** Components compose with a `render` prop, not
  `asChild`. e.g. `<Button render={<Link href="…" />}>Label</Button>`,
  `<FormControl render={<Input />} />`. Don't reach for `@radix-ui/*`.
- **Tailwind v4** — colors via CSS variables in `src/app/globals.css`. Primary is amber
  (electrical brand). Arbitrary spacing like `size-4.5` is valid.
- **Supabase** clients: `src/lib/supabase/{client,server,proxy}.ts`. Hand-maintained DB types
  in `src/lib/supabase/types.ts` — keep in sync with `supabase/migrations/`.

## Domain rules

- Two roles: `owner` (full) and `tech` (own jobs/time/mileage only). Enforced by **RLS** in
  the DB *and* `requireProfile()` / `requireOwner()` in `src/lib/auth.ts`. Never rely on UI
  gating alone.
- Access is **invite-only**: first Google login provisions a profile via the `handle_new_user`
  trigger, active only if the email is in `allowlist`.
- **Price-book items are all-in installed prices.** A quote = item counts + fees. Fees: JIC,
  admin, small-parts are % of items subtotal; permit is flat. HST 13%.
- Quotes **snapshot** their fee %s + HST rate at creation (columns on `quotes`) so editing
  Settings never rewrites historical quotes. Computed totals live in the `quote_totals` view.
- Two views of a quote: internal pricing sheet (owner) and a client-facing letter grouped by
  room/area (no per-item pricing) ending in TOTAL + "HST extra".
- Margins = `job_costs` view: invoice pre-tax revenue − labor(hours×wage) − mileage(km×rate) −
  parts.

## Multi-tenant (v2)

- One shared DB; every table has `tenant_id`. A `BEFORE INSERT` trigger (`set_tenant_id`) stamps
  it from `current_tenant_id()`, so most inserts don't set it — but cross-tenant inserts by the
  **platform admin** (e.g. seeding a new company's price book) MUST pass `tenant_id` explicitly.
- Roles: `admin | office | tech` (no more `owner`). Guards: `adminContext` (settings/team/price
  book), `staffContext` (clients/quotes/jobs/invoices), `userContext` (techs' own entries),
  `platformContext`. Page guards: `requireAdmin` / `requireStaff` / `requireTenantMember` /
  `requirePlatformAdmin` in `src/lib/auth.ts`.
- Platform admins have `tenant_id = null` + `is_platform_admin = true`; they live at
  `/platform/admin`, not the tenant app.
- Tenant resolved by host in `src/lib/tenant.ts` (`getSiteTenant`, service-role lookup). Per-tenant
  branding from `tenant_settings` (`company_name`/`logo_url`/`brand_color`); `brand_color` is
  injected as `--primary`. `getSettings()` reads the caller's tenant row (RLS-scoped).
- Brand: Gold `#C49A2C` / Charcoal `#1A1A1A` / Slate `#6B6F76`; fonts Raleway (`--font-sans`) +
  Montserrat (`--font-heading`).

## Migrations

- DB changes go in numbered files `supabase/migrations/NNNN_name.sql`. They **auto-apply on
  deploy**: the Render build runs `npm run db:migrate` (`scripts/migrate.mjs`), which runs each
  file once, tracked in `public.app_migrations` (and baselines an existing DB by marking
  `0001_init.sql` applied when `public.tenants` already exists). Needs `SUPABASE_DB_URL`.
- So just add a new `NNNN_*.sql` and push — no manual SQL. Keep migrations additive
  (`add column if not exists`, etc.) unless you are deliberately resequencing before handoff.

## Verify

`npm run build` (typechecks too). For DB changes, validate with `npx supabase db reset`
against a local stack (needs Docker).

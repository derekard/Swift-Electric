# Swift Electric

Quoting and job-management web app / PWA for **Swift Electric** (Matthew Swift, Master
Electrician, Ontario). Build quotes from a standard price book, turn them into invoices and
jobs, and let the crew log time + mileage against each job so the owner can see real margins.

- **Stack:** Next.js (App Router, TypeScript) · Tailwind v4 · shadcn/ui (Base UI) · Supabase
  (Postgres + Auth/Google + Storage + RLS) · deployed on Vercel.
- **Multi-tenant:** one shared backend serves many contractor companies, each with its own
  users, data, branding and (sub)domain. Swift Electric is customer #1.
- **Auth:** invite-only Google sign-in. Per-company roles: `admin` · `office` · `tech`, plus a
  **platform admin** who onboards companies. Enforced by Postgres RLS scoped by `tenant_id`.
- **Net-15 invoicing** with automatic outstanding-invoice follow-ups (client emails + owner
  digest) via a daily cron.
- **Install:** responsive, white-label PWA — installable on an Android home screen.

See [`/Users/derekard-air/.claude/plans/splendid-giggling-gadget.md`](.) for the full product
plan and the phased roadmap.

---

## Roadmap

| Phase | Scope | Status |
|------|-------|--------|
| 1 | Foundation: scaffold, auth + roles, schema/seed, app shell, PWA | ✅ done |
| 2 | Quoting: clients, tap/type + voice quote builder, client PDF, email send | ✅ done |
| 3 | Jobs & invoicing: accept quote → job + invoice, invoice PDF, payments status | ✅ done |
| 4 | Team portal: time entry, KM/mileage, expenses, submit/approve | ✅ done |
| 5 | Owner dashboard: job costs vs. revenue, margins | ✅ done |
| 6 | Settings (price book/fees/wages/invites), PWA install, public marketing site | ✅ done |
| v2 | Multi-tenant + roles + platform admin · Net-15 reminders · brand identity | ✅ done |

The full app is built. Remaining work is operational: connect Supabase + Google OAuth (below),
fill in real numbers in **Settings**, and deploy. Optional integrations (voice, email) activate
when their API keys are present.

## Multi-tenant & roles

- Every table carries `tenant_id`; RLS isolates each company. A `BEFORE INSERT` trigger stamps
  `tenant_id` from the caller, so app code rarely sets it.
- Roles: **admin** (full, incl. settings/team), **office** (quotes/jobs/invoices/clients, no
  settings), **tech** (assigned jobs + own time/mileage/expenses). A **platform admin**
  (`is_platform_admin`) manages all companies at **/platform/admin** — create a company there
  (it provisions settings + price book + invites the company admin).
- **Branding** (logo, accent colour, name) is per-company in `tenant_settings` and flows into the
  login, app shell, PDFs and emails. The accent is injected as the `--primary` CSS variable.
- **Tenant resolution by host**: `<slug>.NEXT_PUBLIC_APP_DOMAIN` or a company's `custom_domain`
  (see `src/lib/tenant.ts`). Locally, set `DEV_TENANT_SLUG`. Apex/unknown host → marketing.

## Invoice reminders (Net-15)

- Marking an invoice **sent** sets `due_date = issued + net_days` (default 15, per-company).
- `vercel.json` runs `/api/cron/invoice-reminders` daily. It emails clients on the due date and
  at +7/+14 days overdue, and emails each company's admins/office an outstanding-invoice digest.
  Protected by `CRON_SECRET`. Trigger locally: `GET /api/cron/invoice-reminders?key=$CRON_SECRET`.

---

## Local setup

### 1. Install

```bash
npm install
```

### 2. Create a Supabase project

1. Create a project at <https://supabase.com> (free tier is fine).
2. In **Project Settings → API**, copy:
   - Project URL → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon` public key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY` (server-only, never expose)

### 3. Environment variables

```bash
cp .env.example .env.local
```

Fill in the Supabase values. `ANTHROPIC_API_KEY` (voice) and `RESEND_API_KEY` (email) are
only needed from Phase 2 onward — leave blank for now.

### 4. Apply the database schema + seed

The schema lives in [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql)
and the seed in [`supabase/seed.sql`](supabase/seed.sql).

**Option A — Supabase CLI (recommended):**

```bash
npx supabase link --project-ref <your-project-ref>
npx supabase db push          # applies migrations
# then run the seed once, e.g. paste supabase/seed.sql into the SQL editor,
# or use a local stack:  npx supabase db reset   (resets + seeds a LOCAL db)
```

**Option B — Dashboard:** open the SQL editor and run the contents of
`0001_init.sql`, then `seed.sql`.

> **Edit the allowlist.** `seed.sql` seeds the invite allowlist with placeholder owner
> emails. Update the `allowlist` rows to the real Google addresses before anyone signs in —
> only allowlisted emails get an active account. (Owners can manage the allowlist in-app once
> Settings ships in a later phase; until then, edit the `allowlist` table directly.)

### 5. Configure Google sign-in

1. In **Google Cloud Console**, create an OAuth 2.0 Client ID (type: Web application).
   - Authorized redirect URI: `https://<your-project-ref>.supabase.co/auth/v1/callback`
2. In **Supabase → Authentication → Providers → Google**, paste the Client ID + secret and
   enable it.
3. In **Supabase → Authentication → URL Configuration**, set the Site URL and add redirect
   URLs for `http://localhost:3000/**` and your production domain `https://.../**`.

### 6. Run

```bash
npm run dev      # http://localhost:3000
```

Sign in with an allowlisted Google account. Owners land on the dashboard; techs land on
their jobs.

---

## Deploy (Vercel)

1. Import the repo in Vercel.
2. Add the same env vars (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
   `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SITE_URL` = your prod URL; plus
   `ANTHROPIC_API_KEY` / `RESEND_API_KEY` / `EMAIL_FROM` when those features land).
3. Deploy. Add the production domain to Supabase Auth redirect URLs (step 5.3 above).

---

## Project structure

```
src/
  app/
    (app)/              # authenticated, role-gated area (sidebar shell)
      dashboard/        #   owner
      quotes/ jobs/ invoices/ clients/ settings/
      my/jobs/ my/timesheet/   #   tech
    auth/callback/      # OAuth code exchange
    login/  no-access/  # public
  components/
    ui/                 # shadcn (Base UI) primitives
    app-shell.tsx       # sidebar + mobile nav
  lib/
    auth.ts             # requireProfile / requireOwner helpers
    nav.ts              # role-based nav config
    supabase/           # browser/server/proxy clients + DB types
  proxy.ts              # session refresh + route gating (Next 16 "proxy")
supabase/
  migrations/0001_init.sql
  seed.sql
```

## Conventions

- **Roles & access** are enforced two ways: `proxy.ts` redirects unauthenticated users, and
  every server page calls `requireProfile()` / `requireOwner()`. The database is the source of
  truth via **RLS** — owners see everything; techs see only their own jobs/time/mileage.
- **Quotes** snapshot their fee percentages + HST rate at creation, so changing Settings later
  never rewrites old quotes. Totals are computed in the `quote_totals` view.
- **Margins** come from the `job_costs` view: revenue (invoice pre-tax) − labor (hours × wage)
  − mileage (km × rate) − parts.
- UI primitives use **Base UI** (`render` prop), not Radix (`asChild`).

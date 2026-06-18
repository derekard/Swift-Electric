# Swift Electric

Quoting and job-management web app / PWA for **Swift Electric** (Matthew Swift, Master
Electrician, Ontario). Build quotes from a standard price book, turn them into invoices and
jobs, and let the crew log time + mileage against each job so the owner can see real margins.

- **Stack:** Next.js (App Router, TypeScript) · Tailwind v4 · shadcn/ui (Base UI) · Supabase
  (Postgres + Auth/Google + Storage + RLS) · deployed on Render (Blueprint in `render.yaml`).
- **Multi-tenant:** one shared backend serves many contractor companies, each with its own
  users, data, branding and (sub)domain. Swift Electric is customer #1.
- **Auth:** Google sign-in gated by an in-app authorization list (no email is sent
  automatically). Per-company roles: `admin` · `office` · `tech`, plus a **platform admin**
  who onboards companies. Enforced by Postgres RLS scoped by `tenant_id`.
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
| 6 | Settings (price book/fees/wages/authorized emails), PWA install, public marketing site | ✅ done |
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
  (it provisions settings + price book + an authorized admin email).
- **Branding** (logo URL, accent colour, name) is per-company in `tenant_settings` and flows
  into the login, app shell, PDFs and emails. Admins can edit the logo URL and accent colour in
  Settings; the accent is injected as the `--primary` CSS variable.
- **Tenant resolution by host**: `<slug>.NEXT_PUBLIC_APP_DOMAIN` or a company's `custom_domain`
  (see `src/lib/tenant.ts`). Locally, set `DEV_TENANT_SLUG`. Apex/unknown host → marketing.

## Invoice reminders (Net-15)

- Marking an invoice **sent** sets `due_date = issued + net_days` (default 15, per-company).
- A daily Render cron hits `/api/cron/invoice-reminders`, emails clients on the due date and
  at +7/+14 days overdue, and emails each company's admins/office an outstanding-invoice
  digest. A monthly Render cron hits `/api/cron/monthly-statement` for bookkeeping emails.
  Production cron requests must send `Authorization: Bearer $CRON_SECRET`; the `?key=...`
  shortcut is local-development only. The checked-in `vercel.json` lists the same paths and
  schedules, but production callers must be able to send the bearer header.

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
3. In **Project Settings → Database**, copy a Postgres connection string for
   `SUPABASE_DB_URL` if you want `npm run db:migrate` or Render deploys to apply
   pending migrations automatically.

### 3. Environment variables

```bash
cp .env.example .env.local
```

Fill in the Supabase values. `ANTHROPIC_API_KEY` (voice) and `RESEND_API_KEY` / `EMAIL_FROM`
(email) are only needed from Phase 2 onward — leave blank for now. For public contact
requests, set the company email in Settings or use `CONTACT_TO_EMAIL` as a fallback.

### 4. Apply the database schema + seed

The database schema is the ordered set of SQL files in
[`supabase/migrations`](supabase/migrations). Apply all migrations; do not run
only `0001_init.sql`. The seed is in [`supabase/seed.sql`](supabase/seed.sql).

**Supabase CLI (authoritative path):**

```bash
npx supabase link --project-ref <your-project-ref>
npx supabase db push          # applies every supabase/migrations/*.sql file
# then run the seed once, e.g. paste supabase/seed.sql into the SQL editor,
# or use a local stack:  npx supabase db reset   (resets + seeds a LOCAL db)
```

For deploy-time migrations without the Supabase CLI, set `SUPABASE_DB_URL` and
run `npm run db:migrate`; it uses the same ordered migration directory and tracks
applied files in `public.app_migrations`.

> **Authorize Google emails.** `seed.sql` does not seed any live admin accounts. Add the
> owner's real Google address to `allowlist` before first login — only authorized emails get an
> active account. Admins can manage authorized Google emails in **Settings > Team**; adding one
> does not send mail, so share the login URL separately.

### 5. Configure Google sign-in

1. In **Google Cloud Console**, create an OAuth 2.0 Client ID (type: Web application).
   - Authorized redirect URI: `https://<your-project-ref>.supabase.co/auth/v1/callback`
2. In **Supabase → Authentication → Providers → Google**, paste the Client ID + secret and
   enable it.
3. In **Supabase → Authentication → URL Configuration**, set the Site URL and add redirect
   URLs for `http://localhost:3000/**` and your production domain `https://.../**`.
4. Set `NEXT_PUBLIC_SITE_URL` to the exact production origin. The OAuth callback uses this
   configured origin for production redirects and will not trust forwarded host headers.

### 6. Run

```bash
npm run dev      # http://localhost:3000
```

Sign in with an allowlisted Google account. Owners land on the dashboard; techs land on
their jobs.

---

## Deploy (Render)

The repo ships a Render Blueprint (`render.yaml`) that provisions three services: a **Web
Service** (the Next.js app) and two **Cron Jobs** (daily Net-15 reminders plus monthly
statements). Render ignores `vercel.json`, so these schedules live in the Blueprint.

1. Push the repo to GitHub/GitLab.
2. In Render: **New → Blueprint**, select the repo. Render reads `render.yaml`.
3. Fill in the secret env vars (everything marked `sync: false`): `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_URL`,
   `NEXT_PUBLIC_SITE_URL` (your prod URL), `NEXT_PUBLIC_APP_DOMAIN`, and — for contact/reminders/voice —
   `RESEND_API_KEY`, `EMAIL_FROM`, `CONTACT_TO_EMAIL`, `ANTHROPIC_API_KEY`.
   `CRON_SECRET` is generated automatically and shared with the cron jobs, which send it as
   an `Authorization: Bearer ...` header.
   `SUPABASE_DB_URL` is required for Render's build-time migration step; if it is blank,
   `npm run db:migrate` skips and the deploy can point at a stale schema. `NEXT_PUBLIC_*`
   vars are baked in at build time, so set them before the first build.
4. Deploy. Then add the production URL to **Supabase → Auth → URL Configuration** (Site URL +
   redirect `https://<your-app>.onrender.com/**`), and make sure `NEXT_PUBLIC_SITE_URL`
   matches it or Google sign-in fails.

**Node** is pinned in `.node-version`. The Blueprint uses the **Starter** plan on purpose —
the free instance spins down when idle and can OOM during `next build`; use free only for
throwaway tests.

**Multi-tenant domains:** `*.onrender.com` can't do wildcard subdomains. For
`<slug>.yourdomain.com` tenant routing, add a custom domain to the web service with a wildcard
DNS record and set `NEXT_PUBLIC_APP_DOMAIN` to that apex. For a single tenant, map a custom
domain and set it as that tenant's `custom_domain`.

> Vercel still works unchanged via `vercel.json` if you ever want it — the two are independent.

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
  migrations/*.sql
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

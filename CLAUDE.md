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

## Verify

`npm run build` (typechecks too). For DB changes, validate with `npx supabase db reset`
against a local stack (needs Docker).

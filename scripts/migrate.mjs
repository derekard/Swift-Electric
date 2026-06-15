// Applies pending SQL migrations to the database on deploy.
//
// - Runs every file in supabase/migrations/*.sql in order, once each, tracked
//   in a public.app_migrations table.
// - Auto-baselines a database that was set up before this runner existed: if
//   nothing is tracked yet but the schema already exists (public.tenants),
//   the initial migration is marked applied so it isn't re-run.
// - No SUPABASE_DB_URL set → skips quietly (e.g. local builds, previews).
//
// Wire-up: `npm run db:migrate` (runs in the Render build before next build).
import { readdir, readFile } from "node:fs/promises"
import path from "node:path"
import pg from "pg"

const url = process.env.SUPABASE_DB_URL
if (!url) {
  console.log("[migrate] SUPABASE_DB_URL not set — skipping migrations")
  process.exit(0)
}

const dir = path.join(process.cwd(), "supabase", "migrations")
const files = (await readdir(dir))
  .filter((f) => /^\d.*\.sql$/.test(f))
  .sort()

const client = new pg.Client({
  connectionString: url,
  ssl: { rejectUnauthorized: false },
})
await client.connect()

try {
  await client.query(
    `create table if not exists public.app_migrations (
       name text primary key,
       run_at timestamptz not null default now()
     )`
  )

  const { rows } = await client.query("select name from public.app_migrations")
  const applied = new Set(rows.map((r) => r.name))

  // Baseline an existing (manually set-up) database so we don't re-run 0001.
  if (applied.size === 0 && files.length) {
    const reg = await client.query("select to_regclass('public.tenants') as t")
    if (reg.rows[0].t) {
      await client.query(
        "insert into public.app_migrations(name) values ($1) on conflict do nothing",
        [files[0]]
      )
      applied.add(files[0])
      console.log(`[migrate] baselined existing schema: ${files[0]}`)
    }
  }

  let ran = 0
  for (const f of files) {
    if (applied.has(f)) continue
    const sql = await readFile(path.join(dir, f), "utf8")
    console.log(`[migrate] applying ${f}…`)
    await client.query("begin")
    try {
      await client.query(sql)
      await client.query(
        "insert into public.app_migrations(name) values ($1)",
        [f]
      )
      await client.query("commit")
      ran++
    } catch (err) {
      await client.query("rollback")
      throw new Error(`Migration ${f} failed: ${err.message}`)
    }
  }
  console.log(
    ran ? `[migrate] applied ${ran} migration(s)` : "[migrate] up to date"
  )
} finally {
  await client.end()
}

import assert from "node:assert/strict"
import { readdir, readFile } from "node:fs/promises"
import { test } from "node:test"

async function readRepoFile(path) {
  return readFile(new URL(path, import.meta.url), "utf8")
}

test("migration filenames remain sequential", async () => {
  const files = (await readdir(new URL("../supabase/migrations/", import.meta.url)))
    .filter((file) => /^\d{4}_.*\.sql$/.test(file))
    .sort()

  files.forEach((file, index) => {
    assert.equal(file.slice(0, 4), String(index + 1).padStart(4, "0"))
  })
  assert.ok(files.includes("0013_cross_tenant_integrity.sql"))
})

test("cross-tenant integrity migration adds tenant-composite FKs", async () => {
  const migration = await readRepoFile(
    "../supabase/migrations/0013_cross_tenant_integrity.sql"
  )

  for (const constraint of [
    "clients_id_tenant_id_unique",
    "quotes_id_tenant_id_unique",
    "quote_areas_id_tenant_id_unique",
    "price_book_items_id_tenant_id_unique",
    "jobs_id_tenant_id_unique",
    "profiles_id_tenant_id_unique",
  ]) {
    assert.match(migration, new RegExp(`add constraint ${constraint} unique`, "i"))
  }

  const relationships = [
    ["quotes", "quotes_client_same_tenant_fk", "client_id, tenant_id", "clients"],
    ["quote_areas", "quote_areas_quote_same_tenant_fk", "quote_id, tenant_id", "quotes"],
    ["quote_lines", "quote_lines_area_same_tenant_fk", "area_id, tenant_id", "quote_areas"],
    [
      "quote_lines",
      "quote_lines_price_book_item_same_tenant_fk",
      "price_book_item_id, tenant_id",
      "price_book_items",
    ],
    ["jobs", "jobs_quote_same_tenant_fk", "quote_id, tenant_id", "quotes"],
    ["jobs", "jobs_client_same_tenant_fk", "client_id, tenant_id", "clients"],
    ["job_assignments", "job_assignments_job_same_tenant_fk", "job_id, tenant_id", "jobs"],
    [
      "job_assignments",
      "job_assignments_profile_same_tenant_fk",
      "profile_id, tenant_id",
      "profiles",
    ],
    ["invoices", "invoices_job_same_tenant_fk", "job_id, tenant_id", "jobs"],
    ["invoices", "invoices_quote_same_tenant_fk", "quote_id, tenant_id", "quotes"],
    ["invoices", "invoices_client_same_tenant_fk", "client_id, tenant_id", "clients"],
    ["time_entries", "time_entries_job_same_tenant_fk", "job_id, tenant_id", "jobs"],
    ["mileage_entries", "mileage_entries_job_same_tenant_fk", "job_id, tenant_id", "jobs"],
    ["expenses", "expenses_job_same_tenant_fk", "job_id, tenant_id", "jobs"],
    ["job_visits", "job_visits_job_same_tenant_fk", "job_id, tenant_id", "jobs"],
  ]

  for (const [child, constraint, fkColumns, parent] of relationships) {
    assert.match(
      migration,
      new RegExp(
        `alter table public\\.${child}[\\s\\S]*?add constraint ${constraint}` +
          `[\\s\\S]*?foreign key \\(${fkColumns}\\)` +
          `[\\s\\S]*?references public\\.${parent} \\(id, tenant_id\\)` +
          `[\\s\\S]*?not valid;`,
        "i"
      )
    )
  }
})

test("public quote service-role reads keep related rows in the quote tenant", async () => {
  const publicQuote = await readRepoFile("../src/lib/public-quote.ts")
  const acceptance = await readRepoFile("../src/lib/quote-acceptance.ts")

  assert.match(
    publicQuote,
    /from\("quote_areas"\)[\s\S]*?\.eq\("quote_id", quote\.id\)[\s\S]*?\.eq\("tenant_id", quote\.tenant_id\)/
  )
  assert.match(
    publicQuote,
    /from\("quote_lines"\)[\s\S]*?\.in\("area_id", areaIds\)[\s\S]*?\.eq\("tenant_id", quote\.tenant_id\)/
  )
  assert.match(
    publicQuote,
    /from\("clients"\)[\s\S]*?\.eq\("id", quote\.client_id\)[\s\S]*?\.eq\("tenant_id", quote\.tenant_id\)/
  )

  assert.match(
    acceptance,
    /from\("jobs"\)[\s\S]*?\.eq\("quote_id", quoteId\)[\s\S]*?\.eq\("tenant_id", tenantId\)/
  )
  assert.match(
    acceptance,
    /from\("invoices"\)[\s\S]*?\.eq\("quote_id", quoteId\)[\s\S]*?\.eq\("tenant_id", tenantId\)/
  )
  assert.match(
    acceptance,
    /from\("quotes"\)[\s\S]*?\.update\(patch\)[\s\S]*?\.eq\("id", args\.quote\.id\)[\s\S]*?\.eq\("tenant_id", args\.quote\.tenant_id\)/
  )
})

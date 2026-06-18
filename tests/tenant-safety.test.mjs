import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { test } from "node:test"
import ts from "typescript"

async function readRepoFile(path) {
  return readFile(new URL(path, import.meta.url), "utf8")
}

async function importTenantDomainHelpers() {
  const source = await readRepoFile("../src/lib/tenant.ts")
  const start = source.indexOf("const DOMAIN_LABEL_RE")
  const end = source.indexOf("/** Parse the request host")
  assert.notEqual(start, -1)
  assert.notEqual(end, -1)

  const { outputText } = ts.transpileModule(source.slice(start, end), {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
    },
  })

  const url = `data:text/javascript;base64,${Buffer.from(outputText).toString(
    "base64"
  )}`
  return import(url)
}

const { normalizeCustomDomain, normalizeHostname } =
  await importTenantDomainHelpers()

test("custom domains are normalized before tenant lookup/storage", () => {
  assert.equal(normalizeHostname("Tenant.Example.COM:3000"), "tenant.example.com")
  assert.equal(normalizeHostname("https://Root.Example.COM"), "root.example.com")
  assert.deepEqual(normalizeCustomDomain(" AcmeElectric.CA. "), {
    ok: true,
    domain: "acmeelectric.ca",
  })
  assert.deepEqual(normalizeCustomDomain("https://WWW.Example.COM/"), {
    ok: true,
    domain: "www.example.com",
  })
  assert.deepEqual(normalizeCustomDomain(" "), { ok: true, domain: null })
})

test("custom domains reject paths, ports, IPs, and invalid labels", () => {
  for (const domain of [
    "example.com/jobs",
    "https://example.com:8443",
    "localhost",
    "bad_domain.com",
    "-bad.example",
    "192.168.0.1",
  ]) {
    assert.equal(normalizeCustomDomain(domain).ok, false, domain)
  }
})

test("profile updates guard the last active tenant admin server-side", async () => {
  const source = await readRepoFile("../src/app/(app)/settings/actions.ts")

  assert.match(source, /At least one active admin is required\./)
  assert.match(
    source,
    /\.select\("id", \{ count: "exact", head: true \}\)[\s\S]*\.eq\("role", "admin"\)[\s\S]*\.eq\("active", true\)/
  )
  assert.match(
    source,
    /current\.role === "admin"[\s\S]*current\.active[\s\S]*nextRole !== "admin" \|\| !nextActive/
  )
})

test("price book updates are validated and delete archives tenant-scoped rows", async () => {
  const source = await readRepoFile("../src/app/(app)/settings/actions.ts")
  const deleteStart = source.indexOf("export async function deletePriceItemAction")
  const deleteEnd = source.indexOf("// ---------------------------------------------------------------------------", deleteStart)
  assert.notEqual(deleteStart, -1)
  assert.notEqual(deleteEnd, -1)
  const deleteAction = source.slice(deleteStart, deleteEnd)

  assert.match(source, /const priceItemUpdateSchema = priceItemSchema/)
  assert.match(source, /priceItemUpdateSchema\.safeParse\(input\)/)
  assert.match(source, /Enter at least one price book change\./)
  assert.match(deleteAction, /\.update\(\{ active: false \}\)/)
  assert.match(deleteAction, /\.eq\("tenant_id", tenantId\)/)
  assert.doesNotMatch(deleteAction, /\.delete\(\)/)
})

test("tenant creation preflights uniqueness and cleans partial inserts", async () => {
  const source = await readRepoFile("../src/app/platform/admin/actions.ts")

  assert.match(source, /normalizeCustomDomain/)
  assert.match(source, /reservedAppDomain/)
  assert.match(source, /preflightTenantCreate/)
  assert.match(source, /\.eq\("slug", slug\)/)
  assert.match(source, /\.eq\("custom_domain", customDomain\)/)
  assert.match(source, /\.eq\("email", adminEmail\)/)
  assert.match(source, /cleanupTenantCreation/)
  assert.match(source, /from\("tenant_settings"\)\.delete\(\)/)
  assert.match(source, /from\("price_book_items"\)\.delete\(\)/)
  assert.match(source, /from\("tenants"\)\.delete\(\)\.eq\("id", tenantId\)/)
})

import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { test } from "node:test"

async function readRepoFile(path) {
  return readFile(new URL(path, import.meta.url), "utf8")
}

function exportedFunction(source, name) {
  const start = source.indexOf(`export async function ${name}`)
  assert.notEqual(start, -1, `${name} should exist`)

  const next = source.indexOf("\nexport async function", start + 1)
  return source.slice(start, next === -1 ? undefined : next)
}

test("saveQuoteAction locks accepted quotes before mutating quote data", async () => {
  const source = await readRepoFile("../src/app/(app)/quotes/actions.ts")
  const action = exportedFunction(source, "saveQuoteAction")

  const acceptedGuard = action.indexOf('current.status === "accepted"')
  const metadataUpdate = action.indexOf(".update(meta)")
  const quoteAreaInsert = action.indexOf(
    '.insert({ quote_id: id, name: area.name, sort: areaIndex })'
  )

  assert.notEqual(acceptedGuard, -1)
  assert.notEqual(metadataUpdate, -1)
  assert.notEqual(quoteAreaInsert, -1)
  assert.ok(acceptedGuard < metadataUpdate)
  assert.ok(acceptedGuard < quoteAreaInsert)
  assert.match(action, /ACCEPTED_QUOTE_LOCK_MESSAGE/)
})

test("saveQuoteAction builds the replacement tree before removing old areas", async () => {
  const source = await readRepoFile("../src/app/(app)/quotes/actions.ts")
  const action = exportedFunction(source, "saveQuoteAction")

  const quoteAreaInsert = action.indexOf(
    '.insert({ quote_id: id, name: area.name, sort: areaIndex })'
  )
  const oldAreaDelete = action.indexOf('.in("id", oldAreaIds)')

  assert.notEqual(quoteAreaInsert, -1)
  assert.notEqual(oldAreaDelete, -1)
  assert.ok(quoteAreaInsert < oldAreaDelete)
  assert.match(action, /cleanupInsertedAreas/)
})

test("setQuoteStatusAction cannot unlock accepted quotes", async () => {
  const source = await readRepoFile("../src/app/(app)/quotes/actions.ts")
  const action = exportedFunction(source, "setQuoteStatusAction")

  assert.match(action, /status === "accepted"[\s\S]*acceptQuoteAction/)
  assert.match(action, /current\.status === "accepted"/)
  assert.match(action, /\.neq\("status", "accepted"\)/)
})

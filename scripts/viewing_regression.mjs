// Local-only regression: fresh in-memory D1, no production data or requests.
// Run with: node scripts/viewing_regression.mjs
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'

const root = fileURLToPath(new URL('../', import.meta.url))
const { outputFiles } = await build({
  stdin: {
    contents: `import { Hono } from 'hono';
      import { itemsRoutes } from './src/worker/routes/items';
      import { statsRoutes } from './src/worker/routes/stats';
      const app = new Hono();
      app.onError((e, c) => c.json({ error: e.message }, 500));
      app.route('/api/items', itemsRoutes);
      app.route('/api', statsRoutes);
      export default app;`,
    resolveDir: root,
    sourcefile: 'viewing-test-worker.ts',
    loader: 'ts',
  },
  bundle: true,
  format: 'esm',
  platform: 'browser',
  write: false,
})
const mf = new Miniflare(convertV4MiniflareOptions({
  modules: true,
  script: outputFiles[0].text,
  compatibilityDate: '2026-10-11',
  d1Databases: ['DB'],
  d1Persist: false,
  outboundService: () => { throw new Error('Unexpected outbound request') },
}))

try {
  const db = await mf.getD1Database('DB')
  const migrations = (await readdir(new URL('../migrations/', import.meta.url))).filter((name) => name.endsWith('.sql')).sort()
  for (const name of migrations) {
    const sql = await readFile(new URL(`../migrations/${name}`, import.meta.url), 'utf8')
    const statements = sql.replace(/--[^\n]*/g, '').split(/;(?=\s*(?:\n|$))/).map((s) => s.trim()).filter(Boolean)
    for (const statement of statements) await db.prepare(statement).run()
  }

  async function item(status) {
    const row = await db.prepare(
      `INSERT INTO items (title, category, status, progress, episode_count, rating, notes, review, created_at, updated_at)
       VALUES (?, 'series', ?, '3', 12, 4, '保留备注', '保留观后感', '2026-01-01', '2026-01-01') RETURNING id`
    ).bind(`观看测试 ${status}`, status).first()
    return row.id
  }
  async function call(path, body, status = 200) {
    const res = await mf.dispatchFetch(`http://localhost/api/${path}`, body === undefined ? {} : {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    })
    const result = await res.json()
    assert.equal(res.status, status, `${path}: ${JSON.stringify(result)}`)
    return result
  }
  const current = (id) => db.prepare('SELECT * FROM items WHERE id = ?').bind(id).first()
  const logs = async (id) => (await db.prepare('SELECT * FROM activity_log WHERE item_id = ? ORDER BY id').bind(id).all()).results
  const viewings = async (id) => (await db.prepare('SELECT * FROM viewings WHERE item_id = ? ORDER BY id').bind(id).all()).results
  const personalFields = ({ status, updated_at, ...rest }) => rest
  let count = 0
  const passed = (name) => { count++; console.log(`PASS ${name}`) }

  const labels = { want: '想看', watching: '在看', dropped: '弃了', done: '看过' }
  for (const status of Object.keys(labels)) {
    const id = await item(status)
    const before = await current(id)
    const countsBefore = await call('items/status-counts')
    const statsBefore = await call('stats')
    const viewing = await call(`items/${id}/viewings`, { watched_on: '2026-11-20', comment: ' 一刷短评 ' }, 201)
    assert.equal(viewing.item_id, id)
    assert.equal(viewing.watched_on, '2026-11-20')
    assert.equal(viewing.comment, '一刷短评')
    assert.ok(Number.isInteger(viewing.id))
    const after = await current(id)
    assert.equal(after.status, 'done')
    assert.equal(after.updated_at, viewing.created_at)
    assert.notEqual(after.updated_at, before.updated_at)
    assert.deepEqual(personalFields(after), personalFields(before))
    const activity = await logs(id)
    const statusLogs = activity.filter((log) => log.action === 'status_changed')
    assert.equal(statusLogs.length, status === 'done' ? 0 : 1)
    if (status !== 'done') assert.equal(statusLogs[0].detail, `状态：${labels[status]} → 看过`)
    assert.equal(activity.filter((log) => log.action === 'viewing_added').length, 1)
    assert.ok(activity.every((log) => log.created_at === viewing.created_at))
    const countsAfter = await call('items/status-counts')
    const expectedCounts = { ...countsBefore }
    if (status !== 'done') { expectedCounts[status]--; expectedCounts.done++ }
    assert.deepEqual(countsAfter, expectedCounts)
    const statsAfter = await call('stats')
    assert.equal(statsAfter.kpi.done, statsBefore.kpi.done + (status === 'done' ? 0 : 1))
    assert.equal((await call(`items/${id}`)).status, 'done')

    await call(`items/${id}/viewings`, { watched_on: '2026-11-20', comment: '二刷' }, 201)
    await call(`items/${id}/viewings`, { watched_on: '2020-01-01' }, 201)
    const detail = await call(`items/${id}`)
    assert.equal(detail.status, 'done')
    assert.equal(detail.viewings.length, 3)
    assert.equal(detail.last_watched, '2026-11-20')
    assert.equal(detail.activity.filter((log) => log.action === 'status_changed').length, status === 'done' ? 0 : 1)
    assert.equal(detail.activity.filter((log) => log.action === 'viewing_added').length, 3)
    assert.equal(detail.viewings.find((v) => v.watched_on === '2020-01-01').comment, '')
    passed(`${status} -> done, preserves fields, refreshes counts/detail; rewatch and backdated viewing`)
  }

  for (const action of ['status_changed', 'viewing_added']) {
    const id = await item('want')
    const before = await current(id)
    await db.exec(`CREATE TRIGGER fail_viewing_activity BEFORE INSERT ON activity_log WHEN NEW.action = '${action}' BEGIN SELECT RAISE(ABORT, 'mock activity failure'); END;`)
    await call(`items/${id}/viewings`, { watched_on: '2026-11-20' }, 500)
    assert.deepEqual(await current(id), before)
    assert.deepEqual(await viewings(id), [])
    assert.deepEqual(await logs(id), [])
    await db.exec('DROP TRIGGER fail_viewing_activity')
    await call(`items/${id}/viewings`, { watched_on: '2026-11-20' }, 201)
    assert.equal((await current(id)).status, 'done')
    assert.equal((await viewings(id)).length, 1)
    assert.equal((await logs(id)).length, 2)
    passed(`${action} failure rolls back viewing/status/timestamps/logs; retry succeeds`)
  }

  const invalidId = await item('watching')
  const beforeInvalid = await current(invalidId)
  for (const body of [{ watched_on: '2026-02-30' }, {}, { watched_on: '2026-11-20', comment: 'a'.repeat(2001) }]) {
    await call(`items/${invalidId}/viewings`, body, 400)
  }
  await call('items/not-an-id/viewings', { watched_on: '2026-11-20' }, 400)
  await call('items/999999/viewings', { watched_on: '2026-11-20' }, 404)
  assert.deepEqual(await current(invalidId), beforeInvalid)
  assert.deepEqual(await viewings(invalidId), [])
  assert.deepEqual(await logs(invalidId), [])
  passed('invalid input leaves viewing, status, and activity unchanged')

  console.log(`${count} viewing regression groups passed (fresh local D1, no production requests).`)
} finally {
  await mf.dispose()
}

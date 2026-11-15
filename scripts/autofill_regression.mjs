// Local-only regression: fresh in-memory D1 and mocked external metadata.
// Run with: node scripts/autofill_regression.mjs
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'

const root = fileURLToPath(new URL('../', import.meta.url))
const { outputFiles } = await build({
  stdin: {
    contents: `import { Hono } from 'hono';
      import { autofillRoutes } from './src/worker/routes/autofill';
      const app = new Hono();
      app.onError((e, c) => c.json({ error: e.message }, 500));
      app.route('/api/autofill', autofillRoutes);
      export default app;`,
    resolveDir: root,
    sourcefile: 'autofill-test-worker.ts',
    loader: 'ts',
  },
  bundle: true,
  format: 'esm',
  platform: 'browser',
  write: false,
})

const requests = []
const series = {
  id: 101, name: '示例剧集', first_air_date: '2010-01-01',
  number_of_seasons: 2, number_of_episodes: 18, vote_average: 8.5,
  poster_path: '/show.jpg', origin_country: ['US'], genres: [{ id: 18, name: 'Drama' }],
  created_by: [{ name: 'Example Creator' }],
  aggregate_credits: { cast: [{ name: 'Example Actor' }] },
  seasons: [
    { season_number: 1, episode_count: 10, air_date: '2010-01-01', poster_path: '/s1.jpg' },
    { season_number: 2, episode_count: 8, air_date: '2012-01-01', poster_path: '/s2.jpg' },
  ],
}
const book = {
  id: 201, name: 'Example Book', name_cn: '示例书籍', date: '2020-01-01', eps: 12,
  rating: { score: 8 }, images: { large: 'https://lain.bgm.tv/pic/cover/l/book.jpg' },
  tags: [{ name: '2020年', count: 100 }, { name: '奇幻', count: 90 }],
  infobox: [{ key: '作者', value: [{ v: 'Example Author（出版社）' }] }],
}
const mf = new Miniflare(convertV4MiniflareOptions({
  modules: true,
  script: outputFiles[0].text,
  compatibilityDate: '2026-10-11',
  d1Databases: ['DB'],
  d1Persist: false,
  bindings: { TMDB_API_KEY: 'local-mock-only' },
  outboundService: (request) => {
    const url = new URL(request.url)
    requests.push({ path: url.pathname, query: url.searchParams.get('query'), year: url.searchParams.get('first_air_date_year') })
    if (url.hostname === 'api.themoviedb.org') {
      if (url.pathname === '/3/search/tv') {
        return Response.json({ results: Array.from({ length: 4 }, (_, i) => ({ ...series, id: 101 + i })) })
      }
      if (/^\/3\/tv\/\d+\/season\/2$/.test(url.pathname)) {
        return Response.json({ air_date: '2012-01-01', episodes: Array.from({ length: 8 }, (_, i) => ({ episode_number: i + 1 })) })
      }
      if (/^\/3\/tv\/\d+$/.test(url.pathname)) return Response.json(series)
    }
    if (url.hostname === 'api.bgm.tv' && url.pathname === '/v0/subjects/201') return Response.json(book)
    throw new Error(`Unexpected mock request: ${url.hostname}${url.pathname}`)
  },
}))

try {
  const db = await mf.getD1Database('DB')
  const migrations = (await readdir(new URL('../migrations/', import.meta.url))).filter((name) => name.endsWith('.sql')).sort()
  for (const name of migrations) {
    const sql = await readFile(new URL(`../migrations/${name}`, import.meta.url), 'utf8')
    const statements = sql.replace(/--[^\n]*/g, '').split(/;(?=\s*(?:\n|$))/).map((s) => s.trim()).filter(Boolean)
    for (const statement of statements) await db.prepare(statement).run()
  }

  async function item(title, season = null, extra = {}) {
    const values = { title, category: 'series', season, created_at: '2026-01-01', updated_at: '2026-01-01', ...extra }
    const keys = Object.keys(values)
    const row = await db.prepare(`INSERT INTO items (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')}) RETURNING id`).bind(...Object.values(values)).first()
    return row.id
  }
  async function call(path, body, status = 200) {
    const res = await mf.dispatchFetch(`http://localhost/api/autofill/${path}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    })
    const result = await res.json()
    assert.equal(res.status, status, `${path}: ${JSON.stringify(result)}`)
    return result
  }
  const current = (id) => db.prepare('SELECT * FROM items WHERE id = ?').bind(id).first()
  const fieldsBody = (id, season) => ({ item_id: id, source: 'tmdb', external_id: '101', ...(season ? { season } : {}) })
  let count = 0
  const passed = (name) => { count++; console.log(`PASS ${name}`) }

  const queryId = await item('示例剧集')
  const preview = await call('preview', { item_id: queryId, query: '示例剧集 第2季', year: 2012 })
  assert.equal(preview.candidates.length, 4)
  assert.ok(preview.candidates.every((c) => c.seasonNumber === 2))
  assert.equal(preview.candidates[0].seasonEpisodeCount, 8)
  assert.ok(requests.filter((r) => r.path === '/3/search/tv').every((r) => r.year === null))
  const options = await call('fields', fieldsBody(queryId, preview.candidates[3].seasonNumber))
  assert.equal(options.available.find((f) => f.key === 'episode_count').preview, '8')
  const queryApplied = await call('apply', { ...fieldsBody(queryId, 2), fields: ['episode_count', 'year'] })
  let row = await current(queryId)
  assert.equal(row.episode_count, 8)
  assert.equal(row.year, 2012)
  assert.equal(row.season, 2)
  assert.deepEqual(queryApplied.applied.season, { before: null, after: 2 })
  await call('undo', { log_id: queryApplied.logId })
  row = await current(queryId)
  assert.equal(row.season, null)
  assert.equal(row.episode_count, null)
  passed('query season survives preview -> fields -> apply -> undo, including fourth candidate')

  const titleId = await item('示例剧集 第二季')
  const titleApplied = await call('apply', { ...fieldsBody(titleId), fields: ['title', 'episode_count'], overwrite: true })
  row = await current(titleId)
  assert.equal(row.title, '示例剧集')
  assert.equal(row.season, 2)
  assert.equal(row.episode_count, 8)
  assert.equal(row.pinyin, 'shilijuji')
  assert.equal(row.pinyin_initial, 'S')
  const laterOptions = await call('fields', fieldsBody(titleId))
  assert.equal(laterOptions.filled.find((f) => f.key === 'episode_count').preview, '8')
  await call('undo', { log_id: titleApplied.logId })
  row = await current(titleId)
  assert.equal(row.title, '示例剧集 第二季')
  assert.equal(row.season, null)
  assert.equal(row.pinyin, 'shilijujidierji')
  passed('title replacement preserves title-only season and undo restores title/season/pinyin')

  for (const [title, savedSeason] of [['示例剧集 第一季', 2], ['示例剧集', 1]]) {
    const id = await item(title, savedSeason)
    const opts = await call('fields', fieldsBody(id, 2))
    assert.equal(opts.available.find((f) => f.key === 'episode_count').preview, '10')
  }
  await call('fields', { ...fieldsBody(queryId), season: 0 }, 400)
  await call('apply', { ...fieldsBody(queryId), fields: ['year'], season: 2.5 }, 400)
  passed('title season > stored season > query season; invalid season rejected')

  await db.prepare('UPDATE settings SET value = ? WHERE key = ?').bind(JSON.stringify({ 'Example Creator': '示例主创', 'Example Actor': '示例演员', 'Example Author': '示例作者' }), 'person_aliases').run()
  const aliasId = await item('示例剧集', 2, { tags: '["手填标签"]', year: 2000, actors: '["手填主演"]', notes: '保留备注', review: '保留观后感', rating: 5 })
  const aliasOptions = await call('fields', fieldsBody(aliasId))
  assert.equal(aliasOptions.available.find((f) => f.key === 'directors').preview, '示例主创')
  const aliasApplied = await call('apply', { ...fieldsBody(aliasId), fields: ['directors', 'actors', 'tags', 'year'] })
  row = await current(aliasId)
  assert.equal(row.directors, '["示例主创"]')
  assert.equal(row.actors, '["手填主演"]')
  assert.equal(row.tags, '["手填标签"]')
  assert.equal(row.year, 2000)
  assert.equal(row.notes, '保留备注')
  assert.equal(row.review, '保留观后感')
  assert.equal(row.rating, 5)
  assert.deepEqual(aliasApplied.skipped, ['actors', 'tags', 'year'])
  await call('undo', { log_id: aliasApplied.logId })
  assert.equal((await current(aliasId)).directors, '[]')
  passed('preview/apply normalize aliases; fill-only preserves occupied and personal fields; arrays undo')

  const bookId = await item('示例书籍', null, { category: 'novel', authors: '["原作者"]' })
  const bgmApplied = await call('apply', { item_id: bookId, source: 'bangumi', external_id: '201', fields: ['authors', 'tags', 'external_rating'], overwrite: true })
  row = await current(bookId)
  assert.equal(row.bgm_id, 201)
  assert.equal(typeof row.bgm_id, 'number')
  assert.equal(row.authors, '["示例作者"]')
  assert.equal(row.tags, '["奇幻"]')
  const bgmUndone = await call('undo', { log_id: bgmApplied.logId })
  assert.ok(bgmUndone.restored.includes('bgm_id'))
  row = await current(bookId)
  assert.equal(row.bgm_id, null)
  assert.equal(row.authors, '["原作者"]')
  assert.equal(row.tags, '[]')
  assert.equal(row.external_rating, null)
  passed('Bangumi infobox arrays and numeric external ID round-trip through snapshots')

  const conflictId = await item('示例剧集', 2)
  const conflictApplied = await call('apply', { ...fieldsBody(conflictId), fields: ['tags', 'year'] })
  await db.prepare('UPDATE items SET tags = ? WHERE id = ?').bind('["后来手填"]', conflictId).run()
  const conflictUndo = await call('undo', { log_id: conflictApplied.logId })
  assert.ok(conflictUndo.skipped.includes('tags'))
  assert.ok(conflictUndo.restored.includes('year'))
  assert.equal((await current(conflictId)).tags, '["后来手填"]')
  passed('undo skips fields changed manually after apply')

  const atomicId = await item('示例剧集', 2)
  const atomicApplied = await call('apply', { ...fieldsBody(atomicId), fields: ['year'] })
  await db.exec("CREATE TRIGGER fail_undo_activity BEFORE INSERT ON activity_log WHEN NEW.detail LIKE '撤回自动补全%' BEGIN SELECT RAISE(ABORT, 'mock activity failure'); END;")
  await call('undo', { log_id: atomicApplied.logId }, 500)
  assert.equal((await current(atomicId)).year, 2012)
  assert.equal((await db.prepare('SELECT undone_at FROM autofill_log WHERE id = ?').bind(atomicApplied.logId).first()).undone_at, null)
  await db.exec('DROP TRIGGER fail_undo_activity')
  await call('undo', { log_id: atomicApplied.logId })
  assert.equal((await current(atomicId)).year, null)
  passed('undo failure rolls back item/log atomically and retry succeeds')

  console.log(`${count} autofill regression groups passed (fresh local D1, outbound metadata mocked).`)
} finally {
  await mf.dispose()
}

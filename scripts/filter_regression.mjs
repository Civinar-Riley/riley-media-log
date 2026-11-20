// Run with: node scripts/filter_regression.mjs
import assert from 'node:assert/strict'
import { build } from 'esbuild'

const { outputFiles } = await build({
  stdin: {
    contents: `export * from './src/web/components/filterState'; export { filtersToQuery } from './src/web/api'; export { parseFilters } from './src/shared/filters';`,
    resolveDir: process.cwd(), loader: 'ts',
  },
  bundle: true, format: 'esm', platform: 'node', write: false,
})
const { FILTER_FIELDS, fieldPatch, clearField, fieldSummary, clearedFilters, filtersToQuery, parseFilters } = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`)
const read = (filters) => parseFilters(new URLSearchParams(filtersToQuery(filters)))
const filters = read({
  q: '星际', category: ['movie'], status: ['want', 'watching'], regions: ['美国', '日本'], region_mode: 'all',
  tags: ['科幻'], authors: ['作者,甲', '[乙]'], author_mode: 'all', directors: ['导演'], actors: ['主演'],
  year_min: 2000, year_max: 2026, rating_min: 4, rating_max: 4,
  has_cover: false, has_review: true, channel: '影院', finish_status: ['finished'], list_id: 3,
  watched_from: '2026-01-01', watched_to: '2026-11-20', sort: 'rating', order: 'asc',
})
for (const field of FILTER_FIELDS) {
  assert.ok(fieldSummary(filters, field.id), `Active ${field.id} has no summary`)
  const patch = fieldPatch(filters, field.id)
  const restored = read({ ...filters, ...patch })
  assert.deepEqual(restored, filters, `Editing ${field.id} changed another condition`)
  const cleared = read({ ...filters, ...clearField(field.id) })
  assert.equal(fieldSummary(cleared, field.id), '', `${field.id} could not be cleared`)
  for (const other of FILTER_FIELDS.filter((f) => f.id !== field.id)) {
    assert.equal(fieldSummary(cleared, other.id), fieldSummary(filters, other.id), `Clearing ${field.id} changed ${other.id}`)
  }
}
assert.deepEqual(read({ ...filters, ...fieldPatch({ authors: ['新作者'], author_mode: 'any' }, 'authors') }).authors, ['新作者'])
assert.equal(fieldSummary(filters, 'rating'), '4 星')
assert.equal(fieldSummary(filters, 'has_cover'), '无封面')
assert.equal(fieldSummary(filters, 'regions'), '美国、日本（同时包含）')
assert.deepEqual(filters.authors, ['作者,甲', '[乙]'])
assert.deepEqual(clearedFilters(filters), { sort: 'rating', order: 'asc' })
const reset = read(clearedFilters(filters))
assert.equal(reset.list_id, undefined)
assert.equal(reset.q, undefined)
assert.equal(reset.has_cover, undefined)
assert.ok(FILTER_FIELDS.every((f) => !fieldSummary(reset, f.id)))
console.log(`PASS ${FILTER_FIELDS.length} filter fields: summaries, isolated apply/clear, URL round-trip, false values and exact ratings`)
console.log('PASS clear filters preserves sorting and removes all conditions')

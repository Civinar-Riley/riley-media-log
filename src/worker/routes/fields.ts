import { Hono } from 'hono'
import { fieldRenameSchema, readBody } from '../validate'
import { parseArr } from '../db'
import type { FieldName } from '../../shared/types'

const FIELDS: FieldName[] = ['tags', 'regions', 'creators', 'channel']
const ARRAY_FIELDS = new Set<FieldName>(['tags', 'regions', 'creators'])

export const fieldsRoutes = new Hono<{ Bindings: Env }>()

/** 筛选栏一次拉齐：类别与四个字段的全部取值 + 年份范围 */
fieldsRoutes.get('/facets', async (c) => {
  const [cats, tags, regions, creators, channels, years] = await Promise.all([
    c.env.DB.prepare(`SELECT category AS v, COUNT(*) AS n FROM items GROUP BY category`).all<{ v: string; n: number }>(),
    c.env.DB.prepare(
      `SELECT je.value AS v, COUNT(*) AS n FROM items i, json_each(i.tags) je
       GROUP BY je.value ORDER BY n DESC, v COLLATE NOCASE`
    ).all<{ v: string; n: number }>(),
    c.env.DB.prepare(
      `SELECT je.value AS v, COUNT(*) AS n FROM items i, json_each(i.regions) je
       GROUP BY je.value ORDER BY n DESC, v COLLATE NOCASE`
    ).all<{ v: string; n: number }>(),
    c.env.DB.prepare(
      `SELECT je.value AS v, COUNT(*) AS n FROM items i, json_each(i.creators) je
       GROUP BY je.value ORDER BY n DESC, v COLLATE NOCASE`
    ).all<{ v: string; n: number }>(),
    c.env.DB.prepare(
      `SELECT channel AS v, COUNT(*) AS n FROM items WHERE channel <> ''
       GROUP BY channel ORDER BY n DESC, v COLLATE NOCASE`
    ).all<{ v: string; n: number }>(),
    c.env.DB.prepare(`SELECT MIN(year) AS y_min, MAX(year) AS y_max FROM items`).first<{ y_min: number | null; y_max: number | null }>(),
  ])
  return c.json({
    categories: cats.results.map((r) => [r.v, r.n] as [string, number]),
    tags: tags.results.map((r) => [r.v, r.n] as [string, number]),
    regions: regions.results.map((r) => [r.v, r.n] as [string, number]),
    creators: creators.results.map((r) => [r.v, r.n] as [string, number]),
    channels: channels.results.map((r) => [r.v, r.n] as [string, number]),
    year_min: years?.y_min ?? null,
    year_max: years?.y_max ?? null,
  })
})

/** 某个多值字段的所有取值与条目计数（筛选下拉、字段管理页共用） */
fieldsRoutes.get('/values', async (c) => {
  const field = c.req.query('field') as FieldName | undefined
  if (!field || !FIELDS.includes(field)) return c.json({ error: 'field 不合法' }, 400)

  let rows: { results: { v: string; n: number }[] }
  if (ARRAY_FIELDS.has(field)) {
    rows = await c.env.DB.prepare(
      `SELECT je.value AS v, COUNT(*) AS n FROM items i, json_each(i.${field}) je
       GROUP BY je.value ORDER BY n DESC, v COLLATE NOCASE`
    ).all()
  } else {
    rows = await c.env.DB.prepare(
      `SELECT channel AS v, COUNT(*) AS n FROM items WHERE channel <> '' GROUP BY channel ORDER BY n DESC, v COLLATE NOCASE`
    ).all()
  }
  return c.json(rows.results.map((r) => [r.v, r.n]))
})

/** 字段值改名/合并（to 为空串表示删除该值）；channel 为单值字段单独处理 */
fieldsRoutes.post('/rename', async (c) => {
  const field = c.req.query('field') as FieldName | undefined
  if (!field || !FIELDS.includes(field)) return c.json({ error: 'field 不合法' }, 400)

  const data = await readBody(c, fieldRenameSchema)
  if (data instanceof Response) return data
  const fromList = (Array.isArray(data.from) ? data.from : [data.from]).filter((v) => v !== data.to)
  if (!fromList.length) return c.json({ error: '没有要改名的值' }, 400)

  if (field === 'channel') {
    const ph = fromList.map(() => '?').join(',')
    const res = await c.env.DB.prepare(`UPDATE items SET channel = ? WHERE channel IN (${ph})`)
      .bind(data.to, ...fromList)
      .run()
    return c.json({ updated: res.meta.changes ?? 0 })
  }

  const ph = fromList.map(() => '?').join(',')
  const rows = await c.env.DB.prepare(
    `SELECT id, ${field} AS vals FROM items i
     WHERE EXISTS (SELECT 1 FROM json_each(i.${field}) je WHERE je.value IN (${ph}))`
  )
    .bind(...fromList)
    .all()

  const stmts: D1PreparedStatement[] = []
  for (const row of rows.results) {
    const current = parseArr(row.vals as string)
    const seen = new Set<string>()
    const next: string[] = []
    for (const v of current) {
      const mapped = fromList.includes(v) ? data.to : v
      if (mapped !== '' && !seen.has(mapped)) {
        seen.add(mapped)
        next.push(mapped)
      }
    }
    if (next.join('\u0000') !== current.join('\u0000')) {
      stmts.push(c.env.DB.prepare(`UPDATE items SET ${field} = ? WHERE id = ?`).bind(JSON.stringify(next), row.id))
    }
  }
  if (stmts.length) await c.env.DB.batch(stmts)
  return c.json({ updated: stmts.length })
})

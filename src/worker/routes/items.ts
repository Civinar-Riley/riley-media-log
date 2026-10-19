import { Hono } from 'hono'
import { itemCreateSchema, itemUpdateSchema, viewingCreateSchema, readBody } from '../validate'
import { parseFilters, buildListQuery, buildWhere } from '../filters'
import { mapItem, nowISO, logActivity, parseArr } from '../db'
import { toPinyinText, toPinyinInitial } from '../pinyin'
import { normalizeItemPeople } from './settings'
import { STATUS_LABELS } from '../../shared/types'
import type { Status } from '../../shared/types'

const FIELD_LABELS: Record<string, string> = {
  title: '标题',
  category: '类别',
  year: '年份',
  season: '季号',
  regions: '地区',
  tags: '类型标签',
  authors: '作者',
  directors: '导演',
  actors: '主演',
  progress: '进度',
  episode_count: '总集数',
  cover_url: '封面',
  channel: '观看渠道',
  finish_status: '完结状态',
  notes: '备注',
  review: '观后感',
  tmdb_id: 'TMDB',
}

/** 值为数组的列在写入时需序列化 */
const ARRAY_COLUMNS = new Set(['regions', 'tags', 'authors', 'directors', 'actors'])

function pageNum(v: string | undefined): number | undefined {
  if (v === undefined || v === '') return undefined
  const n = Number(v)
  return Number.isFinite(n) ? Math.trunc(n) : undefined
}

function numId(v: string): number | null {
  const n = Number(v)
  return Number.isInteger(n) && n > 0 ? n : null
}

export const itemsRoutes = new Hono<{ Bindings: Env }>()

/** 列表：筛选 + 排序 + 分页 */
itemsRoutes.get('/', async (c) => {
  const sp = new URLSearchParams(c.req.query())
  const q = buildListQuery(parseFilters(sp), pageNum(sp.get('page') ?? undefined), pageNum(sp.get('page_size') ?? undefined))
  const [countRow, rows] = await Promise.all([
    c.env.DB.prepare(q.countSql).bind(...q.whereParams).first<{ n: number }>(),
    c.env.DB.prepare(q.rowsSql).bind(...q.rowsParams).all(),
  ])
  return c.json({
    total: countRow?.n ?? 0,
    page: q.page,
    page_size: q.page_size,
    items: rows.results.map(mapItem),
  })
})

/** 随机抽一个（默认从想看里摇） */
itemsRoutes.get('/random', async (c) => {
  const where = buildWhere(parseFilters(new URLSearchParams(c.req.query())))
  const wherePart = where.sql ? `WHERE ${where.sql}` : ''
  const row = await c.env.DB.prepare(
    `SELECT i.*, (SELECT MAX(watched_on) FROM viewings v WHERE v.item_id = i.id) AS last_watched
     FROM items i ${wherePart} ORDER BY RANDOM() LIMIT 1`
  )
    .bind(...where.params)
    .first()
  if (!row) return c.json({ error: '没有符合条件的结果' }, 404)
  return c.json(mapItem(row))
})

/** 新建条目 */
itemsRoutes.post('/', async (c) => {
  const data = await readBody(c, itemCreateSchema)
  if (data instanceof Response) return data
  await normalizeItemPeople(c.env.DB, data)
  const now = nowISO()
  const row = await c.env.DB.prepare(
    `INSERT INTO items
       (title, pinyin, pinyin_initial, category, year, season, regions, tags, authors, directors, actors,
        status, progress, episode_count, rating, cover_url, channel, finish_status, notes, review, tmdb_id,
        created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
     RETURNING *`
  )
    .bind(
      data.title,
      toPinyinText(data.title),
      toPinyinInitial(data.title),
      data.category,
      data.year,
      data.season,
      JSON.stringify(data.regions),
      JSON.stringify(data.tags),
      JSON.stringify(data.authors),
      JSON.stringify(data.directors),
      JSON.stringify(data.actors),
      data.status,
      data.progress,
      data.episode_count,
      data.rating,
      data.cover_url,
      data.channel,
      data.finish_status,
      data.notes,
      data.review,
      data.tmdb_id,
      now,
      now
    )
    .first()
  await logActivity(c.env.DB, row!.id as number, 'created', `添加《${data.title}》`)
  return c.json(mapItem(row!), 201)
})

/** 状态计数：可按类别范围过滤（用于状态快捷条的徽标；注意需在 /:id 之前注册） */
itemsRoutes.get('/status-counts', async (c) => {
  const raw = c.req.query('category') ?? ''
  const cats = raw.split(',').map((s) => s.trim()).filter(Boolean)
  const where = cats.length ? `WHERE category IN (${cats.map(() => '?').join(',')})` : ''
  const rows = await c.env.DB.prepare(`SELECT status, COUNT(*) AS n FROM items ${where} GROUP BY status`)
    .bind(...cats)
    .all<{ status: string; n: number }>()
  const counts: Record<string, number> = { want: 0, watching: 0, done: 0, dropped: 0 }
  for (const r of rows.results) counts[r.status] = r.n
  return c.json(counts)
})

/** 详情：条目 + 观看流水 + 所在清单 + 动态时间线 */
itemsRoutes.get('/:id', async (c) => {
  const id = numId(c.req.param('id'))
  if (id === null) return c.json({ error: 'ID 不合法' }, 400)
  const [row, viewings, lists, activity] = await Promise.all([
    c.env.DB.prepare(
      `SELECT i.*, (SELECT MAX(watched_on) FROM viewings v WHERE v.item_id = i.id) AS last_watched
       FROM items i WHERE i.id = ?`
    )
      .bind(id)
      .first(),
    c.env.DB.prepare('SELECT * FROM viewings WHERE item_id = ? ORDER BY watched_on DESC, id DESC').bind(id).all(),
    c.env.DB.prepare(
      'SELECT l.id, l.name FROM lists l JOIN list_items li ON li.list_id = l.id WHERE li.item_id = ? ORDER BY l.id'
    )
      .bind(id)
      .all(),
    c.env.DB.prepare('SELECT * FROM activity_log WHERE item_id = ? ORDER BY created_at DESC, id DESC LIMIT 100')
      .bind(id)
      .all(),
  ])
  if (!row) return c.json({ error: '条目不存在' }, 404)
  return c.json({
    ...mapItem(row),
    viewings: viewings.results,
    lists: lists.results,
    activity: activity.results,
  })
})

/** 更新条目（按提交的字段做局部更新，自动记动态） */
itemsRoutes.put('/:id', async (c) => {
  const id = numId(c.req.param('id'))
  if (id === null) return c.json({ error: 'ID 不合法' }, 400)
  const old = await c.env.DB.prepare('SELECT * FROM items WHERE id = ?').bind(id).first()
  if (!old) return c.json({ error: '条目不存在' }, 404)

  const data = await readBody(c, itemUpdateSchema)
  if (data instanceof Response) return data
  await normalizeItemPeople(c.env.DB, data)
  const keys = Object.keys(data) as (keyof typeof data)[]
  if (!keys.length) return c.json(mapItem(old))

  const sets: string[] = []
  const vals: unknown[] = []
  for (const key of keys) {
    if (key === 'title') {
      sets.push('title = ?', 'pinyin = ?', 'pinyin_initial = ?')
      vals.push(data.title, toPinyinText(data.title!), toPinyinInitial(data.title!))
    } else if (ARRAY_COLUMNS.has(key)) {
      sets.push(`${key} = ?`)
      vals.push(JSON.stringify(data[key]))
    } else {
      sets.push(`${key} = ?`)
      vals.push(data[key])
    }
  }
  sets.push('updated_at = ?')
  vals.push(nowISO())
  await c.env.DB.prepare(`UPDATE items SET ${sets.join(', ')} WHERE id = ?`).bind(...vals, id).run()

  // 动态时间线：状态、评分单独记，其余字段合并成一条
  const oldStatus = old.status as Status
  if (data.status !== undefined && data.status !== oldStatus) {
    await logActivity(
      c.env.DB,
      id,
      'status_changed',
      `状态：${STATUS_LABELS[oldStatus]} → ${STATUS_LABELS[data.status]}`
    )
  }
  if (data.rating !== undefined && data.rating !== old.rating) {
    await logActivity(
      c.env.DB,
      id,
      'rating_changed',
      `评分：${old.rating ?? '未评'} → ${data.rating ?? '未评'}`
    )
  }
  const others = keys.filter((k) => {
    if (k === 'status' || k === 'rating') return false
    const next = data[k]
    const prev = old[k as keyof typeof old]
    // 数组按内容比较（旧值在库里是 JSON 字符串），避免「没改也记一笔动态」的噪音
    if (Array.isArray(next)) return JSON.stringify(next) !== JSON.stringify(parseArr(prev as string))
    return next !== prev
  })
  if (others.length) {
    await logActivity(
      c.env.DB,
      id,
      'updated',
      `修改了：${others.map((k) => FIELD_LABELS[k] ?? k).join('、')}`
    )
  }

  const fresh = await c.env.DB.prepare(
    `SELECT i.*, (SELECT MAX(watched_on) FROM viewings v WHERE v.item_id = i.id) AS last_watched
     FROM items i WHERE i.id = ?`
  )
    .bind(id)
    .first()
  return c.json(mapItem(fresh!))
})

itemsRoutes.delete('/:id', async (c) => {
  const id = numId(c.req.param('id'))
  if (id === null) return c.json({ error: 'ID 不合法' }, 400)
  const res = await c.env.DB.prepare('DELETE FROM items WHERE id = ?').bind(id).run()
  if (!res.meta.changes) return c.json({ error: '条目不存在' }, 404)
  return c.json({ ok: true })
})

/** 追加一条观看流水（二刷/补记） */
itemsRoutes.post('/:id/viewings', async (c) => {
  const id = numId(c.req.param('id'))
  if (id === null) return c.json({ error: 'ID 不合法' }, 400)
  const item = await c.env.DB.prepare('SELECT id, title FROM items WHERE id = ?').bind(id).first()
  if (!item) return c.json({ error: '条目不存在' }, 404)

  const data = await readBody(c, viewingCreateSchema)
  if (data instanceof Response) return data
  const row = await c.env.DB.prepare(
    'INSERT INTO viewings (item_id, watched_on, comment, created_at) VALUES (?,?,?,?) RETURNING *'
  )
    .bind(id, data.watched_on, data.comment, nowISO())
    .first()
  await logActivity(
    c.env.DB,
    id,
    'viewing_added',
    `观看记录：${data.watched_on}${data.comment ? `（${data.comment.slice(0, 40)}）` : ''}`
  )
  return c.json(row, 201)
})

itemsRoutes.delete('/:id/viewings/:vid', async (c) => {
  const id = numId(c.req.param('id'))
  const vid = numId(c.req.param('vid'))
  if (id === null || vid === null) return c.json({ error: 'ID 不合法' }, 400)
  const res = await c.env.DB.prepare('DELETE FROM viewings WHERE id = ? AND item_id = ?').bind(vid, id).run()
  if (!res.meta.changes) return c.json({ error: '观看记录不存在' }, 404)
  await logActivity(c.env.DB, id, 'viewing_removed', '删除了一条观看记录')
  return c.json({ ok: true })
})

import { Hono } from 'hono'
import { parseFilters, buildWhere } from '../filters'
import { mapItem, nowISO, todayLocal } from '../db'
import { readCategories } from './settings'
import { STATUS_LABELS, FINISH_LABELS } from '../../shared/types'
import type { Item } from '../../shared/types'

export const exportRoutes = new Hono<{ Bindings: Env }>()

const CSV_HEADERS = [
  '标题', '类别', '年份', '季号', '制片地区', '类型标签', '主创', '状态', '进度',
  '总集数', '我的评分', '观看渠道', '完结状态', '最近观看', '备注', '观后感', '封面', '添加时间', '更新时间',
]

function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v)
  return `"${s.replace(/"/g, '""')}"`
}

function itemToRow(it: Item, categoryLabel: (id: string) => string): unknown[] {
  return [
    it.title,
    categoryLabel(it.category),
    it.year ?? '',
    it.season ?? '',
    it.regions.join('/'),
    it.tags.join('/'),
    it.creators.join('/'),
    STATUS_LABELS[it.status] ?? it.status,
    it.progress,
    it.episode_count ?? '',
    it.rating ?? '',
    it.channel,
    it.finish_status ? (FINISH_LABELS[it.finish_status] ?? it.finish_status) : '',
    it.last_watched ?? '',
    it.notes,
    it.review,
    it.cover_url,
    it.created_at,
    it.updated_at,
  ]
}

interface ExportCtx {
  req: { query(): Record<string, string> }
  env: { DB: D1Database }
}

async function loadAll(c: ExportCtx): Promise<Item[]> {
  const where = buildWhere(parseFilters(new URLSearchParams(c.req.query())))
  const wherePart = where.sql ? `WHERE ${where.sql}` : ''
  const rows = await c.env.DB.prepare(
    `SELECT i.*, (SELECT MAX(watched_on) FROM viewings v WHERE v.item_id = i.id) AS last_watched
     FROM items i ${wherePart} ORDER BY i.created_at DESC, i.id DESC LIMIT 20000`
  )
    .bind(...where.params)
    .all()
  return rows.results.map(mapItem)
}

exportRoutes.get('/export.csv', async (c) => {
  const [items, cats] = await Promise.all([loadAll(c), readCategories(c.env.DB)])
  const labelMap = new Map(cats.map((cat) => [cat.id, cat.label]))
  const lines = [
    CSV_HEADERS.map(csvCell).join(','),
    ...items.map((it) => itemToRow(it, (id) => labelMap.get(id) ?? id).map(csvCell).join(',')),
  ]
  const body = '\uFEFF' + lines.join('\r\n')
  const date = todayLocal().replace(/-/g, '')
  return new Response(body, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="media-log-${date}.csv"; filename*=UTF-8''${encodeURIComponent(`书影集-${date}.csv`)}`,
    },
  })
})

exportRoutes.get('/export.json', async (c) => {
  const items = await loadAll(c)
  const date = todayLocal().replace(/-/g, '')
  return new Response(
    JSON.stringify({ exported_at: nowISO(), count: items.length, items }, null, 2),
    {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="media-log-${date}.json"; filename*=UTF-8''${encodeURIComponent(`书影集-${date}.json`)}`,
      },
    }
  )
})

import { Hono } from 'hono'
import { parseFilters, buildWhere } from '../filters'
import { mapItem, nowISO, todayLocal } from '../db'
import { readCategories } from './settings'
import { STATUS_LABELS, FINISH_LABELS } from '../../shared/types'
import type { Item } from '../../shared/types'

export const exportRoutes = new Hono<{ Bindings: Env }>()

const CSV_HEADERS = [
  '标题', '类别', '年份', '季号', '制片地区', '类型标签', '作者', '导演', '主演', '状态', '进度',
  '总集数', '我的评分', '外部评分', '观看渠道', '完结状态', '最近观看', '备注', '观后感', '封面', '添加时间', '更新时间',
]

function csvCell(v: unknown): string {
  let s = v === null || v === undefined ? '' : String(v)
  // 防 CSV 公式注入：Excel 会执行以 = + - @ 开头的单元格
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s
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
    it.authors.join('/'),
    it.directors.join('/'),
    it.actors.join('/'),
    STATUS_LABELS[it.status] ?? it.status,
    it.progress,
    it.episode_count ?? '',
    it.rating ?? '',
    it.external_rating ?? '',
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

async function loadAll(
  c: ExportCtx
): Promise<{ items: Item[]; total: number; truncated: boolean }> {
  const where = buildWhere(parseFilters(new URLSearchParams(c.req.query())))
  const wherePart = where.sql ? `WHERE ${where.sql}` : ''
  const [countRow, rows] = await Promise.all([
    c.env.DB.prepare(`SELECT COUNT(*) AS n FROM items i ${wherePart}`)
      .bind(...where.params)
      .first<{ n: number }>(),
    c.env.DB.prepare(
      `SELECT i.*, (SELECT MAX(watched_on) FROM viewings v WHERE v.item_id = i.id) AS last_watched
       FROM items i ${wherePart} ORDER BY i.created_at DESC, i.id DESC LIMIT 20000`
    )
      .bind(...where.params)
      .all(),
  ])
  const items = rows.results.map(mapItem)
  const total = countRow?.n ?? items.length
  return { items, total, truncated: total > items.length }
}

exportRoutes.get('/export.csv', async (c) => {
  const [data, cats] = await Promise.all([loadAll(c), readCategories(c.env.DB)])
  const labelMap = new Map(cats.map((cat) => [cat.id, cat.label]))
  const lines = [
    CSV_HEADERS.map(csvCell).join(','),
    ...data.items.map((it) => itemToRow(it, (id) => labelMap.get(id) ?? id).map(csvCell).join(',')),
  ]
  const body = '\uFEFF' + lines.join('\r\n')
  const date = todayLocal().replace(/-/g, '')
  return new Response(body, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="media-log-${date}.csv"; filename*=UTF-8''${encodeURIComponent(`书影集-${date}.csv`)}`,
      'X-Export-Truncated': data.truncated ? 'true' : 'false',
      'X-Export-Total': String(data.total),
    },
  })
})

exportRoutes.get('/export.json', async (c) => {
  const data = await loadAll(c)
  const date = todayLocal().replace(/-/g, '')
  return new Response(
    JSON.stringify(
      {
        exported_at: nowISO(),
        count: data.items.length,
        total: data.total,
        truncated: data.truncated,
        items: data.items,
      },
      null,
      2
    ),
    {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="media-log-${date}.json"; filename*=UTF-8''${encodeURIComponent(`书影集-${date}.json`)}`,
      },
    }
  )
})

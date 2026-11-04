import type { ItemFilters } from '../shared/types'
import { parseFilters } from '../shared/filters'

export { parseFilters }

/** LIKE 通配符转义 */
function like(v: string): string {
  return '%' + v.replace(/[\\%_]/g, (m) => '\\' + m) + '%'
}

/**
 * 搜索词归一化：去掉标点/空白并转小写，与 items.search_norm 生成列同一套规则
 * （0007 迁移：标题侧在 SQL 里做同样的剔除），让「BEN 10：终极异形」能被 ben10 终极 搜到。
 * 注意：两边字符集要保持一致，改这里必须同步改迁移。
 */
const STRIP_CHARS = [
  ' ', '\t', '\n', '\r', ' ', '　',
  '！', '？', '。', '，', '、', '．', '：', '；', '·', '・', '—', '–', '―', '－', '~', '-', '～',
  '!', '?', ',', '.', ':', ';',
  '（', '）', '(', ')', '「', '」', '『', '』', '【', '】', '[', ']', '《', '》', '〈', '〉', '{', '}',
  '“', '”', '‘', '’', '"', "'",
  '／', '/', '＼', '\\',
  '＋', '＊', '＆', '｜', '＿', '％', '＃', '＠', '＝', '＜', '＞', '￥',
  '$', '^', '=', '<', '>', '|', '*', '&', '+', '#', '@', '_', '%',
]

export function normalizeSearchTerm(s: string): string {
  let out = s
  for (const ch of STRIP_CHARS) out = out.split(ch).join('')
  // 只小写 A–Z：生成列用 SQLite 的 lower()，而它只处理 ASCII（'É'→'É'、'Ｂ'→'Ｂ'、西里尔不变）。
  // 这里若用 toLowerCase() 会把 'É' 变 'é'、'Ｂ' 变 'ｂ'，与生成列不等，原样照打也搜不到。
  return out.replace(/[A-Z]/g, (c) => c.toLowerCase())
}

/** 搜索词 → 匹配条件：按空格拆成多个关键字 AND 组合，每个关键字命中标题（归一化）或拼音即可 */
function searchCond(q: string): Cond {
  const terms = [...new Set(q.split(/\s+/).map(normalizeSearchTerm).filter(Boolean))]
  if (!terms.length) {
    // 整串都是标点/空白时退回原始子串匹配，避免「搜 · 变成搜全部」。
    // 这里不能用 normalizeSearchTerm（它会把标点剥成空串 → 匹配全部）；
    // 拼音列只含 a–z0–9，toLowerCase 不会有跨 Unicode 的大小写问题。
    return { sql: `(i.title LIKE ? ESCAPE '\\' OR i.pinyin LIKE ? ESCAPE '\\')`, params: [like(q), like(q.toLowerCase())] }
  }
  return {
    sql: terms
      .map(() => `(i.search_norm LIKE ? ESCAPE '\\' OR i.pinyin LIKE ? ESCAPE '\\')`)
      .join(' AND '),
    params: terms.flatMap((t) => [like(t), like(t)]),
  }
}

/** JSON 数组字段（tags/regions/creators）的「任一/全部」匹配条件 */
function jsonFieldCond(field: string, values: string[], mode: 'any' | 'all') {
  const unique = [...new Set(values)]
  const ph = unique.map(() => '?').join(',')
  if (mode === 'any') {
    return {
      sql: `EXISTS (SELECT 1 FROM json_each(i.${field}) je WHERE je.value IN (${ph}))`,
      params: unique,
    }
  }
  return {
    sql: `(SELECT COUNT(DISTINCT je.value) FROM json_each(i.${field}) je WHERE je.value IN (${ph})) = ?`,
    params: [...unique, unique.length],
  }
}

interface Cond {
  sql: string
  params: unknown[]
}

/** 结构化筛选 → WHERE 子句（不带 WHERE 关键字） */
export function buildWhere(raw: ItemFilters): Cond {
  const f = {
    ...raw,
    category: raw.category ?? [],
    status: raw.status ?? [],
    regions: raw.regions ?? [],
    tags: raw.tags ?? [],
    authors: raw.authors ?? [],
    directors: raw.directors ?? [],
    actors: raw.actors ?? [],
    finish_status: raw.finish_status ?? [],
  }
  const conds: Cond[] = []

  if (f.q) conds.push(searchCond(f.q))
  if (f.category.length) conds.push({ sql: `i.category IN (${f.category.map(() => '?').join(',')})`, params: f.category })
  if (f.status.length) conds.push({ sql: `i.status IN (${f.status.map(() => '?').join(',')})`, params: f.status })
  if (f.year_min !== undefined) conds.push({ sql: 'i.year >= ?', params: [f.year_min] })
  if (f.year_max !== undefined) conds.push({ sql: 'i.year <= ?', params: [f.year_max] })
  if (f.rating_min !== undefined) conds.push({ sql: 'i.rating >= ?', params: [f.rating_min] })
  if (f.rating_max !== undefined) conds.push({ sql: 'i.rating <= ?', params: [f.rating_max] })
  if (f.has_cover !== undefined)
    conds.push(f.has_cover ? { sql: "i.cover_url <> ''", params: [] } : { sql: "i.cover_url = ''", params: [] })
  if (f.has_review !== undefined)
    conds.push(f.has_review ? { sql: "i.review <> ''", params: [] } : { sql: "i.review = ''", params: [] })
  if (f.channel) conds.push({ sql: "i.channel LIKE ? ESCAPE '\\'", params: [like(f.channel)] })
  if (f.finish_status.length)
    conds.push({
      sql: `i.finish_status IN (${f.finish_status.map(() => '?').join(',')})`,
      params: f.finish_status,
    })
  if (f.regions.length) conds.push(jsonFieldCond('regions', f.regions, f.region_mode ?? 'any'))
  if (f.tags.length) conds.push(jsonFieldCond('tags', f.tags, f.tag_mode ?? 'any'))
  if (f.authors.length) conds.push(jsonFieldCond('authors', f.authors, f.author_mode ?? 'any'))
  if (f.directors.length) conds.push(jsonFieldCond('directors', f.directors, f.director_mode ?? 'any'))
  if (f.actors.length) conds.push(jsonFieldCond('actors', f.actors, f.actor_mode ?? 'any'))

  if (f.list_id !== undefined) {
    conds.push({
      sql: 'EXISTS (SELECT 1 FROM list_items li WHERE li.list_id = ? AND li.item_id = i.id)',
      params: [f.list_id],
    })
  }
  const watchedConds: string[] = []
  const watchedParams: unknown[] = []
  if (f.watched_from) {
    watchedConds.push('v.watched_on >= ?')
    watchedParams.push(f.watched_from)
  }
  if (f.watched_to) {
    watchedConds.push('v.watched_on <= ?')
    watchedParams.push(f.watched_to)
  }
  if (watchedConds.length) {
    conds.push({
      sql: `EXISTS (SELECT 1 FROM viewings v WHERE v.item_id = i.id AND ${watchedConds.join(' AND ')})`,
      params: watchedParams,
    })
  }

  return {
    sql: conds.map((c) => c.sql).join(' AND '),
    params: conds.flatMap((c) => c.params),
  }
}

const LIST_COLUMNS =
  'i.*, (SELECT MAX(v.watched_on) FROM viewings v WHERE v.item_id = i.id) AS last_watched'

/** 排序子句（空值恒排后面；打平时的 id 兜底跟随同方向，保证升降序结果确实不同） */
function orderClause(sort: ItemFilters['sort'], dir: 'asc' | 'desc'): string {
  const d = dir === 'asc' ? 'ASC' : 'DESC'
  switch (sort) {
    case 'title':
      return `ORDER BY i.pinyin_initial ${d}, i.pinyin ${d}, i.id ${d}`
    case 'year':
      return `ORDER BY CASE WHEN i.year IS NULL THEN 1 ELSE 0 END, i.year ${d}, i.pinyin_initial ASC, i.id ${d}`
    case 'rating':
      return `ORDER BY CASE WHEN i.rating IS NULL THEN 1 ELSE 0 END, i.rating ${d}, i.id ${d}`
    case 'watched':
      return `ORDER BY CASE WHEN last_watched IS NULL THEN 1 ELSE 0 END, last_watched ${d}, i.id ${d}`
    default:
      return `ORDER BY i.${sort} ${d}, i.id ${d}`
  }
}

export interface ListQuery {
  rowsSql: string
  countSql: string
  whereParams: unknown[]
  rowsParams: unknown[]
  page: number
  page_size: number
}

export function buildListQuery(
  f: ItemFilters,
  pageRaw: number | undefined,
  pageSizeRaw: number | undefined
): ListQuery {
  const where = buildWhere(f)
  const wherePart = where.sql ? `WHERE ${where.sql}` : ''
  const page = Math.max(1, pageRaw ?? 1)
  const page_size = Math.min(200, Math.max(1, pageSizeRaw ?? 50))
  const rowsSql = `SELECT ${LIST_COLUMNS} FROM items i ${wherePart} ${orderClause(
    f.sort ?? 'created_at',
    f.order ?? 'desc'
  )} LIMIT ? OFFSET ?`
  const countSql = `SELECT COUNT(*) AS n FROM items i ${wherePart}`
  return {
    rowsSql,
    countSql,
    whereParams: where.params,
    rowsParams: [...where.params, page_size, (page - 1) * page_size],
    page,
    page_size,
  }
}

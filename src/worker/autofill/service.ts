// 自动补全服务：外部源字段映射、只填空位、快照日志与撤回
import { parseArr } from '../db'
import type { CategoryDef } from '../../shared/types'
import { AUTOFILL_FIELD_LABELS } from '../../shared/types'
import { tmdbSearch, tmdbDetails, tmdbConfigured } from './tmdb'
import { bgmSearch, bgmDetails, bgmConfigured, bgmSubjectType } from './bangumi'

export type AutofillSource = 'tmdb' | 'bangumi'

/** 类别 → 默认数据源：影视走 TMDB，书漫走 Bangumi */
export function defaultSource(category: string): AutofillSource {
  return category === 'novel' || category === 'manga' || category === 'anime'
    ? 'bangumi'
    : 'tmdb'
}

export const AUTOFILL_SOURCE_LABEL: Record<AutofillSource, string> = {
  tmdb: 'TMDB',
  bangumi: 'Bangumi',
}

/** 自动补全允许触碰的字段（备注/观后感/个人评分永不触碰；外部评分单独列出） */
export const AUTOFILL_FIELDS = [
  'cover_url', 'year', 'regions', 'tags', 'directors', 'actors', 'authors', 'episode_count',
  'external_rating',
] as const

/** 字段为空判断（只填空位的「空」） */
function isEmptyValue(column: string, value: unknown): boolean {
  if (value === null || value === undefined) return true
  if (['regions', 'tags', 'authors', 'directors', 'actors'].includes(column)) {
    return parseArr(value as string).length === 0
  }
  if (typeof value === 'string') return value.trim() === ''
  return false
}

/** 撤回时的空值默认（按列语义） */
function emptyDefaultFor(column: string): unknown {
  if (['regions', 'tags', 'authors', 'directors', 'actors'].includes(column)) return '[]'
  if (['cover_url', 'channel'].includes(column)) return ''
  return null
}

/** 撤回时的「当前值 vs 补全值」比较：数组列解析 JSON，数字列做数值比较 */
function fieldValueMatches(field: string, current: unknown, after: unknown): boolean {
  if (['regions', 'tags', 'authors', 'directors', 'actors'].includes(field)) {
    return JSON.stringify(parseArr(current as string)) === JSON.stringify(parseArr(JSON.stringify(after)))
  }
  if (field === 'bgm_id') return Number(current) === Number(after)
  return sameValue(current as string, after)
}

function normalizeValue(column: string, value: unknown): unknown {
  if (value === null || value === undefined) return emptyDefaultFor(column)
  return value
}

function sameValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

export interface AppliedResult {
  applied: Record<string, { before: unknown; after: unknown }>
  skipped: string[]
  logId: number
}

/** 应用自动补全：只填空位，写快照日志，返回可撤回的 logId */
export async function applyAutofill(
  env: Env,
  db: D1Database,
  itemId: number,
  source: AutofillSource,
  externalId: string,
  requested: string[]
): Promise<AppliedResult | { error: string }> {
  const item = await db.prepare('SELECT * FROM items WHERE id = ?').bind(itemId).first()
  if (!item) return { error: '条目不存在' }

  let details
  try {
    details =
      source === 'tmdb'
        ? await tmdbDetails(env, item.category === 'movie' ? 'movie' : 'tv', externalId)
        : await bgmDetails(env, externalId)
  } catch (e) {
    return { error: e instanceof Error ? e.message : '外部数据源请求失败' }
  }

  // 外部评分并入可填充字段，走统一的「只填空」流程
  const provided: Record<string, unknown> = { ...details.fields }
  if (details.rating !== null) provided.external_rating = details.rating

  const patch: Record<string, unknown> = {}
  const logFields: Record<string, { before: unknown; after: unknown }> = {}
  const skipped: string[] = []

  for (const field of requested) {
    if (!(field in provided)) {
      skipped.push(field) // 源上没有这项数据
      continue
    }
    const current = item[field as keyof typeof item]
    if (!isEmptyValue(field, current)) {
      skipped.push(field) // 已有值，只填空原则
      continue
    }
    const value = normalizeValue(field, provided[field])
    patch[field] = value
    logFields[field] = { before: normalizeValue(field, null), after: value }
  }

  // 外部 ID 留档（tmdb_id / bgm_id）
  const idColumn = source === 'tmdb' ? 'tmdb_id' : 'bgm_id'
  if (isEmptyValue(idColumn, item[idColumn as keyof typeof item])) {
    patch[idColumn] = externalId
    logFields[idColumn] = { before: null, after: externalId }
  }

  if (!Object.keys(patch).length) {
    return {
      applied: {},
      skipped,
      logId: 0,
      error: '没有可填充的字段：所选字段都已有值，或外部源上没有对应数据',
    } as AppliedResult & { error: string }
  }

  const now = new Date().toISOString()
  // 数组列必须序列化成 JSON 字符串再绑定，否则 D1 报 D1_TYPE_ERROR
  const ARRAY_COLUMNS = new Set(['regions', 'tags', 'authors', 'directors', 'actors'])
  const sets = Object.keys(patch).map((k) => `${k} = ?`)
  sets.push('updated_at = ?')
  const vals = Object.entries(patch).map(([k, v]) => (ARRAY_COLUMNS.has(k) ? JSON.stringify(v) : v))
  vals.push(now)
  await db.prepare(`UPDATE items SET ${sets.join(', ')} WHERE id = ?`).bind(...vals, itemId).run()

  const logResult = await db
    .prepare(
      'INSERT INTO autofill_log (item_id, source, external_id, fields, applied_at) VALUES (?,?,?,?,?)'
    )
    .bind(itemId, source, externalId, JSON.stringify(logFields), now)
    .run()
  const logId = logResult.meta.last_row_id as number

  const appliedNames = Object.keys(patch)
    .filter((k) => k !== 'external_rating' && k !== 'tmdb_id' && k !== 'bgm_id')
    .join('、')
  await db
    .prepare('INSERT INTO activity_log (item_id, action, detail, created_at) VALUES (?,?,?,?)')
    .bind(
      itemId,
      'autofill',
      `自动补全（${AUTOFILL_SOURCE_LABEL[source]}）：${appliedNames || '外部评分与外部 ID'}`,
      now
    )
    .run()

  return { applied: logFields, skipped, logId }
}

/** 撤回一次自动补全：把快照里的旧值写回去（被手动改过的字段自动跳过） */
export async function undoAutofill(
  db: D1Database,
  logId: number
): Promise<{ restored: string[]; skipped: string[] } | { error: string }> {
  const row = await db.prepare('SELECT * FROM autofill_log WHERE id = ?').bind(logId).first()
  if (!row) return { error: '补全记录不存在' }
  if (row.undone_at) return { error: '这条补全已经撤回过了' }

  const itemId = row.item_id as number
  const source = row.source as AutofillSource
  const logFields = JSON.parse(row.fields as string) as Record<string, { before: unknown; after: unknown }>

  const fresh = await db.prepare('SELECT * FROM items WHERE id = ?').bind(itemId).first()
  if (!fresh) return { error: '条目已不存在' }

  const restore: Record<string, unknown> = {}
  const skipped: string[] = []
  for (const [field, snap] of Object.entries(logFields)) {
    const current = fresh[field as keyof typeof fresh]
    if (fieldValueMatches(field, current, snap.after)) {
      restore[field] = normalizeValue(field, snap.before)
    } else {
      skipped.push(field) // 撤回前又被手动改过，跳过以免覆盖
    }
  }

  const now = new Date().toISOString()
  if (Object.keys(restore).length) {
    const sets = Object.keys(restore).map((k) => `${k} = ?`)
    sets.push('updated_at = ?')
    const vals = [...Object.values(restore), now]
    await db.prepare(`UPDATE items SET ${sets.join(', ')} WHERE id = ?`).bind(...vals, itemId).run()
  }
  await db.prepare('UPDATE autofill_log SET undone_at = ? WHERE id = ?').bind(now, logId).run()

  await db
    .prepare('INSERT INTO activity_log (item_id, action, detail, created_at) VALUES (?,?,?,?)')
    .bind(
      itemId,
      'autofill',
      `撤回自动补全（${AUTOFILL_SOURCE_LABEL[source] ?? source}）：${(skipped.length ? '部分字段' : Object.keys(restore).join('、')) || '无字段'}已恢复`,
      now
    )
    .run()

  return { restored: Object.keys(restore), skipped }
}

/** 预检某个候选能提供哪些字段（不写库），供补全弹窗做字段勾选 */
export async function autofillFieldOptions(
  env: Env,
  itemId: number,
  source: AutofillSource,
  externalId: string
): Promise<
  | { error: string }
  | {
      available: { key: string; label: string; preview: string }[]
      filled: { key: string; label: string; preview: string }[]
      displayTitle: string
      externalRating: number | null
    }> {
  const item = await env.DB.prepare('SELECT * FROM items WHERE id = ?').bind(itemId).first()
  if (!item) return { error: '条目不存在' }

  let details
  try {
    details =
      source === 'tmdb'
        ? await tmdbDetails(env, item.category === 'movie' ? 'movie' : 'tv', externalId)
        : await bgmDetails(env, externalId)
  } catch (e) {
    return { error: e instanceof Error ? e.message : '外部数据源请求失败' }
  }

  const provided = details.fields as Record<string, unknown>
  if (details.rating !== null) provided.external_rating = details.rating

  const available: { key: string; label: string; preview: string }[] = []
  const filled: { key: string; label: string; preview: string }[] = []
  for (const key of AUTOFILL_FIELDS) {
    if (!(key in provided)) continue
    const entry = {
      key,
      label: AUTOFILL_FIELD_LABELS[key] ?? key,
      preview: key === 'cover_url' ? '图片' : String(provided[key]).slice(0, 60),
    }
    if (isEmptyValue(key, item[key as keyof typeof item])) available.push(entry)
    else filled.push(entry)
  }
  return { available, filled, displayTitle: details.displayTitle, externalRating: details.rating }
}
export async function searchCandidates(
  env: Env,
  category: string,
  source: AutofillSource | undefined,
  query: string,
  year?: number
): Promise<{ source: AutofillSource; candidates: unknown[] }> {
  const src: AutofillSource = source ?? defaultSource(category)
  if (src === 'tmdb') {
    if (!tmdbConfigured(env)) throw new Error('未配置 TMDB_API_KEY，请在 Cloudflare 后台设置后重试')
    const kind = category === 'movie' ? 'movie' : 'tv'
    return { source: src, candidates: await tmdbSearch(env, kind, query, year) }
  }
  const type = bgmSubjectType(category)
  return { source: src, candidates: await bgmSearch(env, query, type) }
}

export function sourceConfigured(env: Env, source: AutofillSource): boolean {
  return source === 'tmdb' ? tmdbConfigured(env) : bgmConfigured(env)
}

export function categorySourceHint(categories: CategoryDef[]): string {
  const film = categories.filter((c) => ['movie', 'series', 'variety'].includes(c.id)).map((c) => c.label)
  const book = categories.filter((c) => ['anime', 'novel', 'manga'].includes(c.id)).map((c) => c.label)
  return `影视类（${film.join('/')}）走 TMDB；${book.join('/')} 走 Bangumi。可在补全时手动切换数据源。`
}

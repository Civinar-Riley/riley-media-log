import type { ItemFilters } from './types'
import { CATEGORIES, STATUSES, FINISH_STATUSES } from './types'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function csvList(sp: URLSearchParams, key: string, allowed?: readonly string[]): string[] {
  const raw = sp.get(key)
  if (!raw) return []
  const list = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  return allowed ? list.filter((v) => (allowed as readonly string[]).includes(v)) : list
}

function intVal(v: string | null): number | undefined {
  if (v === null || v === '') return undefined
  const n = Number(v)
  return Number.isFinite(n) ? Math.trunc(n) : undefined
}

function boolVal(sp: URLSearchParams, key: string): boolean | undefined {
  if (sp.get(key) === 'true') return true
  if (sp.get(key) === 'false') return false
  return undefined
}

/** URL 参数 → 结构化筛选条件（前后端共用，保证语义一致） */
export function parseFilters(sp: URLSearchParams): ItemFilters {
  const q = sp.get('q')?.trim()
  const watched_from = sp.get('watched_from') ?? undefined
  const watched_to = sp.get('watched_to') ?? undefined
  const sortRaw = sp.get('sort') as ItemFilters['sort'] | null
  return {
    q: q || undefined,
    category: csvList(sp, 'category', CATEGORIES),
    status: csvList(sp, 'status', STATUSES),
    year_min: intVal(sp.get('year_min')),
    year_max: intVal(sp.get('year_max')),
    regions: csvList(sp, 'regions'),
    tags: csvList(sp, 'tags'),
    creators: csvList(sp, 'creators'),
    tag_mode: sp.get('tag_mode') === 'all' ? 'all' : 'any',
    region_mode: sp.get('region_mode') === 'all' ? 'all' : 'any',
    creator_mode: sp.get('creator_mode') === 'all' ? 'all' : 'any',
    rating_min: intVal(sp.get('rating_min')),
    rating_max: intVal(sp.get('rating_max')),
    has_cover: boolVal(sp, 'has_cover'),
    has_review: boolVal(sp, 'has_review'),
    channel: sp.get('channel')?.trim() || undefined,
    finish_status: csvList(sp, 'finish_status', FINISH_STATUSES),
    list_id: intVal(sp.get('list_id')),
    watched_from: watched_from && DATE_RE.test(watched_from) ? watched_from : undefined,
    watched_to: watched_to && DATE_RE.test(watched_to) ? watched_to : undefined,
    sort:
      sortRaw && ['created_at', 'updated_at', 'title', 'year', 'rating', 'watched'].includes(sortRaw)
        ? sortRaw
        : 'created_at',
    order: sp.get('order') === 'asc' ? 'asc' : 'desc',
  }
}

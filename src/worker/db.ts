import type { Item, Status, FinishStatus } from '../shared/types'

export function nowISO(): string {
  return new Date().toISOString()
}

export function todayLocal(): string {
  // 观看日期按东八区取「今天」
  const d = new Date(Date.now() + 8 * 3600 * 1000)
  return d.toISOString().slice(0, 10)
}

export function parseArr(json: string | null | undefined): string[] {
  if (!json) return []
  try {
    const v = JSON.parse(json)
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

/** D1 返回的行都是 Record<string, unknown>，这里做一次统一塑形 */
export function mapItem(row: Record<string, unknown>): Item {
  return {
    id: row.id as number,
    title: row.title as string,
    category: row.category as string,
    year: (row.year as number | null) ?? null,
    season: (row.season as number | null) ?? null,
    regions: parseArr(row.regions as string),
    tags: parseArr(row.tags as string),
    authors: parseArr(row.authors as string),
    directors: parseArr(row.directors as string),
    actors: parseArr(row.actors as string),
    status: row.status as Status,
    progress: (row.progress as string) ?? '',
    episode_count: (row.episode_count as number | null) ?? null,
    rating: (row.rating as number | null) ?? null,
    cover_url: (row.cover_url as string) ?? '',
    channel: (row.channel as string) ?? '',
    finish_status: (row.finish_status as FinishStatus | null) ?? null,
    notes: (row.notes as string) ?? '',
    review: (row.review as string) ?? '',
    tmdb_id: (row.tmdb_id as string | null) ?? null,
    bgm_id: (row.bgm_id as number | null) ?? null,
    external_rating: (row.external_rating as number | null) ?? null,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
    last_watched: (row.last_watched as string | null) ?? null,
  }
}

export async function logActivity(
  db: D1Database,
  itemId: number | null,
  action: string,
  detail: string
): Promise<void> {
  await db
    .prepare('INSERT INTO activity_log (item_id, action, detail, created_at) VALUES (?, ?, ?, ?)')
    .bind(itemId, action, detail, nowISO())
    .run()
}

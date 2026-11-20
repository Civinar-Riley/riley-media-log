import type { ItemFilters } from '../../shared/types'
import { FINISH_LABELS, STATUS_LABELS } from '../../shared/types'
import type { FinishStatus, Status } from '../../shared/types'

export const FILTER_FIELDS = [
  { id: 'regions', label: '地区', keys: ['regions', 'region_mode'] },
  { id: 'tags', label: '类型标签', keys: ['tags', 'tag_mode'] },
  { id: 'year', label: '年份', keys: ['year_min', 'year_max'] },
  { id: 'rating', label: '评分', keys: ['rating_min', 'rating_max'] },
  { id: 'watched', label: '观看日期', keys: ['watched_from', 'watched_to'] },
  { id: 'authors', label: '作者', keys: ['authors', 'author_mode'] },
  { id: 'directors', label: '导演', keys: ['directors', 'director_mode'] },
  { id: 'actors', label: '主演', keys: ['actors', 'actor_mode'] },
  { id: 'channel', label: '观看渠道', keys: ['channel'] },
  { id: 'finish_status', label: '完结状态', keys: ['finish_status'] },
  { id: 'has_cover', label: '封面', keys: ['has_cover'] },
  { id: 'has_review', label: '观后感', keys: ['has_review'] },
  { id: 'status', label: '观看状态', keys: ['status'] },
] as const

export type FilterField = typeof FILTER_FIELDS[number]['id']

export function fieldPatch(filters: ItemFilters, field: FilterField): Partial<ItemFilters> {
  const definition = FILTER_FIELDS.find((f) => f.id === field)!
  return Object.fromEntries(definition.keys.map((key) => [key, filters[key]]))
}

export function clearField(field: FilterField): Partial<ItemFilters> {
  const definition = FILTER_FIELDS.find((f) => f.id === field)!
  return Object.fromEntries(definition.keys.map((key) => [key, undefined]))
}

function rangeLabel(from: string | number | undefined, to: string | number | undefined, unit = '') {
  if (from === undefined && to === undefined) return ''
  if (from === to) return `${from}${unit}`
  if (from === undefined) return `${to}${unit}及以前`
  if (to === undefined) return `${from}${unit}起`
  return `${from}–${to}${unit}`
}

export function fieldSummary(filters: ItemFilters, field: FilterField): string {
  switch (field) {
    case 'year': return rangeLabel(filters.year_min, filters.year_max, '年')
    case 'watched': return rangeLabel(filters.watched_from, filters.watched_to)
    case 'rating': {
      const min = filters.rating_min
      const max = filters.rating_max
      if (min === undefined && max === undefined) return ''
      if (min === max) return `${min} 星`
      if (min === undefined) return `${max} 星及以下`
      if (max === undefined) return `${min} 星及以上`
      return `${min}–${max} 星`
    }
    case 'has_cover': return filters.has_cover === undefined ? '' : filters.has_cover ? '有封面' : '无封面'
    case 'has_review': return filters.has_review === undefined ? '' : filters.has_review ? '有观后感' : '无观后感'
    case 'channel': return filters.channel ?? ''
    case 'status': return (filters.status ?? []).map((s) => STATUS_LABELS[s as Status]).join('、')
    case 'finish_status': return (filters.finish_status ?? []).map((s) => FINISH_LABELS[s as FinishStatus]).join('、')
    default: {
      const values = filters[field] ?? []
      const modes = { regions: 'region_mode', tags: 'tag_mode', authors: 'author_mode', directors: 'director_mode', actors: 'actor_mode' } as const
      return values.join('、') + (values.length > 1 && filters[modes[field]] === 'all' ? '（同时包含）' : '')
    }
  }
}

/** 清除条件时保留浏览偏好；页码由列表页统一重置。 */
export function clearedFilters(filters: ItemFilters): ItemFilters {
  return { sort: filters.sort, order: filters.order }
}

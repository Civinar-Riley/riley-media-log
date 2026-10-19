import type { QueryClient } from '@tanstack/react-query'

/** 条目 / 清单 / 统计相关写操作后统一失效，避免各页面只刷新一部分缓存 */
export function invalidateLibrary(qc: QueryClient): void {
  for (const key of [
    'items',
    'item',
    'stats',
    'status-counts',
    'facets',
    'field-values',
    'lists',
    'list',
    'random',
  ]) {
    qc.invalidateQueries({ queryKey: [key] })
  }
}

import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowDownWideNarrow, ArrowUpNarrowWide, Download, LayoutGrid, List, Plus, Search } from 'lucide-react'
import { api, filtersToQuery } from '../api'
import { parseFilters } from '../../shared/filters'
import { STATUSES, STATUS_LABELS } from '../../shared/types'
import type { Item, ItemFilters } from '../../shared/types'
import { EmptyState, Loading, PageHeader, Pagination, RatingStars, StatusBadge, CategoryBadge } from '../components/ui'
import { ItemCard } from '../components/ItemCard'
import { useCategories } from '../cat'
import { LibraryFilters } from '../components/LibraryFilters'
import { clearedFilters } from '../components/filterState'

const SORT_OPTIONS = [
  ['created_at', '添加时间'],
  ['updated_at', '最近更新'],
  ['title', '标题'],
  ['year', '年份'],
  ['rating', '评分'],
  ['watched', '观看日期'],
] as const

/* ---------------- 列表视图行 ---------------- */

function ItemRow({ item }: { item: Item }) {
  const navigate = useNavigate()
  return (
    <tr
      className="cursor-pointer border-t border-line transition hover:bg-muted/60"
      onClick={() => navigate(`/items/${item.id}`)}
    >
      <td className="max-w-56 px-3 py-2.5">
        <Link to={`/items/${item.id}`} onClick={(e) => e.stopPropagation()} className="serif font-medium text-ink hover:text-brand">
          {item.title}
        </Link>
        {item.season ? <span className="ml-1 text-xs text-faint">第{item.season}季</span> : null}
      </td>
      <td className="px-3 py-2.5">
        <CategoryBadge category={item.category} />
      </td>
      <td className="px-3 py-2.5 text-soft">{item.year ?? '—'}</td>
      <td className="px-3 py-2.5">
        <StatusBadge status={item.status} />
      </td>
      <td className="px-3 py-2.5">
        <RatingStars value={item.rating} />
      </td>
      <td className="max-w-40 truncate px-3 py-2.5 text-xs text-faint" title={item.tags.join('/')}>
        {item.tags.join('/') || '—'}
      </td>
      <td className="px-3 py-2.5 text-xs text-faint">{item.last_watched ?? '—'}</td>
    </tr>
  )
}

/* ---------------- 主页面 ---------------- */

export default function ListPage() {
  const [sp, setSp] = useSearchParams()
  const navigate = useNavigate()
  const filters = useMemo(() => parseFilters(sp), [sp])
  const page = Math.max(1, Math.trunc(Number(sp.get('page')) || 1))
  // 每页条数（10 的倍数，默认 60；服务端上限 200）
  const pageSize = Math.max(10, Math.min(200, Math.trunc(Number(sp.get('page_size')) || 60)))
  const [view, setView] = useState<'grid' | 'table'>(() =>
    localStorage.getItem('rml-view') === 'table' ? 'table' : 'grid'
  )
  const [searchDraft, setSearchDraft] = useState({ query: filters.q ?? '', text: filters.q ?? '' })
  const searchText = searchDraft.query === (filters.q ?? '') ? searchDraft.text : filters.q ?? ''
  const restored = useRef(false)

  // 记住上次浏览状态：进入片单且 URL 无任何参数时，恢复完整筛选组合
  useEffect(() => {
    if (restored.current) return
    restored.current = true
    if (![...sp.keys()].length) {
      const saved = localStorage.getItem('rml-last-view')
      if (saved) setSp(new URLSearchParams(saved), { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    localStorage.setItem(
      'rml-last-view',
      filtersToQuery(filters) + (pageSize !== 60 ? `&page_size=${pageSize}` : '')
    )
  }, [filters, pageSize])

  function setCategory(id: string | null) {
    patchFilters({ category: id ? [id] : [] })
  }

  const itemsQ = useQuery({
    queryKey: ['items', sp.toString()],
    queryFn: () => api.listItems(filters, page, pageSize),
    placeholderData: (prev) => prev,
  })
  const outOfRange = Boolean(itemsQ.data && itemsQ.data.total > 0 && itemsQ.data.items.length === 0)

  // 页码超过实际页数（手改 URL、删掉最后一页数据）时收敛到最后一页，避免误显示“空库”
  useEffect(() => {
    if (!itemsQ.data || itemsQ.isPlaceholderData) return
    const maxPage = Math.max(1, Math.ceil(itemsQ.data.total / pageSize))
    if (page <= maxPage) return
    const next = new URLSearchParams(sp)
    if (maxPage <= 1) next.delete('page')
    else next.set('page', String(maxPage))
    setSp(next, { replace: true })
  }, [itemsQ.data, itemsQ.isPlaceholderData, page, pageSize, sp, setSp])
  const facetsQ = useQuery({ queryKey: ['facets'], queryFn: api.facets, staleTime: 5 * 60_000 })
  const statusCountsQ = useQuery({
    queryKey: ['status-counts', filters.category?.join(',') ?? ''],
    queryFn: () => api.statusCounts(filters.category ?? []),
    placeholderData: (prev) => prev,
  })
  const { visible: visibleCats } = useCategories()
  const catCounts = useMemo(
    () => new Map((facetsQ.data?.categories ?? []).map(([k, n]) => [k, n])),
    [facetsQ.data]
  )

  useEffect(() => {
    setSearchDraft({ query: filters.q ?? '', text: filters.q ?? '' })
  }, [filters.q])
  useEffect(() => {
    const query = searchText.trim()
    if (query === (filters.q ?? '')) return
    const t = setTimeout(() => {
      const next = { ...filters, q: query || undefined }
      const nsp = new URLSearchParams(filtersToQuery(next))
      const ps = sp.get('page_size')
      if (ps) nsp.set('page_size', ps)
      setSp(nsp, { replace: true })
    }, 350)
    return () => clearTimeout(t)
  }, [searchText, filters, sp, setSp])

  function patchFilters(patch: Partial<ItemFilters>) {
    const next = { ...filters, ...patch }
    const nsp = new URLSearchParams(filtersToQuery(next))
    // 改筛选时保留「每页条数」设置（页码照旧回到第 1 页）
    const ps = sp.get('page_size')
    if (ps) nsp.set('page_size', ps)
    setSp(nsp)
  }

  function clearFilters() {
    setSearchDraft({ query: '', text: '' })
    const next = new URLSearchParams(filtersToQuery(clearedFilters(filters)))
    const ps = sp.get('page_size')
    if (ps) next.set('page_size', ps)
    setSp(next)
  }

  function setSort(sort: ItemFilters['sort']) {
    patchFilters({ sort, order: filters.order })
  }

  const total = itemsQ.data?.total ?? 0
  const hasActiveFilters =
    (filters.category?.length ?? 0) > 0 ||
    (filters.status?.length ?? 0) > 0 ||
    (filters.regions?.length ?? 0) > 0 ||
    (filters.tags?.length ?? 0) > 0 ||
    (filters.authors?.length ?? 0) > 0 ||
    (filters.directors?.length ?? 0) > 0 ||
    (filters.actors?.length ?? 0) > 0 ||
    (filters.finish_status?.length ?? 0) > 0 ||
    filters.year_min !== undefined ||
    filters.year_max !== undefined ||
    filters.rating_min !== undefined ||
    filters.rating_max !== undefined ||
    filters.has_cover !== undefined ||
    filters.has_review !== undefined ||
    !!filters.channel ||
    !!filters.watched_from ||
    !!filters.watched_to ||
    filters.list_id !== undefined ||
    !!filters.q

  function setViewMode(v: 'grid' | 'table') {
    setView(v)
    localStorage.setItem('rml-view', v)
  }

  return (
    <div>
      <PageHeader
        title="片单"
        sub={itemsQ.isFetching ? '加载中…' : `共 ${total} 条记录`}
        right={
          <>
            <a
              className="btn h-9 w-9 px-0"
              href={`/api/export.csv?${filtersToQuery(filters)}`}
              title="导出当前筛选为 CSV"
            >
              <Download className="h-4 w-4" />
            </a>
            <div className="flex overflow-hidden rounded-md border border-line">
              <button
                className={`flex h-9 w-9 items-center justify-center transition ${view === 'grid' ? 'bg-brand text-brand-ink' : 'bg-card text-faint hover:text-ink'}`}
                onClick={() => setViewMode('grid')}
                title="网格视图"
              >
                <LayoutGrid className="h-4 w-4" />
              </button>
              <button
                className={`flex h-9 w-9 items-center justify-center transition ${view === 'table' ? 'bg-brand text-brand-ink' : 'bg-card text-faint hover:text-ink'}`}
                onClick={() => setViewMode('table')}
                title="列表视图"
              >
                <List className="h-4 w-4" />
              </button>
            </div>
            <button className="btn btn-primary hidden md:inline-flex" onClick={() => navigate('/new')}>
              <Plus className="h-4 w-4" />
              记一笔
            </button>
          </>
        }
      />

      {/* 类别页签 */}
      <div className="mb-2.5 flex items-center gap-1.5 overflow-x-auto pb-1">
        <button
          onClick={() => setCategory(null)}
          className={`flex h-8 shrink-0 items-center gap-1.5 rounded-md px-3 text-sm transition ${
            !filters.category?.length ? 'bg-brand font-medium text-brand-ink' : 'text-soft hover:bg-muted'
          }`}
        >
          全部
          <span className="text-[11px] opacity-70">
            {Array.from(catCounts.values()).reduce((sum, n) => sum + n, 0)}
          </span>
        </button>
        {visibleCats.map((cd) => (
          <button
            key={cd.id}
            onClick={() => setCategory(cd.id)}
            className={`flex h-8 shrink-0 items-center gap-1.5 rounded-md px-3 text-sm transition ${
              filters.category?.length === 1 && filters.category[0] === cd.id
                ? 'bg-brand font-medium text-brand-ink'
                : 'text-soft hover:bg-muted'
            }`}
          >
            {cd.label}
            <span className="text-[11px] opacity-70">{catCounts.get(cd.id) ?? 0}</span>
          </button>
        ))}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-1.5" role="group" aria-label="观看状态">
        <button type="button" className={`btn h-8 px-2.5 text-xs ${!filters.status?.length ? 'border-brand/40 bg-brand-soft text-brand' : 'btn-ghost'}`} aria-pressed={!filters.status?.length} onClick={() => patchFilters({ status: [] })}>全部状态</button>
        {STATUSES.map((s) => {
          const active = filters.status?.includes(s) ?? false
          return (
            <button
              key={s}
              type="button"
              className={`btn h-8 px-2.5 text-xs ${active ? 'border-brand/40 bg-brand-soft text-brand' : 'btn-ghost'}`}
              aria-pressed={active}
              onClick={() => patchFilters({ status: active ? filters.status!.filter((v) => v !== s) : [...filters.status ?? [], s] })}
            >
              {STATUS_LABELS[s]}
              <span className="text-[11px] tabular-nums opacity-70">{statusCountsQ.data?.[s] ?? 0}</span>
            </button>
          )
        })}
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <label className="relative basis-full md:mr-auto md:max-w-md md:flex-1 md:basis-auto">
          <Search className="pointer-events-none absolute top-3 left-3 h-4 w-4 text-faint" />
          <input
            value={searchText}
            onChange={(e) => setSearchDraft({ query: filters.q ?? '', text: e.target.value })}
            placeholder="搜索标题 / 拼音"
            aria-label="搜索标题或拼音"
            className="input h-10 pl-9 text-base"
          />
        </label>
        <label className="ml-auto flex items-center gap-2 text-xs text-soft">
          排序
          <select aria-label="排序方式" className="input w-28" value={filters.sort} onChange={(e) => setSort(e.target.value as ItemFilters['sort'])}>
            {SORT_OPTIONS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </select>
        </label>
        <button
          className="btn h-9 w-9 px-0"
          aria-label={filters.order === 'desc' ? '降序，点击改为升序' : '升序，点击改为降序'}
          title={filters.order === 'desc' ? '降序' : '升序'}
          onClick={() => patchFilters({ order: filters.order === 'desc' ? 'asc' : 'desc' })}
        >
          {filters.order === 'desc' ? <ArrowDownWideNarrow className="h-4 w-4" /> : <ArrowUpNarrowWide className="h-4 w-4" />}
        </button>
      </div>

      <LibraryFilters filters={filters} facets={facetsQ.data} loading={facetsQ.isPending} error={facetsQ.isError} onRetry={() => { void facetsQ.refetch() }} onChange={patchFilters} onClear={clearFilters} />

      {itemsQ.isLoading ? (
        <Loading />
      ) : itemsQ.isError ? (
        <p className="py-16 text-center text-sm text-faint">条目加载失败，请刷新重试。</p>
      ) : outOfRange ? (
        <Loading />
      ) : itemsQ.data && itemsQ.data.items.length > 0 ? (
        view === 'grid' ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {itemsQ.data.items.map((item, i) => (
              <ItemCard key={item.id} item={item} index={i} />
            ))}
          </div>
        ) : (
          <div className="card overflow-x-auto">
            <table className="w-full min-w-[768px] text-sm">
              <thead>
                <tr className="text-left text-xs text-faint">
                  <th className="px-3 py-2.5 font-medium">标题</th>
                  <th className="px-3 py-2.5 font-medium">类别</th>
                  <th className="px-3 py-2.5 font-medium">年份</th>
                  <th className="px-3 py-2.5 font-medium">状态</th>
                  <th className="px-3 py-2.5 font-medium">评分</th>
                  <th className="px-3 py-2.5 font-medium">标签</th>
                  <th className="px-3 py-2.5 font-medium">最近观看</th>
                </tr>
              </thead>
              <tbody>
                {itemsQ.data.items.map((item) => (
                  <ItemRow key={item.id} item={item} />
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : (
        <EmptyState
          title={hasActiveFilters ? '没有符合筛选的条目' : '这里还空着'}
          hint={hasActiveFilters ? '换个条件试试，或清空筛选看全部。' : '点右上角「记一笔」开始记录，或者先把 Excel 存量导入。'}
          action={
            hasActiveFilters ? (
              <button className="btn" onClick={clearFilters}>
                清空筛选
              </button>
            ) : (
              <button className="btn btn-primary" onClick={() => navigate('/new')}>
                <Plus className="h-4 w-4" />
                记一笔
              </button>
            )
          }
        />
      )}

      {itemsQ.data && (
        <Pagination
          page={page}
          pageSize={pageSize}
          total={total}
          onPage={(p) => {
            const nsp = new URLSearchParams(sp)
            if (p <= 1) nsp.delete('page')
            else nsp.set('page', String(p))
            setSp(nsp)
            window.scrollTo({ top: 0 })
          }}
          onPageSize={(n) => {
            const nsp = new URLSearchParams(sp)
            if (n === 60) nsp.delete('page_size')
            else nsp.set('page_size', String(n))
            nsp.delete('page') // 换每页条数后回到第 1 页
            setSp(nsp)
            window.scrollTo({ top: 0 })
          }}
        />
      )}
    </div>
  )
}

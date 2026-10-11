import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowDownWideNarrow, ArrowUpNarrowWide, Download, LayoutGrid, List, Plus, SlidersHorizontal, X } from 'lucide-react'
import { api, filtersToQuery } from '../api'
import { parseFilters } from '../../shared/filters'
import { STATUSES, STATUS_LABELS, FINISH_STATUSES, FINISH_LABELS } from '../../shared/types'
import type { Item, ItemFilters, Facets, Status, FinishStatus } from '../../shared/types'
import { EmptyState, Loading, PageHeader, Pagination, RatingStars, StatusBadge, CategoryBadge } from '../components/ui'
import { ItemCard } from '../components/ItemCard'
import { useCategories } from '../cat'

/* ---------------- 筛选面板 ---------------- */

function ModeToggle({
  value,
  onChange,
  disabled,
}: {
  value: 'any' | 'all'
  onChange: (v: 'any' | 'all') => void
  disabled?: boolean
}) {
  if (disabled) return null
  return (
    <span className="inline-flex overflow-hidden rounded border border-line text-[11px]">
      {(['any', 'all'] as const).map((m) => (
        <button
          key={m}
          type="button"
          onClick={() => onChange(m)}
          className={`px-1.5 py-0.5 transition ${value === m ? 'bg-brand text-brand-ink' : 'bg-card text-faint hover:text-ink'}`}
        >
          {m === 'any' ? '任一' : '全部'}
        </button>
      ))}
    </span>
  )
}

function ChipRow({
  options,
  selected,
  onToggle,
  mode,
  onMode,
}: {
  options: string[]
  selected: string[]
  onToggle: (v: string) => void
  mode?: 'any' | 'all'
  onMode?: (m: 'any' | 'all') => void
}) {
  if (!options.length) return <p className="text-xs text-faint">暂无可选项</p>
  return (
    <div className="flex items-start gap-2">
      <div className="flex max-h-28 flex-wrap gap-1.5 overflow-y-auto">
        {options.map((opt) => (
          <button
            key={opt}
            type="button"
            className={`chip ${selected.includes(opt) ? 'chip-on' : ''}`}
            onClick={() => onToggle(opt)}
          >
            {opt}
          </button>
        ))}
      </div>
      {onMode && selected.length > 1 && (
        <ModeToggle value={mode ?? 'any'} onChange={onMode} />
      )}
    </div>
  )
}

function toggleIn(list: string[], v: string): string[] {
  return list.includes(v) ? list.filter((x) => x !== v) : [...list, v]
}

const SORT_OPTIONS = [
  ['created_at', '添加时间'],
  ['updated_at', '最近更新'],
  ['title', '标题'],
  ['year', '年份'],
  ['rating', '评分'],
  ['watched', '观看日期'],
] as const

function FilterBar({
  filters,
  facets,
  onChange,
  onClear,
}: {
  filters: ItemFilters
  facets: Facets | undefined
  onChange: (patch: Partial<ItemFilters>) => void
  onClear: () => void
}) {
  const [showAllCreators, setShowAllCreators] = useState(false)
  const creatorOptions = facets
    ? facets.creators.map(([v]) => v)
    : []
  const visibleCreators = showAllCreators ? creatorOptions : creatorOptions.slice(0, 18)

  const triState = (value: boolean | undefined, on: () => Partial<ItemFilters>, off: () => Partial<ItemFilters>) => (
    <div className="flex gap-1.5">
      <button className={`chip ${value === undefined ? 'chip-on' : ''}`} onClick={() => value !== undefined && onChange(off())}>
        全部
      </button>
      <button className={`chip ${value === true ? 'chip-on' : ''}`} onClick={() => value !== true && onChange(on())}>
        有
      </button>
      <button className={`chip ${value === false ? 'chip-on' : ''}`} onClick={() => value !== false && onChange(off())}>
        无
      </button>
    </div>
  )

  return (
    <div className="card anim space-y-4 p-4">
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <p className="label mb-1.5">状态</p>
          <ChipRow
            options={STATUSES.map((s) => STATUS_LABELS[s])}
            selected={filters.status?.map((s) => STATUS_LABELS[s as Status]) ?? []}
            onToggle={(label) => {
              const st = STATUSES.find((s) => STATUS_LABELS[s] === label)!
              onChange({ status: toggleIn(filters.status ?? [], st) })
            }}
          />
        </div>
        <div>
          <p className="label mb-1.5">年份区间</p>
          <div className="flex items-center gap-2">
            <input
              type="number"
              placeholder="从"
              className="input w-24"
              value={filters.year_min ?? ''}
              onChange={(e) => onChange({ year_min: e.target.value ? Number(e.target.value) : undefined })}
            />
            <span className="text-faint">—</span>
            <input
              type="number"
              placeholder="到"
              className="input w-24"
              value={filters.year_max ?? ''}
              onChange={(e) => onChange({ year_max: e.target.value ? Number(e.target.value) : undefined })}
            />
          </div>
        </div>
        <div>
          <p className="label mb-1.5">评分下限</p>
          <div className="flex gap-1.5">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                className={`chip ${filters.rating_min === n ? 'chip-on' : ''}`}
                onClick={() => onChange({ rating_min: filters.rating_min === n ? undefined : n })}
              >
                ★{n}+
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="label mb-1.5">观看日期（想回顾某段时间看的）</p>
          <div className="flex items-center gap-2">
            <input
              type="date"
              className="input w-36"
              value={filters.watched_from ?? ''}
              onChange={(e) => onChange({ watched_from: e.target.value || undefined })}
            />
            <span className="text-faint">—</span>
            <input
              type="date"
              className="input w-36"
              value={filters.watched_to ?? ''}
              onChange={(e) => onChange({ watched_to: e.target.value || undefined })}
            />
          </div>
        </div>
        <div>
          <p className="label mb-1.5">完结状态（小说/漫画）</p>
          <ChipRow
            options={FINISH_STATUSES.map((s) => FINISH_LABELS[s])}
            selected={filters.finish_status?.map((s) => FINISH_LABELS[s as FinishStatus]) ?? []}
            onToggle={(label) => {
              const fs = FINISH_STATUSES.find((s) => FINISH_LABELS[s] === label)!
              onChange({ finish_status: toggleIn(filters.finish_status ?? [], fs) })
            }}
          />
        </div>
      </div>

      <div>
        <p className="label mb-1.5">地区</p>
        <ChipRow
          options={facets?.regions.map(([v]) => v) ?? []}
          selected={filters.regions ?? []}
          onToggle={(v) => onChange({ regions: toggleIn(filters.regions ?? [], v) })}
          mode={filters.region_mode}
          onMode={(m) => onChange({ region_mode: m })}
        />
      </div>
      <div>
        <p className="label mb-1.5">类型标签</p>
        <ChipRow
          options={facets?.tags.map(([v]) => v) ?? []}
          selected={filters.tags ?? []}
          onToggle={(v) => onChange({ tags: toggleIn(filters.tags ?? [], v) })}
          mode={filters.tag_mode}
          onMode={(m) => onChange({ tag_mode: m })}
        />
      </div>
      <div>
        <p className="label mb-1.5">
          主创 / 作者
          {creatorOptions.length > 18 && (
            <button className="ml-2 text-brand hover:underline" onClick={() => setShowAllCreators((v) => !v)}>
              {showAllCreators ? '收起' : `展开全部（${creatorOptions.length}）`}
            </button>
          )}
        </p>
        <ChipRow
          options={visibleCreators}
          selected={filters.creators ?? []}
          onToggle={(v) => onChange({ creators: toggleIn(filters.creators ?? [], v) })}
          mode={filters.creator_mode}
          onMode={(m) => onChange({ creator_mode: m })}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div>
          <p className="label mb-1.5">封面</p>
          {triState(
            filters.has_cover,
            () => ({ has_cover: true }),
            () => ({ has_cover: undefined })
          )}
        </div>
        <div>
          <p className="label mb-1.5">观后感</p>
          {triState(
            filters.has_review,
            () => ({ has_review: true }),
            () => ({ has_review: undefined })
          )}
        </div>
        <div>
          <p className="label mb-1.5">观看渠道</p>
          <select
            className="input"
            value={filters.channel ?? ''}
            onChange={(e) => onChange({ channel: e.target.value || undefined })}
          >
            <option value="">全部渠道</option>
            {(facets?.channels ?? []).map(([v]) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex justify-end border-t border-line pt-3">
        <button className="btn btn-ghost h-8 text-danger" onClick={onClear}>
          <X className="h-3.5 w-3.5" />
          清空筛选
        </button>
      </div>
    </div>
  )
}

/* ---------------- 列表视图行 ---------------- */

function ItemRow({ item }: { item: Item }) {
  const navigate = useNavigate()
  return (
    <tr
      className="cursor-pointer border-t border-line transition hover:bg-muted/60"
      onClick={() => navigate(`/items/${item.id}`)}
    >
      <td className="max-w-56 px-3 py-2.5">
        <Link to={`/items/${item.id}`} className="serif font-medium text-ink hover:text-brand">
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
  const page = Math.max(1, Number(sp.get('page')) || 1)
  const [view, setView] = useState<'grid' | 'table'>(() =>
    localStorage.getItem('rml-view') === 'table' ? 'table' : 'grid'
  )
  const [showFilters, setShowFilters] = useState(false)
  const [searchText, setSearchText] = useState(filters.q ?? '')
  const restored = useRef(false)

  // 记住上次浏览状态：进入片单且 URL 无任何参数时，恢复完整筛选组合
  useEffect(() => {
    if (restored.current) return
    restored.current = true
    if (![...sp.keys()].length) {
      const saved = localStorage.getItem('rml-last-view')
      if (saved) setSp(new URLSearchParams(saved))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    localStorage.setItem('rml-last-view', filtersToQuery(filters))
  }, [filters])

  function setCategory(id: string | null) {
    patchFilters({ category: id ? [id] : [] })
  }

  const itemsQ = useQuery({
    queryKey: ['items', sp.toString()],
    queryFn: () => api.listItems(filters, page, 60),
    placeholderData: (prev) => prev,
  })
  const facetsQ = useQuery({ queryKey: ['facets'], queryFn: api.facets, staleTime: 5 * 60_000 })
  const { visible: visibleCats } = useCategories()
  const catCounts = useMemo(
    () => new Map((facetsQ.data?.categories ?? []).map(([k, n]) => [k, n])),
    [facetsQ.data]
  )

  useEffect(() => setSearchText(filters.q ?? ''), [filters.q])
  useEffect(() => {
    const t = setTimeout(() => {
      if (searchText !== (filters.q ?? '')) patchFilters({ q: searchText || undefined })
    }, 350)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchText])

  function patchFilters(patch: Partial<ItemFilters>) {
    const next = { ...filters, ...patch }
    const nsp = new URLSearchParams(filtersToQuery(next))
    setSp(nsp)
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
    (filters.creators?.length ?? 0) > 0 ||
    (filters.finish_status?.length ?? 0) > 0 ||
    filters.year_min !== undefined ||
    filters.year_max !== undefined ||
    filters.rating_min !== undefined ||
    filters.has_cover !== undefined ||
    filters.has_review !== undefined ||
    !!filters.channel ||
    !!filters.watched_from ||
    !!filters.watched_to ||
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
            {visibleCats.reduce((sum, cd) => sum + (catCounts.get(cd.id) ?? 0), 0)}
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

      {/* 状态快捷条（与筛选器里的状态是同一参数） */}
      <div className="mb-2.5 flex flex-wrap items-center gap-1.5">
        {STATUSES.map((s) => {
          const active = filters.status?.length === 1 && filters.status[0] === s
          return (
            <button
              key={s}
              className={`chip ${active ? 'chip-on' : ''}`}
              onClick={() => patchFilters({ status: active ? [] : [s] })}
            >
              {STATUS_LABELS[s]}
            </button>
          )
        })}
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          placeholder="搜索标题，也支持拼音（如 manchang）"
          className="input h-10 flex-1 text-base md:max-w-md"
        />
        <button
          className={`btn ${hasActiveFilters ? 'border-brand/60 text-brand' : ''}`}
          onClick={() => setShowFilters((v) => !v)}
        >
          <SlidersHorizontal className="h-4 w-4" />
          筛选{hasActiveFilters ? ' · 已启用' : ''}
        </button>
        <select className="input w-32" value={filters.sort} onChange={(e) => setSort(e.target.value as ItemFilters['sort'])}>
          {SORT_OPTIONS.map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </select>
        <button
          className="btn h-9 w-9 px-0"
          title={filters.order === 'desc' ? '降序' : '升序'}
          onClick={() => patchFilters({ order: filters.order === 'desc' ? 'asc' : 'desc' })}
        >
          {filters.order === 'desc' ? <ArrowDownWideNarrow className="h-4 w-4" /> : <ArrowUpNarrowWide className="h-4 w-4" />}
        </button>
      </div>

      {showFilters && (
        <div className="mb-4">
          <FilterBar
            filters={filters}
            facets={facetsQ.data}
            onChange={patchFilters}
            onClear={() => setSp(new URLSearchParams())}
          />
        </div>
      )}

      {itemsQ.isLoading ? (
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
              <button className="btn" onClick={() => setSp(new URLSearchParams())}>
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
          pageSize={itemsQ.data.page_size}
          total={total}
          onPage={(p) => {
            const nsp = new URLSearchParams(sp)
            if (p <= 1) nsp.delete('page')
            else nsp.set('page', String(p))
            setSp(nsp)
            window.scrollTo({ top: 0 })
          }}
        />
      )}
    </div>
  )
}

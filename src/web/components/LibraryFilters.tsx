import { useState } from 'react'
import { Check, ChevronDown, ChevronLeft, Search, SlidersHorizontal, X } from 'lucide-react'
import type { Facets, ItemFilters } from '../../shared/types'
import { FINISH_LABELS, FINISH_STATUSES } from '../../shared/types'
import { Modal } from './ui'
import { useCategories } from '../cat'
import { FILTER_FIELDS, clearField, fieldPatch, fieldSummary } from './filterState'
import type { FilterField } from './filterState'

const QUICK_FIELDS: FilterField[] = ['regions', 'tags', 'year', 'rating']
const VALUE_FIELDS = {
  regions: { facet: 'regions', mode: 'region_mode' },
  tags: { facet: 'tags', mode: 'tag_mode' },
  authors: { facet: 'authors', mode: 'author_mode' },
  directors: { facet: 'directors', mode: 'director_mode' },
  actors: { facet: 'actors', mode: 'actor_mode' },
} as const

function FilterEditor({
  field, filters, facets, loading, error, onRetry, onApply, onClose,
}: {
  field: FilterField
  filters: ItemFilters
  facets?: Facets
  loading: boolean
  error: boolean
  onRetry: () => void
  onApply: (patch: Partial<ItemFilters>) => void
  onClose: () => void
}) {
  const [draft, setDraft] = useState<ItemFilters>(() => fieldPatch(filters, field))
  const [query, setQuery] = useState('')
  const label = FILTER_FIELDS.find((f) => f.id === field)!.label
  const patch = (next: Partial<ItemFilters>) => setDraft((prev) => ({ ...prev, ...next }))
  const valuesConfig = field in VALUE_FIELDS ? VALUE_FIELDS[field as keyof typeof VALUE_FIELDS] : undefined
  const selected = valuesConfig ? draft[field as keyof typeof VALUE_FIELDS] ?? [] : []
  const source = valuesConfig ? facets?.[valuesConfig.facet] ?? [] : field === 'channel' ? facets?.channels ?? [] : []
  const options = [...new Set([...selected, ...(field === 'channel' && draft.channel ? [draft.channel] : []), ...source.map(([v]) => v)])]
    .filter((v) => v.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
  const counts = new Map(source)
  const invalid = field === 'year'
    ? draft.year_min !== undefined && draft.year_max !== undefined && draft.year_min > draft.year_max
    : field === 'watched'
      ? !!draft.watched_from && !!draft.watched_to && draft.watched_from > draft.watched_to
      : field === 'rating' && draft.rating_min !== undefined && draft.rating_max !== undefined && draft.rating_min > draft.rating_max

  return (
    <form onSubmit={(e) => { e.preventDefault(); if (!invalid) onApply(fieldPatch(draft, field)) }}>
      {(valuesConfig || field === 'channel') && (
        <>
          <label className="relative mb-3 block">
            <Search className="pointer-events-none absolute top-2.5 left-3 h-4 w-4 text-faint" />
            <input autoFocus className="input h-10 pl-9" aria-label={`搜索${label}`} placeholder={`搜索${label}`} value={query} onChange={(e) => setQuery(e.target.value)} />
          </label>
          {selected.length > 0 && (
            <div className="mb-3 flex flex-wrap gap-1.5" aria-label="待应用的选项">
              {selected.map((v) => (
                <button type="button" key={v} className="inline-flex max-w-full items-center gap-1 rounded bg-brand-soft px-2 py-1 text-xs text-brand" aria-label={`取消选择${v}`} onClick={() => patch({ [field]: selected.filter((s) => s !== v) })}>
                  <span className="truncate">{v}</span><X className="h-3 w-3 shrink-0" />
                </button>
              ))}
            </div>
          )}
          {valuesConfig && selected.length > 1 && (
            <label className="mb-3 flex items-center justify-between gap-2 text-xs text-soft">
              多选时
              <select className="input h-8 w-40" aria-label={`${label}匹配方式`} value={draft[valuesConfig.mode] ?? 'any'} onChange={(e) => patch({ [valuesConfig.mode]: e.target.value })}>
                <option value="any">包含任意一个</option><option value="all">同时包含全部</option>
              </select>
            </label>
          )}
          <div className="max-h-[min(38dvh,320px)] overflow-y-auto overscroll-contain rounded-md border border-line">
            {options.map((value) => {
              const checked = field === 'channel' ? draft.channel === value : selected.includes(value)
              return (
                <label key={value} className={`flex min-h-11 cursor-pointer items-center gap-3 px-3 py-2.5 text-sm hover:bg-muted ${checked ? 'bg-brand-soft/50' : ''}`}>
                  <input type={field === 'channel' ? 'radio' : 'checkbox'} name="filter-value" className="h-4 w-4 shrink-0 accent-brand" checked={checked} disabled={!checked && selected.length >= 20} onChange={() => patch(field === 'channel' ? { channel: value } : { [field]: checked ? selected.filter((s) => s !== value) : [...selected, value] })} />
                  <span className="min-w-0 flex-1 break-words">{value}</span>
                  {counts.has(value) && <span className="text-xs tabular-nums text-faint">{counts.get(value)}</span>}
                </label>
              )
            })}
            {loading && !options.length && <p className="p-5 text-center text-sm text-soft">选项加载中…</p>}
            {!loading && !options.length && <p className="p-5 text-center text-sm text-soft">{query ? '没有找到，换个关键词试试' : '暂无可选项'}</p>}
          </div>
          {error && <p className="mt-2 text-sm text-danger">选项加载失败。<button type="button" className="ml-2 underline" onClick={onRetry}>重试</button></p>}
          {selected.length >= 20 && <p className="mt-2 text-xs text-soft">最多选择 20 项</p>}
        </>
      )}
      {field === 'year' && (
        <>
          <div className="mb-4 flex flex-wrap gap-2">
            {[2020, 2010, 2000, 1990, 1980].map((year) => (
              <button key={year} type="button" className={`btn h-8 px-2.5 text-xs ${draft.year_min === year && draft.year_max === year + 9 ? 'border-brand bg-brand-soft text-brand' : ''}`} onClick={() => patch({ year_min: year, year_max: year + 9 })}>{year} 年代</button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1.5 text-sm text-soft">最早年份<input type="number" className="input" placeholder="不限" value={draft.year_min ?? ''} onChange={(e) => patch({ year_min: e.target.value ? Number(e.target.value) : undefined })} /></label>
            <label className="space-y-1.5 text-sm text-soft">最晚年份<input type="number" className="input" placeholder="不限" value={draft.year_max ?? ''} onChange={(e) => patch({ year_max: e.target.value ? Number(e.target.value) : undefined })} /></label>
          </div>
        </>
      )}
      {field === 'rating' && (
        <>
          <div className="mb-4 flex flex-wrap gap-2">
            {[3, 4, 5].map((n) => <button key={n} type="button" className={`btn ${draft.rating_min === n && draft.rating_max === undefined ? 'border-brand bg-brand-soft text-brand' : ''}`} onClick={() => patch({ rating_min: n, rating_max: undefined })}>★ {n}{n < 5 ? ' 星以上' : ' 星'}</button>)}
          </div>
          <div className="grid grid-cols-2 gap-3">
            {(['rating_min', 'rating_max'] as const).map((key) => (
              <label key={key} className="space-y-1.5 text-sm text-soft">{key === 'rating_min' ? '最低评分' : '最高评分'}
                <select className="input" value={draft[key] ?? ''} onChange={(e) => patch({ [key]: e.target.value ? Number(e.target.value) : undefined })}>
                  <option value="">不限</option>{[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n} 星</option>)}
                </select>
              </label>
            ))}
          </div>
        </>
      )}
      {field === 'watched' && (
        <div className="grid grid-cols-1 gap-3 min-[380px]:grid-cols-2">
          <label className="min-w-0 space-y-1.5 text-sm text-soft">开始日期<input type="date" className="input min-w-0" value={draft.watched_from ?? ''} onChange={(e) => patch({ watched_from: e.target.value || undefined })} /></label>
          <label className="min-w-0 space-y-1.5 text-sm text-soft">结束日期<input type="date" className="input min-w-0" value={draft.watched_to ?? ''} onChange={(e) => patch({ watched_to: e.target.value || undefined })} /></label>
        </div>
      )}
      {field === 'finish_status' && (
        <div className="space-y-1">
          {FINISH_STATUSES.map((s) => (
            <label key={s} className="flex min-h-11 cursor-pointer items-center gap-3 rounded px-2 text-sm hover:bg-muted">
              <input type="checkbox" className="h-4 w-4 accent-brand" checked={draft.finish_status?.includes(s) ?? false} onChange={() => patch({ finish_status: draft.finish_status?.includes(s) ? draft.finish_status.filter((v) => v !== s) : [...draft.finish_status ?? [], s] })} />{FINISH_LABELS[s]}
            </label>
          ))}
        </div>
      )}
      {(field === 'has_cover' || field === 'has_review') && (
        <div className="grid grid-cols-3 gap-2">
          {([undefined, true, false] as const).map((value) => (
            <button key={String(value)} type="button" className={`btn h-11 px-2 ${draft[field] === value ? 'border-brand bg-brand-soft text-brand' : ''}`} aria-pressed={draft[field] === value} onClick={() => patch({ [field]: value })}>{value === undefined ? '不限' : `${value ? '有' : '无'}${label}`}</button>
          ))}
        </div>
      )}
      {invalid && <p className="mt-3 text-sm text-danger" role="alert">{field === 'watched' ? '开始日期不能晚于结束日期' : field === 'year' ? '最早年份不能大于最晚年份' : '最低评分不能高于最高评分'}</p>}
      <div className="mt-5 flex items-center justify-between gap-2 border-t border-line pt-4">
        <button type="button" className="btn btn-ghost px-2 text-danger" onClick={() => onApply(clearField(field))}>清除此条件</button>
        <div className="flex gap-2"><button type="button" className="btn btn-ghost" onClick={onClose}>取消</button><button type="submit" className="btn btn-primary" disabled={invalid}>应用</button></div>
      </div>
    </form>
  )
}

export function LibraryFilters({ filters, facets, loading, error, onRetry, onChange, onClear }: {
  filters: ItemFilters
  facets?: Facets
  loading: boolean
  error: boolean
  onRetry: () => void
  onChange: (patch: Partial<ItemFilters>) => void
  onClear: () => void
}) {
  const [open, setOpen] = useState<FilterField | 'more' | null>(null)
  const { labelOf } = useCategories()
  const active = FILTER_FIELDS.filter((f) => fieldSummary(filters, f.id))
  const extraCount = active.filter((f) => !QUICK_FIELDS.includes(f.id) && f.id !== 'status').length
  const chips = [
    ...(filters.q ? [{ id: 'q', label: `搜索：${filters.q}`, remove: () => onChange({ q: undefined }), edit: undefined }] : []),
    ...(filters.category?.length ? [{ id: 'category', label: `类别：${filters.category.map(labelOf).join('、')}`, remove: () => onChange({ category: [] }), edit: undefined }] : []),
    ...active.map((f) => ({ id: f.id, label: `${f.label}：${fieldSummary(filters, f.id)}`, remove: () => onChange(clearField(f.id)), edit: f.id === 'status' ? undefined : () => setOpen(f.id) })),
    ...(filters.list_id !== undefined ? [{ id: 'list', label: `清单 #${filters.list_id}`, remove: () => onChange({ list_id: undefined }), edit: undefined }] : []),
  ]

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2" aria-label="筛选条件">
        {QUICK_FIELDS.map((id) => {
          const definition = FILTER_FIELDS.find((f) => f.id === id)!
          const selected = !!fieldSummary(filters, id)
          return <button key={id} type="button" className={`btn h-8 gap-1.5 px-2.5 text-xs ${selected ? 'border-brand/50 bg-brand-soft text-brand' : 'text-soft'}`} aria-haspopup="dialog" onClick={() => setOpen(id)}>{definition.label}<ChevronDown className="h-3.5 w-3.5" /></button>
        })}
        <button type="button" className={`btn h-8 px-2.5 text-xs ${extraCount ? 'border-brand/50 text-brand' : 'text-soft'}`} aria-haspopup="dialog" onClick={() => setOpen('more')}><SlidersHorizontal className="h-3.5 w-3.5" />更多筛选{extraCount > 0 && <span className="rounded bg-brand-soft px-1.5 text-brand">{extraCount}</span>}</button>
      </div>
      {chips.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2" aria-label="已选筛选">
          {chips.map((chip) => (
            <span key={chip.id} className="inline-flex max-w-full items-center rounded-md border border-brand/25 bg-brand-soft/60 text-xs text-ink">
              {chip.edit ? <button type="button" className="min-w-0 truncate px-2.5 py-2 text-left hover:text-brand" title={chip.label} aria-label={`编辑${chip.label}`} onClick={chip.edit}>{chip.label}</button> : <span className="min-w-0 truncate py-2 pl-2.5" title={chip.label}>{chip.label}</span>}
              <button type="button" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-r-md text-soft hover:bg-brand/10 hover:text-danger" aria-label={`移除${chip.label}`} onClick={chip.remove}><X className="h-3.5 w-3.5" /></button>
            </span>
          ))}
          <button type="button" className="min-h-8 px-1 text-xs text-soft underline decoration-line underline-offset-4 hover:text-danger" onClick={onClear}>清空筛选</button>
        </div>
      )}
      <Modal open={open !== null} title={open === 'more' || open === null ? '添加筛选' : FILTER_FIELDS.find((f) => f.id === open)!.label} onClose={() => setOpen(null)}>
        {open === 'more' ? (
          <div className="space-y-4">
            {[
              { label: '作品', fields: ['regions', 'tags', 'year', 'rating', 'finish_status'] as FilterField[] },
              { label: '主创', fields: ['authors', 'directors', 'actors'] as FilterField[] },
              { label: '我的记录', fields: ['watched', 'channel', 'has_cover', 'has_review'] as FilterField[] },
            ].map((group) => (
              <div key={group.label}>
                <p className="mb-1 px-2 text-xs text-soft">{group.label}</p>
                <div className="divide-y divide-line/60">
                  {group.fields.map((id) => {
                    const summary = fieldSummary(filters, id)
                    return <button type="button" key={id} className="flex min-h-11 w-full items-center gap-3 rounded px-2 py-2 text-left text-sm hover:bg-muted" onClick={() => setOpen(id)}><span className="shrink-0">{FILTER_FIELDS.find((f) => f.id === id)!.label}</span><span className="min-w-0 flex-1 truncate text-right text-xs text-soft">{summary}</span>{summary ? <Check className="h-4 w-4 shrink-0 text-brand" /> : <PlusSign />}</button>
                  })}
                </div>
              </div>
            ))}
          </div>
        ) : open && (
          <>
            <button type="button" className="mb-3 inline-flex min-h-8 items-center gap-1 text-xs text-soft hover:text-brand" onClick={() => setOpen('more')}><ChevronLeft className="h-3.5 w-3.5" />全部条件</button>
            <FilterEditor key={open} field={open} filters={filters} facets={facets} loading={loading} error={error} onRetry={onRetry} onClose={() => setOpen(null)} onApply={(patch) => { onChange(patch); setOpen(null) }} />
          </>
        )}
      </Modal>
    </>
  )
}

function PlusSign() {
  return <span className="w-4 shrink-0 text-center text-soft" aria-hidden="true">+</span>
}

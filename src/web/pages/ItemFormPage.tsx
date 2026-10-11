import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../api'
import {
  CHANNEL_SUGGESTIONS,
  FINISH_LABELS,
  FINISH_STATUSES,
  REGION_PRESETS,
  STATUSES,
  STATUS_LABELS,
  TAG_PRESETS,
} from '../../shared/types'
import type { FinishStatus, Item, Status } from '../../shared/types'
import { Loading, PageHeader, RatingStars } from '../components/ui'
import { BackLink } from '../components/ui'
import { TagInput } from '../components/TagInput'
import { useCategories } from '../cat'

interface FormState {
  title: string
  category: string
  status: Status
  year: string
  season: string
  episode_count: string
  rating: number | null
  regions: string[]
  tags: string[]
  creators: string[]
  channel: string
  finish_status: FinishStatus | null
  cover_url: string
  progress: string
  notes: string
  review: string
  tmdb_id: string
}

const EMPTY: FormState = {
  title: '',
  category: 'movie',
  status: 'want',
  year: '',
  season: '',
  episode_count: '',
  rating: null,
  regions: [],
  tags: [],
  creators: [],
  channel: '',
  finish_status: null,
  cover_url: '',
  progress: '',
  notes: '',
  review: '',
  tmdb_id: '',
}

function numOrNull(v: string): number | null {
  const t = v.trim()
  if (!t) return null
  const n = Number(t)
  return Number.isFinite(n) ? Math.trunc(n) : null
}

function toForm(item: Item): FormState {
  return {
    title: item.title,
    category: item.category,
    status: item.status,
    year: item.year?.toString() ?? '',
    season: item.season?.toString() ?? '',
    episode_count: item.episode_count?.toString() ?? '',
    rating: item.rating,
    regions: item.regions,
    tags: item.tags,
    creators: item.creators,
    channel: item.channel,
    finish_status: item.finish_status,
    cover_url: item.cover_url,
    progress: item.progress,
    notes: item.notes,
    review: item.review,
    tmdb_id: item.tmdb_id ?? '',
  }
}

function Segmented({
  options,
  value,
  onChange,
  labels,
}: {
  options: string[]
  value: string
  onChange: (v: string) => void
  labels: Record<string, string>
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((opt) => (
        <button
          key={opt}
          type="button"
          className={`chip ${value === opt ? 'chip-on' : ''}`}
          onClick={() => onChange(opt)}
        >
          {labels[opt] ?? opt}
        </button>
      ))}
    </div>
  )
}

export default function ItemFormPage() {
  const { id } = useParams()
  const itemId = id ? Number(id) : undefined
  const editing = itemId !== undefined
  const navigate = useNavigate()
  const qc = useQueryClient()

  const existing = useQuery({
    queryKey: ['item', itemId],
    queryFn: () => api.getItem(itemId!),
    enabled: editing,
  })
  const facets = useQuery({ queryKey: ['facets'], queryFn: api.facets, staleTime: 5 * 60_000 })
  const { visible: visibleCats, finishOf } = useCategories()

  const [form, setForm] = useState<FormState>(EMPTY)
  const [error, setError] = useState('')
  const catOptions = visibleCats.some((c) => c.id === form.category)
    ? visibleCats
    : [...visibleCats, { id: form.category, label: form.category }]
  const catLabels = Object.fromEntries(catOptions.map((c) => [c.id, c.label]))

  useEffect(() => {
    if (editing && existing.data) setForm(toForm(existing.data))
  }, [editing, existing.data])

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        title: form.title.trim(),
        category: form.category,
        status: form.status,
        year: numOrNull(form.year),
        season: numOrNull(form.season),
        episode_count: numOrNull(form.episode_count),
        rating: form.rating,
        regions: form.regions,
        tags: form.tags,
        creators: form.creators,
        channel: form.channel.trim(),
        finish_status: form.finish_status,
        cover_url: form.cover_url.trim(),
        progress: form.progress.trim(),
        notes: form.notes.trim(),
        review: form.review.trim(),
        tmdb_id: form.tmdb_id.trim() || null,
      }
      return editing ? api.updateItem(itemId!, payload) : api.createItem(payload)
    },
    onSuccess: (saved) => {
      qc.invalidateQueries({ queryKey: ['items'] })
      qc.invalidateQueries({ queryKey: ['facets'] })
      qc.invalidateQueries({ queryKey: ['stats'] })
      if (editing) qc.invalidateQueries({ queryKey: ['item', itemId] })
      navigate(`/items/${editing ? itemId : saved.id}`)
    },
    onError: (err) => setError(err instanceof Error ? err.message : '保存失败'),
  })

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }))

  if (editing && existing.isLoading) return <Loading />

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-3">
        <BackLink fallback={editing ? `/items/${itemId}` : '/'} label={editing ? '返回条目' : '返回片单'} />
      </div>
      <PageHeader
        title={editing ? '编辑条目' : '记一笔'}
        sub={editing ? '改动会记进条目动态' : '填个标题就能存，其他随时补'}
      />

      <div className="card anim space-y-5 p-5 md:p-6">
        <div>
          <label className="label mb-1.5 block">
            标题 <span className="text-danger">*</span>
          </label>
          <input
            className="input h-11 text-lg"
            autoFocus={!editing}
            value={form.title}
            onChange={(e) => set('title', e.target.value)}
            placeholder="作品名"
          />
        </div>

        <div className="grid gap-5 md:grid-cols-2">
          <div>
            <label className="label mb-1.5 block">类别</label>
            <Segmented options={catOptions.map((c) => c.id)} value={form.category} onChange={(v) => set('category', v)} labels={catLabels} />
          </div>
          <div>
            <label className="label mb-1.5 block">状态</label>
            <Segmented options={[...STATUSES]} value={form.status} onChange={(v) => set('status', v as Status)} labels={STATUS_LABELS} />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="label mb-1.5 block">年份</label>
            <input type="number" className="input" value={form.year} onChange={(e) => set('year', e.target.value)} placeholder="如 2024" />
          </div>
          <div>
            <label className="label mb-1.5 block">季号</label>
            <input type="number" className="input" value={form.season} onChange={(e) => set('season', e.target.value)} placeholder="可选" />
          </div>
          <div>
            <label className="label mb-1.5 block">总集数</label>
            <input type="number" className="input" value={form.episode_count} onChange={(e) => set('episode_count', e.target.value)} placeholder="可选" />
          </div>
        </div>

        <div className="grid gap-5 md:grid-cols-2">
          <div>
            <label className="label mb-1.5 block">制片地区（可多选）</label>
            <TagInput
              values={form.regions}
              onChange={(v) => set('regions', v)}
              suggestions={[...new Set([...REGION_PRESETS, ...(facets.data?.regions.map(([v]) => v) ?? [])])]}
              placeholder="如 中国大陆、日本"
            />
          </div>
          <div>
            <label className="label mb-1.5 block">类型标签（可多选）</label>
            <TagInput
              values={form.tags}
              onChange={(v) => set('tags', v)}
              suggestions={[...new Set([...TAG_PRESETS, ...(facets.data?.tags.map(([v]) => v) ?? [])])]}
              placeholder="如 科幻、悬疑"
            />
          </div>
        </div>

        <div>
          <label className="label mb-1.5 block">主创 / 作者（可多选，可筛选）</label>
          <TagInput
            values={form.creators}
            onChange={(v) => set('creators', v)}
            suggestions={facets.data?.creators.map(([v]) => v) ?? []}
            placeholder="如 导演、演员、作者名"
          />
        </div>

        <div className="grid gap-5 md:grid-cols-2">
          <div>
            <label className="label mb-1.5 block">观看渠道</label>
            <input
              className="input"
              list="channel-suggestions"
              value={form.channel}
              onChange={(e) => set('channel', e.target.value)}
              placeholder="如 影院、腾讯视频"
            />
            <datalist id="channel-suggestions">
              {[...new Set([...CHANNEL_SUGGESTIONS, ...(facets.data?.channels.map(([v]) => v) ?? [])])].map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>
          <div>
            <label className="label mb-1.5 block">观看进度</label>
            <input
              className="input"
              value={form.progress}
              onChange={(e) => set('progress', e.target.value)}
              placeholder="如 看到第 8 集"
            />
          </div>
        </div>

        <div className="grid gap-5 md:grid-cols-2">
          <div>
            <label className="label mb-1.5 block">我的评分</label>
            <div className="flex h-9 items-center">
              <RatingStars value={form.rating} onChange={(v) => set('rating', v)} size={24} />
              {form.rating && (
                <button className="btn-ghost btn ml-2 h-7 px-2 text-xs" onClick={() => set('rating', null)}>
                  清除
                </button>
              )}
            </div>
          </div>
          {finishOf(form.category) && (
            <div>
              <label className="label mb-1.5 block">完结状态</label>
              <div className="flex gap-1.5">
                {FINISH_STATUSES.map((fs) => (
                  <button
                    key={fs}
                    type="button"
                    className={`chip ${form.finish_status === fs ? 'chip-on' : ''}`}
                    onClick={() => set('finish_status', form.finish_status === fs ? null : fs)}
                  >
                    {FINISH_LABELS[fs]}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div>
          <label className="label mb-1.5 block">封面外链</label>
          <div className="flex items-start gap-3">
            <input
              className="input flex-1"
              value={form.cover_url}
              onChange={(e) => set('cover_url', e.target.value)}
              placeholder="https://…（豆瓣、TMDB 等海报图链接）"
            />
            {form.cover_url && (
              <img
                src={form.cover_url}
                alt="封面预览"
                className="h-20 w-14 rounded border border-line object-cover"
                onError={(e) => {
                  ;(e.target as HTMLImageElement).style.opacity = '0.2'
                }}
              />
            )}
          </div>
        </div>

        <div>
          <label className="label mb-1.5 block">备注</label>
          <textarea
            className="input"
            rows={2}
            value={form.notes}
            onChange={(e) => set('notes', e.target.value)}
            placeholder="片源、版本、来龙去脉……"
          />
        </div>

        <div>
          <label className="label mb-1.5 block">观后感</label>
          <textarea
            className="input"
            rows={4}
            value={form.review}
            onChange={(e) => set('review', e.target.value)}
            placeholder="看完想说的话"
          />
        </div>

        {error && <p className="text-sm text-danger">{error}</p>}

        <div className="flex justify-end gap-2 border-t border-line pt-4">
          <button className="btn" onClick={() => navigate(-1)}>
            取消
          </button>
          <button className="btn btn-primary" disabled={!form.title.trim() || save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? '保存中…' : '保存'}
          </button>
        </div>
      </div>
    </div>
  )
}

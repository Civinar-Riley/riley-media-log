import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
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
import { seasonFromTitle } from '../../shared/season'
import { Loading, PageHeader, RatingStars } from '../components/ui'
import { BackLink } from '../components/ui'
import { TagInput } from '../components/TagInput'
import { useCategories } from '../cat'
import { invalidateLibrary } from '../cache'

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
  authors: string[]
  directors: string[]
  actors: string[]
  channel: string
  finish_status: FinishStatus | null
  cover_url: string
  progressNum: string
  progressLegacy: string
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
  authors: [],
  directors: [],
  actors: [],
  channel: '',
  finish_status: null,
  cover_url: '',
  progressNum: '',
  progressLegacy: '',
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

/** 进度单位：综艺按期、小说按章、漫画按话，其余按集 */
function progressUnit(category: string): string {
  if (category === 'variety') return '期'
  if (category === 'novel') return '章'
  if (category === 'manga') return '话'
  return '集'
}

/** 老数据兼容：标准格式或纯数字取出数字，其他原文保留（保存时原样带回） */
function parseProgress(raw: string): { num: string; legacy: string } {
  const s = raw.trim()
  if (!s) return { num: '', legacy: '' }
  const m = s.match(/^看到第\s*(\d+)\s*[集期话章]$/)
  if (m) return { num: m[1], legacy: '' }
  if (/^\d+$/.test(s)) return { num: s, legacy: '' }
  return { num: '', legacy: s }
}

function toForm(item: Item): FormState {
  const progress = parseProgress(item.progress)
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
    authors: item.authors,
    directors: item.directors,
    actors: item.actors,
    channel: item.channel,
    finish_status: item.finish_status,
    cover_url: item.cover_url,
    progressNum: progress.num,
    progressLegacy: progress.legacy,
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
  const location = useLocation()
  const qc = useQueryClient()

  const existing = useQuery({
    queryKey: ['item', itemId],
    queryFn: () => api.getItem(itemId!),
    enabled: editing,
  })
  const facets = useQuery({ queryKey: ['facets'], queryFn: api.facets, staleTime: 5 * 60_000 })
  const { visible: visibleCats, finishOf, authorOf, directorOf, actorOf } = useCategories()

  const [form, setForm] = useState<FormState>(EMPTY)
  const [error, setError] = useState('')
  const initialRef = useRef<FormState>(EMPTY)
  const catOptions = visibleCats.some((c) => c.id === form.category)
    ? visibleCats
    : [...visibleCats, { id: form.category, label: form.category }]
  const catLabels = Object.fromEntries(catOptions.map((c) => [c.id, c.label]))
  const regionSuggestions = useMemo(
    () => [...new Set([...REGION_PRESETS, ...(facets.data?.regions.map(([v]) => v) ?? [])])],
    [facets.data]
  )
  const tagSuggestions = useMemo(
    () => [...new Set([...TAG_PRESETS, ...(facets.data?.tags.map(([v]) => v) ?? [])])],
    [facets.data]
  )
  const authorSuggestions = useMemo(() => facets.data?.authors.map(([v]) => v) ?? [], [facets.data])
  const directorSuggestions = useMemo(
    () => facets.data?.directors.map(([v]) => v) ?? [],
    [facets.data]
  )
  const actorSuggestions = useMemo(() => facets.data?.actors.map(([v]) => v) ?? [], [facets.data])

  useEffect(() => {
    if (editing && existing.data) {
      const next = toForm(existing.data)
      initialRef.current = next
      setForm(next)
    }
  }, [editing, existing.data])

  // 编辑页和 /new 复用同一个组件实例：从编辑切到新建时要清空，否则会带着上一条的数据
  useEffect(() => {
    if (!editing) {
      initialRef.current = EMPTY
      setForm(EMPTY)
      setError('')
    }
  }, [editing])

  const confirmLeave = () =>
    JSON.stringify(form) === JSON.stringify(initialRef.current) ||
    window.confirm('有未保存的修改，确定离开吗？')

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
        authors: authorOf(form.category) ? form.authors : [],
        directors: directorOf(form.category) ? form.directors : [],
        actors: actorOf(form.category) ? form.actors : [],
        channel: form.channel.trim(),
        finish_status: finishOf(form.category) ? form.finish_status : null,
        cover_url: form.cover_url.trim(),
        progress: form.progressNum
          ? `看到第 ${form.progressNum} ${progressUnit(form.category)}`
          : form.progressLegacy,
        notes: form.notes.trim(),
        review: form.review.trim(),
        tmdb_id: form.tmdb_id.trim() || null,
      }
      return editing ? api.updateItem(itemId!, payload) : api.createItem(payload)
    },
    onSuccess: (saved) => {
      invalidateLibrary(qc)
      if (editing) {
        // 历史里本来就有详情页（列表→详情→编辑），直接退回去即可：
        // 编辑页不留历史，之后点「返回」自然回到列表；直接打开编辑页的情况退无可退，replace 落到详情
        if (location.key === 'default') navigate(`/items/${itemId}`, { replace: true })
        else navigate(-1)
      } else {
        // 新建后落在详情，replace 让「返回」回到来处而不是空白表单
        navigate(`/items/${saved.id}`, { replace: true })
      }
    },
    onError: (err) => setError(err instanceof Error ? err.message : '保存失败'),
  })

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }))

  if (editing && existing.isLoading) return <Loading />
  if (editing && existing.isError)
    return <p className="py-16 text-center text-sm text-faint">条目加载失败，请刷新重试。</p>

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-3">
        <BackLink
          fallback={editing ? `/items/${itemId}` : '/'}
          label={editing ? '返回条目' : '返回片单'}
          confirm={confirmLeave}
        />
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
            onChange={(e) => {
              const title = e.target.value
              const inTitle = seasonFromTitle(title)
              setForm((f) => ({
                ...f,
                title,
                // 标题里出现季号 → 同步；原标题的季号被去掉 → 清空（不留上一部的季号）；
                // 原标题本来没有季号 → 尊重用户手填的值
                season: inTitle
                  ? String(inTitle)
                  : f.season && seasonFromTitle(f.title)
                    ? ''
                    : f.season,
              }))
            }}
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
              suggestions={regionSuggestions}
              placeholder="如 中国大陆、日本"
            />
          </div>
          <div>
            <label className="label mb-1.5 block">类型标签（可多选）</label>
            <TagInput
              values={form.tags}
              onChange={(v) => set('tags', v)}
              suggestions={tagSuggestions}
              placeholder="如 科幻、悬疑"
            />
          </div>
        </div>

        {authorOf(form.category) && (
          <div>
            <label className="label mb-1.5 block">作者</label>
            <TagInput
              values={form.authors}
              onChange={(v) => set('authors', v)}
              suggestions={authorSuggestions}
              placeholder="作者名，回车添加"
            />
          </div>
        )}
        {(directorOf(form.category) || actorOf(form.category)) && (
          <div className="grid gap-5 md:grid-cols-2">
            {directorOf(form.category) && (
              <div>
                <label className="label mb-1.5 block">导演</label>
                <TagInput
                  values={form.directors}
                  onChange={(v) => set('directors', v)}
                  suggestions={directorSuggestions}
                  placeholder="导演名"
                />
              </div>
            )}
            {actorOf(form.category) && (
              <div>
                <label className="label mb-1.5 block">主演</label>
                <TagInput
                  values={form.actors}
                  onChange={(v) => set('actors', v)}
                  suggestions={actorSuggestions}
                  placeholder="主演名，可多个"
                />
              </div>
            )}
          </div>
        )}

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
            <div className="flex items-center gap-2">
              <span className="shrink-0 text-sm text-soft">看到第</span>
              <input
                className="input w-24 text-center"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                value={form.progressNum}
                onChange={(e) => {
                  const digits = e.target.value.replace(/\D/g, '').replace(/^0+(?=\d)/, '').slice(0, 6)
                  setForm((f) => ({
                    ...f,
                    progressNum: digits,
                    progressLegacy: digits ? '' : f.progressLegacy,
                    // 填了进度说明已经开看；「看过 / 弃了」是用户明确选择，不自动改
                    status: digits && f.status === 'want' ? 'watching' : f.status,
                  }))
                }}
                placeholder="8"
              />
              <span className="shrink-0 text-sm text-soft">{progressUnit(form.category)}</span>
              {form.episode_count && (
                <span className="ml-auto shrink-0 text-xs text-faint">
                  共 {form.episode_count} {progressUnit(form.category)}
                </span>
              )}
            </div>
            {form.progressLegacy && (
              <p className="mt-1 text-xs text-faint">
                原进度「{form.progressLegacy}」不是纯数字，填数字后会替换。
                <button
                  type="button"
                  className="ml-1 text-brand hover:underline"
                  onClick={() => setForm((f) => ({ ...f, progressLegacy: '' }))}
                >
                  清除
                </button>
              </p>
            )}
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
                onLoad={(e) => {
                  ;(e.target as HTMLImageElement).style.opacity = '1'
                }}
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
          <button
            className="btn"
            onClick={() => {
              if (!confirmLeave()) return
              if (location.key === 'default') {
                navigate(editing ? `/items/${itemId}` : '/', { replace: true })
              } else {
                navigate(-1)
              }
            }}
          >
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

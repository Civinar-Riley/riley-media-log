import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Pencil, X } from 'lucide-react'
import { api } from '../api'
import { useAuth } from '../auth'
import { Loading, PageHeader } from '../components/ui'
import { invalidateLibrary } from '../cache'

const FIELDS = [
  { key: 'tags', name: '类型标签', hint: '改名会应用到所有条目；改成已存在的名字即为合并' },
  { key: 'regions', name: '地区', hint: '同上，适合把「美国 中国香港」这类拆分归一' },
  { key: 'authors', name: '作者', hint: '小说/漫画的作者；外国作者建议统一用中文译名做主名' },
  { key: 'directors', name: '导演', hint: '改名合并全局生效，配合别名功能统一译名' },
  { key: 'actors', name: '主演', hint: '改名合并全局生效，配合别名功能统一译名' },
  { key: 'channel', name: '观看渠道', hint: '单值字段，同样支持改名合并' },
] as const

type FieldKey = (typeof FIELDS)[number]['key']

function FieldPanel({ field }: { field: FieldKey }) {
  const { demo } = useAuth()
  const qc = useQueryClient()
  const valuesQ = useQuery({ queryKey: ['field-values', field], queryFn: () => api.fieldValues(field) })
  const [editing, setEditing] = useState<string | null>(null)
  const [next, setNext] = useState('')
  const [error, setError] = useState('')

  const rename = useMutation({
    mutationFn: (from: string) => api.renameField(field, from, next.trim()),
    onMutate: () => setError(''),
    onSuccess: () => {
      setEditing(null)
      setNext('')
      invalidateLibrary(qc)
    },
    onError: (e) => setError(e instanceof Error ? e.message : '改名失败'),
  })

  if (valuesQ.isLoading) return <Loading />
  if (valuesQ.isError) return <p className="card p-8 text-center text-sm text-faint">字段值加载失败，请刷新重试。</p>
  const values = valuesQ.data ?? []
  if (!values.length) return <p className="card p-8 text-center text-sm text-faint">这个字段还没有任何值。</p>

  return (
    <div>
      {error && <p className="mb-2 text-sm text-danger">{error}</p>}
      <ul className="card divide-y divide-line">
      {values.map(([v, count]) =>
        editing === v ? (
          <li key={v} className="flex flex-wrap items-center gap-2 px-4 py-2.5">
            <span className="text-sm text-ink">{v}</span>
            <span className="text-faint">→</span>
            <input
              className="input h-8 w-56"
              autoFocus
              value={next}
              onChange={(e) => setNext(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && next.trim() && next.trim() !== v && rename.mutate(v)}
              placeholder="新名称（填已有名称即合并）"
            />
            <button
              className="btn btn-primary h-8 px-2.5"
              disabled={!next.trim() || next.trim() === v || rename.isPending}
              onClick={() => rename.mutate(v)}
            >
              <Check className="h-3.5 w-3.5" />
              应用
            </button>
            <button className="btn btn-ghost h-8 px-2.5" onClick={() => setEditing(null)}>
              <X className="h-3.5 w-3.5" />
            </button>
            {next.trim() && next.trim() !== v && (
              <span className="text-xs text-faint">将更新 {count} 个条目</span>
            )}
          </li>
        ) : (
          <li key={v} className="group flex items-center justify-between gap-3 px-4 py-2.5">
            <div className="flex min-w-0 items-baseline gap-2">
              <span className="truncate text-sm text-ink">{v}</span>
              <span className="shrink-0 text-xs text-faint">{count} 条</span>
            </div>
            {!demo && (
              <button
                className="btn btn-ghost h-7 shrink-0 px-2 transition md:pointer-events-none md:opacity-0 md:group-hover:pointer-events-auto md:group-hover:opacity-100 focus-visible:pointer-events-auto focus-visible:opacity-100"
                onClick={() => {
                  setEditing(v)
                  setNext(v)
                }}
              >
                <Pencil className="h-3.5 w-3.5" />
                改名 / 合并
              </button>
            )}
          </li>
        )
      )}
      </ul>
    </div>
  )
}

export default function ManageFieldsPage() {
  const { demo } = useAuth()
  const [tab, setTab] = useState<FieldKey>('tags')
  const current = FIELDS.find((f) => f.key === tab)!

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="字段管理" sub="统一修剪标签体系，防止「科幻 / sci-fi」分家" />

      <div className="mb-3 flex flex-wrap gap-1.5">
        {FIELDS.map((f) => (
          <button key={f.key} className={`chip ${tab === f.key ? 'chip-on' : ''}`} onClick={() => setTab(f.key)}>
            {f.name}
          </button>
        ))}
      </div>
      <p className="mb-4 text-xs text-faint">
        {current.hint}。{demo ? '演示站已禁用改名操作。' : '改名立即生效，片单与统计同步刷新。'}
      </p>

      <FieldPanel key={tab} field={tab} />
    </div>
  )
}

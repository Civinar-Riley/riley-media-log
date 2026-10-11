import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarPlus, Pencil, Plus, Trash2 } from 'lucide-react'
import { api } from '../api'
import { CategoryBadge, CoverImage, FinishBadge, Loading, Modal, PageHeader, RatingStars, StatusBadge } from '../components/ui'
import { BackLink } from '../components/ui'

function fmtDateTime(iso: string): string {
  return iso.slice(0, 16).replace('T', ' ')
}

function todayLocal(): string {
  return new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10)
}

function Meta({ label, value }: { label: string; value?: React.ReactNode }) {
  if (value === undefined || value === null || value === '') return null
  return (
    <div>
      <p className="label">{label}</p>
      <p className="mt-0.5 text-sm text-ink">{value}</p>
    </div>
  )
}

/** 人名行：label + 可点击的筛选 chips */
function PeopleRow({ label, people, param, modeParam }: { label: string; people: string[]; param: string; modeParam: string }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="label mr-1">{label}</span>
      {people.map((p) => (
        <Link key={p} to={`/?${param}=${encodeURIComponent(p)}&${modeParam}=any`} className="chip">
          {p}
        </Link>
      ))}
    </div>
  )
}

export default function ItemDetailPage() {
  const { id } = useParams()
  const itemId = Number(id)
  const navigate = useNavigate()
  const qc = useQueryClient()

  const itemQ = useQuery({ queryKey: ['item', itemId], queryFn: () => api.getItem(itemId) })
  const listsQ = useQuery({ queryKey: ['lists'], queryFn: api.lists })

  const [viewDate, setViewDate] = useState(todayLocal())
  const [viewComment, setViewComment] = useState('')
  const [pickerOpen, setPickerOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['item', itemId] })
    qc.invalidateQueries({ queryKey: ['items'] })
    qc.invalidateQueries({ queryKey: ['stats'] })
    qc.invalidateQueries({ queryKey: ['status-counts'] })
  }

  const addViewing = useMutation({
    mutationFn: () => api.addViewing(itemId, { watched_on: viewDate, comment: viewComment.trim() }),
    onSuccess: () => {
      setViewComment('')
      invalidate()
    },
  })
  const delViewing = useMutation({
    mutationFn: (vid: number) => api.deleteViewing(itemId, vid),
    onSuccess: invalidate,
  })
  const delItem = useMutation({
    mutationFn: () => api.deleteItem(itemId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['items'] })
      navigate('/', { replace: true })
    },
  })
  const toggleList = useMutation({
    mutationFn: async ({ listId, has }: { listId: number; has: boolean }) => {
      if (has) return api.removeListItem(listId, itemId)
      return api.addListItems(listId, [itemId])
    },
    onSuccess: () => {
      invalidate()
      qc.invalidateQueries({ queryKey: ['lists'] })
    },
  })

  if (itemQ.isLoading) return <Loading />
  const item = itemQ.data
  if (!item) return <p className="py-16 text-center text-faint">条目不存在，可能已被删除。</p>

  const inLists = new Set(item.lists.map((l) => l.id))

  return (
    <div>
      <div className="mb-3">
        <BackLink fallback="/" label="返回片单" />
      </div>
      <PageHeader
        title="条目详情"
        right={
          <>
            <button className="btn" onClick={() => navigate(`/items/${itemId}/edit`)}>
              <Pencil className="h-4 w-4" />
              编辑
            </button>
            <button className="btn" onClick={() => setPickerOpen(true)}>
              <Plus className="h-4 w-4" />
              加入清单
            </button>
            <button className="btn btn-danger" onClick={() => setConfirmDelete(true)}>
              <Trash2 className="h-4 w-4" />
              删除
            </button>
          </>
        }
      />

      <div className="grid gap-6 md:grid-cols-[220px_1fr]">
        {/* 左：封面 */}
        <div className="anim mx-auto w-44 md:mx-0 md:w-full">
          <div className="card overflow-hidden shadow-md">
            <CoverImage title={item.title} coverUrl={item.cover_url} className="aspect-2/3 w-full" />
          </div>
        </div>

        {/* 右：信息 */}
        <div className="anim space-y-4" style={{ animationDelay: '60ms' }}>
          <div>
            <h2 className="serif text-2xl font-semibold text-ink md:text-3xl">{item.title}</h2>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <CategoryBadge category={item.category} />
              <StatusBadge status={item.status} />
              <FinishBadge status={item.finish_status} />
              <RatingStars value={item.rating} size={16} />
            </div>
          </div>

          <div className="card grid grid-cols-2 gap-4 p-4 sm:grid-cols-3">
            <Meta label="年份" value={item.year} />
            <Meta label="季号" value={item.season ? `第 ${item.season} 季` : ''} />
            <Meta label="总集数" value={item.episode_count} />
            <Meta label="地区" value={item.regions.join(' / ')} />
            <Meta label="观看渠道" value={item.channel} />
            <Meta label="进度" value={item.progress} />
            <Meta label="最近观看" value={item.last_watched} />
            <Meta label="记录于" value={fmtDateTime(item.created_at)} />
            <Meta label="更新于" value={fmtDateTime(item.updated_at)} />
          </div>

          {(item.authors.length > 0 || item.directors.length > 0 || item.actors.length > 0 || item.tags.length > 0) && (
            <div className="card space-y-2.5 p-4">
              {item.directors.length > 0 && (
                <PeopleRow label="导演" people={item.directors} param="directors" modeParam="director_mode" />
              )}
              {item.actors.length > 0 && (
                <PeopleRow label="主演" people={item.actors} param="actors" modeParam="actor_mode" />
              )}
              {item.authors.length > 0 && (
                <PeopleRow label="作者" people={item.authors} param="authors" modeParam="author_mode" />
              )}
              {item.tags.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="label mr-1">标签</span>
                  {item.tags.map((t) => (
                    <Link key={t} to={`/?tags=${encodeURIComponent(t)}&tag_mode=any`} className="chip">
                      {t}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )}

          {item.notes && (
            <div className="card p-4">
              <p className="label mb-1.5">备注</p>
              <p className="text-sm whitespace-pre-wrap text-soft">{item.notes}</p>
            </div>
          )}
          {item.review && (
            <div className="card border-l-2 border-l-brand p-4">
              <p className="label mb-1.5">观后感</p>
              <p className="text-sm whitespace-pre-wrap text-ink">{item.review}</p>
            </div>
          )}

          {/* 观看流水 */}
          <div className="card p-4">
            <p className="label mb-3">观看流水（二刷也记在这里）</p>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <input type="date" className="input w-36" value={viewDate} onChange={(e) => setViewDate(e.target.value)} />
              <input
                className="input h-9 flex-1"
                placeholder="这次看的一句话感受（可不填）"
                value={viewComment}
                onChange={(e) => setViewComment(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !addViewing.isPending && addViewing.mutate()}
              />
              <button className="btn btn-primary" disabled={addViewing.isPending} onClick={() => addViewing.mutate()}>
                <CalendarPlus className="h-4 w-4" />
                记一次观看
              </button>
            </div>
            {item.viewings.length ? (
              <ul className="divide-y divide-line">
                {item.viewings.map((v) => (
                  <li key={v.id} className="group flex items-center justify-between gap-3 py-2">
                    <div>
                      <span className="text-sm font-medium text-ink">{v.watched_on}</span>
                      {v.comment && <span className="ml-2 text-sm text-soft">{v.comment}</span>}
                    </div>
                    <button
                      className="btn btn-danger h-7 px-2 opacity-0 transition group-hover:opacity-100"
                      onClick={() => delViewing.mutate(v.id)}
                      title="删除这条观看记录"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-faint">还没有观看记录。</p>
            )}
          </div>

          {item.lists.length > 0 && (
            <div className="card p-4">
              <p className="label mb-2">所在清单</p>
              <div className="flex flex-wrap gap-1.5">
                {item.lists.map((l) => (
                  <Link key={l.id} to={`/lists/${l.id}`} className="chip">
                    {l.name}
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* 动态时间线 */}
          {item.activity.length > 0 && (
            <div className="card p-4">
              <p className="label mb-3">动态</p>
              <ol className="relative space-y-3 border-l border-line pl-4">
                {item.activity.map((a) => (
                  <li key={a.id} className="relative text-sm">
                    <span className="absolute top-1.5 -left-[21px] h-2 w-2 rounded-full bg-brand/70" aria-hidden />
                    <p className="text-soft">{a.detail}</p>
                    <p className="text-xs text-faint">{fmtDateTime(a.created_at)}</p>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      </div>

      {/* 清单选择弹窗 */}
      <Modal open={pickerOpen} title="加入 / 移出清单" onClose={() => setPickerOpen(false)}>
        {listsQ.data && listsQ.data.length > 0 ? (
          <ul className="space-y-1.5">
            {listsQ.data.map((l) => {
              const has = inLists.has(l.id)
              return (
                <li key={l.id}>
                  <button
                    className={`flex w-full items-center justify-between rounded-md border px-3 py-2 text-sm transition ${
                      has ? 'border-brand bg-brand-soft text-ink' : 'border-line text-soft hover:border-brand/50'
                    }`}
                    disabled={toggleList.isPending}
                    onClick={() => toggleList.mutate({ listId: l.id, has })}
                  >
                    <span>{l.name}</span>
                    <span className="text-xs text-faint">{has ? '已在清单，点击移出' : '点击加入'}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="text-sm text-faint">
            还没有清单，先去 <Link to="/lists" className="text-brand underline">清单</Link> 页新建一个。
          </p>
        )}
      </Modal>

      {/* 删除确认 */}
      <Modal open={confirmDelete} title="删除条目" onClose={() => setConfirmDelete(false)}>
        <p className="text-sm text-soft">
          确定删除《{item.title}》吗？观看流水和动态会一并删除，此操作不可撤销。
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <button className="btn" onClick={() => setConfirmDelete(false)}>
            再想想
          </button>
          <button className="btn border-danger bg-danger text-white hover:opacity-90" onClick={() => delItem.mutate()}>
            确认删除
          </button>
        </div>
      </Modal>
    </div>
  )
}

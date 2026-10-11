import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Dices } from 'lucide-react'
import { api, ApiError } from '../api'
import { useCategories } from '../cat'
import { CategoryBadge, CoverImage, EmptyState, Loading, RatingStars, StatusBadge } from '../components/ui'

export default function RandomPage() {
  const qc = useQueryClient()
  const { labelOf } = useCategories()
  const [scope, setScope] = useState<'want' | 'all'>('want')
  const [seed, setSeed] = useState(0)

  const q = useQuery({
    queryKey: ['random', scope, seed],
    queryFn: () => api.random(scope === 'want' ? { status: ['want'] } : {}),
    retry: false,
  })

  const markDone = useMutation({
    mutationFn: (id: number) => api.updateItem(id, { status: 'done' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['items'] })
      qc.invalidateQueries({ queryKey: ['stats'] })
      qc.invalidateQueries({ queryKey: ['status-counts'] })
      setSeed((s) => s + 1) // 顺手摇下一个
    },
  })

  const item = q.data
  const notFound = q.error instanceof ApiError && q.error.status === 404

  return (
    <div className="mx-auto max-w-xl">
      <div className="mb-6 text-center">
        <h1 className="serif text-3xl font-semibold tracking-wide text-ink">今晚看什么？</h1>
        <p className="mt-2 text-sm text-faint">从下面的范围里随机摇一个，治好选择困难症</p>
        <div className="mt-3 inline-flex gap-1.5">
          <button className={`chip ${scope === 'want' ? 'chip-on' : ''}`} onClick={() => { setScope('want'); setSeed((s) => s + 1) }}>
            只摇想看
          </button>
          <button className={`chip ${scope === 'all' ? 'chip-on' : ''}`} onClick={() => { setScope('all'); setSeed((s) => s + 1) }}>
            全部条目
          </button>
        </div>
      </div>

      {q.isLoading ? (
        <Loading label="摇动骰子中…" />
      ) : notFound ? (
        <EmptyState
          title={scope === 'want' ? '想看清单空了' : '一条记录都没有'}
          hint={scope === 'want' ? '把想看的都看完啦？去补点货吧。' : '先去记几笔再说。'}
          action={
            <Link to="/new" className="btn btn-primary">
              记一笔
            </Link>
          }
        />
      ) : item ? (
        <div className="card anim-pop mx-auto max-w-sm overflow-hidden shadow-xl">
          <div className="relative aspect-2/3 bg-muted">
            <CoverImage title={item.title} coverUrl={item.cover_url} className="h-full w-full" />
            <div className="absolute top-2 left-2">
              <CategoryBadge category={item.category} />
            </div>
            <div className="absolute bottom-2 left-2">
              <StatusBadge status={item.status} />
            </div>
          </div>
          <div className="space-y-3 p-5 text-center">
            <h2 className="serif text-2xl font-semibold text-ink">{item.title}</h2>
            <p className="text-sm text-faint">
              {[
                item.year,
                labelOf(item.category),
                item.regions.join(' / '),
                item.tags.join(' / '),
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
            {item.rating ? (
              <div className="flex justify-center">
                <RatingStars value={item.rating} />
              </div>
            ) : null}
            {item.review && <p className="text-sm text-soft">{item.review}</p>}
            <div className="flex flex-wrap justify-center gap-2 pt-2">
              <button className="btn btn-primary" onClick={() => setSeed((s) => s + 1)}>
                <Dices className="h-4 w-4" />
                再摇一个
              </button>
              <Link to={`/items/${item.id}`} className="btn">
                查看详情
              </Link>
              {item.status === 'want' && (
                <button className="btn" disabled={markDone.isPending} onClick={() => markDone.mutate(item.id)}>
                  <Check className="h-4 w-4" />
                  看完了
                </button>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

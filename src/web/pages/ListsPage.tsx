import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronRight, Plus } from 'lucide-react'
import { api } from '../api'
import { EmptyState, Loading, PageHeader } from '../components/ui'

export default function ListsPage() {
  const qc = useQueryClient()
  const listsQ = useQuery({ queryKey: ['lists'], queryFn: api.lists })
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')

  const create = useMutation({
    mutationFn: () => api.createList({ name: name.trim(), description: description.trim() }),
    onSuccess: () => {
      setName('')
      setDescription('')
      qc.invalidateQueries({ queryKey: ['lists'] })
    },
  })

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (name.trim()) create.mutate()
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="清单" sub="把条目组成一张张主题单子：春节档、周星驰补完、借出去的书……" />

      <form onSubmit={onSubmit} className="card anim mb-4 flex flex-wrap items-end gap-3 p-4">
        <div className="min-w-40 flex-1">
          <label className="label mb-1.5 block">新清单名</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="如 2026 春节档" />
        </div>
        <div className="min-w-40 flex-[2]">
          <label className="label mb-1.5 block">说明（可选）</label>
          <input className="input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="这张单子想干嘛" />
        </div>
        <button type="submit" className="btn btn-primary" disabled={!name.trim() || create.isPending}>
          <Plus className="h-4 w-4" />
          新建
        </button>
      </form>

      {listsQ.isLoading ? (
        <Loading />
      ) : listsQ.data && listsQ.data.length > 0 ? (
        <ul className="space-y-2.5">
          {listsQ.data.map((l, i) => (
            <li key={l.id} className="anim" style={{ animationDelay: `${i * 40}ms` }}>
              <Link
                to={`/lists/${l.id}`}
                className="card flex items-center justify-between gap-3 px-4 py-3.5 transition hover:border-brand/50"
              >
                <div className="min-w-0">
                  <p className="serif font-medium text-ink">{l.name}</p>
                  {l.description && <p className="truncate text-xs text-faint">{l.description}</p>}
                </div>
                <div className="flex shrink-0 items-center gap-2 text-sm text-faint">
                  <span>{l.item_count ?? 0} 条</span>
                  <ChevronRight className="h-4 w-4" />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState title="还没有清单" hint="建一张单子，把想一起看的、想推荐朋友的归到一起。" />
      )}
    </div>
  )
}

import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, X } from 'lucide-react'
import { api } from '../api'
import type { Item } from '../../shared/types'
import { EmptyState, Loading, Modal } from '../components/ui'
import { ItemCard } from '../components/ItemCard'

/** 从库内搜索并勾选条目加入清单 */
function ItemPicker({
  listId,
  existingIds,
  open,
  onClose,
}: {
  listId: number
  existingIds: Set<number>
  open: boolean
  onClose: () => void
}) {
  const qc = useQueryClient()
  const [q, setQ] = useState('')
  const [picked, setPicked] = useState<number[]>([])

  const searchQ = useQuery({
    queryKey: ['picker-search', q],
    queryFn: () => api.listItems({ q: q || undefined }, 1, 20),
    enabled: open,
    placeholderData: (prev) => prev,
  })

  const add = useMutation({
    mutationFn: () => api.addListItems(listId, picked),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['list', listId] })
      qc.invalidateQueries({ queryKey: ['lists'] })
      setPicked([])
      setQ('')
      onClose()
    },
  })

  function toggle(id: number) {
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))
  }

  return (
    <Modal open={open} title="从片单里挑条目加入" onClose={onClose} wide>
      <input
        className="input mb-3"
        autoFocus
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="搜索标题或拼音…"
      />
      <div className="max-h-80 space-y-1.5 overflow-y-auto">
        {searchQ.data?.items.map((it: Item) => {
          const already = existingIds.has(it.id)
          const checked = picked.includes(it.id)
          return (
            <button
              key={it.id}
              type="button"
              disabled={already}
              onClick={() => toggle(it.id)}
              className={`flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-sm transition ${
                already
                  ? 'border-line text-faint opacity-60'
                  : checked
                    ? 'border-brand bg-brand-soft text-ink'
                    : 'border-line text-soft hover:border-brand/50'
              }`}
            >
              <span className="min-w-0 truncate">
                {it.title}
                <span className="ml-2 text-xs text-faint">
                  {[it.year, it.category].filter(Boolean).join(' · ')}
                </span>
              </span>
              <span className="text-xs">{already ? '已在清单' : checked ? '✓ 已选' : ''}</span>
            </button>
          )
        })}
        {searchQ.data && searchQ.data.items.length === 0 && (
          <p className="py-6 text-center text-sm text-faint">没搜到，换个词试试</p>
        )}
      </div>
      <div className="mt-4 flex justify-end gap-2 border-t border-line pt-3">
        <span className="mr-auto self-center text-xs text-faint">已选 {picked.length} 个</span>
        <button className="btn" onClick={onClose}>
          取消
        </button>
        <button className="btn btn-primary" disabled={!picked.length || add.isPending} onClick={() => add.mutate()}>
          <Plus className="h-4 w-4" />
          加入清单
        </button>
      </div>
    </Modal>
  )
}

export default function ListDetailPage() {
  const { id } = useParams()
  const listId = Number(id)
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [pickerOpen, setPickerOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const listQ = useQuery({ queryKey: ['list', listId], queryFn: () => api.getList(listId) })

  const removeItem = useMutation({
    mutationFn: (itemId: number) => api.removeListItem(listId, itemId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['list', listId] })
      qc.invalidateQueries({ queryKey: ['lists'] })
    },
  })
  const deleteList = useMutation({
    mutationFn: () => api.deleteList(listId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['lists'] })
      navigate('/lists')
    },
  })

  if (listQ.isLoading) return <Loading />
  const list = listQ.data
  if (!list) return <p className="py-16 text-center text-faint">清单不存在。</p>

  const existingIds = new Set(list.items.map((it) => it.id))

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-x-3 gap-y-2">
        <div className="min-w-0">
          <Link to="/lists" className="text-xs text-faint hover:text-brand">
            ← 全部清单
          </Link>
          <h1 className="serif mt-1 text-2xl font-semibold break-words text-ink md:text-3xl">{list.name}</h1>
          {list.description && <p className="mt-1 text-sm break-words text-faint">{list.description}</p>}
        </div>
        <div className="ml-auto flex flex-wrap justify-end gap-2">
          <button className="btn btn-primary" onClick={() => setPickerOpen(true)}>
            <Plus className="h-4 w-4" />
            添加条目
          </button>
          <button className="btn btn-danger" onClick={() => setConfirmDelete(true)}>
            <Trash2 className="h-4 w-4" />
            删清单
          </button>
        </div>
      </div>

      {list.items.length ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {list.items.map((it, i) => (
            <div key={it.id} className="group relative">
              <ItemCard item={it} index={i} />
              <button
                className="absolute top-1.5 right-1.5 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white transition md:pointer-events-none md:opacity-0 md:group-hover:pointer-events-auto md:group-hover:opacity-100"
                title="从清单移出（不删除条目）"
                onClick={() => removeItem.mutate(it.id)}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState
          title="清单还是空的"
          hint="点右上角「添加条目」，从片单里挑着加进来。"
          action={
            <button className="btn btn-primary" onClick={() => setPickerOpen(true)}>
              <Plus className="h-4 w-4" />
              添加条目
            </button>
          }
        />
      )}

      <ItemPicker listId={listId} existingIds={existingIds} open={pickerOpen} onClose={() => setPickerOpen(false)} />

      <Modal open={confirmDelete} title="删除清单" onClose={() => setConfirmDelete(false)}>
        <p className="text-sm text-soft">
          删除清单「{list.name}」？清单里的条目本身不会被删除，只是移出这张单子。
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <button className="btn" onClick={() => setConfirmDelete(false)}>
            再想想
          </button>
          <button className="btn border-danger bg-danger text-white hover:opacity-90" onClick={() => deleteList.mutate()}>
            确认删除
          </button>
        </div>
      </Modal>
    </div>
  )
}

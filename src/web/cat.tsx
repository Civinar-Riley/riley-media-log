import { createContext, useContext } from 'react'
import type { ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from './api'
import { DEFAULT_CATEGORIES } from '../shared/types'
import type { CategoryDef } from '../shared/types'

interface CatCtx {
  ready: boolean
  error: boolean
  reload: () => void
  /** 未隐藏的类别（页签、表单用） */
  visible: CategoryDef[]
  /** 全部类别（管理页用，含隐藏） */
  all: CategoryDef[]
  labelOf: (id: string) => string
  finishOf: (id: string) => boolean
  authorOf: (id: string) => boolean
  directorOf: (id: string) => boolean
  actorOf: (id: string) => boolean
}

const Ctx = createContext<CatCtx | null>(null)

export function CategoriesProvider({ children }: { children: ReactNode }) {
  const q = useQuery({ queryKey: ['settings'], queryFn: api.getSettings, staleTime: 5 * 60_000 })
  const all = q.data?.categories ?? DEFAULT_CATEGORIES
  const labelMap = new Map(all.map((c) => [c.id, c.label]))

  const value: CatCtx = {
    ready: q.isSuccess,
    error: q.isError,
    reload: () => {
      void q.refetch()
    },
    visible: all.filter((c) => !c.hidden),
    all,
    labelOf: (id) => labelMap.get(id) ?? id,
    finishOf: (id) => Boolean(all.find((c) => c.id === id)?.finish),
    authorOf: (id) => Boolean(all.find((c) => c.id === id)?.author),
    directorOf: (id) => Boolean(all.find((c) => c.id === id)?.director),
    actorOf: (id) => Boolean(all.find((c) => c.id === id)?.actor),
  }

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useCategories(): CatCtx {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useCategories 必须在 CategoriesProvider 内使用')
  return ctx
}

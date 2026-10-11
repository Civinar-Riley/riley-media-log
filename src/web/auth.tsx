import { createContext, useContext } from 'react'
import type { ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './api'

interface AuthCtx {
  loading: boolean
  authed: boolean
  hasApiToken: boolean
  login: (password: string) => Promise<void>
  logout: () => Promise<void>
}

const Ctx = createContext<AuthCtx | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: ['auth-status'],
    queryFn: api.status,
    staleTime: 60_000,
    retry: false,
  })

  const value: AuthCtx = {
    loading: isLoading,
    authed: data?.authenticated ?? false,
    hasApiToken: data?.has_api_token ?? false,
    login: async (password) => {
      await api.login(password)
      await qc.invalidateQueries({ queryKey: ['auth-status'] })
    },
    logout: async () => {
      await api.logout()
      qc.clear()
      await qc.invalidateQueries({ queryKey: ['auth-status'] })
    },
  }

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAuth(): AuthCtx {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useAuth 必须在 AuthProvider 内使用')
  return ctx
}

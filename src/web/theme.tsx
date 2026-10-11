import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'

export type ThemeId = 'dawn' | 'night' | 'paper' | 'celadon'

export const THEMES: { id: ThemeId; name: string; hint: string; swatch: string[] }[] = [
  { id: 'dawn', name: '晨白', hint: '宣纸晨光', swatch: ['#f4f1e8', '#56684f', '#b5502f'] },
  { id: 'night', name: '夜幕', hint: '灯下夜读', swatch: ['#141518', '#c2a878', '#d07a52'] },
  { id: 'paper', name: '纸页', hint: '泛黄书卷', swatch: ['#ece3d0', '#8a5a33', '#a83b2a'] },
  { id: 'celadon', name: '青瓷', hint: '瓷青淡雅', swatch: ['#e6eee8', '#39685a', '#b05038'] },
]

interface ThemeCtx {
  theme: ThemeId
  followSystem: boolean
  setTheme: (t: ThemeId) => void
  setFollowSystem: (v: boolean) => void
}

const Ctx = createContext<ThemeCtx | null>(null)

function effective(): ThemeId {
  const saved = localStorage.getItem('rml-theme') as ThemeId | null
  if (saved && THEMES.some((t) => t.id === saved)) return saved
  return 'dawn'
}

function applyTheme(theme: ThemeId) {
  document.documentElement.dataset.theme = theme
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeId>(effective)
  const [followSystem, setFollowSystemState] = useState(
    () => localStorage.getItem('rml-theme-system') === '1'
  )

  useEffect(() => {
    if (!followSystem) {
      applyTheme(theme)
      return
    }
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const sync = () => applyTheme(mq.matches ? 'night' : 'dawn')
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [theme, followSystem])

  const value: ThemeCtx = {
    theme,
    followSystem,
    setTheme: (t) => {
      localStorage.setItem('rml-theme', t)
      setFollowSystemState(false)
      localStorage.setItem('rml-theme-system', '0')
      setThemeState(t)
      applyTheme(t)
    },
    setFollowSystem: (v) => {
      localStorage.setItem('rml-theme-system', v ? '1' : '0')
      setFollowSystemState(v)
    },
  }

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useTheme(): ThemeCtx {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useTheme 必须在 ThemeProvider 内使用')
  return ctx
}

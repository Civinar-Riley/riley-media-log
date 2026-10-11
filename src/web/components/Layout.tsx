import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { BarChart3, Dices, LibraryBig, ListChecks, LogOut, Palette, Plus, Settings2, SlidersHorizontal } from 'lucide-react'
import { useAuth } from '../auth'
import { THEMES, useTheme } from '../theme'

const NAV = [
  { to: '/', label: '片单', icon: LibraryBig },
  { to: '/stats', label: '统计', icon: BarChart3 },
  { to: '/random', label: '摇一摇', icon: Dices, center: true },
  { to: '/lists', label: '清单', icon: ListChecks },
  { to: '/settings', label: '设置', icon: Settings2 },
]

function Brand({ vertical = false }: { vertical?: boolean }) {
  return (
    <div className={vertical ? 'flex flex-col items-center gap-2' : 'flex items-center gap-2'}>
      {vertical ? (
        <span className="serif text-3xl font-semibold tracking-[0.35em] text-ink [writing-mode:vertical-rl]">
          书影集
        </span>
      ) : (
        <span className="serif text-xl font-semibold tracking-[0.25em] text-ink">书影集</span>
      )}
      <span className="h-2 w-2 rounded-[2px] bg-seal" aria-hidden />
    </div>
  )
}

function ThemeQuickToggle() {
  const { theme, setTheme } = useTheme()
  const idx = THEMES.findIndex((t) => t.id === theme)
  const next = THEMES[(idx + 1) % THEMES.length]
  return (
    <button
      className="btn-ghost btn w-full justify-start"
      title={`切换主题：${next.name}（${next.hint}）`}
      onClick={() => setTheme(next.id)}
    >
      <Palette className="h-4 w-4" />
      <span className="text-sm">主题 · {THEMES[idx]?.name}</span>
    </button>
  )
}

export default function Layout() {
  const { logout } = useAuth()
  const navigate = useNavigate()

  return (
    <div className="min-h-dvh">
      {/* 桌面侧边栏 */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-52 flex-col justify-between border-r border-line bg-card/60 px-4 py-6 backdrop-blur md:flex">
        <div className="flex flex-col items-center gap-8">
          <Brand vertical />
          <nav className="flex flex-col gap-1">
            {NAV.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/'}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-md px-3 py-2 text-sm transition ${
                    isActive
                      ? 'bg-brand text-brand-ink'
                      : 'text-soft hover:bg-muted hover:text-ink'
                  }`
                }
              >
                <Icon className="h-4 w-4" />
                {label}
              </NavLink>
            ))}
            <NavLink
              to="/manage"
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-md px-3 py-2 text-sm transition ${
                  isActive ? 'bg-brand text-brand-ink' : 'text-soft hover:bg-muted hover:text-ink'
                }`
              }
            >
              <SlidersHorizontal className="h-4 w-4" />
              字段管理
            </NavLink>
          </nav>
        </div>
        <div className="flex flex-col gap-1">
          <ThemeQuickToggle />
          <button
            className="btn-ghost btn w-full justify-start"
            onClick={async () => {
              await logout()
              navigate('/login')
            }}
          >
            <LogOut className="h-4 w-4" />
            <span className="text-sm">退出登录</span>
          </button>
        </div>
      </aside>

      {/* 移动端顶栏 */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-card/85 px-4 py-3 backdrop-blur md:hidden">
        <Brand />
        <button className="btn btn-primary h-8 px-3" onClick={() => navigate('/new')}>
          <Plus className="h-4 w-4" />
          记一笔
        </button>
      </header>

      <main className="pb-24 md:pb-10 md:pl-52">
        <div className="mx-auto max-w-6xl px-4 py-5 md:px-8 md:py-8">
          <Outlet />
        </div>
      </main>

      {/* 移动端底部导航（摇一摇居中凸起） */}
      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-line bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        {[NAV[0], NAV[1]].map(({ to, label, icon: Icon }) => (
          <TabLink key={to} to={to} label={label} icon={Icon} />
        ))}
        <NavLink
          to="/random"
          className={({ isActive }) =>
            `relative -mt-5 flex flex-col items-center justify-start gap-0.5 pt-1 text-[11px] ${
              isActive ? 'text-brand' : 'text-faint'
            }`
          }
        >
          <span className="flex h-12 w-12 items-center justify-center rounded-full border border-line bg-brand text-brand-ink shadow-lg">
            <Dices className="h-5 w-5" />
          </span>
          摇一摇
        </NavLink>
        {[NAV[3], NAV[4]].map(({ to, label, icon: Icon }) => (
          <TabLink key={to} to={to} label={label} icon={Icon} />
        ))}
      </nav>
    </div>
  )
}

function TabLink({
  to,
  label,
  icon: Icon,
}: {
  to: string
  label: string
  icon: typeof LibraryBig
}) {
  return (
    <NavLink
      to={to}
      end={to === '/'}
      className={({ isActive }) =>
        `flex flex-col items-center gap-0.5 py-2.5 text-[11px] ${
          isActive ? 'text-brand' : 'text-faint'
        }`
      }
    >
      <Icon className="h-5 w-5" />
      {label}
    </NavLink>
  )
}

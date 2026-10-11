import { useNavigate } from 'react-router-dom'
import { Download, FileJson, LogOut } from 'lucide-react'
import { useAuth } from '../auth'
import { THEMES, useTheme } from '../theme'
import { PageHeader } from '../components/ui'

export default function SettingsPage() {
  const { theme, followSystem, setTheme, setFollowSystem } = useTheme()
  const { logout, hasApiToken } = useAuth()
  const navigate = useNavigate()

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader title="设置" />

      {/* 主题 */}
      <section className="card p-5">
        <h2 className="serif mb-1 font-medium text-ink">主题</h2>
        <p className="mb-4 text-xs text-faint">四套整体配色，各有各的气氛</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {THEMES.map((t) => (
            <button
              key={t.id}
              onClick={() => setTheme(t.id)}
              className={`card p-3 text-left transition ${
                theme === t.id && !followSystem ? 'border-brand ring-2 ring-brand/30' : 'hover:border-brand/50'
              }`}
            >
              <div className="mb-2 flex h-8 overflow-hidden rounded-md border border-line">
                {t.swatch.map((c) => (
                  <span key={c} className="flex-1" style={{ backgroundColor: c }} />
                ))}
              </div>
              <p className="serif text-sm font-medium text-ink">{t.name}</p>
              <p className="text-xs text-faint">{t.hint}</p>
            </button>
          ))}
        </div>
        <label className="mt-4 flex cursor-pointer items-center gap-2 text-sm text-soft">
          <input
            type="checkbox"
            className="h-4 w-4 accent-[var(--brand)]"
            checked={followSystem}
            onChange={(e) => setFollowSystem(e.target.checked)}
          />
          跟随系统昼夜自动切换（白天晨白，晚上夜幕）
        </label>
      </section>

      {/* 导出 */}
      <section className="card p-5">
        <h2 className="serif mb-1 font-medium text-ink">导出备份</h2>
        <p className="mb-4 text-xs text-faint">CSV 用 Excel 直接打开；JSON 是完整备份（含所有字段）。片单页的导出按钮只导当前筛选结果。</p>
        <div className="flex gap-2">
          <a className="btn" href="/api/export.csv">
            <Download className="h-4 w-4" />
            全部条目 CSV
          </a>
          <a className="btn" href="/api/export.json">
            <FileJson className="h-4 w-4" />
            全部条目 JSON
          </a>
        </div>
      </section>

      {/* API */}
      <section className="card p-5">
        <h2 className="serif mb-1 font-medium text-ink">开放 API</h2>
        {hasApiToken ? (
          <>
            <p className="mb-3 text-xs text-faint">
              服务端已配置 API_TOKEN。用 Bearer 令牌即可在脚本里读写数据，例如：
            </p>
            <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs leading-relaxed text-soft">
              {`curl -H "Authorization: Bearer <你的API_TOKEN>" \\\n  https://<你的域名>/api/items?page_size=5`}
            </pre>
          </>
        ) : (
          <p className="text-sm text-faint">
            尚未配置 API_TOKEN。部署时执行 <code className="rounded bg-muted px-1">wrangler secret put API_TOKEN</code>{' '}
            即可开启，用脚本批量读写数据时很方便。
          </p>
        )}
      </section>

      {/* 关于 */}
      <section className="card p-5">
        <h2 className="serif mb-2 font-medium text-ink">关于</h2>
        <p className="text-sm text-soft">书影集 · 个人的书影音记录工具（v0.1.0）</p>
        <p className="mt-1 text-xs text-faint">
          数据存在你自己的 Cloudflare D1 里；源码遵循 MIT 协议：
          <a
            className="ml-1 text-brand hover:underline"
            href="https://github.com/Civinar-Riley/riley-media-log"
            target="_blank"
            rel="noreferrer"
          >
            Civinar-Riley/riley-media-log
          </a>
        </p>
      </section>

      <section className="card p-5">
        <button
          className="btn btn-danger"
          onClick={async () => {
            await logout()
            navigate('/login')
          }}
        >
          <LogOut className="h-4 w-4" />
          退出登录
        </button>
      </section>
    </div>
  )
}

import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowDown, ArrowUp, Download, Eye, EyeOff, FileJson, LogOut, Plus, X } from 'lucide-react'
import { api } from '../api'
import { useAuth } from '../auth'
import { useCategories } from '../cat'
import { THEMES, useTheme } from '../theme'
import type { CategoryDef } from '../../shared/types'
import { PageHeader } from '../components/ui'

/** 类别管理：改名 / 排序 / 隐藏 / 新增 / 删除（有条目的类别不可删） */
function CategoryManager() {
  const { all } = useCategories()
  const qc = useQueryClient()
  const facetsQ = useQuery({ queryKey: ['facets'], queryFn: api.facets, staleTime: 5 * 60_000 })
  const counts = useMemo(
    () => new Map((facetsQ.data?.categories ?? []).map(([k, n]) => [k, n])),
    [facetsQ.data]
  )
  const [draft, setDraft] = useState<CategoryDef[] | null>(null)
  const [newLabel, setNewLabel] = useState('')
  const [error, setError] = useState('')
  const cats = draft ?? all

  const save = useMutation({
    mutationFn: () => api.saveCategories(cats),
    onSuccess: () => {
      setDraft(null)
      setError('')
      qc.invalidateQueries({ queryKey: ['settings'] })
      qc.invalidateQueries({ queryKey: ['facets'] })
      qc.invalidateQueries({ queryKey: ['stats'] })
    },
    onError: (e) => setError(e instanceof Error ? e.message : '保存失败'),
  })

  function move(i: number, dir: -1 | 1) {
    const list = [...cats]
    const j = i + dir
    if (j < 0 || j >= list.length) return
    ;[list[i], list[j]] = [list[j], list[i]]
    setDraft(list)
  }

  function patchAt(i: number, patch: Partial<CategoryDef>) {
    setDraft(cats.map((c, idx) => (idx === i ? { ...c, ...patch } : c)))
  }

  function removeAt(i: number) {
    const target = cats[i]
    if ((counts.get(target.id) ?? 0) > 0) {
      setError(`「${target.label}」下还有条目，只能隐藏不能删除`)
      return
    }
    setDraft(cats.filter((_, idx) => idx !== i))
  }

  function add() {
    const label = newLabel.trim()
    if (!label) return
    setDraft([...cats, { id: 'cat_' + Math.random().toString(36).slice(2, 8), label }])
    setNewLabel('')
  }

  const dirty = draft !== null

  return (
    <section className="card p-5">
      <h2 className="serif mb-1 font-medium text-ink">类别管理</h2>
      <p className="mb-4 text-xs text-faint">
        页签、记录表单、统计都跟着这份定义走。改名不影响已有条目；有条目的类别只能隐藏、不能删除。
      </p>

      <ul className="mb-3 space-y-1.5">
        {cats.map((c, i) => (
          <li key={c.id} className="flex flex-wrap items-center gap-2 rounded-md border border-line px-2.5 py-1.5">
            <div className="flex flex-col">
              <button className="cursor-pointer text-faint hover:text-brand disabled:opacity-30" disabled={i === 0} onClick={() => move(i, -1)} aria-label="上移">
                <ArrowUp className="h-3 w-3" />
              </button>
              <button className="cursor-pointer text-faint hover:text-brand disabled:opacity-30" disabled={i === cats.length - 1} onClick={() => move(i, 1)} aria-label="下移">
                <ArrowDown className="h-3 w-3" />
              </button>
            </div>
            <input
              className="input h-8 w-28"
              value={c.label}
              maxLength={20}
              onChange={(e) => patchAt(i, { label: e.target.value.trim() || c.label })}
              onFocus={() => setDraft(cats)}
            />
            <span className="text-xs text-faint">{counts.get(c.id) ?? 0} 条</span>
            <button
              className={`chip ${c.finish ? 'chip-on' : ''}`}
              title="该类别是否使用「完结状态」字段（连载/完结/烂尾）"
              onClick={() => {
                setDraft(cats)
                patchAt(i, { finish: !c.finish })
              }}
            >
              完结
            </button>
            <button
              className={`chip ${c.author ? 'chip-on' : ''}`}
              title="该类别是否使用「作者」字段"
              onClick={() => {
                setDraft(cats)
                patchAt(i, { author: !c.author })
              }}
            >
              作者
            </button>
            <button
              className={`chip ${c.director ? 'chip-on' : ''}`}
              title="该类别是否使用「导演」字段"
              onClick={() => {
                setDraft(cats)
                patchAt(i, { director: !c.director })
              }}
            >
              导演
            </button>
            <button
              className={`chip ${c.actor ? 'chip-on' : ''}`}
              title="该类别是否使用「主演」字段"
              onClick={() => {
                setDraft(cats)
                patchAt(i, { actor: !c.actor })
              }}
            >
              主演
            </button>
            <button
              className={`chip ${c.hidden ? 'chip-on' : ''}`}
              title={c.hidden ? '已隐藏，点击恢复显示' : '点击隐藏（数据保留）'}
              onClick={() => {
                setDraft(cats)
                patchAt(i, { hidden: !c.hidden })
              }}
            >
              {c.hidden ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
              {c.hidden ? '已隐藏' : '显示中'}
            </button>
            <button
              className="btn btn-danger ml-auto h-7 px-2"
              title={(counts.get(c.id) ?? 0) > 0 ? '还有条目，不能删除' : '删除该类别'}
              onClick={() => {
                setDraft(cats)
                removeAt(i)
              }}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap items-center gap-2">
        <input
          className="input h-8 w-40"
          placeholder="新类别名，如 话剧"
          value={newLabel}
          maxLength={20}
          onChange={(e) => setNewLabel(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
        />
        <button className="btn h-8" onClick={add} disabled={!newLabel.trim()}>
          <Plus className="h-3.5 w-3.5" />
          添加
        </button>
        {dirty && (
          <>
            <span className="ml-auto text-xs text-faint">有未保存的修改</span>
            <button className="btn h-8" onClick={() => { setDraft(null); setError('') }}>
              放弃
            </button>
            <button className="btn btn-primary h-8" disabled={save.isPending} onClick={() => save.mutate()}>
              {save.isPending ? '保存中…' : '保存类别'}
            </button>
          </>
        )}
      </div>
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
    </section>
  )
}

/** 人名别名管理：别名 → 主名，保存条目时自动归一 */
function AliasManager() {
  const qc = useQueryClient()
  const settingsQ = useQuery({ queryKey: ['settings'], queryFn: api.getSettings, staleTime: 5 * 60_000 })
  const facetsQ = useQuery({ queryKey: ['facets'], queryFn: api.facets, staleTime: 5 * 60_000 })
  const aliases = settingsQ.data?.aliases ?? {}
  const [draft, setDraft] = useState<Record<string, string> | null>(null)
  const [variant, setVariant] = useState('')
  const [canonical, setCanonical] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const cur = draft ?? aliases
  const dirty = draft !== null
  const entries = Object.entries(cur).sort((a, b) => a[1].localeCompare(b[1], 'zh') || a[0].localeCompare(b[0], 'zh'))

  const nameSuggestions = useMemo(() => {
    const f = facetsQ.data
    return [...(f?.authors ?? []), ...(f?.directors ?? []), ...(f?.actors ?? [])].map(([v]) => v)
  }, [facetsQ.data])

  const save = useMutation({
    mutationFn: () => api.saveAliases(cur),
    onSuccess: () => {
      setDraft(null)
      setError('')
      qc.invalidateQueries({ queryKey: ['settings'] })
    },
    onError: (e) => setError(e instanceof Error ? e.message : '保存失败'),
  })

  const normalize = useMutation({
    mutationFn: api.normalizePeople,
    onSuccess: (r) => {
      setNotice(`已归一 ${r.updated} 个条目`)
      qc.invalidateQueries({ queryKey: ['items'] })
      qc.invalidateQueries({ queryKey: ['facets'] })
      qc.invalidateQueries({ queryKey: ['stats'] })
    },
    onError: (e) => setError(e instanceof Error ? e.message : '归一失败'),
  })

  function add() {
    const a = variant.trim()
    const c = canonical.trim()
    if (!a || !c) return
    setDraft({ ...cur, [a]: c })
    setVariant('')
    setCanonical('')
    setNotice('')
  }

  return (
    <section className="card p-5">
      <h2 className="serif mb-1 font-medium text-ink">人名别名</h2>
      <p className="mb-4 text-xs text-faint">
        外国导演/主演常有英文原名和中文译名。登记「别名 → 主名」后，填写别名会自动转成主名，筛选统计都算同一个人。建议主名用中文译名。
      </p>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input
          className="input h-8 w-44"
          placeholder="别名，如 Christopher Nolan"
          value={variant}
          onChange={(e) => setVariant(e.target.value)}
        />
        <span className="text-faint">→</span>
        <input
          className="input h-8 w-44"
          list="alias-canonical-names"
          placeholder="主名，如 克里斯托弗·诺兰"
          value={canonical}
          onChange={(e) => setCanonical(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
        />
        <datalist id="alias-canonical-names">
          {nameSuggestions.map((n) => (
            <option key={n} value={n} />
          ))}
        </datalist>
        <button className="btn h-8" onClick={add} disabled={!variant.trim() || !canonical.trim()}>
          <Plus className="h-3.5 w-3.5" />
          登记
        </button>
        <span className="text-xs text-faint">共 {entries.length} 条</span>
      </div>

      {entries.length > 0 && (
        <ul className="mb-3 grid gap-1.5 sm:grid-cols-2">
          {entries.map(([a, c]) => (
            <li key={a} className="flex items-center gap-2 rounded-md border border-line px-2.5 py-1.5 text-sm">
              <span className="truncate text-faint">{a}</span>
              <span className="text-faint">→</span>
              <span className="truncate text-ink">{c}</span>
              <button
                className="btn btn-danger ml-auto h-6 px-1.5"
                aria-label={`删除别名 ${a}`}
                onClick={() => {
                  const next = { ...cur }
                  delete next[a]
                  setDraft(next)
                }}
              >
                <X className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {dirty && (
          <>
            <span className="text-xs text-faint">有未保存的修改</span>
            <button className="btn h-8" onClick={() => { setDraft(null); setError('') }}>
              放弃
            </button>
            <button className="btn btn-primary h-8" disabled={save.isPending} onClick={() => save.mutate()}>
              {save.isPending ? '保存中…' : '保存别名'}
            </button>
          </>
        )}
        <button
          className="btn h-8 sm:ml-auto"
          disabled={!entries.length || normalize.isPending}
          title="把已有条目里的人名按别名表改写为主名"
          onClick={() => normalize.mutate()}
        >
          {normalize.isPending ? '归一中…' : '一键归一历史数据'}
        </button>
      </div>
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
      {notice && <p className="mt-2 text-sm text-brand">{notice}</p>}
    </section>
  )
}

/** 登录密码修改：应用内密码存 D1 哈希，Cloudflare 应急密钥保留为恢复通道 */
function PasswordChanger() {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')

  const change = useMutation({
    mutationFn: () => api.changePassword(current, next),
    onSuccess: () => {
      setOk('密码已更新。Cloudflare 后台的应急密钥（AUTH_PASSWORD）仍可作为找回入口。')
      setError('')
      setCurrent('')
      setNext('')
      setConfirm('')
    },
    onError: (e) => {
      setOk('')
      setError(e instanceof Error ? e.message : '修改失败')
    },
  })

  function submit() {
    setOk('')
    if (next.length < 6) {
      setError('新密码至少 6 位')
      return
    }
    if (next !== confirm) {
      setError('两次输入的新密码不一致')
      return
    }
    setError('')
    change.mutate()
  }

  return (
    <section className="card p-5">
      <h2 className="serif mb-1 font-medium text-ink">登录密码</h2>
      <p className="mb-4 text-xs text-faint">
        修改后立即生效，已登录的设备不受影响。忘记密码时，Cloudflare 后台设置的应急密钥（AUTH_PASSWORD）仍可登录。
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className="label mb-1.5 block">当前密码</label>
          <input
            type="password"
            className="input"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            placeholder="当前密码"
          />
        </div>
        <div>
          <label className="label mb-1.5 block">新密码</label>
          <input
            type="password"
            className="input"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            placeholder="至少 6 位"
          />
        </div>
        <div>
          <label className="label mb-1.5 block">确认新密码</label>
          <input
            type="password"
            className="input"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            placeholder="再输一遍"
          />
        </div>
      </div>
      <div className="mt-4 flex items-center gap-3">
        <button
          className="btn btn-primary"
          disabled={!current || !next || !confirm || change.isPending}
          onClick={submit}
        >
          {change.isPending ? '修改中…' : '修改密码'}
        </button>
        {error && <span className="text-sm text-danger">{error}</span>}
        {ok && <span className="text-sm text-brand">{ok}</span>}
      </div>
    </section>
  )
}

/** 自动补全数据源状态 */
function DataSourceSection() {
  const q = useQuery({ queryKey: ['autofill-status'], queryFn: api.autofillStatus, staleTime: 60_000 })
  const row = (name: string, ok: boolean, desc: ReactNode) => (
    <div className="flex items-start justify-between gap-3 border-b border-line py-2.5 last:border-none">
      <div>
        <p className="text-sm font-medium text-ink">
          {ok ? '✓ ' : ''}
          {name}
        </p>
        <p className="mt-0.5 text-xs text-faint">{desc}</p>
      </div>
      <span className={`shrink-0 text-xs ${ok ? 'text-brand' : 'text-danger'}`}>{ok ? '已就绪' : '未配置'}</span>
    </div>
  )
  return (
    <section className="card p-5">
      <h2 className="serif mb-1 font-medium text-ink">自动补全数据源</h2>
      <p className="mb-4 text-xs text-faint">
        条目详情页的「自动补全」从这里取数据；Key 只存在 Worker 的 secret 里，不会暴露给前端。
      </p>
      {row(
        'TMDB（电影 / 剧集 / 综艺）',
        q.data?.tmdb ?? false,
        <>
          免费申请：<a className="text-brand hover:underline" href="https://www.themoviedb.org/settings/api" target="_blank" rel="noreferrer">
            themoviedb.org/settings/api
          </a>{' '}
          → 创建后执行 <code className="rounded bg-muted px-1">npx wrangler secret put TMDB_API_KEY</code>（本地写入 .dev.vars 同名字段）
        </>,
      )}
      {row(
        'Bangumi（动漫 / 漫画 / 小说）',
        q.data?.bangumi ?? false,
        <>
          公开接口匿名即可用；想提升配额可在{' '}
          <a className="text-brand hover:underline" href="https://next.bgm.tv/demo/access-token" target="_blank" rel="noreferrer">
            next.bgm.tv/demo/access-token
          </a>{' '}
          生成 Token 后执行 <code className="rounded bg-muted px-1">npx wrangler secret put BANGUMI_TOKEN</code>
        </>,
      )}
    </section>
  )
}

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

      {/* 类别管理 */}
      <CategoryManager />

      {/* 人名别名 */}
      <AliasManager />

      {/* 自动补全数据源 */}
      <DataSourceSection />

      {/* 登录密码 */}
      <PasswordChanger />

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

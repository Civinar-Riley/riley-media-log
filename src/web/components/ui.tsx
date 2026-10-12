import { useState } from 'react'
import type { ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ArrowLeft, Star, ImageOff } from 'lucide-react'
import { STATUS_LABELS, FINISH_LABELS } from '../../shared/types'
import type { Status, FinishStatus } from '../../shared/types'
import { useCategories } from '../cat'

/** 返回按钮：从站内点进来的原路返回；直接输入/刷新进来的落到 fallback */
export function BackLink({ fallback = '/', label = '返回' }: { fallback?: string; label?: string }) {
  const navigate = useNavigate()
  const location = useLocation()
  const fromSite = location.key !== 'default'
  return (
    <button
      className="inline-flex cursor-pointer items-center gap-1 text-sm text-faint transition hover:text-brand"
      onClick={() => (fromSite ? navigate(-1) : navigate(fallback, { replace: true }))}
    >
      <ArrowLeft className="h-4 w-4" />
      {label}
    </button>
  )
}

/** 封面图：加载失败或无图时回退到书名首字占位 */
export function CoverImage({
  title,
  coverUrl,
  className = '',
}: {
  title: string
  coverUrl?: string
  className?: string
}) {
  const [failed, setFailed] = useState(false)
  let src = coverUrl
  if (src) {
    // 被墙的图床走 Worker 图片代理，保证国内浏览器能加载
    try {
      const host = new URL(src).hostname
      if (host === 'image.tmdb.org' || host === 'lain.bgm.tv') {
        src = '/api/img?u=' + encodeURIComponent(src)
      }
    } catch {
      /* 非 URL 原样使用 */
    }
  }
  if (src && !failed) {
    return (
      <img
        src={src}
        alt={title}
        loading="lazy"
        onError={() => setFailed(true)}
        className={`object-cover ${className}`}
      />
    )
  }
  return (
    <div
      className={`flex items-center justify-center bg-brand-soft text-brand ${className}`}
      aria-label={title}
    >
      {coverUrl ? (
        <ImageOff className="h-5 w-5 opacity-50" />
      ) : (
        <span className="serif text-3xl opacity-70">{title.trim().charAt(0) || '？'}</span>
      )}
    </div>
  )
}

const STATUS_STYLE: Record<Status, string> = {
  want: 'border-line bg-card text-faint',
  watching: 'border-brand/60 bg-brand-soft text-ink',
  done: 'border-transparent bg-brand text-brand-ink',
  dropped: 'border-transparent bg-muted text-faint line-through',
}

export function StatusBadge({ status }: { status: Status }) {
  return (
    <span
      className={`inline-flex h-5 items-center rounded-full border px-2 text-[11px] leading-none font-medium ${STATUS_STYLE[status]}`}
    >
      {STATUS_LABELS[status]}
    </span>
  )
}

export function CategoryBadge({ category }: { category: string }) {
  const { labelOf } = useCategories()
  return <span className="seal-tag">{labelOf(category)}</span>
}

export function FinishBadge({ status }: { status: FinishStatus | null }) {
  if (!status) return null
  const style =
    status === 'finished'
      ? 'border-brand/40 text-brand'
      : status === 'ongoing'
        ? 'border-line text-soft'
        : 'border-danger/40 text-danger'
  return (
    <span className={`inline-flex h-5 items-center rounded border px-1.5 text-[11px] leading-none ${style}`}>
      {FINISH_LABELS[status]}
    </span>
  )
}

/** 星级：可展示可打分 */
export function RatingStars({
  value,
  onChange,
  size = 14,
}: {
  value: number | null
  onChange?: (v: number | null) => void
  size?: number
}) {
  const [hover, setHover] = useState<number | null>(null)
  const shown = hover ?? value ?? 0
  return (
    <span
      className="inline-flex items-center gap-0.5"
      onMouseLeave={() => setHover(null)}
      title={value ? `${value} 星` : '未评分'}
    >
      {[1, 2, 3, 4, 5].map((n) => {
        const star = (
          <Star
            style={{ width: size, height: size }}
            className={
              n <= shown ? 'fill-brand text-brand' : 'text-line fill-transparent'
            }
          />
        )
        return onChange ? (
          <button
            key={n}
            type="button"
            className="cursor-pointer p-0.5 transition hover:scale-110"
            onMouseEnter={() => setHover(n)}
            onClick={() => onChange(value === n ? null : n)}
            aria-label={`${n} 星`}
          >
            {star}
          </button>
        ) : (
          <span key={n} className="p-0.5">
            {star}
          </span>
        )
      })}
    </span>
  )
}

export function PageHeader({
  title,
  sub,
  right,
}: {
  title: string
  sub?: string
  right?: ReactNode
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-x-3 gap-y-2">
      <div className="min-w-0">
        <h1 className="serif text-2xl font-semibold tracking-wide text-ink md:text-3xl">{title}</h1>
        {sub && <p className="mt-1 text-sm text-faint">{sub}</p>}
      </div>
      {right && <div className="ml-auto flex flex-wrap items-center justify-end gap-2">{right}</div>}
    </div>
  )
}

export function EmptyState({
  title,
  hint,
  action,
}: {
  title: string
  hint?: string
  action?: ReactNode
}) {
  return (
    <div className="card anim flex flex-col items-center gap-3 px-6 py-16 text-center">
      <span className="serif text-4xl text-faint">空</span>
      <p className="font-medium text-ink">{title}</p>
      {hint && <p className="max-w-sm text-sm text-faint">{hint}</p>}
      {action}
    </div>
  )
}

export function Loading({ label = '加载中…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-sm text-faint">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-line border-t-brand" />
      {label}
    </div>
  )
}

export function Pagination({
  page,
  pageSize,
  total,
  onPage,
  onPageSize,
}: {
  page: number
  pageSize: number
  total: number
  onPage: (p: number) => void
  /** 传入后显示「每页 N 条」选择器（10 的倍数） */
  onPageSize?: (n: number) => void
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize))
  // 点省略号弹出跳页输入框：记录被点开的是第几个省略号
  const [jumpAt, setJumpAt] = useState<number | null>(null)
  const [jumpText, setJumpText] = useState('')
  if (total === 0 || (pages <= 1 && !onPageSize)) return null
  const nums: (number | '…')[] = []
  for (let i = 1; i <= pages; i++) {
    if (i === 1 || i === pages || Math.abs(i - page) <= 1) nums.push(i)
    else if (nums[nums.length - 1] !== '…') nums.push('…')
  }
  const sizeOptions = [...new Set([10, 20, 30, 50, 60, 100, pageSize])].sort((a, b) => a - b)
  const closeJump = () => {
    setJumpAt(null)
    setJumpText('')
  }
  const submitJump = () => {
    const n = Number(jumpText.trim())
    if (Number.isFinite(n)) onPage(Math.min(pages, Math.max(1, Math.trunc(n))))
    closeJump()
  }
  return (
    <div className="mt-6 flex flex-wrap items-center justify-center gap-x-3 gap-y-2 text-sm">
      {pages > 1 && (
        <>
          <button className="btn h-8 px-2.5" disabled={page <= 1} onClick={() => onPage(page - 1)}>
            上一页
          </button>
          {nums.map((n, i) =>
            n === '…' ? (
              <span key={`e${i}`} className="relative">
                <button
                  className={`h-8 min-w-8 rounded-md px-1.5 transition ${
                    jumpAt === i ? 'bg-muted text-ink' : 'text-faint hover:bg-muted hover:text-ink'
                  }`}
                  title="跳转到指定页"
                  onClick={() => {
                    setJumpAt(i)
                    setJumpText(String(page))
                  }}
                >
                  …
                </button>
                {jumpAt === i && (
                  <span className="card absolute bottom-full left-1/2 z-20 mb-1.5 flex w-max -translate-x-1/2 items-center gap-1.5 p-1.5 shadow-lg">
                    <input
                      autoFocus
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={pages}
                      className="input h-8 w-20"
                      value={jumpText}
                      onFocus={(e) => e.target.select()}
                      onChange={(e) => setJumpText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.nativeEvent.isComposing || e.keyCode === 229) return
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          submitJump()
                        } else if (e.key === 'Escape') {
                          closeJump()
                        }
                      }}
                      onBlur={() => setTimeout(closeJump, 150)}
                      placeholder="页码"
                    />
                    <button className="btn btn-primary h-8 shrink-0 px-2.5 whitespace-nowrap" onClick={submitJump}>
                      跳转
                    </button>
                  </span>
                )}
              </span>
            ) : (
              <button
                key={n}
                onClick={() => onPage(n)}
                className={`h-8 min-w-8 rounded-md px-2 transition ${
                  n === page ? 'bg-brand text-brand-ink' : 'text-soft hover:bg-muted'
                }`}
              >
                {n}
              </button>
            )
          )}
          <button className="btn h-8 px-2.5" disabled={page >= pages} onClick={() => onPage(page + 1)}>
            下一页
          </button>
        </>
      )}
      <span className="text-xs text-faint">
        共 {total} 条 / {pages} 页
      </span>
      {onPageSize && (
        <label className="flex items-center gap-1 text-xs text-faint">
          每页
          <select
            className="input h-7 w-auto px-1.5 text-xs"
            value={pageSize}
            onChange={(e) => onPageSize(Number(e.target.value))}
          >
            {sizeOptions.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
          条
        </label>
      )}
    </div>
  )
}

export function Modal({
  open,
  title,
  onClose,
  children,
  wide,
}: {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
  wide?: boolean
}) {
  if (!open) return null
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 backdrop-blur-[2px] sm:items-center sm:p-6"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className={`card anim-pop max-h-[88dvh] w-full overflow-y-auto rounded-b-none p-5 sm:rounded-lg ${
          wide ? 'sm:max-w-2xl' : 'sm:max-w-md'
        }`}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="serif text-lg font-semibold">{title}</h3>
          <button className="btn-ghost btn h-8 w-8 px-0" onClick={onClose} aria-label="关闭">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

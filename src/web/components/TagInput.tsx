import { useMemo, useRef, useState } from 'react'

/** 多值输入：chips + 输入 + 预设/历史建议补全 */
export function TagInput({
  values,
  onChange,
  suggestions = [],
  placeholder = '输入后回车添加',
}: {
  values: string[]
  onChange: (v: string[]) => void
  suggestions?: string[]
  placeholder?: string
}) {
  const [text, setText] = useState('')
  const [open, setOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const trimmed = text.trim()
  const canAdd = trimmed !== '' && !values.includes(trimmed)

  const filtered = useMemo(() => {
    const q = text.trim().toLowerCase()
    return suggestions
      .filter((s) => !values.includes(s))
      .filter((s) => (q ? s.toLowerCase().includes(q) : true))
      .slice(0, 12)
  }, [text, values, suggestions])

  function add(v: string) {
    const t = v.trim()
    if (!t || values.includes(t)) return
    onChange([...values, t])
    setText('')
  }

  return (
    <div className="relative">
      <div
        className="input flex h-auto min-h-9 flex-wrap items-center gap-1.5 py-1.5 pr-2"
        onClick={() => inputRef.current?.focus()}
      >
        {values.map((v) => (
          <span
            key={v}
            className="inline-flex h-6 max-w-full min-w-0 items-center gap-1 rounded-full bg-brand-soft px-2 text-xs text-ink"
          >
            <span className="truncate">{v}</span>
            <button
              type="button"
              className="cursor-pointer text-faint hover:text-danger"
              onClick={(e) => {
                e.stopPropagation()
                onChange(values.filter((x) => x !== v))
              }}
              aria-label={`删除 ${v}`}
            >
              ✕
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => {
            // 输入法合成中的回车/逗号交给输入法处理（确认候选），否则会把拼音原文当成标签
            if (e.nativeEvent.isComposing || e.keyCode === 229) return
            if (e.key === 'Enter' || e.key === ',') {
              e.preventDefault()
              add(text)
              setOpen(true)
            } else if (e.key === 'Backspace' && !text && values.length) {
              onChange(values.slice(0, -1))
            }
          }}
          placeholder={values.length ? '' : placeholder}
          className="min-w-24 flex-1 bg-transparent text-sm outline-none placeholder:text-faint"
        />
      </div>
      {open && (canAdd || filtered.length > 0) && (
        <div className="card absolute top-full z-20 mt-1 max-h-48 w-full overflow-y-auto p-1 shadow-lg">
          {/* 始终提供「直接添加输入内容」：与已有值部分匹配时也能加自定义标签，手机端无需回车 */}
          {canAdd && (
            <button
              type="button"
              className="flex w-full items-center gap-1 rounded px-2.5 py-1.5 text-left text-sm text-brand hover:bg-muted"
              onMouseDown={(e) => {
                e.preventDefault()
                add(trimmed)
              }}
            >
              ＋ 添加「<span className="truncate">{trimmed}</span>」
            </button>
          )}
          {filtered.map((s) => (
            <button
              key={s}
              type="button"
              className="flex w-full items-center justify-between rounded px-2.5 py-1.5 text-left text-sm text-soft hover:bg-muted hover:text-ink"
              onMouseDown={(e) => {
                e.preventDefault()
                add(s)
              }}
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

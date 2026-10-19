import { useMemo, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'

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
  const [active, setActive] = useState(0)
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

  const options = useMemo(() => {
    const out: string[] = []
    if (canAdd) out.push(trimmed)
    for (const s of filtered) if (!out.includes(s)) out.push(s)
    return out
  }, [canAdd, trimmed, filtered])
  const activeIndex = Math.min(active, Math.max(0, options.length - 1))

  function add(v: string) {
    const t = v.trim()
    if (!t || values.includes(t)) return
    onChange([...values, t])
    setText('')
    setActive(0)
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    // 输入法合成中的回车/逗号交给输入法处理（确认候选），否则会把拼音原文当成标签
    if (e.nativeEvent.isComposing || e.keyCode === 229) return
    if (e.key === 'ArrowDown') {
      if (options.length) {
        e.preventDefault()
        setOpen(true)
        setActive((i) => Math.min(i + 1, options.length - 1))
      }
      return
    }
    if (e.key === 'ArrowUp') {
      if (options.length) {
        e.preventDefault()
        setActive((i) => Math.max(i - 1, 0))
      }
      return
    }
    if (e.key === 'Escape') {
      setOpen(false)
      return
    }
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      add(open && options[activeIndex] ? options[activeIndex] : text)
      setOpen(true)
    } else if (e.key === 'Backspace' && !text && values.length) {
      onChange(values.slice(0, -1))
    }
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
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          onChange={(e) => {
            setText(e.target.value)
            setActive(0)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={onKeyDown}
          placeholder={values.length ? '' : placeholder}
          className="min-w-24 flex-1 bg-transparent text-sm outline-none placeholder:text-faint"
        />
      </div>
      {open && options.length > 0 && (
        <div
          role="listbox"
          className="card absolute top-full z-20 mt-1 max-h-48 w-full overflow-y-auto p-1 shadow-lg"
        >
          {options.map((opt, i) => (
            <button
              key={`${i}:${opt}`}
              type="button"
              role="option"
              aria-selected={i === activeIndex}
              className={`flex w-full items-center gap-1 rounded px-2.5 py-1.5 text-left text-sm ${
                i === activeIndex ? 'bg-muted text-ink' : i === 0 && canAdd ? 'text-brand' : 'text-soft'
              } hover:bg-muted hover:text-ink`}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => {
                e.preventDefault()
                add(opt)
              }}
            >
              {i === 0 && canAdd ? (
                <>
                  ＋ 添加「<span className="truncate">{opt}</span>」
                </>
              ) : (
                opt
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

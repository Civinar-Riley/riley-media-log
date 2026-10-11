import { useState } from 'react'
import { Sparkles, Undo2 } from 'lucide-react'
import { api } from '../api'
import { AUTOFILL_FIELD_LABELS } from '../../shared/types'
import type { AutofillCandidate, AutofillFieldOption, AutofillSource, Item } from '../../shared/types'
import { Modal } from './ui'

type Step = 'search' | 'fields' | 'done'

function defaultSourceFor(category: string): AutofillSource {
  return category === 'novel' || category === 'manga' || category === 'anime' ? 'bangumi' : 'tmdb'
}

const SOURCE_LABEL: Record<AutofillSource, string> = { tmdb: 'TMDB', bangumi: 'Bangumi' }

export function AutofillDialog({
  item,
  open,
  onClose,
  onApplied,
}: {
  item: Item
  open: boolean
  onClose: () => void
  onApplied: () => void
}) {
  const [step, setStep] = useState<Step>('search')
  const [source, setSource] = useState<AutofillSource>(defaultSourceFor(item.category))
  const [query, setQuery] = useState(item.title)
  const [candidates, setCandidates] = useState<AutofillCandidate[]>([])
  const [picked, setPicked] = useState<AutofillCandidate | null>(null)
  const [options, setOptions] = useState<{ available: AutofillFieldOption[]; filled: AutofillFieldOption[]; displayTitle: string } | null>(null)
  const [checked, setChecked] = useState<Record<string, boolean>>({})
  const [applied, setApplied] = useState<string[] | null>(null)
  const [skipped, setSkipped] = useState<string[]>([])
  const [logId, setLogId] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  function fail(e: unknown) {
    setError(e instanceof Error ? e.message : '请求失败')
    setBusy(false)
  }

  async function doSearch() {
    setBusy(true)
    setError('')
    try {
      const d = await api.autofillPreview({ item_id: item.id, source, query: query || undefined })
      setCandidates(d.candidates)
      setBusy(false)
    } catch (e) {
      return fail(e)
    }
  }

  async function pickCandidate(c: AutofillCandidate) {
    setPicked(c)
    setBusy(true)
    setError('')
    try {
      const d = await api.autofillFields({ item_id: item.id, source, external_id: c.externalId })
      setOptions({ available: d.available, filled: d.filled, displayTitle: d.displayTitle })
      const init: Record<string, boolean> = {}
      for (const f of d.available) init[f.key] = true
      setChecked(init)
      setStep('fields')
      setBusy(false)
    } catch (e) {
      return fail(e)
    }
  }

  async function doApply() {
    if (!picked) return
    setBusy(true)
    setError('')
    try {
      const d = await api.autofillApply({
        item_id: item.id,
        source,
        external_id: picked.externalId,
        fields: Object.keys(checked).filter((k) => checked[k]),
      })
      setApplied(Object.keys(d.applied).map((k) => AUTOFILL_FIELD_LABELS[k] ?? k))
      setSkipped(d.skipped)
      setLogId(d.logId)
      setStep('done')
      onApplied()
      setBusy(false)
    } catch (e) {
      return fail(e)
    }
  }

  async function doUndo() {
    if (logId === null) return
    setBusy(true)
    try {
      await api.autofillUndo(logId)
      setApplied(null)
      setLogId(null)
      onApplied()
      setBusy(false)
    } catch (e) {
      return fail(e)
    }
  }

  return (
    <Modal open={open} title="自动补全" onClose={onClose} wide>
      {/* 数据源切换（切换后回到搜索步） */}
      <div className="mb-3 flex items-center gap-2 text-sm">
        <span className="label">数据源</span>
        {(['tmdb', 'bangumi'] as AutofillSource[]).map((s) => (
          <button
            key={s}
            className={`chip ${source === s ? 'chip-on' : ''}`}
            onClick={() => {
              if (source === s) return
              setSource(s)
              setStep('search')
              setCandidates([])
              setPicked(null)
            }}
          >
            {SOURCE_LABEL[s]}
          </button>
        ))}
        <span className="text-xs text-faint">只填空字段，手填过的不会动</span>
      </div>

      {step === 'search' && (
        <div>
          <div className="mb-3 flex gap-2">
            <input
              className="input"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !busy && doSearch()}
              placeholder={`在 ${SOURCE_LABEL[source]} 搜索`}
            />
            <button className="btn btn-primary shrink-0" disabled={busy || !query.trim()} onClick={doSearch}>
              <Sparkles className="h-4 w-4" />
              搜索
            </button>
          </div>
          {candidates.length > 0 ? (
            <ul className="max-h-96 space-y-1.5 overflow-y-auto">
              {candidates.map((c) => (
                <li key={c.externalId}>
                  <button
                    className="flex w-full items-center gap-3 rounded-md border border-line px-2.5 py-2 text-left transition hover:border-brand/60"
                    onClick={() => pickCandidate(c)}
                  >
                    {c.coverThumb ? (
                      <img src={c.coverThumb} alt="" className="h-16 w-11 shrink-0 rounded object-cover" />
                    ) : (
                      <span className="serif flex h-16 w-11 shrink-0 items-center justify-center rounded bg-muted text-xl text-faint">
                        {c.title.charAt(0)}
                      </span>
                    )}
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-ink">
                        {c.title || '(无中文标题)'}
                        {c.year ? <span className="ml-1 text-xs text-faint">{c.year}</span> : null}
                        {c.rating ? <span className="ml-1.5 text-xs text-brand">★ {c.rating.toFixed(1)}</span> : null}
                      </span>
                      {c.overview && <span className="block truncate text-xs text-faint">{c.overview}</span>}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-4 text-center text-sm text-faint">输入标题后搜索，候选来自 {SOURCE_LABEL[source]}</p>
          )}
        </div>
      )}

      {step === 'fields' && picked && options && (
        <div>
          <p className="mb-3 text-sm text-soft">
            匹配到：<span className="font-medium text-ink">{options.displayTitle || picked.title}</span>
            {picked.year ? <span className="text-faint">（{picked.year}）</span> : null}
          </p>
          <div className="mb-3 space-y-1.5">
            {options.available.map((f) => (
              <label
                key={f.key}
                className="flex cursor-pointer items-center gap-2 rounded-md border border-line px-3 py-2 text-sm hover:border-brand/50"
              >
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-[var(--brand)]"
                  checked={Boolean(checked[f.key])}
                  onChange={(e) => setChecked((prev) => ({ ...prev, [f.key]: e.target.checked }))}
                />
                <span className="text-ink">{f.label}</span>
                <span className="ml-auto max-w-56 truncate text-xs text-faint" title={f.preview}>
                  {f.preview}
                </span>
              </label>
            ))}
            {options.filled.map((f) => (
              <div key={f.key} className="flex items-center gap-2 rounded-md border border-line px-3 py-2 text-sm opacity-55">
                <input type="checkbox" className="h-4 w-4" disabled checked={false} />
                <span className="text-soft">{f.label}</span>
                <span className="ml-auto text-xs text-faint">已有，跳过</span>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-end gap-2 border-t border-line pt-3">
            <button className="btn" onClick={() => setStep('search')}>
              返回重选
            </button>
            <button
              className="btn btn-primary"
              disabled={busy || !Object.values(checked).some(Boolean)}
              onClick={doApply}
            >
              <Sparkles className="h-4 w-4" />
              应用所选
            </button>
          </div>
        </div>
      )}

      {step === 'done' && (
        <div className="text-center">
          <Sparkles className="mx-auto mb-3 h-8 w-8 text-brand" />
          <p className="text-sm text-ink">
            {applied && applied.length > 0 ? (
              <>
                已填入：<span className="font-medium">{applied.join('、')}</span>
              </>
            ) : (
              '没有需要填入的字段。'
            )}
          </p>
          {skipped.length > 0 && <p className="mt-1 text-xs text-faint">跳过：{skipped.join('、')}</p>}
          <div className="mt-5 flex justify-center gap-2">
            {logId !== null && (
              <button className="btn" disabled={busy} onClick={doUndo}>
                <Undo2 className="h-4 w-4" />
                撤回这次补全
              </button>
            )}
            <button className="btn btn-primary" onClick={onClose}>
              完成
            </button>
          </div>
        </div>
      )}

      {error && <p className="mt-3 text-sm text-danger">{error}</p>}
    </Modal>
  )
}

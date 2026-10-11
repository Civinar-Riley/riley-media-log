import { useState } from 'react'
import type { FormEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth'

export default function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!password || busy) return
    setBusy(true)
    setError('')
    try {
      await login(password)
      navigate((location.state as { from?: string } | null)?.from ?? '/', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : '登录失败')
      setBusy(false)
    }
  }

  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden px-6">
      <span
        aria-hidden
        className="serif pointer-events-none absolute -right-10 -top-16 select-none text-[22rem] leading-none text-ink opacity-[0.04]"
      >
        书
      </span>
      <form onSubmit={onSubmit} className="card anim w-full max-w-sm p-8 shadow-xl">
        <div className="mb-8 flex flex-col items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="serif text-4xl font-semibold tracking-[0.3em] text-ink">书影集</span>
            <span className="h-2.5 w-2.5 rounded-[2px] bg-seal" aria-hidden />
          </div>
          <p className="text-sm text-faint">看过的、想看的，都记在这里</p>
        </div>
        <label className="label mb-1.5 block" htmlFor="password">
          访问密码
        </label>
        <input
          id="password"
          type="password"
          autoFocus
          className="input"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="输入访问密码"
        />
        {error && <p className="mt-2 text-sm text-danger">{error}</p>}
        <button type="submit" className="btn btn-primary mt-6 w-full" disabled={busy || !password}>
          {busy ? '验证中…' : '进 入'}
        </button>
      </form>
    </div>
  )
}

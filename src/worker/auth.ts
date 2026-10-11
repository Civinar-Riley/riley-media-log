import { Hono } from 'hono'
import type { MiddlewareHandler } from 'hono'
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'

const SESSION_COOKIE = 'rml_session'
const SESSION_DAYS = 30

const enc = new TextEncoder()

async function sha256(input: string): Promise<ArrayBuffer> {
  return crypto.subtle.digest('SHA-256', enc.encode(input))
}

/** 定长摘要比较，避免时序侧信道 */
async function safeEqual(a: string, b: string): Promise<boolean> {
  const da = await sha256(a)
  const db = await sha256(b)
  return crypto.subtle.timingSafeEqual(da, db)
}

async function sign(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(payload))
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

async function makeSession(secret: string): Promise<string> {
  const exp = Date.now() + SESSION_DAYS * 86400_000
  const payload = String(exp)
  return `${payload}.${await sign(payload, secret)}`
}

async function verifySession(token: string | undefined, secret: string): Promise<boolean> {
  if (!token) return false
  const dot = token.lastIndexOf('.')
  if (dot <= 0) return false
  const payload = token.slice(0, dot)
  const sig = token.slice(dot + 1)
  const exp = Number(payload)
  if (!Number.isFinite(exp) || exp < Date.now()) return false
  return safeEqual(sig, await sign(payload, secret))
}

export const authRoutes = new Hono<{ Bindings: Env }>()

authRoutes.post('/login', async (c) => {
  let password: string | undefined
  try {
    const body = await c.req.json<{ password?: string }>()
    password = body.password
  } catch {
    password = undefined
  }
  const expected = c.env.AUTH_PASSWORD
  if (!expected) {
    return c.json({ error: '服务端未配置登录密码（AUTH_PASSWORD）' }, 500)
  }
  if (!password || !(await safeEqual(password, expected))) {
    return c.json({ error: '密码不对' }, 401)
  }
  setCookie(c, SESSION_COOKIE, await makeSession(c.env.SESSION_SECRET), {
    httpOnly: true,
    secure: true,
    sameSite: 'Lax',
    path: '/',
    maxAge: SESSION_DAYS * 86400,
  })
  return c.json({ ok: true })
})

authRoutes.post('/logout', (c) => {
  deleteCookie(c, SESSION_COOKIE, { path: '/' })
  return c.json({ ok: true })
})

authRoutes.get('/status', async (c) => {
  const token = getCookie(c, SESSION_COOKIE)
  return c.json({
    authenticated: await verifySession(token, c.env.SESSION_SECRET),
    has_api_token: Boolean(c.env.API_TOKEN),
  })
})

/** API 守卫：cookie 会话或 Bearer 令牌二选一 */
export const authMiddleware: MiddlewareHandler<{ Bindings: Env }> = async (c, next) => {
  const token = getCookie(c, SESSION_COOKIE)
  if (await verifySession(token, c.env.SESSION_SECRET)) return next()

  const authz = c.req.header('authorization')
  const bearer = authz?.startsWith('Bearer ') ? authz.slice(7).trim() : undefined
  if (c.env.API_TOKEN && bearer && (await safeEqual(bearer, c.env.API_TOKEN))) return next()

  return c.json({ error: '未登录' }, 401)
}

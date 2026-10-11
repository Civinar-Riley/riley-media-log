import { Hono } from 'hono'
import type { MiddlewareHandler } from 'hono'
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'
import { changePasswordSchema, readBody } from './validate'

const SESSION_COOKIE = 'rml_session'
const SESSION_DAYS = 30
const PASSWORD_HASH_KEY = 'auth_password_hash'

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

/* ---------------- 登录密码（应用内可改，哈希存 D1） ---------------- */

function b64encode(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s)
}

function b64decode(str: string): Uint8Array {
  const bin = atob(str)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

async function pbkdf2Bits(password: string, salt: Uint8Array, iterations: number): Promise<ArrayBuffer> {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits'])
  return crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, key, 256)
}

async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iterations = 100_000
  const bits = await pbkdf2Bits(password, salt, iterations)
  return `pbkdf2$${iterations}$${b64encode(salt)}$${b64encode(new Uint8Array(bits))}`
}

async function verifyPasswordHash(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$')
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false
  const iterations = Number(parts[1])
  if (!Number.isFinite(iterations) || iterations < 1000) return false
  const salt = b64decode(parts[2])
  const expected = b64decode(parts[3])
  const bits = new Uint8Array(await pbkdf2Bits(password, salt, iterations))
  if (bits.length !== expected.length) return false
  return crypto.subtle.timingSafeEqual(bits, expected)
}

async function readPasswordHash(db: D1Database): Promise<string | null> {
  const row = await db
    .prepare('SELECT value FROM settings WHERE key = ?')
    .bind(PASSWORD_HASH_KEY)
    .first<{ value: string }>()
  return row?.value ?? null
}

/** 登录校验：应用内设置的密码（D1 哈希）或 Cloudflare 应急密钥（AUTH_PASSWORD secret），任一通过即可 */
export async function verifyPassword(env: Env, password: string): Promise<boolean> {
  const stored = await readPasswordHash(env.DB)
  if (stored && (await verifyPasswordHash(password, stored))) return true
  if (env.AUTH_PASSWORD && (await safeEqual(password, env.AUTH_PASSWORD))) return true
  return false
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
  const hasCredential = Boolean(c.env.AUTH_PASSWORD) || Boolean(await readPasswordHash(c.env.DB))
  if (!hasCredential) {
    return c.json({ error: '服务端未配置登录密码（AUTH_PASSWORD）' }, 500)
  }
  if (!password || !(await verifyPassword(c.env, password))) {
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

/** 修改登录密码：写入 D1 哈希；Cloudflare 应急密钥（AUTH_PASSWORD secret）仍保留为恢复通道 */
authRoutes.post('/change-password', authMiddleware, async (c) => {
  const data = await readBody(c, changePasswordSchema)
  if (data instanceof Response) return data
  if (!(await verifyPassword(c.env, data.current))) {
    return c.json({ error: '当前密码不对' }, 400)
  }
  const hash = await hashPassword(data.next)
  await c.env.DB.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  )
    .bind(PASSWORD_HASH_KEY, hash)
    .run()
  return c.json({ ok: true })
})

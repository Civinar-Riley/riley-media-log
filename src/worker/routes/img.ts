// 封面图片代理：只允许两个已知图床，防止被当成开放代理滥用
// （image.tmdb.org 与 lain.bgm.tv 国内直连不通，浏览器里的 <img> 走本端点中转）
import { Hono } from 'hono'

const UA = 'riley-media-log/0.1 (https://github.com/Civinar-Riley/riley-media-log)'

const ALLOWED: { host: string; pattern: RegExp }[] = [
  // TMDB 图片：/t/p/<尺寸>/<哈希>.jpg|png|webp
  { host: 'image.tmdb.org', pattern: /^\/t\/p\/[\w]+\/[\w]+\.(jpg|jpeg|png|webp)$/i },
  // Bangumi 图片：/pic/<种类>/<路径>
  { host: 'lain.bgm.tv', pattern: /^\/pic\/[\w]+\/[\w./-]+\.(jpg|jpeg|png|webp|gif)$/i },
]

export const imgRoutes = new Hono<{ Bindings: Env }>()

imgRoutes.get('/img', async (c) => {
  const u = c.req.query('u')
  if (!u) return c.json({ error: '缺少 u 参数' }, 400)

  let target: URL
  try {
    target = new URL(u)
  } catch {
    return c.json({ error: 'URL 不合法' }, 400)
  }
  if (target.protocol !== 'https:') return c.json({ error: '只允许 https 图片' }, 400)

  const rule = ALLOWED.find((r) => r.host === target.hostname)
  if (!rule || !rule.pattern.test(target.pathname)) {
    return c.json({ error: '不允许的图片地址' }, 403)
  }

  const cacheKey = new Request(u, { method: 'GET' })
  const cached = await caches.default.match(cacheKey)
  if (cached) {
    const hit = new Response(cached.body, cached)
    hit.headers.set('X-Cache', 'HIT')
    return hit
  }

  const upstream = await fetch(u, { headers: { 'User-Agent': UA, accept: 'image/*' } })
  if (!upstream.ok || !upstream.body) {
    return c.json({ error: `图片拉取失败（${upstream.status}）` }, 502)
  }
  const res = new Response(upstream.body, {
    headers: {
      'Content-Type': upstream.headers.get('Content-Type') ?? 'image/jpeg',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  })
  c.executionCtx.waitUntil(caches.default.put(cacheKey, res.clone()))
  return res
})

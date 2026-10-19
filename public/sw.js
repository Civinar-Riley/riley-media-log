// 书影集 Service Worker：静态资源缓存优先，API 永远走网络
const CACHE = 'rml-v2'

function isCacheableAsset(request, res) {
  if (!res.ok) return false
  const type = (res.headers.get('content-type') || '').toLowerCase()
  // SPA fallback 会给缺失的 /assets/*.js 返回 200 的 index.html，不能把它缓存成 JS
  if (type.includes('text/html')) return false
  const path = new URL(request.url).pathname
  if (path.startsWith('/assets/')) {
    if (/\.js$/.test(path)) return type.includes('javascript')
    if (/\.css$/.test(path)) return type.includes('text/css')
  }
  return true
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(['/'])).then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)
  if (url.origin !== self.location.origin) return
  if (url.pathname.startsWith('/api')) return // API 不缓存
  if (event.request.method !== 'GET') return

  // 页面导航：网络优先（保证重新部署后能拿到新版），离线时回退缓存
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone()
            caches.open(CACHE).then((cache) => cache.put(event.request, copy))
          }
          return res
        })
        .catch(() => caches.match(event.request).then((hit) => hit || caches.match('/')))
    )
    return
  }

  // 静态资源（带哈希文件名，内容不变）：缓存优先
  event.respondWith(
    caches.match(event.request).then(
      (hit) =>
        hit ||
        fetch(event.request).then((res) => {
          // 缺失的 /assets/* 被 SPA fallback 成 HTML 时，直接按 404 处理，避免污染缓存
          const type = (res.headers.get('content-type') || '').toLowerCase()
          if (url.pathname.startsWith('/assets/') && type.includes('text/html')) {
            return new Response('Not found', { status: 404 })
          }
          if (isCacheableAsset(event.request, res)) {
            const copy = res.clone()
            caches.open(CACHE).then((cache) => cache.put(event.request, copy))
          }
          return res
        })
    )
  )
})

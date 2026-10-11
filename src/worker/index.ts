import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { authRoutes, authMiddleware } from './auth'
import { itemsRoutes } from './routes/items'
import { listsRoutes } from './routes/lists'
import { fieldsRoutes } from './routes/fields'
import { settingsRoutes } from './routes/settings'
import { statsRoutes } from './routes/stats'
import { exportRoutes } from './routes/export'

const app = new Hono<{ Bindings: Env }>()

app.onError((err, c) => {
  if (err instanceof HTTPException) return err.getResponse()
  console.error('API 错误:', err)
  return c.json({ error: err instanceof Error ? err.message : '服务器开小差了' }, 500)
})

// 登录与状态查询不需要会话
app.route('/api/auth', authRoutes)
// 其余 API 一律要登录（cookie 会话或 Bearer 令牌）
app.use('/api/*', authMiddleware)

app.route('/api/items', itemsRoutes)
app.route('/api/lists', listsRoutes)
app.route('/api/fields', fieldsRoutes)
app.route('/api/settings', settingsRoutes)
app.route('/api', statsRoutes)
app.route('/api', exportRoutes)

app.all('/api/*', (c) => c.json({ error: '接口不存在' }, 404))

// 其余路径交给静态资产，SPA 路由由 assets 的 not_found_handling 兜底
app.all('*', (c) => c.env.ASSETS.fetch(c.req.raw))

export default app

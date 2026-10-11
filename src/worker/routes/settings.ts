import { Hono } from 'hono'
import { readBody } from '../validate'
import { categoriesSchema } from '../validate'
import { DEFAULT_CATEGORIES } from '../../shared/types'
import type { CategoryDef } from '../../shared/types'

const SETTINGS_KEY = 'categories'

/** 读类别定义；settings 里没有（老库未跑迁移）时回落到默认六类 */
export async function readCategories(db: D1Database): Promise<CategoryDef[]> {
  const row = await db
    .prepare('SELECT value FROM settings WHERE key = ?')
    .bind(SETTINGS_KEY)
    .first<{ value: string }>()
  if (!row) return DEFAULT_CATEGORIES
  try {
    const v = JSON.parse(row.value)
    if (Array.isArray(v) && v.length > 0) return v as CategoryDef[]
  } catch {
    /* 损坏则回落默认 */
  }
  return DEFAULT_CATEGORIES
}

export const settingsRoutes = new Hono<{ Bindings: Env }>()

settingsRoutes.get('/', async (c) => {
  return c.json({ categories: await readCategories(c.env.DB) })
})

/** 整体保存类别定义；移除仍有条目的类别会被拒绝（应改用隐藏） */
settingsRoutes.put('/categories', async (c) => {
  const data = await readBody(c, categoriesSchema)
  if (data instanceof Response) return data
  const next = data.categories

  const current = await readCategories(c.env.DB)
  const nextIds = new Set(next.map((x) => x.id))
  const removed = current.filter((x) => !nextIds.has(x.id))
  if (removed.length) {
    const counts = await c.env.DB.prepare('SELECT category AS cat, COUNT(*) AS n FROM items GROUP BY category').all()
    const countMap = new Map(counts.results.map((r) => [r.cat as string, r.n as number]))
    const blocked = removed.filter((r) => (countMap.get(r.id) ?? 0) > 0)
    if (blocked.length) {
      return c.json(
        {
          error: `类别「${blocked.map((b) => b.label).join('、')}」下还有条目，不能删除；请改为隐藏`,
        },
        400
      )
    }
  }

  await c.env.DB.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  )
    .bind(SETTINGS_KEY, JSON.stringify(next))
    .run()
  return c.json({ categories: next })
})

import { Hono } from 'hono'
import { readBody } from '../validate'
import { categoriesSchema, aliasesSchema } from '../validate'
import { DEFAULT_CATEGORIES } from '../../shared/types'
import type { CategoryDef } from '../../shared/types'

const CATEGORIES_KEY = 'categories'
const ALIASES_KEY = 'person_aliases'

/** 熟知类别的默认人员字段开关；未显式配置时按此补齐 */
const DEFAULT_PEOPLE_FLAGS: Record<string, Partial<CategoryDef>> = {
  novel: { author: true },
  manga: { author: true },
  movie: { director: true, actor: true },
  series: { director: true, actor: true },
  anime: { director: true, actor: true },
  variety: { director: true, actor: true },
}

function normalizeCategoryFlags(list: CategoryDef[]): CategoryDef[] {
  return list.map((c) => {
    if (c.author !== undefined || c.director !== undefined || c.actor !== undefined) return c
    return { ...c, ...(DEFAULT_PEOPLE_FLAGS[c.id] ?? {}) }
  })
}

/** 读类别定义；settings 里没有（老库未跑迁移）时回落到默认六类 */
export async function readCategories(db: D1Database): Promise<CategoryDef[]> {
  const row = await db
    .prepare('SELECT value FROM settings WHERE key = ?')
    .bind(CATEGORIES_KEY)
    .first<{ value: string }>()
  if (!row) return normalizeCategoryFlags(DEFAULT_CATEGORIES)
  try {
    const v = JSON.parse(row.value)
    if (Array.isArray(v) && v.length > 0) return normalizeCategoryFlags(v as CategoryDef[])
  } catch {
    /* 损坏则回落默认 */
  }
  return normalizeCategoryFlags(DEFAULT_CATEGORIES)
}

/** 读人名别名映射 { 别名: 主名 } */
export async function readAliases(db: D1Database): Promise<Record<string, string>> {
  const row = await db
    .prepare('SELECT value FROM settings WHERE key = ?')
    .bind(ALIASES_KEY)
    .first<{ value: string }>()
  if (!row) return {}
  try {
    const v = JSON.parse(row.value)
    if (v && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, string>
  } catch {
    /* 损坏则视为空 */
  }
  return {}
}

/** 把人名数组按别名映射归一到主名 */
function applyAliases(names: string[] | undefined, aliases: Record<string, string>): string[] | undefined {
  if (!names) return names
  const seen = new Set<string>()
  const out: string[] = []
  for (const n of names) {
    const canonical = aliases[n] ?? n
    if (canonical && !seen.has(canonical)) {
      seen.add(canonical)
      out.push(canonical)
    }
  }
  return out
}

/** 保存条目前归一其人名字段 */
export async function normalizeItemPeople(
  db: D1Database,
  data: { authors?: string[]; directors?: string[]; actors?: string[] }
): Promise<void> {
  const aliases = await readAliases(db)
  if (!Object.keys(aliases).length) return
  data.authors = applyAliases(data.authors, aliases)
  data.directors = applyAliases(data.directors, aliases)
  data.actors = applyAliases(data.actors, aliases)
}

export const settingsRoutes = new Hono<{ Bindings: Env }>()

settingsRoutes.get('/', async (c) => {
  const [categories, aliases] = await Promise.all([readCategories(c.env.DB), readAliases(c.env.DB)])
  return c.json({ categories, aliases })
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
    .bind(CATEGORIES_KEY, JSON.stringify(next))
    .run()
  return c.json({ categories: next })
})

/** 保存别名映射；校验自指与循环链 */
settingsRoutes.put('/aliases', async (c) => {
  const data = await readBody(c, aliasesSchema)
  if (data instanceof Response) return data
  const aliases = data.aliases

  for (const [alias, canonical] of Object.entries(aliases)) {
    if (alias === canonical) return c.json({ error: `别名「${alias}」不能指向自己` }, 400)
    let cur: string = canonical
    for (let depth = 0; depth < 10; depth++) {
      const next = aliases[cur]
      if (next === undefined) break
      if (next === alias) return c.json({ error: `别名成环：${alias} ↔ ${canonical}` }, 400)
      cur = next
    }
  }

  await c.env.DB.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  )
    .bind(ALIASES_KEY, JSON.stringify(aliases))
    .run()
  return c.json({ aliases })
})

/** 一键归一：把历史数据里的人名按别名映射改写为主名 */
settingsRoutes.post('/aliases/normalize', async (c) => {
  const aliases = await readAliases(c.env.DB)
  if (!Object.keys(aliases).length) return c.json({ updated: 0 })

  const rows = await c.env.DB.prepare('SELECT id, authors, directors, actors FROM items').all()
  const stmts: D1PreparedStatement[] = []
  for (const row of rows.results) {
    const authors = applyAliases(parseCol(row.authors), aliases)
    const directors = applyAliases(parseCol(row.directors), aliases)
    const actors = applyAliases(parseCol(row.actors), aliases)
    const origAuthors = parseCol(row.authors)
    const origDirectors = parseCol(row.directors)
    const origActors = parseCol(row.actors)
    if (
      JSON.stringify(authors) !== JSON.stringify(origAuthors) ||
      JSON.stringify(directors) !== JSON.stringify(origDirectors) ||
      JSON.stringify(actors) !== JSON.stringify(origActors)
    ) {
      stmts.push(
        c.env.DB.prepare('UPDATE items SET authors = ?, directors = ?, actors = ? WHERE id = ?').bind(
          JSON.stringify(authors),
          JSON.stringify(directors),
          JSON.stringify(actors),
          row.id
        )
      )
    }
  }
  if (stmts.length) await c.env.DB.batch(stmts)
  return c.json({ updated: stmts.length })
})

function parseCol(v: unknown): string[] {
  try {
    const arr = JSON.parse((v as string) ?? '[]')
    return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

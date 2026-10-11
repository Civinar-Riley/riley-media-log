import { Hono } from 'hono'
import { listCreateSchema, listUpdateSchema, listAddItemsSchema, listOrderSchema, readBody } from '../validate'
import { nowISO, logActivity, mapItem } from '../db'

export const listsRoutes = new Hono<{ Bindings: Env }>()

/** 清单列表（含条目数） */
listsRoutes.get('/', async (c) => {
  const rows = await c.env.DB.prepare(
    `SELECT l.*, (SELECT COUNT(*) FROM list_items li WHERE li.list_id = l.id) AS item_count
     FROM lists l ORDER BY l.created_at DESC, l.id DESC`
  ).all()
  return c.json(rows.results)
})

listsRoutes.post('/', async (c) => {
  const data = await readBody(c, listCreateSchema)
  if (data instanceof Response) return data
  const row = await c.env.DB.prepare(
    'INSERT INTO lists (name, description, created_at) VALUES (?,?,?) RETURNING *'
  )
    .bind(data.name, data.description, nowISO())
    .first()
  return c.json(row, 201)
})

listsRoutes.get('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const list = await c.env.DB.prepare('SELECT * FROM lists WHERE id = ?').bind(id).first()
  if (!list) return c.json({ error: '清单不存在' }, 404)
  const items = await c.env.DB.prepare(
    `SELECT i.*, li.added_at, li.sort_order
     FROM items i JOIN list_items li ON li.item_id = i.id
     WHERE li.list_id = ?
     ORDER BY li.sort_order ASC, li.added_at DESC`
  )
    .bind(id)
    .all()
  return c.json({
    ...list,
    items: items.results.map((r) => ({ ...mapItem(r), added_at: r.added_at, sort_order: r.sort_order })),
  })
})

listsRoutes.put('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const data = await readBody(c, listUpdateSchema)
  if (data instanceof Response) return data
  const sets: string[] = []
  const vals: unknown[] = []
  if (data.name !== undefined) {
    sets.push('name = ?')
    vals.push(data.name)
  }
  if (data.description !== undefined) {
    sets.push('description = ?')
    vals.push(data.description)
  }
  if (!sets.length) return c.json({ error: '没有要修改的内容' }, 400)
  const res = await c.env.DB.prepare(`UPDATE lists SET ${sets.join(', ')} WHERE id = ?`).bind(...vals, id).run()
  if (!res.meta.changes) return c.json({ error: '清单不存在' }, 404)
  return c.json({ ok: true })
})

listsRoutes.delete('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const res = await c.env.DB.prepare('DELETE FROM lists WHERE id = ?').bind(id).run()
  if (!res.meta.changes) return c.json({ error: '清单不存在' }, 404)
  return c.json({ ok: true })
})

/** 批量把库内条目加入清单 */
listsRoutes.post('/:id/items', async (c) => {
  const id = Number(c.req.param('id'))
  const list = await c.env.DB.prepare('SELECT id, name FROM lists WHERE id = ?').bind(id).first()
  if (!list) return c.json({ error: '清单不存在' }, 404)

  const data = await readBody(c, listAddItemsSchema)
  if (data instanceof Response) return data

  const now = nowISO()
  const stmts = data.item_ids.map(
    (itemId) =>
      c.env.DB.prepare(
        'INSERT INTO list_items (list_id, item_id, added_at) VALUES (?,?,?) ON CONFLICT DO NOTHING'
      ).bind(id, itemId, now)
  )
  await c.env.DB.batch(stmts)
  await logActivity(c.env.DB, null, 'list_changed', `向清单「${list.name as string}」添加了 ${data.item_ids.length} 个条目`)
  return c.json({ ok: true })
})

listsRoutes.delete('/:id/items/:itemId', async (c) => {
  const id = Number(c.req.param('id'))
  const itemId = Number(c.req.param('itemId'))
  const res = await c.env.DB.prepare('DELETE FROM list_items WHERE list_id = ? AND item_id = ?').bind(id, itemId).run()
  if (!res.meta.changes) return c.json({ error: '条目不在这个清单里' }, 404)
  return c.json({ ok: true })
})

/** 清单内排序（按传入顺序重排） */
listsRoutes.put('/:id/order', async (c) => {
  const id = Number(c.req.param('id'))
  const data = await readBody(c, listOrderSchema)
  if (data instanceof Response) return data
  const stmts = data.item_ids.map((itemId, idx) =>
    c.env.DB.prepare('UPDATE list_items SET sort_order = ? WHERE list_id = ? AND item_id = ?').bind(idx, id, itemId)
  )
  if (stmts.length) await c.env.DB.batch(stmts)
  return c.json({ ok: true })
})

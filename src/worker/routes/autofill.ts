// 自动补全接口：候选预览 / 应用（可撤回）/ 撤回 / 数据源状态
import { Hono } from 'hono'
import {
  autofillApplySchema,
  autofillFieldOptionsSchema,
  autofillPreviewSchema,
  autofillUndoSchema,
  readBody,
} from '../validate'
import {
  applyAutofill,
  autofillFieldOptions,
  searchCandidates,
  sourceConfigured,
  undoAutofill,
  defaultSource,
  itemSeason,
  AUTOFILL_FIELDS,
} from '../autofill/service'

export const autofillRoutes = new Hono<{ Bindings: Env }>()

/** 数据源配置状态（设置页展示） */
autofillRoutes.get('/status', (c) => {
  return c.json({
    tmdb: sourceConfigured(c.env, 'tmdb'),
    bangumi: sourceConfigured(c.env, 'bangumi'),
  })
})

/** 搜索候选：按条目的类别与标题（可传 query 覆盖） */
autofillRoutes.post('/preview', async (c) => {
  const data = await readBody(c, autofillPreviewSchema)
  if (data instanceof Response) return data
  const item = await c.env.DB.prepare('SELECT * FROM items WHERE id = ?').bind(data.item_id).first()
  if (!item) return c.json({ error: '条目不存在' }, 404)

  const category = item.category as string
  const source = data.source ?? defaultSource(category)
  if (!sourceConfigured(c.env, source)) {
    return c.json(
      { error: source === 'tmdb' ? '未配置 TMDB_API_KEY' : 'Bangumi 未就绪', source },
      503
    )
  }
  const query = (data.query ?? (item.title_cn as string) ?? (item.title as string) ?? '').trim()
  let year: number | undefined
  if (data.year === null) year = undefined
  else if (typeof data.year === 'number') year = data.year
  else if (typeof item.year === 'number') year = item.year
  try {
    const { candidates } = await searchCandidates(
      c.env,
      category,
      source,
      query,
      year,
      itemSeason(item, query)
    )
    return c.json({ source, candidates })
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : '搜索失败', source }, 502)
  }
})

/** 应用自动补全：只填空位，写快照日志 */
autofillRoutes.post('/apply', async (c) => {
  const data = await readBody(c, autofillApplySchema)
  if (data instanceof Response) return data
  const invalid = data.fields.filter((f) => !(AUTOFILL_FIELDS as readonly string[]).includes(f))
  if (invalid.length) return c.json({ error: `不支持自动补全的字段：${invalid.join('、')}` }, 400)
  if (!sourceConfigured(c.env, data.source)) {
    return c.json(
      { error: data.source === 'tmdb' ? '未配置 TMDB_API_KEY' : 'Bangumi 未就绪', source: data.source },
      503
    )
  }

  const result = await applyAutofill(
    c.env,
    c.env.DB,
    data.item_id,
    data.source,
    data.external_id,
    data.fields,
    data.overwrite === true
  )
  if ('error' in result && result.error) {
    const status = result.error.includes('不存在') ? 404 : 400
    return c.json({ ...result, error: result.error }, status)
  }
  return c.json(result)
})

/** 撤回一次自动补全 */
autofillRoutes.post('/undo', async (c) => {
  const data = await readBody(c, autofillUndoSchema)
  if (data instanceof Response) return data
  const result = await undoAutofill(c.env.DB, data.log_id)
  if ('error' in result) {
    const status = result.error.includes('不存在') ? 404 : 400
    return c.json({ ...result, error: result.error }, status)
  }
  return c.json(result)
})

/** 某候选可提供的字段清单（不写库），供补全弹窗勾选 */
autofillRoutes.post('/fields', async (c) => {
  const data = await readBody(c, autofillFieldOptionsSchema)
  if (data instanceof Response) return data
  if (!sourceConfigured(c.env, data.source)) {
    return c.json(
      { error: data.source === 'tmdb' ? '未配置 TMDB_API_KEY' : 'Bangumi 未就绪', source: data.source },
      503
    )
  }
  const result = await autofillFieldOptions(c.env, data.item_id, data.source, data.external_id)
  if ('error' in result) {
    const status = result.error.includes('不存在') ? 404 : 400
    return c.json({ ...result, error: result.error }, status)
  }
  return c.json(result)
})

/** 某条目最近的补全记录（供撤回入口展示） */
autofillRoutes.get('/logs', async (c) => {
  const itemId = Number(c.req.query('item_id'))
  if (!Number.isInteger(itemId)) return c.json({ error: 'item_id 不合法' }, 400)
  const rows = await c.env.DB.prepare(
    `SELECT id, source, external_id, fields, applied_at, undone_at
     FROM autofill_log WHERE item_id = ? ORDER BY id DESC LIMIT 10`
  )
    .bind(itemId)
    .all()
  return c.json(rows.results)
})

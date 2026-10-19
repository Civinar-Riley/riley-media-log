import { z } from 'zod'
import { STATUSES, FINISH_STATUSES } from '../shared/types'

const strArr = z
  .array(z.string().trim().min(1).max(60))
  .max(30)
  .optional()
  .transform((v) => [...new Set(v ?? [])])

/** 条目字段（不带 default）：create 再补默认值，update 用 partial 只处理实际提交的字段 */
const itemFields = {
  title: z.string().trim().min(1, '标题不能为空').max(200),
  category: z.string().trim().min(1, '类别不能为空').max(40),
  year: z.number().int().min(1850).max(2100).nullish().transform((v) => v ?? null),
  season: z.number().int().min(1).max(200).nullish().transform((v) => v ?? null),
  regions: strArr,
  tags: strArr,
  authors: strArr,
  directors: strArr,
  actors: strArr,
  status: z.enum(STATUSES),
  progress: z.string().trim().max(500),
  episode_count: z.number().int().min(1).max(100000).nullish().transform((v) => v ?? null),
  rating: z.number().int().min(1).max(5).nullish().transform((v) => v ?? null),
  cover_url: z
    .string()
    .trim()
    .max(600)
    .refine((v) => v === '' || /^https?:\/\//.test(v), '封面必须是 http(s) 链接'),
  channel: z.string().trim().max(60),
  finish_status: z.enum(FINISH_STATUSES).nullish().transform((v) => v ?? null),
  notes: z.string().trim().max(5000),
  review: z.string().trim().max(5000),
  tmdb_id: z.string().trim().max(32).nullish().transform((v) => v ?? null),
}

export const itemCreateSchema = z.object({
  ...itemFields,
  status: itemFields.status.default('want'),
  progress: itemFields.progress.default(''),
  cover_url: itemFields.cover_url.default(''),
  channel: itemFields.channel.default(''),
  notes: itemFields.notes.default(''),
  review: itemFields.review.default(''),
})

/** 注意：不能直接 itemCreateSchema.partial()——Zod 4 会保留 default，
 *  只传 status 的 PUT 会把 progress/封面/备注/观后感等一起重置为空 */
export const itemUpdateSchema = z.object(itemFields).partial()

export const viewingCreateSchema = z.object({
  watched_on: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, '日期格式应为 YYYY-MM-DD')
    .refine((v) => {
      const d = new Date(v + 'T00:00:00Z')
      return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v
    }, '日期不存在'),
  comment: z.string().trim().max(2000).default(''),
})

const listFields = {
  name: z.string().trim().min(1, '清单名不能为空').max(100),
  description: z.string().trim().max(500),
}

export const listCreateSchema = z.object({
  ...listFields,
  description: listFields.description.default(''),
})

/** 同上：更新不能带 default，否则只改名字会清空描述 */
export const listUpdateSchema = z.object(listFields).partial()

export const listAddItemsSchema = z.object({
  item_ids: z.array(z.number().int().positive()).min(1).max(200),
})

export const listOrderSchema = z.object({
  item_ids: z.array(z.number().int().positive()).max(1000),
})

export const fieldRenameSchema = z.object({
  from: z.union([
    z.string().trim().min(1).max(60),
    z.array(z.string().trim().min(1).max(60)).min(1).max(100),
  ]),
  to: z.string().trim().max(60),
})

export const loginSchema = z.object({ password: z.string().min(1).max(200) })

export const changePasswordSchema = z.object({
  current: z.string().min(1, '请输入当前密码').max(200),
  next: z.string().min(6, '新密码至少 6 位').max(100),
})

export const AUTOFILL_SOURCES = ['tmdb', 'bangumi'] as const
const autofillSourceSchema = z.enum(AUTOFILL_SOURCES)

export const autofillPreviewSchema = z.object({
  item_id: z.number().int().positive(),
  source: autofillSourceSchema.optional(),
  query: z.string().trim().max(200).optional(),
  year: z.number().int().nullable().optional(), // 显式传 null = 不带年份过滤搜索
})

export const autofillApplySchema = z.object({
  item_id: z.number().int().positive(),
  source: autofillSourceSchema,
  external_id: z.string().trim().min(1).max(40).regex(/^\d+$/, '外部 ID 必须是数字'),
  fields: z.array(z.string().trim().min(1).max(40)).min(1, '至少选择一个要补全的字段').max(10),
  /** true 时允许覆盖已有值（默认只填空位） */
  overwrite: z.boolean().optional(),
})

export const autofillFieldOptionsSchema = z.object({
  item_id: z.number().int().positive(),
  source: autofillSourceSchema,
  external_id: z.string().trim().min(1).max(40).regex(/^\d+$/, '外部 ID 必须是数字'),
})

export const autofillUndoSchema = z.object({ log_id: z.number().int().positive() })

export const aliasesSchema = z.object({
  aliases: z
    .record(z.string().trim().min(1).max(60), z.string().trim().min(1).max(60))
    .refine((obj) => Object.keys(obj).length <= 500, '别名太多（上限 500 条）'),
})

const categoryDefSchema = z.object({
  id: z
    .string()
    .trim()
    .min(1, '类别 id 不能为空')
    .max(40)
    .regex(/^[A-Za-z0-9_-]+$/, '类别 id 只能包含字母、数字、- 和 _'),
  label: z.string().trim().min(1, '类别名不能为空').max(20),
  hidden: z.boolean().optional(),
  finish: z.boolean().optional(),
  author: z.boolean().optional(),
  director: z.boolean().optional(),
  actor: z.boolean().optional(),
})

export const categoriesSchema = z
  .object({ categories: z.array(categoryDefSchema).min(1, '至少保留一个类别').max(30) })
  .superRefine((val, ctx) => {
    const ids = new Set<string>()
    const labels = new Set<string>()
    for (const cat of val.categories) {
      if (ids.has(cat.id)) ctx.addIssue({ code: 'custom', message: `类别 id 重复：${cat.id}` })
      ids.add(cat.id)
      if (labels.has(cat.label)) ctx.addIssue({ code: 'custom', message: `类别名重复：${cat.label}` })
      labels.add(cat.label)
    }
  })

/** 解析 JSON 请求体并校验；不合法时直接返回 400 Response */
export async function readBody<S extends z.ZodType>(
  c: { req: { json(): Promise<unknown> } },
  schema: S
): Promise<z.output<S> | Response> {
  let raw: unknown
  try {
    raw = await c.req.json()
  } catch {
    return Response.json({ error: '请求体不是合法 JSON' }, { status: 400 })
  }
  const r = schema.safeParse(raw)
  if (!r.success) {
    const msg = r.error.issues.map((i) => i.message).join('；') || '参数不对'
    return Response.json({ error: msg }, { status: 400 })
  }
  return r.data as z.output<S>
}

import { z } from 'zod'
import { STATUSES, FINISH_STATUSES } from '../shared/types'

const strArr = z
  .array(z.string().trim().min(1).max(60))
  .max(30)
  .optional()
  .transform((v) => v ?? [])

export const itemCreateSchema = z.object({
  title: z.string().trim().min(1, '标题不能为空').max(200),
  category: z.string().trim().min(1, '类别不能为空').max(40),
  year: z.number().int().min(1850).max(2100).nullish().transform((v) => v ?? null),
  season: z.number().int().min(1).max(200).nullish().transform((v) => v ?? null),
  regions: strArr,
  tags: strArr,
  authors: strArr,
  directors: strArr,
  actors: strArr,
  status: z.enum(STATUSES).default('want'),
  progress: z.string().trim().max(500).default(''),
  episode_count: z.number().int().min(1).max(100000).nullish().transform((v) => v ?? null),
  rating: z.number().int().min(1).max(5).nullish().transform((v) => v ?? null),
  cover_url: z
    .string()
    .trim()
    .max(600)
    .refine((v) => v === '' || /^https?:\/\//.test(v), '封面必须是 http(s) 链接')
    .default(''),
  channel: z.string().trim().max(60).default(''),
  finish_status: z.enum(FINISH_STATUSES).nullish().transform((v) => v ?? null),
  notes: z.string().trim().max(5000).default(''),
  review: z.string().trim().max(5000).default(''),
  tmdb_id: z.string().trim().max(32).nullish().transform((v) => v ?? null),
})

export const itemUpdateSchema = itemCreateSchema.partial()

export const viewingCreateSchema = z.object({
  watched_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '日期格式应为 YYYY-MM-DD'),
  comment: z.string().trim().max(2000).default(''),
})

export const listCreateSchema = z.object({
  name: z.string().trim().min(1, '清单名不能为空').max(100),
  description: z.string().trim().max(500).default(''),
})

export const listUpdateSchema = listCreateSchema.partial()

export const listAddItemsSchema = z.object({
  item_ids: z.array(z.number().int().positive()).min(1).max(200),
})

export const listOrderSchema = z.object({
  item_ids: z.array(z.number().int().positive()).max(1000),
})

export const fieldRenameSchema = z.object({
  from: z.union([z.string().trim().min(1), z.array(z.string().trim().min(1)).min(1)]),
  to: z.string().trim().max(60),
})

export const loginSchema = z.object({ password: z.string().min(1).max(200) })

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

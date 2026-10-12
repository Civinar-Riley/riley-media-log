// Bangumi (bgm.tv) 客户端：动漫 / 漫画 / 小说（含轻小说网文）的元数据与封面
// 公开条目接口可匿名访问；配置了 BANGUMI_TOKEN 时带上以获得更高配额

const BGM_BASE = 'https://api.bgm.tv'
const UA = 'riley-media-log/0.1 (https://github.com/Civinar-Riley/riley-media-log)'

export interface BgmCandidate {
  externalId: string
  title: string
  year: number | null
  coverThumb: string | null
  overview: string
  rating: number | null
}

export interface BgmDetails {
  displayTitle: string
  overview: string
  rating: number | null
  fields: {
    cover_url?: string
    year?: number
    regions?: string[]
    tags?: string[]
    authors?: string[]
    directors?: string[]
    actors?: string[]
    episode_count?: number
  }
}

/** Bangumi 条目类型：1 书籍（含漫画/小说）2 动画 3 音乐 4 游戏 6 三次元 */
export function bgmSubjectType(category: string): number | undefined {
  if (category === 'anime') return 2
  if (category === 'novel' || category === 'manga') return 1
  if (category === 'series' || category === 'variety') return 6
  return undefined
}

interface BgmRaw {
  id: number
  name: string
  name_cn?: string
  date?: string | null
  summary?: string
  images?: { large?: string; common?: string; medium?: string }
  rating?: { score?: number }
  tags?: { name: string; count: number }[]
  eps?: number
  infobox?: { key: string; value: unknown }[]
}

function bgmHeaders(env: Env): Record<string, string> {
  const h: Record<string, string> = { 'User-Agent': UA, accept: 'application/json' }
  if (env.BANGUMI_TOKEN) h.Authorization = `Bearer ${env.BANGUMI_TOKEN}`
  return h
}

async function bgmGet(env: Env, path: string): Promise<BgmRaw> {
  // 上游偶发 502/429，自动重试一次
  let lastError = ''
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 800))
    const res = await fetch(BGM_BASE + path, { headers: bgmHeaders(env) })
    if (res.ok) return (await res.json()) as BgmRaw
    lastError = `${res.status}: ${(await res.text()).slice(0, 150)}`
    if (res.status !== 502 && res.status !== 503 && res.status !== 429) break
  }
  throw new Error(`Bangumi 请求失败（${lastError}）`)
}

async function bgmSearchRaw(env: Env, keyword: string, type?: number): Promise<BgmRaw[]> {
  const body: Record<string, unknown> = { keyword, limit: 8 }
  // 注意：filter.type 必须是数字数组（[2]）；裸数字或字符串都会 400，
  // 且 Bangumi 的报错信息（illegal base64）有误导性
  if (type) body.filter = { type: [type] }
  let lastError = ''
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 800))
    const res = await fetch(`${BGM_BASE}/v0/search/subjects?limit=8`, {
      method: 'POST',
      headers: { ...bgmHeaders(env), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (res.ok) return ((await res.json()) as { data?: BgmRaw[] }).data ?? []
    lastError = `${res.status}: ${(await res.text()).slice(0, 150)}`
    if (res.status !== 502 && res.status !== 503 && res.status !== 429) break
  }
  throw new Error(`Bangumi 搜索失败（${lastError}）`)
}

export function bgmConfigured(_env: Env): boolean {
  // 公开接口可匿名访问；配置 token 与否都算「可用」
  return true
}

export async function bgmSearch(
  env: Env,
  query: string,
  type?: number
): Promise<BgmCandidate[]> {
  const results = await bgmSearchRaw(env, query, type)
  return results.slice(0, 8).map((r) => ({
    externalId: String(r.id),
    title: (r.name_cn || r.name || '').trim(),
    year: parseInt(((r.date ?? '') + '0000').slice(0, 4), 10) || null,
    coverThumb: r.images?.common ?? r.images?.medium ?? null,
    overview: (r.summary ?? '').slice(0, 120),
    rating: typeof r.rating?.score === 'number' && r.rating.score > 0 ? r.rating.score : null,
  }))
}

/** infobox 取值：值可能是字符串或 {v: string} 数组；
 *  去掉「（掲載…／KADOKAWA刊）」这类括号补充说明——只保留主名称 */
function infoboxValue(raw: BgmRaw, keys: string[]): string[] {
  const strip = (v: string) => v.replace(/[（(].*$/, '').trim()
  for (const item of raw.infobox ?? []) {
    if (!keys.includes(item.key)) continue
    const v = item.value
    if (typeof v === 'string') return [strip(v)].filter(Boolean)
    if (Array.isArray(v)) {
      return v
        .map((x) => (typeof x === 'string' ? x : (x as { v: string }).v))
        .map(strip)
        .filter(Boolean)
    }
    if (v) return [strip(String(v))].filter(Boolean)
  }
  return []
}

export async function bgmDetails(env: Env, externalId: string): Promise<BgmDetails> {
  const raw = await bgmGet(env, `/v0/subjects/${externalId}`)
  const fields: BgmDetails['fields'] = {}

  const cover = raw.images?.large ?? raw.images?.common
  if (cover) fields.cover_url = cover
  const year = parseInt(((raw.date ?? '') + '0000').slice(0, 4), 10)
  if (year) fields.year = year
  if (raw.tags?.length) {
    // 过滤「2023年10月」这类播出季日期标签（社区标签里很常见，但不是有效内容标签）
    const clean = raw.tags.filter((t) => !/^\d{4}年(\d{1,2}月)?$/.test(t.name.trim()))
    if (clean.length) {
      fields.tags = clean
        .sort((a, b) => b.count - a.count)
        .slice(0, 4)
        .map((t) => t.name)
    }
  }
  const regions = infoboxValue(raw, ['地区', '产地'])
  if (regions.length) fields.regions = regions
  const authors = infoboxValue(raw, ['作者', '原作', '漫画原作'])
  if (authors.length) fields.authors = authors.slice(0, 3)
  const directors = infoboxValue(raw, ['导演'])
  if (directors.length) fields.directors = directors.slice(0, 3)
  const cv = infoboxValue(raw, ['声优', '主演'])
  if (cv.length) fields.actors = cv.slice(0, 3)
  if (raw.eps) fields.episode_count = raw.eps

  return {
    displayTitle: (raw.name_cn || raw.name || '').trim(),
    overview: (raw.summary ?? '').slice(0, 200),
    rating: typeof raw.rating?.score === 'number' && raw.rating.score > 0 ? raw.rating.score : null,
    fields,
  }
}

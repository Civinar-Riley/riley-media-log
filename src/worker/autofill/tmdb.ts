// TMDB 客户端：影视类（电影/剧集）元数据与封面
// 注意：api.themoviedb.org 在中国大陆直连不通，本模块只在 Worker 端调用（Cloudflare 边缘 → TMDB 无碍）

const TMDB_BASE = 'https://api.themoviedb.org/3'
const IMG_BASE = 'https://image.tmdb.org/t/p/w780'

export interface TmdbCandidate {
  externalId: string
  title: string
  year: number | null
  coverThumb: string | null
  overview: string
  rating: number | null
}

export interface TmdbDetails {
  displayTitle: string
  overview: string
  rating: number | null
  fields: {
    cover_url?: string
    year?: number
    regions?: string[]
    tags?: string[]
    directors?: string[]
    actors?: string[]
    episode_count?: number
  }
}

/** TMDB 电影/剧集的中文类型名映射（genre id 因类型而异） */
const MOVIE_GENRES: Record<number, string> = {
  28: '动作', 12: '冒险', 16: '动画', 35: '喜剧', 80: '犯罪', 99: '纪录片',
  18: '剧情', 10751: '家庭', 14: '奇幻', 36: '历史', 9648: '悬疑', 10402: '音乐',
  10749: '爱情', 878: '科幻', 10770: '电视电影', 53: '惊悚', 10752: '战争', 37: '西部',
}
const TV_GENRES: Record<number, string> = {
  10759: '动作', 16: '动画', 35: '喜剧', 80: '犯罪', 99: '纪录片', 18: '剧情',
  10751: '家庭', 10762: '儿童', 9648: '悬疑', 10763: '新闻', 10764: '真人秀',
  10765: '科幻', 10766: '肥皂剧', 10767: '脱口秀', 10768: '战争', 37: '西部',
}

/** 国家代码 → 中文名（TMDB 返回的是 ISO 代码） */
const REGION_ZH: Record<string, string> = {
  US: '美国', CN: '中国大陆', HK: '中国香港', TW: '中国台湾', JP: '日本', KR: '韩国',
  GB: '英国', FR: '法国', DE: '德国', IT: '意大利', ES: '西班牙', CA: '加拿大',
  AU: '澳大利亚', RU: '俄罗斯', IN: '印度', TH: '泰国', SE: '瑞典', DK: '丹麦',
  NO: '挪威', MX: '墨西哥', BR: '巴西', NL: '荷兰', BE: '比利时', NZ: '新西兰',
  SG: '新加坡', MY: '马来西亚', IE: '爱尔兰', AT: '奥地利', CH: '瑞士', PL: '波兰',
}

function regionZh(codes: string[]): string[] {
  return codes.map((c) => REGION_ZH[c] ?? c)
}

interface TmdbRaw {
  id: number
  title?: string
  name?: string
  overview?: string
  vote_average?: number
  poster_path?: string | null
  release_date?: string
  first_air_date?: string
  genres?: { id: number; name: string }[]
  production_countries?: { iso_3166_1: string }[]
  origin_country?: string[]
  number_of_episodes?: number
  created_by?: { name: string }[]
  credits?: {
    crew?: { job: string; name: string }[]
    cast?: { name: string }[]
  }
}

async function tmdbGet(env: Env, path: string, params: Record<string, string> = {}): Promise<TmdbRaw> {
  const url = new URL(TMDB_BASE + path)
  url.searchParams.set('api_key', env.TMDB_API_KEY)
  url.searchParams.set('language', 'zh-CN')
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  const res = await fetch(url, { headers: { accept: 'application/json' } })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`TMDB 请求失败（${res.status}）：${text.slice(0, 200)}`)
  }
  return (await res.json()) as TmdbRaw
}

export function tmdbConfigured(env: Env): boolean {
  return Boolean(env.TMDB_API_KEY)
}

/** 搜索候选（kind: movie | tv） */
export async function tmdbSearch(
  env: Env,
  kind: 'movie' | 'tv',
  query: string,
  year?: number
): Promise<TmdbCandidate[]> {
  const params: Record<string, string> = { query, include_adult: 'false' }
  if (year) {
    if (kind === 'movie') params.year = String(year)
    else params.first_air_date_year = String(year)
  }
  const raw = await tmdbGet(env, `/search/${kind}`, params)
  const results = (raw as unknown as { results?: TmdbRaw[] }).results ?? []
  return results.slice(0, 8).map((r) => ({
    externalId: String(r.id),
    title: (r.title ?? r.name ?? '').trim(),
    year: parseInt(((r.release_date ?? r.first_air_date ?? '') + '0000').slice(0, 4), 10) || null,
    coverThumb: r.poster_path ? `https://image.tmdb.org/t/p/w185${r.poster_path}` : null,
    overview: (r.overview ?? '').slice(0, 120),
    rating: typeof r.vote_average === 'number' && r.vote_average > 0 ? r.vote_average : null,
  }))
}

/** 拉取详情并映射到本项目的字段（只返回源上有值的字段） */
export async function tmdbDetails(
  env: Env,
  kind: 'movie' | 'tv',
  externalId: string
): Promise<TmdbDetails> {
  const raw = await tmdbGet(env, `/${kind}/${externalId}`, { append_to_response: 'credits' })
  const date = raw.release_date ?? raw.first_air_date ?? ''
  const year = parseInt(date.slice(0, 4), 10) || undefined
  const genreMap = kind === 'movie' ? MOVIE_GENRES : TV_GENRES
  const fields: TmdbDetails['fields'] = {}

  if (raw.poster_path) fields.cover_url = `${IMG_BASE}${raw.poster_path}`
  if (year) fields.year = year
  if (kind === 'movie' && raw.production_countries?.length) {
    fields.regions = regionZh(raw.production_countries.map((c) => c.iso_3166_1))
  }
  if (kind === 'tv' && raw.origin_country?.length) {
    fields.regions = regionZh(raw.origin_country)
  }
  if (raw.genres?.length) {
    fields.tags = raw.genres.map((g) => genreMap[g.id] ?? g.name)
  }
  if (kind === 'movie') {
    const directors = (raw.credits?.crew ?? []).filter((p) => p.job === 'Director').map((p) => p.name)
    if (directors.length) fields.directors = directors.slice(0, 3)
  }
  if (kind === 'tv' && raw.created_by?.length) {
    fields.directors = raw.created_by.map((p) => p.name).slice(0, 3)
  }
  const cast = (raw.credits?.cast ?? []).map((p) => p.name)
  if (cast.length) fields.actors = cast.slice(0, 3)
  if (kind === 'tv' && raw.number_of_episodes) fields.episode_count = raw.number_of_episodes

  return {
    displayTitle: (raw.title ?? raw.name ?? '').trim(),
    overview: (raw.overview ?? '').slice(0, 200),
    rating: typeof raw.vote_average === 'number' && raw.vote_average > 0 ? raw.vote_average : null,
    fields,
  }
}

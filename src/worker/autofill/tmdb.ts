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

/** 国家/地区代码 → 中文名（TMDB 返回的是 ISO 3166-1 双字母码；命名遵循中国大陆/中国香港/中国台湾） */
const REGION_ZH: Record<string, string> = {
  CN: '中国大陆', HK: '中国香港', TW: '中国台湾', MO: '中国澳门',
  JP: '日本', KR: '韩国', KP: '朝鲜', MN: '蒙古',
  SG: '新加坡', MY: '马来西亚', TH: '泰国', VN: '越南', PH: '菲律宾',
  ID: '印度尼西亚', KH: '柬埔寨', LA: '老挝', MM: '缅甸', BN: '文莱',
  IN: '印度', PK: '巴基斯坦', BD: '孟加拉国', LK: '斯里兰卡', NP: '尼泊尔',
  BT: '不丹', MV: '马尔代夫', AF: '阿富汗', TL: '东帝汶',
  KZ: '哈萨克斯坦', UZ: '乌兹别克斯坦', KG: '吉尔吉斯斯坦', TJ: '塔吉克斯坦', TM: '土库曼斯坦',
  GE: '格鲁吉亚', AM: '亚美尼亚', AZ: '阿塞拜疆',
  IR: '伊朗', IQ: '伊拉克', SY: '叙利亚', JO: '约旦', LB: '黎巴嫩', IL: '以色列', PS: '巴勒斯坦',
  SA: '沙特阿拉伯', AE: '阿联酋', QA: '卡塔尔', KW: '科威特', BH: '巴林', OM: '阿曼', YE: '也门',
  TR: '土耳其', CY: '塞浦路斯',
  GB: '英国', IE: '爱尔兰', FR: '法国', DE: '德国', IT: '意大利', ES: '西班牙', PT: '葡萄牙',
  NL: '荷兰', BE: '比利时', LU: '卢森堡', CH: '瑞士', AT: '奥地利',
  SE: '瑞典', NO: '挪威', DK: '丹麦', FI: '芬兰', IS: '冰岛',
  PL: '波兰', CZ: '捷克', SK: '斯洛伐克', HU: '匈牙利', RO: '罗马尼亚', BG: '保加利亚',
  GR: '希腊', HR: '克罗地亚', SI: '斯洛文尼亚', RS: '塞尔维亚', BA: '波黑', ME: '黑山',
  MK: '北马其顿', AL: '阿尔巴尼亚', MD: '摩尔多瓦', UA: '乌克兰', BY: '白俄罗斯',
  RU: '俄罗斯', LT: '立陶宛', LV: '拉脱维亚', EE: '爱沙尼亚',
  MT: '马耳他', MC: '摩纳哥', AD: '安道尔', SM: '圣马力诺', LI: '列支敦士登', VA: '梵蒂冈',
  XK: '科索沃', GI: '直布罗陀', FO: '法罗群岛', GL: '格陵兰', AX: '奥兰群岛',
  GG: '根西', JE: '泽西', IM: '马恩岛',
  US: '美国', CA: '加拿大', MX: '墨西哥',
  CU: '古巴', DO: '多米尼加', HT: '海地', JM: '牙买加', TT: '特立尼达和多巴哥',
  BS: '巴哈马', BB: '巴巴多斯', PR: '波多黎各', AW: '阿鲁巴', CW: '库拉索', SX: '荷属圣马丁',
  BM: '百慕大', KY: '开曼群岛', TC: '特克斯和凯科斯群岛', VG: '英属维尔京群岛', VI: '美属维尔京群岛',
  AI: '安圭拉', MS: '蒙特塞拉特', AG: '安提瓜和巴布达', KN: '圣基茨和尼维斯',
  LC: '圣卢西亚', VC: '圣文森特和格林纳丁斯', GD: '格林纳达', DM: '多米尼克',
  GT: '危地马拉', HN: '洪都拉斯', SV: '萨尔瓦多', NI: '尼加拉瓜', CR: '哥斯达黎加', PA: '巴拿马',
  BZ: '伯利兹', CO: '哥伦比亚', VE: '委内瑞拉', EC: '厄瓜多尔', PE: '秘鲁', BO: '玻利维亚',
  CL: '智利', AR: '阿根廷', UY: '乌拉圭', PY: '巴拉圭', BR: '巴西', GY: '圭亚那', SR: '苏里南',
  GF: '法属圭亚那', FK: '福克兰群岛',
  AU: '澳大利亚', NZ: '新西兰', FJ: '斐济', PG: '巴布亚新几内亚', SB: '所罗门群岛',
  VU: '瓦努阿图', WS: '萨摩亚', TO: '汤加', TV: '图瓦卢', KI: '基里巴斯', NR: '瑙鲁',
  PW: '帕劳', FM: '密克罗尼西亚', MH: '马绍尔群岛', GU: '关岛', MP: '北马里亚纳群岛',
  AS: '美属萨摩亚', NC: '新喀里多尼亚', PF: '法属波利尼西亚', WF: '瓦利斯和富图纳',
  CK: '库克群岛', NU: '纽埃', TK: '托克劳', NF: '诺福克岛', PN: '皮特凯恩群岛',
  EG: '埃及', MA: '摩洛哥', DZ: '阿尔及利亚', TN: '突尼斯', LY: '利比亚', SD: '苏丹', SS: '南苏丹',
  EH: '西撒哈拉', MR: '毛里塔尼亚', ML: '马里', NE: '尼日尔', TD: '乍得', SN: '塞内加尔',
  GM: '冈比亚', GW: '几内亚比绍', GN: '几内亚', SL: '塞拉利昂', LR: '利比里亚', CI: '科特迪瓦',
  GH: '加纳', TG: '多哥', BJ: '贝宁', BF: '布基纳法索', NG: '尼日利亚', CM: '喀麦隆',
  CF: '中非', GQ: '赤道几内亚', GA: '加蓬', CG: '刚果（布）', CD: '刚果（金）',
  AO: '安哥拉', ZM: '赞比亚', MW: '马拉维', MZ: '莫桑比克', ZW: '津巴布韦', NA: '纳米比亚',
  BW: '博茨瓦纳', ZA: '南非', LS: '莱索托', SZ: '埃斯瓦蒂尼', MG: '马达加斯加',
  MU: '毛里求斯', SC: '塞舌尔', KM: '科摩罗', YT: '马约特', RE: '留尼汪',
  ET: '埃塞俄比亚', ER: '厄立特里亚', DJ: '吉布提', SO: '索马里', KE: '肯尼亚',
  UG: '乌干达', TZ: '坦桑尼亚', RW: '卢旺达', BI: '布隆迪',
  CV: '佛得角', ST: '圣多美和普林西比', SH: '圣赫勒拿',
  // 历史国家码（老电影常见）
  CS: '捷克斯洛伐克', SU: '苏联', DD: '东德', YU: '南斯拉夫', AN: '荷属安的列斯',
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
  number_of_seasons?: number
  seasons?: { season_number: number; episode_count?: number; air_date?: string | null }[]
  // 季详情（/tv/{id}/season/{n}）返回的字段
  air_date?: string | null
  episode_count?: number
  episodes?: { episode_number?: number }[]
  created_by?: { name: string }[]
  credits?: {
    crew?: { job: string; name: string }[]
    cast?: { name: string }[]
  }
}

/** 中文数字（季号常见写法：第一季 / 第十二季 / 第二十三季） */
const CN_NUM: Record<string, number> = {
  零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4,
  五: 5, 六: 6, 七: 7, 八: 8, 九: 9,
}

function cnNumber(s: string): number | null {
  if (/^\d+$/.test(s)) return Number(s)
  let total = 0
  let current = 0
  for (const ch of s) {
    if (ch === '百') {
      total += (current || 1) * 100
      current = 0
    } else if (ch === '十') {
      total += (current || 1) * 10
      current = 0
    } else if (ch in CN_NUM) {
      current = CN_NUM[ch]
    } else {
      return null
    }
  }
  return total + current
}

/** 标题里的季号：第（01）季 / 第1季 / 第一季 / Season 2 / S02 */
const SEASON_RE =
  /(?:第\s*[（(]?\s*(\d{1,3}|[零〇一二两三四五六七八九十百]+)\s*[）)]?\s*季)|(?:\bseason\s*(\d{1,3})\b)|(?:\bS(\d{1,3})\b)/i

/** 从标题里解析季号（解析不出返回 null） */
export function seasonFromTitle(title: string): number | null {
  const m = title.match(SEASON_RE)
  if (!m) return null
  const n = cnNumber(m[1] ?? m[2] ?? m[3])
  return n !== null && n >= 1 && n <= 200 ? n : null
}

/** 去掉标题里的季号，用于 TMDB 搜索（TMDB 的剧集条目不分季，带季号会搜空） */
export function stripSeasonMarker(title: string): string {
  const cleaned = title.replace(SEASON_RE, ' ').replace(/\s+/g, ' ').trim()
  return cleaned || title.trim()
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

/** 搜索候选（kind: movie | tv）
 *  season 非空时按「分季条目」处理：标题去掉季号，且不用首播年过滤
 *  （TMDB 的 first_air_date_year 是整剧首播年，分季条目用季份年份会搜空） */
export async function tmdbSearch(
  env: Env,
  kind: 'movie' | 'tv',
  query: string,
  year?: number,
  season?: number | null
): Promise<TmdbCandidate[]> {
  const q = query.trim()
  const isTv = kind === 'tv'
  const seasonNo = isTv ? (season ?? seasonFromTitle(q)) : null
  const searchQuery = isTv ? stripSeasonMarker(q) : q

  const params: Record<string, string> = { query: searchQuery || q, include_adult: 'false' }
  if (year) {
    if (kind === 'movie') params.year = String(year)
    else if (!seasonNo) params.first_air_date_year = String(year)
  }

  const run = async (p: Record<string, string>) => {
    const raw = await tmdbGet(env, `/search/${kind}`, p)
    const results = (raw as unknown as { results?: TmdbRaw[] }).results ?? []
    return results.slice(0, 8)
  }

  let results = await run(params)
  // 年份对不上时去掉年份再搜一次（首播年与条目年份不一致很常见）
  if (!results.length && params.first_air_date_year) {
    const retry = { ...params }
    delete retry.first_air_date_year
    results = await run(retry)
  }
  // 去掉季号仍搜不到，用原词兜底（极少数标题本身带「季」）
  if (!results.length && searchQuery !== q) {
    results = await run({ ...params, query: q })
  }

  return results.map((r) => ({
    externalId: String(r.id),
    title: (r.title ?? r.name ?? '').trim(),
    year: parseInt(((r.release_date ?? r.first_air_date ?? '') + '0000').slice(0, 4), 10) || null,
    coverThumb: r.poster_path ? `https://image.tmdb.org/t/p/w185${r.poster_path}` : null,
    overview: (r.overview ?? '').slice(0, 120),
    rating: typeof r.vote_average === 'number' && r.vote_average > 0 ? r.vote_average : null,
  }))
}

/** 拉取详情并映射到本项目的字段（只返回源上有值的字段）
 *  season 非空时，集数 / 年份 / 封面优先取该季的数据：
 *  TMDB 的整剧 number_of_episodes 是各季总和，不能直接填给单季条目 */
export async function tmdbDetails(
  env: Env,
  kind: 'movie' | 'tv',
  externalId: string,
  season?: number | null
): Promise<TmdbDetails> {
  const raw = await tmdbGet(env, `/${kind}/${externalId}`, { append_to_response: 'credits' })
  const date = raw.release_date ?? raw.first_air_date ?? ''
  const year = parseInt(date.slice(0, 4), 10) || undefined
  const genreMap = kind === 'movie' ? MOVIE_GENRES : TV_GENRES
  const fields: TmdbDetails['fields'] = {}
  const seasonNo = kind === 'tv' && season && season > 0 ? season : null

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

  let displayTitle = (raw.title ?? raw.name ?? '').trim()
  if (seasonNo) {
    displayTitle = `${displayTitle} · 第 ${seasonNo} 季`
    let seasonRaw: TmdbRaw | null = null
    try {
      seasonRaw = await tmdbGet(env, `/tv/${externalId}/season/${seasonNo}`)
    } catch {
      seasonRaw = null // 季数据拿不到时退回整剧数据（仅单季剧安全）
    }
    if (seasonRaw) {
      const eps = seasonRaw.episodes?.length ?? seasonRaw.episode_count
      if (eps && eps > 0) fields.episode_count = eps
      const seasonYear = parseInt((seasonRaw.air_date ?? '').slice(0, 4), 10) || undefined
      if (seasonYear) fields.year = seasonYear
      else if (seasonNo > 1) delete fields.year // 多季剧的首播年不能代表该季
      if (seasonRaw.poster_path) fields.cover_url = `${IMG_BASE}${seasonRaw.poster_path}`
    } else {
      if (raw.number_of_seasons === 1 && raw.number_of_episodes) {
        fields.episode_count = raw.number_of_episodes
      } else if (seasonNo > 1) {
        delete fields.year
      }
    }
  } else if (kind === 'tv' && raw.number_of_episodes) {
    fields.episode_count = raw.number_of_episodes
  }

  return {
    displayTitle,
    overview: (raw.overview ?? '').slice(0, 200),
    rating: typeof raw.vote_average === 'number' && raw.vote_average > 0 ? raw.vote_average : null,
    fields,
  }
}

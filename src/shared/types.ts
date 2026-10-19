// 前后端共享的类型与枚举

export const CATEGORIES = ['movie', 'series', 'anime', 'variety', 'novel', 'manga'] as const
export type Category = (typeof CATEGORIES)[number]

export const CATEGORY_LABELS: Record<Category, string> = {
  movie: '电影',
  series: '剧集',
  anime: '动漫',
  variety: '综艺',
  novel: '小说',
  manga: '漫画',
}

/** 类别定义：存于 settings 表，任何部署者可自定义（默认六类只是初始值） */
export interface CategoryDef {
  /** 稳定标识，items.category 引用它；不含中文 */
  id: string
  /** 显示名，任意语言 */
  label: string
  /** 隐藏后不出现在页签/表单，已有条目与数据保留 */
  hidden?: boolean
  /** 该类别是否显示「完结状态」字段（如小说/漫画的连载状态） */
  finish?: boolean
  /** 该类别是否显示「作者」字段 */
  author?: boolean
  /** 该类别是否显示「导演」字段 */
  director?: boolean
  /** 该类别是否显示「主演」字段 */
  actor?: boolean
}

export const DEFAULT_CATEGORIES: CategoryDef[] = [
  { id: 'movie', label: '电影', director: true, actor: true },
  { id: 'series', label: '剧集', director: true, actor: true },
  { id: 'anime', label: '动漫', director: true, actor: true },
  { id: 'variety', label: '综艺', director: true, actor: true },
  { id: 'novel', label: '小说', finish: true, author: true },
  { id: 'manga', label: '漫画', finish: true, author: true },
]

export const STATUSES = ['want', 'watching', 'done', 'dropped'] as const
export type Status = (typeof STATUSES)[number]

export const STATUS_LABELS: Record<Status, string> = {
  want: '想看',
  watching: '在看',
  done: '看过',
  dropped: '弃了',
}

export const FINISH_STATUSES = ['finished', 'ongoing', 'ruined'] as const
export type FinishStatus = (typeof FINISH_STATUSES)[number]

export const FINISH_LABELS: Record<FinishStatus, string> = {
  finished: '完结',
  ongoing: '连载',
  ruined: '烂尾',
}

/** 观看渠道预设建议（输入框提示用，可自由填写） */
export const CHANNEL_SUGGESTIONS = [
  '影院', '腾讯视频', '爱奇艺', '优酷', '哔哩哔哩', '芒果TV', 'Netflix', 'Disney+', '网盘', '电视直播',
]

/** 类型标签预设（可自由扩展，管理页可改名合并） */
export const TAG_PRESETS = [
  '剧情', '喜剧', '爱情', '动作', '科幻', '奇幻', '悬疑', '惊悚', '恐怖', '犯罪',
  '冒险', '动画', '家庭', '战争', '历史', '古装', '武侠', '音乐', '歌舞', '传记',
  '运动', '美食', '纪录片', '真人秀', '脱口秀', '日常', '治愈', '热血', '校园', '职场',
]

/** 地区预设（用户要求中国大陆/中国香港/中国台湾命名） */
export const REGION_PRESETS = [
  '中国大陆', '中国香港', '中国台湾', '日本', '韩国', '美国', '英国', '法国',
  '德国', '意大利', '西班牙', '加拿大', '澳大利亚', '俄罗斯', '印度', '泰国', '其他',
]

export interface Item {
  id: number
  title: string
  category: string
  year: number | null
  season: number | null
  regions: string[]
  tags: string[]
  authors: string[]
  directors: string[]
  actors: string[]
  status: Status
  progress: string
  episode_count: number | null
  rating: number | null
  cover_url: string
  channel: string
  finish_status: FinishStatus | null
  notes: string
  review: string
  tmdb_id: string | null
  bgm_id: number | null
  /** 外部源评分（TMDB/Bangumi），与个人评分分开 */
  external_rating: number | null
  created_at: string
  updated_at: string
  /** 列表页附带：最近一次观看日期 */
  last_watched?: string | null
  /** 详情页附带 */
  viewings?: Viewing[]
  lists?: { id: number; name: string }[]
  activity?: Activity[]
}

/** 自动补全 */
export type AutofillSource = 'tmdb' | 'bangumi'

export interface AutofillCandidate {
  externalId: string
  title: string
  year: number | null
  coverThumb: string | null
  overview: string
  rating: number | null
  /** 分季条目的季号 / 该季集数 / 该季开播年份（仅影视候选预览时附带） */
  seasonNumber?: number | null
  seasonEpisodeCount?: number | null
  seasonYear?: number | null
}

export interface AutofillFieldOption {
  key: string
  label: string
  preview: string
}

export interface AutofillFieldOptions {
  available: AutofillFieldOption[]
  filled: AutofillFieldOption[]
  displayTitle: string
  externalRating: number | null
}

export interface AutofillApplyResult {
  applied: Record<string, { before: unknown; after: unknown }>
  skipped: string[]
  logId: number
}

export interface AutofillLog {
  id: number
  source: string
  external_id: string
  fields: Record<string, { before: unknown; after: unknown }>
  applied_at: string
  undone_at: string | null
}

export const AUTOFILL_FIELD_LABELS: Record<string, string> = {
  cover_url: '封面',
  year: '年份',
  regions: '地区',
  tags: '类型标签',
  directors: '导演',
  actors: '主演',
  authors: '作者',
  episode_count: '总集数',
  external_rating: '外部评分',
  tmdb_id: 'TMDB ID',
  bgm_id: 'Bangumi ID',
}

export interface Viewing {
  id: number
  item_id: number
  watched_on: string
  comment: string
  created_at: string
}

export interface Activity {
  id: number
  item_id: number | null
  action: string
  detail: string
  created_at: string
}

export interface ItemList {
  id: number
  name: string
  description: string
  created_at: string
  item_count?: number
}

export interface PagedItems {
  total: number
  page: number
  page_size: number
  items: Item[]
}

/** 多值字段的可选值与计数 */
export type FieldName = 'tags' | 'regions' | 'authors' | 'directors' | 'actors' | 'channel'
export type ValueCount = [string, number]

export interface Facets {
  categories: ValueCount[]
  tags: ValueCount[]
  regions: ValueCount[]
  authors: ValueCount[]
  directors: ValueCount[]
  actors: ValueCount[]
  channels: ValueCount[]
  year_min: number | null
  year_max: number | null
  /** 有年份的条目数（年份区间筛选的上限） */
  year_count: number
}

export interface Stats {
  kpi: {
    total: number
    done: number
    want: number
    watching: number
    dropped: number
    done_this_year: number
  }
  by_year: { year: string; viewings: number; items: number }[]
  by_category: { key: string; count: number }[]
  by_region: ValueCount[]
  by_tag: ValueCount[]
  by_author: ValueCount[]
  by_director: ValueCount[]
  by_actor: ValueCount[]
  by_rating: { rating: number; count: number }[]
  unrated: number
  want_by_month: { month: string; count: number; cumulative: number }[]
}

/** 通用筛选参数（前后端共用语义） */
export interface ItemFilters {
  q?: string
  category?: string[]
  status?: string[]
  year_min?: number
  year_max?: number
  regions?: string[]
  tags?: string[]
  authors?: string[]
  directors?: string[]
  actors?: string[]
  tag_mode?: 'any' | 'all'
  region_mode?: 'any' | 'all'
  author_mode?: 'any' | 'all'
  director_mode?: 'any' | 'all'
  actor_mode?: 'any' | 'all'
  rating_min?: number
  rating_max?: number
  has_cover?: boolean
  has_review?: boolean
  channel?: string
  finish_status?: string[]
  list_id?: number
  watched_from?: string
  watched_to?: string
  sort?: 'created_at' | 'updated_at' | 'title' | 'year' | 'rating' | 'watched'
  order?: 'asc' | 'desc'
}

import type {
  Activity,
  CategoryDef,
  Facets,
  Item,
  ItemFilters,
  ItemList,
  PagedItems,
  Stats,
  Viewing,
} from '../shared/types'

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: 'same-origin',
    ...init,
    headers: init?.body ? { 'Content-Type': 'application/json', ...init?.headers } : init?.headers,
  })
  if (res.status === 204) return undefined as T
  const isJson = res.headers.get('content-type')?.includes('application/json')
  const data = isJson ? await res.json().catch(() => null) : null
  if (!res.ok) {
    // 会话过期：除登录/状态接口外的 401 直接回登录页，避免页面到处报「未登录」
    if (res.status === 401 && !path.startsWith('/api/auth/')) {
      window.location.href = '/login'
    }
    throw new ApiError(res.status, (data as { error?: string })?.error ?? `请求失败（${res.status}）`)
  }
  return data as T
}

/** 筛选对象 → 查询串（数组逗号连接，空值跳过） */
export function filtersToQuery(f: ItemFilters): string {
  const sp = new URLSearchParams()
  if (f.q) sp.set('q', f.q)
  const listKeys = ['category', 'status', 'regions', 'tags', 'authors', 'directors', 'actors', 'finish_status'] as const
  for (const k of listKeys) {
    const v = f[k]
    if (v && v.length) sp.set(k, v.join(','))
  }
  if (f.tag_mode && f.tags?.length) sp.set('tag_mode', f.tag_mode)
  if (f.region_mode && f.regions?.length) sp.set('region_mode', f.region_mode)
  if (f.author_mode && f.authors?.length) sp.set('author_mode', f.author_mode)
  if (f.director_mode && f.directors?.length) sp.set('director_mode', f.director_mode)
  if (f.actor_mode && f.actors?.length) sp.set('actor_mode', f.actor_mode)
  const scalarKeys = [
    'year_min', 'year_max', 'rating_min', 'rating_max',
    'has_cover', 'has_review', 'channel', 'list_id', 'watched_from', 'watched_to', 'sort', 'order',
  ] as const
  for (const k of scalarKeys) {
    const v = f[k]
    if (v !== undefined && v !== null && v !== '') sp.set(k, String(v))
  }
  return sp.toString()
}

export interface AuthStatus {
  authenticated: boolean
  has_api_token: boolean
}

export const api = {
  status: () => req<AuthStatus>('/api/auth/status'),
  login: (password: string) =>
    req<{ ok: boolean }>('/api/auth/login', { method: 'POST', body: JSON.stringify({ password }) }),
  logout: () => req<{ ok: boolean }>('/api/auth/logout', { method: 'POST' }),
  changePassword: (current: string, next: string) =>
    req<{ ok: boolean }>('/api/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ current, next }),
    }),

  listItems: (f: ItemFilters, page: number, pageSize: number) =>
    req<PagedItems>(`/api/items?${filtersToQuery(f)}&page=${page}&page_size=${pageSize}`),
  getItem: (id: number) =>
    req<Item & { viewings: Viewing[]; lists: { id: number; name: string }[]; activity: Activity[] }>(
      `/api/items/${id}`
    ),
  createItem: (body: Partial<Item>) =>
    req<Item>('/api/items', { method: 'POST', body: JSON.stringify(body) }),
  updateItem: (id: number, body: Partial<Item>) =>
    req<Item>(`/api/items/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  deleteItem: (id: number) => req<{ ok: boolean }>(`/api/items/${id}`, { method: 'DELETE' }),
  random: (f: ItemFilters) => req<Item>(`/api/items/random?${filtersToQuery(f)}`),

  addViewing: (itemId: number, body: { watched_on: string; comment: string }) =>
    req<Viewing>(`/api/items/${itemId}/viewings`, { method: 'POST', body: JSON.stringify(body) }),
  deleteViewing: (itemId: number, vid: number) =>
    req<{ ok: boolean }>(`/api/items/${itemId}/viewings/${vid}`, { method: 'DELETE' }),

  lists: () => req<ItemList[]>('/api/lists'),
  getList: (id: number) => req<ItemList & { items: (Item & { added_at: string })[] }>(`/api/lists/${id}`),
  createList: (body: { name: string; description: string }) =>
    req<ItemList>('/api/lists', { method: 'POST', body: JSON.stringify(body) }),
  updateList: (id: number, body: { name?: string; description?: string }) =>
    req<{ ok: boolean }>(`/api/lists/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  deleteList: (id: number) => req<{ ok: boolean }>(`/api/lists/${id}`, { method: 'DELETE' }),
  addListItems: (id: number, item_ids: number[]) =>
    req<{ ok: boolean }>(`/api/lists/${id}/items`, { method: 'POST', body: JSON.stringify({ item_ids }) }),
  removeListItem: (id: number, itemId: number) =>
    req<{ ok: boolean }>(`/api/lists/${id}/items/${itemId}`, { method: 'DELETE' }),

  facets: () => req<Facets>('/api/fields/facets'),
  getSettings: () => req<{ categories: CategoryDef[]; aliases: Record<string, string> }>('/api/settings'),
  saveCategories: (categories: CategoryDef[]) =>
    req<{ categories: CategoryDef[] }>('/api/settings/categories', {
      method: 'PUT',
      body: JSON.stringify({ categories }),
    }),
  saveAliases: (aliases: Record<string, string>) =>
    req<{ aliases: Record<string, string> }>('/api/settings/aliases', {
      method: 'PUT',
      body: JSON.stringify({ aliases }),
    }),
  normalizePeople: () => req<{ updated: number }>('/api/settings/aliases/normalize', { method: 'POST' }),
  fieldValues: (field: string) => req<[string, number][]>(`/api/fields/values?field=${field}`),
  renameField: (field: string, from: string | string[], to: string) =>
    req<{ updated: number }>(`/api/fields/rename?field=${field}`, {
      method: 'POST',
      body: JSON.stringify({ from, to }),
    }),

  stats: () => req<Stats>('/api/stats'),
}

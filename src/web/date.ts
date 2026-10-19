/** 应用统一按东八区展示日期/时间（数据存 UTC ISO） */
export function todayLocal(): string {
  return new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10)
}

export function fmtDateTime(iso: string): string {
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return iso.slice(0, 16).replace('T', ' ')
  return new Date(t + 8 * 3600 * 1000).toISOString().slice(0, 16).replace('T', ' ')
}

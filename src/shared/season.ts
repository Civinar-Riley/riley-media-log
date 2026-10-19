/** 标题里的季号：第（01）季 / 第1季 / 第一季 / Season 2
 *  不匹配裸 S02：容易把「Galaxy S23」这类型号当成季号 */
const SEASON_RE =
  /(?:第\s*[（(]?\s*(\d{1,3}|[零〇一二两三四五六七八九十百]+)\s*[）)]?\s*季)|(?:\bseason\s*(\d{1,3})\b)/i

const CN_NUM: Record<string, number> = {
  零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4,
  五: 5, 六: 6, 七: 7, 八: 8, 九: 9,
}

/** 中文数字（第一季 / 第十二季 / 第二十三季） */
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

/** 从标题里解析季号（解析不出返回 null） */
export function seasonFromTitle(title: string): number | null {
  const m = title.match(SEASON_RE)
  if (!m) return null
  const n = cnNumber(m[1] ?? m[2])
  return n !== null && n >= 1 && n <= 200 ? n : null
}

const SEASON_RE_G = new RegExp(SEASON_RE.source, 'gi')

/** 去掉标题里的季号，用于 TMDB 搜索（TMDB 的剧集条目不分季，带季号会搜空） */
export function stripSeasonMarker(title: string): string {
  const cleaned = title
    .replace(SEASON_RE_G, ' ')
    .replace(/[（(【\[]\s*[）)】\]]/g, ' ') // 清掉只包着季号的空括号
    .replace(/\s+/g, ' ')
    .trim()
  return cleaned || title.trim()
}

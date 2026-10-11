import { pinyin } from 'pinyin-pro'

/** 全拼小写串，用于中文拼音搜索，如「漫长的季节」→ manchangdejijie */
export function toPinyinText(title: string): string {
  try {
    return pinyin(title, { toneType: 'none', type: 'array' })
      .join('')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
  } catch {
    return ''
  }
}

/** 拼音首字母，用于排序与 A-Z 分组，如「漫长的季节」→ M */
export function toPinyinInitial(title: string): string {
  try {
    const letter = pinyin(title, { pattern: 'first', toneType: 'none', type: 'array' })
      .join('')
      .toUpperCase()
      .replace(/[^A-Z]/g, '')
    return letter ? letter[0] : '#'
  } catch {
    return '#'
  }
}

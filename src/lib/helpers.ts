import type { ReadingDay } from '@/types'

export function uid(prefix = ''): string {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

export function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function formatDate(ts: number): string {
  const d = new Date(ts)
  return `${d.getMonth() + 1}月${d.getDate()}日`
}

/** 连续阅读天数：从今天或昨天开始往前数连续的打卡日期 */
export function calcStreak(days: ReadingDay[]): number {
  if (days.length === 0) return 0
  const set = new Set(days.map((d) => d.date))
  const cur = new Date()
  // 今天没打卡也没关系，从昨天开始数
  if (!set.has(dateStr(cur))) cur.setDate(cur.getDate() - 1)
  if (!set.has(dateStr(cur))) return 0
  let streak = 0
  while (set.has(dateStr(cur))) {
    streak++
    cur.setDate(cur.getDate() - 1)
  }
  return streak
}

function dateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function daysSince(ts: number): number {
  return Math.max(0, Math.floor((Date.now() - ts) / 86400000))
}

export const COVER_COLORS = [
  '#2E5E4E', '#7C4D3A', '#3A5A7C', '#6B4E71', '#8A6D3B',
  '#4A6670', '#95516A', '#5B7B4C', '#7A5C3E', '#44546A',
]

export function pickColor(seed: string): string {
  let h = 0
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return COVER_COLORS[h % COVER_COLORS.length]
}

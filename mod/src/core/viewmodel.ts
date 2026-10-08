import { barStatus, clampBudget, type BarStatus } from './budget'

export type Window = { used: number; resetsAt?: string }

export type UsageView = {
  weekly?: Window // real seven_day percentage
  fiveHour?: Window // real five_hour percentage
  updatedAt: number
}

export type Budgets = { weekly: number; fiveHour: number } // percent of each limit the account may use

export const DEFAULT_BUDGETS: Budgets = { weekly: 70, fiveHour: 80 }

export type TierView = { level: number; name: string; auto: boolean; reason: string; summary: string; calibrating: boolean }

export type BarRow = {
  key: keyof Budgets
  label: string
  used: number | undefined
  budget: number
  status: BarStatus
  bar: string
  text: string
  color: 'success' | 'warning' | 'error' | 'subtle'
}

// "██████░░░░": the filled part is used/budget, clamped to the bar's width; an exceeded budget ends in "!".
export function bar(ratio: number, width: number): string {
  const w = Math.max(4, Math.floor(width))
  const filled = Math.min(w, Math.max(0, Math.round(ratio * w)))
  const body = '█'.repeat(filled) + '░'.repeat(w - filled)
  return ratio > 1 ? body.slice(0, w - 1) + '!' : body
}

const f1 = (n: number) => (Math.round(n * 10) / 10).toString()

// Local "dd.mm HH:MM" of an ISO instant; tzOffsetMinutes as Date#getTimezoneOffset.
export function fmtReset(iso: string | undefined, tzOffsetMinutes: number): string {
  if (!iso) return ''
  const ms = Date.parse(iso)
  if (Number.isNaN(ms)) return ''
  const s = new Date(ms - tzOffsetMinutes * 60000).toISOString()
  return `${s.slice(8, 10)}.${s.slice(5, 7)} ${s.slice(11, 16)}`
}

const COLOR = { ok: 'success', warn: 'warning', over: 'error' } as const

export function usageRows(v: UsageView | null, b: Budgets, width: number, tzOffsetMinutes = 0): BarRow[] {
  const row = (key: keyof Budgets, label: string, w: Window | undefined): BarRow => {
    const budget = b[key]
    if (!w) return { key, label, used: undefined, budget, status: { ratio: 0, level: 'ok' }, bar: bar(0, width), text: 'no data', color: 'subtle' }
    const status = barStatus(w.used, budget)
    const over = status.level === 'over' ? ` · budget exceeded (+${f1(w.used - budget)})` : ''
    const reset = w.resetsAt ? ` · resets ${fmtReset(w.resetsAt, tzOffsetMinutes)}` : ''
    return { key, label, used: w.used, budget, status, bar: bar(status.ratio, width), text: `${f1(w.used)}% / ${f1(budget)}%${over}${reset}`, color: COLOR[status.level] }
  }
  return [row('weekly', 'Weekly', v?.weekly), row('fiveHour', '5-hour', v?.fiveHour)]
}

// Slider substitute: Mods has no slider element, so budgets move by buttons.
export function adjustBudget(b: Budgets, key: keyof Budgets, delta: number): Budgets {
  return { ...b, [key]: clampBudget(b[key] + delta, 1, 100) }
}

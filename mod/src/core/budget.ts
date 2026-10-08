export function daysUntilReset(resetsAtIso: string | undefined, nowMs: number): number | undefined {
  if (!resetsAtIso) return undefined
  const ms = Date.parse(resetsAtIso) - nowMs
  return Number.isNaN(ms) ? undefined : Math.max(0, ms / 86400000)
}

export type BarStatus = { ratio: number; level: 'ok' | 'warn' | 'over' }

// A bar's colour against its budget: warn from 80 %, over past it.
export function barStatus(used: number, budget: number, warnAt = 0.8): BarStatus {
  if (!(budget > 0)) return { ratio: 0, level: 'ok' }
  const ratio = used / budget
  return { ratio, level: ratio > 1 ? 'over' : ratio >= warnAt ? 'warn' : 'ok' }
}

export const clampBudget = (v: number, step = 1, max = 100) => Math.min(max, Math.max(0, Math.round(v / step) * step))

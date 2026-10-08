import type { TierConfig, TiersFile } from './types'

export type TierState = {
  level: number // 0 = normal
  auto: boolean
  manualLevel: number | null
}

export type TierDecision = {
  state: TierState
  changed: boolean
  reason: string // always shown to the user
}

export const initialTierState = (): TierState => ({ level: 0, auto: true, manualLevel: null })

const byLevel = (c: TiersFile, level: number): TierConfig | undefined => c.tiers.find(t => t.level === level)
const nameOf = (c: TiersFile, level: number) => (level === 0 ? 'Normal' : byLevel(c, level)?.name ?? `Tier ${level}`)
const pct = (r: number) => `${Math.round(r * 100)}%`

// Called once per step with the projected-total / budget ratio.
// Hysteresis: a level is entered at `enterAt` and left only below `exitAt`.
export function decideTier(c: TiersFile, s: TierState, ratio: number): TierDecision {
  const maxLevel = c.tiers.length
  if (!s.auto) {
    const level = Math.min(Math.max(s.manualLevel ?? s.level, 0), maxLevel)
    return finish(c, s, level, `Set manually: ${nameOf(c, level)}. Automatic savings is off.`)
  }

  let level = s.level

  // climb: jump to the highest tier whose enter threshold is reached
  for (const t of c.tiers) if (ratio >= t.enterAt && t.level > level) level = t.level

  // descend: leave a level one at a time, only once ratio is below its exit threshold
  while (level > 0 && level === s.level) {
    const t = byLevel(c, level)!
    if (ratio < t.exitAt) level -= 1
    else break
  }

  let reason: string
  if (level === s.level) {
    reason = level === 0 ? `The budget is enough (estimate ${pct(ratio)}).` : `Staying on ${nameOf(c, level)} (estimate ${pct(ratio)}).`
  } else if (level > s.level) {
    const t = byLevel(c, level)!
    reason = `Moved up to ${nameOf(c, level)}: the estimated total is ${pct(ratio)} of the budget, threshold ${pct(t.enterAt)}.`
  } else {
    const from = byLevel(c, s.level)!
    reason = `Moved down to ${nameOf(c, level)}: the estimate is ${pct(ratio)}, below the ${nameOf(c, s.level)} exit threshold of ${pct(from.exitAt)}.`
  }
  return finish(c, s, level, reason)
}

function finish(c: TiersFile, s: TierState, level: number, reason: string): TierDecision {
  const changed = level !== s.level
  return {
    state: { ...s, level },
    changed,
    reason,
  }
}

export function tierRules(c: TiersFile, level: number): string[] {
  if (level === 0) return []
  // a higher tier includes every rule of the lower ones
  return c.tiers.filter(t => t.level <= level).flatMap(t => t.rules).concat(c.qualityFloor)
}

export function denyTools(c: TiersFile, level: number): string[] {
  return [...new Set(c.tiers.filter(t => t.level <= level).flatMap(t => t.denyTools))]
}

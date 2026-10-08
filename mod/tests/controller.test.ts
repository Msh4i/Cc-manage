import { describe, test, expect } from 'claude-code/testing'
import { initialCtl, onStep, setAuto, setManualLevel, type Ctl, type Snapshot, type StepInput } from '../src/core/controller'
import { parseTiers } from '../src/core/config'
import { near } from './helpers'

const cfg = parseTiers(JSON.stringify({
  version: 1, safetyFactor: 1.25, movingAverageWindow: 5, qualityFloor: ['q'],
  tiers: [
    { level: 1, name: 'Light', enterAt: 0.9, exitAt: 0.8, description: '', rules: ['r1'], effort: null, model: null, denyTools: [] },
    { level: 2, name: 'Medium', enterAt: 1.05, exitAt: 0.95, description: '', rules: ['r2'], effort: 'medium', model: null, denyTools: [] },
    { level: 3, name: 'Strict', enterAt: 1.25, exitAt: 1.1, description: '', rules: ['r3'], effort: 'low', model: null, denyTools: ['Agent'] },
  ],
}))

// Runs a fake session: every step costs `usdPerStep`; the weekly percentage rises `ptsPerUsd` per USD from `weekly0`,
// the five-hour one `fivePerUsd` per USD from `five0` (left out: no five-hour reading).
function run(opts: { steps: number; usdPerStep: number; ptsPerUsd: number; budgets: StepInput['budgets']; remaining: number; weekly0?: number; five0?: number; fivePerUsd?: number; start?: Ctl }) {
  let ctl = opts.start ?? initialCtl()
  let usd = 0
  const snaps: Snapshot[] = []
  for (let s = 0; s < opts.steps; s++) {
    const input: StepInput = {
      sessionUsd: usd, accountUsd: usd, remainingSteps: opts.remaining, budgets: opts.budgets,
      weeklyPercent: (opts.weekly0 ?? 10) + usd * opts.ptsPerUsd,
      fivePercent: opts.five0 === undefined ? undefined : opts.five0 + usd * (opts.fivePerUsd ?? 0),
    }
    const r = onStep(cfg, ctl, input)
    ctl = r.ctl
    snaps.push(r.snap)
    usd += opts.usdPerStep
  }
  return { ctl, snaps, last: snaps[snaps.length - 1]! }
}
const roomy = { weekly: 100, fiveHour: 100 }

describe('controller', () => {
  test('calibrating at first: no automatic tier and it says so', () => {
    const { last, ctl } = run({ steps: 2, usdPerStep: 0.2, ptsPerUsd: 5, budgets: { weekly: 12, fiveHour: 100 }, remaining: 50 })
    expect(last.calibrating).toBe(true)
    expect(ctl.tier.level).toBe(0)
    expect(last.reason).toContain('Calibrating')
  })

  test('the weekly budget fits: stays normal after calibration and says what is left', () => {
    // 1 point per step, 60 points left, 10 steps to go: ~12.5 points
    const { last, ctl } = run({ steps: 12, usdPerStep: 0.2, ptsPerUsd: 5, budgets: { weekly: 81, fiveHour: 100 }, remaining: 10 })
    expect(last.calibrating).toBe(false)
    expect(ctl.tier.level).toBe(0)
    expect(last.summary).toContain('Weekly budget has 60 points left')
  })

  test('the weekly budget does not fit: the tier climbs and the reason names the limit', () => {
    // 1 point per step, 40 steps to go, a few points left
    const { last, ctl } = run({ steps: 12, usdPerStep: 0.2, ptsPerUsd: 5, budgets: { weekly: 30, fiveHour: 100 }, remaining: 40 })
    expect(ctl.tier.level).toBe(3)
    expect(last.summary).toContain('runs out at step')
    expect(last.reason).toContain('Limit: at this pace the weekly budget')
  })

  test('borderline: projected a little over what is left lands in a light tier', () => {
    // after 12 steps 21 points used of 31.5: 10.5 left; 8 steps * 1 point * 1.25 = 10 -> 0.95 -> tier 1 only
    const { ctl } = run({ steps: 12, usdPerStep: 0.2, ptsPerUsd: 5, budgets: { weekly: 31.5, fiveHour: 100 }, remaining: 8 })
    expect(ctl.tier.level).toBe(1)
  })

  test('the five-hour budget binds when the weekly one is fine', () => {
    // 4 % of the five-hour limit per step, 40 steps to go, 40 % left
    const { ctl, last } = run({ steps: 12, usdPerStep: 0.2, ptsPerUsd: 5, five0: 0, fivePerUsd: 20, budgets: { weekly: 100, fiveHour: 80 }, remaining: 40 })
    expect(ctl.tier.level).toBe(3)
    expect(last.reason).toContain('5-hour')
    expect(near(ctl.calib5.k, 20, 0.01)).toBe(true)
  })

  test('auto off: tier stays where the user put it', () => {
    let ctl = setManualLevel(initialCtl(), 2)
    const r = run({ steps: 12, usdPerStep: 0.2, ptsPerUsd: 5, budgets: roomy, remaining: 1, start: ctl })
    expect(r.ctl.tier.level).toBe(2)
    expect(r.last.reason).toContain('Set manually')
    ctl = setAuto(r.ctl, true)
    expect(ctl.tier.auto).toBe(true)
  })

  test('off a subscription (no limit readings) never calibrates and never auto-saves', () => {
    let ctl = initialCtl()
    for (let s = 0; s < 10; s++) {
      ctl = onStep(cfg, ctl, { sessionUsd: s, accountUsd: s, weeklyPercent: undefined, fivePercent: undefined, remainingSteps: 99, budgets: { weekly: 1, fiveHour: 1 } }).ctl
    }
    expect(ctl.tier.level).toBe(0)
    expect(ctl.calib.k).toBeNull()
  })

  test('calibration measures the real ratio', () => {
    const { ctl } = run({ steps: 12, usdPerStep: 0.2, ptsPerUsd: 5, budgets: roomy, remaining: 10 })
    expect(near(ctl.calib.k, 5, 0.01)).toBe(true)
  })

  test('before calibration a used-up budget still tightens, and loosens once raised; Strict is the most it ever does', () => {
    let ctl = initialCtl()
    const step = (weekly: number) => (ctl = onStep(cfg, ctl, { sessionUsd: 0, accountUsd: 0, weeklyPercent: 80, fivePercent: 10, remainingSteps: 5, budgets: { weekly, fiveHour: 100 } }).ctl)
    for (let i = 0; i < 6; i++) step(70)
    expect(ctl.tier.level).toBe(3)
    expect(ctl.lastReason).toContain('weekly budget used up')
    for (let i = 0; i < 5; i++) step(90)
    expect(ctl.tier.level).toBe(0)
  })
})

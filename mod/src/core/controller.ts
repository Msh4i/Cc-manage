import { estimate } from './estimator'
import { decideTier, initialTierState, type TierState } from './tiers'
import { confidence, initialCalibration, observe, type Calibration } from './calibration'
import type { TiersFile } from './types'

export type Ctl = {
  tier: TierState
  calib: Calibration // weekly percentage points per USD
  calib5: Calibration // five-hour percentage points per USD
  stepUsd: number[] // cost of each completed step, oldest first
  usdAtLastStep: number | null
  lastReason: string
}

export const initialCtl = (): Ctl => ({
  tier: initialTierState(), calib: initialCalibration(), calib5: initialCalibration(), stepUsd: [], usdAtLastStep: null, lastReason: '',
})

export type StepInput = {
  sessionUsd: number // this session's cost so far
  accountUsd: number // cost of every known session on the account (equals sessionUsd for a single session)
  weeklyPercent: number | undefined // real seven_day percentage; undefined off a subscription
  fivePercent: number | undefined // real five_hour percentage
  remainingSteps: number
  budgets: { weekly: number; fiveHour: number } // targets, in percent of each limit
}

export type Snapshot = {
  calibrating: boolean // true while neither window's percent<->USD ratio is measured yet
  summary: string
  tierChanged: boolean
  reason: string
}

const ROOM_GONE = 10 // a ratio past every threshold: the window's budget is used up
const f1 = (n: number) => (Math.round(n * 10) / 10).toString()
const known = (c: Calibration) => c.k !== null && c.k > 0 && confidence(c) !== 'none'

export const calibrating = (ctl: Ctl) => !known(ctl.calib) && !known(ctl.calib5)

// Called at the start of each model request (a "step"). Pure: returns the next state.
// Each window (weekly, five-hour) has a budget; what is left of it must hold the rest of the task. The tightest window
// sets the tier. Nothing here stops a session: the tightest tier only saves.
export function onStep(c: TiersFile, ctl: Ctl, i: StepInput): { ctl: Ctl; snap: Snapshot } {
  const calib = i.weeklyPercent === undefined ? ctl.calib : observe(ctl.calib, i.weeklyPercent, i.accountUsd)
  const calib5 = i.fivePercent === undefined ? ctl.calib5 : observe(ctl.calib5, i.fivePercent, i.accountUsd)
  const stepUsd = ctl.stepUsd.slice()
  if (ctl.usdAtLastStep !== null && i.sessionUsd >= ctl.usdAtLastStep) stepUsd.push(i.sessionUsd - ctl.usdAtLastStep)

  const windows = [
    { label: 'weekly', fmt: (n: number) => `${f1(n)} points`, used: i.weeklyPercent, budget: i.budgets.weekly, cal: calib },
    { label: '5-hour', fmt: (n: number) => `${f1(n)}%`, used: i.fivePercent, budget: i.budgets.fiveHour, cal: calib5 },
  ]
  let ratio = 0
  let text = ''
  for (const w of windows) {
    if (w.used === undefined) continue
    const room = w.budget - w.used
    let r = 0
    let t = ''
    if (room <= 0) {
      // a used-up budget is a plain reading: it tightens even before calibration
      r = ROOM_GONE
      t = `${w.label} budget used up`
    } else if (known(w.cal)) {
      const k = w.cal.k as number
      const e = estimate({ spent: 0, stepCosts: stepUsd, remainingSteps: i.remainingSteps, budget: room / k, safetyFactor: c.safetyFactor, window: c.movingAverageWindow })
      r = e.ratio
      t = e.status === 'ok' && !e.willFit
        ? `at this pace the ${w.label} budget runs out at step ~${stepUsd.length + (e.stepsAffordable ?? 0)}`
        : `${w.label} budget has ${w.fmt(room)} left${e.status === 'ok' ? `, the rest of the task needs ~${w.fmt(e.projectedTotal * k)}` : ''}`
    }
    if (r > ratio || (!text && t)) {
      ratio = Math.max(ratio, r)
      text = t
    }
  }

  const isCalibrating = calibrating({ ...ctl, calib, calib5 })
  let tier = ctl.tier
  let tierChanged = false
  let reason: string
  if (!ctl.tier.auto || !isCalibrating || ratio > 0 || ctl.tier.level > 0) {
    // while calibrating only a used-up budget moves the tier, and it steps back once the budget is raised
    const d = decideTier(c, ctl.tier, ratio)
    tier = d.state
    tierChanged = d.changed
    reason = d.reason + (ctl.tier.auto && ratio > 0 && text ? ` Limit: ${text}.` : '')
  } else {
    reason = 'Calibrating: the usage rate is not measured yet, so automatic savings is waiting.'
  }
  const summary = text ? text[0]!.toUpperCase() + text.slice(1) + '.' : isCalibrating ? 'Calibrating' : ''

  return {
    ctl: { tier, calib, calib5, stepUsd, usdAtLastStep: i.sessionUsd, lastReason: reason },
    snap: { calibrating: isCalibrating, summary, tierChanged, reason },
  }
}

export function setAuto(ctl: Ctl, auto: boolean): Ctl {
  return { ...ctl, tier: { ...ctl.tier, auto, manualLevel: auto ? null : ctl.tier.level } }
}

export function setManualLevel(ctl: Ctl, level: number): Ctl {
  return { ...ctl, tier: { ...ctl.tier, auto: false, manualLevel: level } }
}

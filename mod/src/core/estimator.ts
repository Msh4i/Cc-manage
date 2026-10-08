export type EstimateInput = {
  spent: number // units already spent (percentage points or USD)
  stepCosts: number[] // units spent per completed step, oldest first
  remainingSteps: number
  budget: number
  safetyFactor: number
  window: number
}

export type Estimate = {
  status: 'ok' | 'no-data' | 'no-budget'
  avgPerStep: number
  projectedTotal: number
  ratio: number // projectedTotal / budget
  stepsAffordable: number | null // how many more steps fit in the remaining budget
  willFit: boolean
}

export function movingAverage(xs: number[], window: number): number {
  const w = xs.slice(-Math.max(1, window))
  return w.length === 0 ? 0 : w.reduce((a, b) => a + b, 0) / w.length
}

export function estimate(i: EstimateInput): Estimate {
  if (!(i.budget > 0)) {
    return { status: 'no-budget', avgPerStep: 0, projectedTotal: i.spent, ratio: 0, stepsAffordable: null, willFit: true }
  }
  if (i.stepCosts.length === 0) {
    // no per-step history yet: only what is already spent can be judged
    return { status: 'no-data', avgPerStep: 0, projectedTotal: i.spent, ratio: i.spent / i.budget, stepsAffordable: null, willFit: i.spent <= i.budget }
  }
  const avg = movingAverage(i.stepCosts, i.window)
  const projectedTotal = i.spent + avg * Math.max(0, i.remainingSteps) * i.safetyFactor
  const left = i.budget - i.spent
  const stepsAffordable = avg > 0 ? Math.max(0, Math.floor(left / avg)) : null
  return {
    status: 'ok',
    avgPerStep: avg,
    projectedTotal,
    ratio: projectedTotal / i.budget,
    stepsAffordable,
    willFit: projectedTotal <= i.budget,
  }
}

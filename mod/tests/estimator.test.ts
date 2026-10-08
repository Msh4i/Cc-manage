import { describe, test, expect } from 'claude-code/testing'
import { near } from './helpers'
import { estimate, movingAverage } from '../src/core/estimator'

const base = { safetyFactor: 1.25, window: 5 }

describe('estimator', () => {
  test('moving average uses only the last window', () => {
    expect(movingAverage([100, 1, 1, 1, 1, 1], 5)).toBe(1)
    expect(movingAverage([], 5)).toBe(0)
  })

  test('budget fits', () => {
    const e = estimate({ ...base, spent: 10, stepCosts: [1, 1, 1], remainingSteps: 10, budget: 40 })
    expect(e.projectedTotal).toBe(22.5) // 10 + 1*10*1.25
    expect(e.willFit).toBe(true)
    expect(near(e.ratio, 0.5625)).toBe(true)
  })

  test('budget does not fit', () => {
    const e = estimate({ ...base, spent: 20, stepCosts: [2, 2, 2], remainingSteps: 20, budget: 40 })
    expect(e.projectedTotal).toBe(70)
    expect(e.willFit).toBe(false)
    expect(e.stepsAffordable).toBe(10) // (40-20)/2
  })

  test('borderline: exactly equal still fits', () => {
    const e = estimate({ ...base, spent: 0, stepCosts: [4], remainingSteps: 2, budget: 10 })
    expect(e.projectedTotal).toBe(10)
    expect(e.willFit).toBe(true)
    expect(e.ratio).toBe(1)
  })

  test('no per-step data judges only what is spent', () => {
    const e = estimate({ ...base, spent: 5, stepCosts: [], remainingSteps: 10, budget: 10 })
    expect(e.status).toBe('no-data')
    expect(e.ratio).toBe(0.5)
  })

  test('no budget set', () => {
    expect(estimate({ ...base, spent: 5, stepCosts: [1], remainingSteps: 3, budget: 0 }).status).toBe('no-budget')
  })

  test('no remaining steps adds nothing', () => {
    const e = estimate({ ...base, spent: 8, stepCosts: [5], remainingSteps: 0, budget: 10 })
    expect(e.projectedTotal).toBe(8)
  })
})

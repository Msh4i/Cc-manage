import { describe, test, expect } from 'claude-code/testing'
import { near } from './helpers'
import { barStatus, daysUntilReset, clampBudget } from '../src/core/budget'
import { initialCalibration, observe, pointsFor, confidence } from '../src/core/calibration'

describe('budget', () => {
  test('bar goes warn then over', () => {
    expect(barStatus(5, 10).level).toBe('ok')
    expect(barStatus(8, 10).level).toBe('warn')
    expect(barStatus(12, 10).level).toBe('over')
    expect(near(barStatus(12, 10).ratio, 1.2)).toBe(true)
    expect(barStatus(3, 0).level).toBe('ok')
  })

  test('days until reset', () => {
    const now = Date.parse('2026-10-07T00:00:00Z')
    expect(near(daysUntilReset('2026-10-10T00:00:00Z', now), 3)).toBe(true)
    expect(daysUntilReset(undefined, now)).toBeUndefined()
  })

  test('budget slider clamps and steps', () => {
    expect(clampBudget(72.4)).toBe(72)
    expect(clampBudget(-5)).toBe(0)
    expect(clampBudget(130)).toBe(100)
  })
})

describe('calibration', () => {
  test('no estimate until measured', () => {
    const c = initialCalibration()
    expect(pointsFor(c, 5)).toBeUndefined()
    expect(confidence(c)).toBe('none')
  })

  test('learns points per USD from real readings', () => {
    let c = observe(initialCalibration(), 10, 0) // anchor
    c = observe(c, 10.4, 0.2) // moved < 1 point: wait
    expect(c.samples).toBe(0)
    c = observe(c, 12, 1) // +2 points for $1
    c = observe(c, 14, 2) // +2 points for $1
    expect(c.samples).toBe(2)
    expect(near(c.k, 2)).toBe(true)
    expect(near(pointsFor(c, 3), 6)).toBe(true)
  })

  test('spend from elsewhere does not corrupt k', () => {
    let c = observe(initialCalibration(), 10, 0)
    c = observe(c, 12, 1)
    c = observe(c, 14, 2)
    c = observe(c, 15, 2) // percent rose, our cost did not
    expect(near(c.k, 2)).toBe(true)
    expect(c.samples).toBe(2)
  })

  test('wild sample is ignored once calibrated', () => {
    let c = observe(initialCalibration(), 0, 0)
    for (let i = 1; i <= 4; i++) c = observe(c, i * 2, i) // k = 2
    const before = c.k
    c = observe(c, c.anchorPercent! + 30, c.anchorUsd! + 1) // 30 points for $1
    expect(c.k).toBe(before)
    expect(c.outliers).toBe(1)
  })

  test('weekly reset re-anchors', () => {
    let c = observe(initialCalibration(), 90, 5)
    c = observe(c, 2, 6)
    expect(c.anchorPercent).toBe(2)
    expect(c.samples).toBe(0)
  })
})

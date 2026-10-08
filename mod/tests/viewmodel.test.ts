import { describe, test, expect } from 'claude-code/testing'
import { adjustBudget, bar, DEFAULT_BUDGETS, fmtReset, usageRows } from '../src/core/viewmodel'

describe('view model', () => {
  test('bar fills in proportion and marks an exceeded budget', () => {
    expect(bar(0.5, 10)).toBe('█████░░░░░')
    expect(bar(0, 10)).toBe('░░░░░░░░░░')
    expect(bar(1, 10)).toBe('██████████')
    expect(bar(1.4, 10)).toBe('█████████!')
  })

  test('rows: weekly ok, five hour over its own budget', () => {
    const rows = usageRows({ weekly: { used: 31.5 }, fiveHour: { used: 90 }, updatedAt: 0 }, DEFAULT_BUDGETS, 10)
    const [weekly, five] = rows
    expect(weekly!.color).toBe('success')
    expect(weekly!.text).toContain('31.5% / 70%')
    expect(five!.color).toBe('error')
    expect(five!.text).toContain('budget exceeded')
    expect(rows.length).toBe(2)
  })

  test('missing data says so instead of inventing a number', () => {
    const rows = usageRows(null, DEFAULT_BUDGETS, 10)
    expect(rows[0]!.text).toBe('no data')
    expect(rows[1]!.text).toBe('no data')
  })

  test('budget buttons step and clamp', () => {
    expect(adjustBudget(DEFAULT_BUDGETS, 'weekly', 5).weekly).toBe(75)
    expect(adjustBudget(DEFAULT_BUDGETS, 'fiveHour', -500).fiveHour).toBe(0)
    expect(adjustBudget(DEFAULT_BUDGETS, 'fiveHour', 500).fiveHour).toBe(100)
  })

  test('reset time is shown in local time', () => {
    expect(fmtReset('2026-10-10T00:30:00Z', -180)).toBe('10.10 03:30')
    expect(fmtReset(undefined, 0)).toBe('')
  })
})

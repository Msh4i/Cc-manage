import { describe, test, expect, mock } from 'claude-code/testing'
import type { On } from 'claude-code'
import { baseWorld } from './world'

const TIERS = JSON.stringify({
  version: 1, safetyFactor: 1.25, movingAverageWindow: 5, qualityFloor: ['q'],
  tiers: [{ level: 1, name: 'Light', enterAt: 0.9, exitAt: 0.8, description: '', rules: ['r'], effort: null, model: null, denyTools: [] }],
})

// A real-looking account: 31.5% of the weekly limit, 23% of the 5-hour one.
function account(on: On, weekly: number) {
  const { toasts } = baseWorld(on, TIERS)
  on('session.usage', () => ({
    value: {
      startedAt: 0,
      context: { window: 200000 },
      rateLimits: [
        { kind: 'seven_day', percentUsed: weekly, resetsAt: '2026-10-10T00:30:00Z' },
        { kind: 'five_hour', percentUsed: 23 },
      ],
      cost: { usd: 0 },
    },
  }) as never)
  return { toasts }
}

const PANE = { component: 'Pane', requestId: 'session-budget', props: { bodyColumns: 40 } } as never

describe('usage bar and panel', () => {
  test('the panel shows real weekly and 5-hour readings and the budget, on every surface', async ($, on) => {
    account(on, 31.5)
    await $.session.start({ cwd: '/x' } as never)
    for (const surface of ['terminal', 'desktop'] as const) {
      const ui = await $.ui.mount({ plugin: 'session-budget', surface, ...(PANE as object) } as never) as any
      expect(await ui.find({ type: 'Text', text: /31\.5% \/ 70%/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /23% \/ 80%/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /Savings tier/ })).toBeDefined()
      await ui.unmount()
    }
  })

  test('budget buttons move the budget up and down', async ($, on) => {
    account(on, 31.5)
    await $.session.start({ cwd: '/x' } as never)
    const ui = await $.ui.mount({ plugin: 'session-budget', surface: 'terminal', ...(PANE as object) } as never) as any
    await ui.press({ key: 'b-weekly-5' })
    expect(await ui.find({ type: 'Text', text: /31\.5% \/ 75%/ })).toBeDefined()
    await ui.press({ key: 'b-weekly--1' })
    expect(await ui.find({ type: 'Text', text: /31\.5% \/ 74%/ })).toBeDefined()
    await ui.press({ key: 'b-fiveHour-5' })
    expect(await ui.find({ type: 'Text', text: /23% \/ 85%/ })).toBeDefined()
    await ui.unmount()
  })

  test('exceeding the budget warns once and the bar turns red', async ($, on) => {
    const a = account(on, 80) // above the 70 % weekly budget
    await $.session.start({ cwd: '/x' } as never)
    expect(a.toasts.filter(t => t.includes('Weekly budget exceeded')).length).toBe(1)
    const ui = await $.ui.mount({ plugin: 'session-budget', surface: 'terminal', ...(PANE as object) } as never) as any
    expect(await ui.find({ type: 'Text', text: /budget exceeded/ })).toBeDefined()
    await ui.unmount()
  })
})

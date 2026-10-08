import { describe, test, expect, mock } from 'claude-code/testing'
import type { On } from 'claude-code'
import { baseWorld } from './world'

const TIERS = JSON.stringify({
  version: 1, safetyFactor: 1.25, movingAverageWindow: 5, qualityFloor: ['Security is never given up.'],
  tiers: [
    { level: 1, name: 'Light', enterAt: 0.9, exitAt: 0.8, description: '', rules: ['Short answers.'], effort: null, model: null, denyTools: [] },
    { level: 2, name: 'Medium', enterAt: 1.05, exitAt: 0.95, description: '', rules: ['Fewer tests.'], effort: 'medium', model: null, denyTools: [] },
    { level: 3, name: 'Strict', enterAt: 1.25, exitAt: 1.1, description: '', rules: ['Minimal.'], effort: 'low', model: null, denyTools: ['Agent'] },
  ],
})

// The world beneath the plugin: a fake account whose weekly percentage rises with spend.
function world(on: On) {
  const w = { usd: 0, pct: 62, efforts: [] as unknown[], toasts: [] as string[], status: [] as string[], agents: [] as Array<{ name: string; model?: string }> }
  const b = baseWorld(on, TIERS)
  w.toasts = b.toasts
  w.status = b.status
  w.agents = b.agents
  on('session.usage', () => ({
    value: {
      startedAt: 0,
      context: { window: 200000 },
      rateLimits: [{ kind: 'seven_day', percentUsed: w.pct }],
      cost: { usd: w.usd },
    },
  }) as never)
  on('turn.step', async function* (_$, e) {
    w.efforts.push(e.effort)
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn', usage: null } as never
  })
  return w
}

async function step($: any, w: ReturnType<typeof world>, index: number, effort: string) {
  w.usd += 0.2
  w.pct += 1 // 5 points per USD, 1 point per step
  const s = $.turn.step({ turnId: 't1', index, model: 'm', effort, messageCount: 1 })
  for await (const _ of s) { /* drain */ }
  await s.result
}

describe('hooks', () => {
  test('a tight budget lowers effort and says so; a loose one leaves it alone', async ($, on) => {
    const w = world(on)
    await $.session.start({ cwd: '/x' } as never)
    for (let i = 0; i < 12; i++) await step($, w, i, 'high')
    const last = w.efforts[w.efforts.length - 1]
    // weekly budget 70 from 62: 8 points left, 20 remaining steps at 1 point each: far over
    expect(last).toBe('low')
    expect(w.efforts[0]).toBe('high')
  })

  test('a tier change is always shown: toast with the reason, status line with the tier', async ($, on) => {
    const w = world(on)
    await $.session.start({ cwd: '/x' } as never)
    for (let i = 0; i < 12; i++) await step($, w, i, 'high')
    expect(w.toasts.some(t => t.includes('Moved up to'))).toBe(true)
    expect(w.status[w.status.length - 1]).toContain('Savings:')
  })

  test('tier 3 closes sub-agents, tier 0 does not; other tools are untouched', async ($, on) => {
    const w = world(on)
    on('tool.call', () => ({ result: {} }) as never)
    await $.session.start({ cwd: '/x' } as never)
    const before = await $.tool.call({ tool: 'Agent', description: 'd', prompt: 'p' } as never)
    expect((before as { deny?: string }).deny).toBeUndefined()
    for (let i = 0; i < 12; i++) await step($, w, i, 'high')
    const denied = await $.tool.call({ tool: 'Agent', description: 'd', prompt: 'p' } as never)
    expect(JSON.stringify(denied)).toContain('is off at this tier')
    const read = await $.tool.call({ tool: 'Read', file_path: '/x' } as never)
    expect((read as { deny?: string }).deny).toBeUndefined()
    // the cheap helpers are what saves, so they stay open
    for (const subagent_type of ['session-budget:writer', 'Explore']) {
      const helper = await $.tool.call({ tool: 'Agent', description: 'd', prompt: 'p', subagent_type } as never)
      expect((helper as { deny?: string }).deny).toBeUndefined()
    }
  })

  test('effort is never raised', async ($, on) => {
    const w = world(on)
    await $.session.start({ cwd: '/x' } as never)
    for (let i = 0; i < 12; i++) await step($, w, i, 'low')
    expect(w.efforts.every(e => e === 'low')).toBe(true)
  })

  test('the tier rules reach the system prompt', async ($, on) => {
    const w = world(on)
    on('prompt.compose', () => ({ sections: [{ id: 'intro', text: 'hi', scope: 'shared' }] }))
    await $.session.start({ cwd: '/x' } as never)
    for (let i = 0; i < 12; i++) await step($, w, i, 'high')
    const r = await $.prompt.compose({ model: 'm', promptModel: 'm', surfaces: ['terminal'], tools: [], outputStyle: null, traits: [], sections: [] } as never)
    const ids = r.sections.map((s: { id: string }) => s.id)
    expect(ids).toContain('session-budget:tier')
  })

  test('cost routing: a Haiku writer, its rule in the prompt from tier 0, Explore on Haiku', async ($, on) => {
    const w = world(on)
    on('prompt.compose', () => ({ sections: [{ id: 'intro', text: 'hi', scope: 'shared' }] }))
    await $.session.start({ cwd: '/x' } as never)
    expect(w.agents.map(a => [a.name, a.model])).toEqual([['writer', 'haiku']])
    const compose = () => $.prompt.compose({ model: 'm', promptModel: 'm', surfaces: ['terminal'], tools: [], outputStyle: null, traits: [], sections: [] } as never)
    const r0 = await compose()
    const rule = r0.sections.find((s: { id: string }) => s.id === 'session-budget:routing')
    expect(rule?.text).toContain('session-budget:writer')
    expect(r0.sections.map((s: { id: string }) => s.id)).not.toContain('session-budget:tier')
    for (let i = 0; i < 12; i++) await step($, w, i, 'high')
    const r3 = (await compose()).sections.map((s: { id: string }) => s.id)
    // the fixed rule stays ahead of the changing tier section, so a tier change does not cost its cache
    expect(r3.indexOf('session-budget:routing')).toBeLessThan(r3.indexOf('session-budget:tier'))
    const explore = await $.agent.spawn({ prompt: 'find x', subagentType: 'Explore' } as never)
    expect((explore as { model: string }).model).toBe('haiku')
    const chosen = await $.agent.spawn({ prompt: 'find x', subagentType: 'Explore', model: 'sonnet' } as never)
    expect((chosen as { model: string }).model).toBe('sonnet')
    const general = await $.agent.spawn({ prompt: 'do y', subagentType: 'general-purpose' } as never)
    expect((general as { model: string }).model).toBe('inherit')
  })

  test('rarely used tools wait behind ToolSearch; everyday ones stay in the prompt', async ($, on) => {
    world(on)
    on('tool.describe', (_$, e) => ({ description: `about ${(e as { tool: string }).tool}` }))
    await $.session.start({ cwd: '/x' } as never)
    const artifact = await $.tool.describe({ tool: 'Artifact', description: '', provider: { plugin: 'engine', tier: 'core' } } as never)
    expect(artifact).toEqual({ description: 'about Artifact', isDeferred: true })
    const bash = await $.tool.describe({ tool: 'Bash', description: '', provider: { plugin: 'engine', tier: 'core' } } as never)
    expect((bash as { isDeferred?: boolean }).isDeferred).toBeUndefined()
  })

  test('/tier shows the state, sets a level and turns auto off', async ($, on) => {
    world(on)
    await $.session.start({ cwd: '/x' } as never)
    const a = await $.command.run({ command: 'tier', args: '2', origin: { kind: 'composer' } } as never)
    expect(String((a as { text: string }).text)).toContain('Tier set manually')
    const b = await $.command.run({ command: 'tier', args: 'auto', origin: { kind: 'composer' } } as never)
    expect(String((b as { text: string }).text)).toContain('Automatic savings is on')
  })
})

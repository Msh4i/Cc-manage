import { describe, test, expect } from 'claude-code/testing'
import type { On } from 'claude-code'
import { baseWorld } from './world'
import { serializeRecord, CHAR_STATES, type SessionRecord } from '../src/core/registry'
import type { Manifest } from '../src/core/characters'

const TIERS = JSON.stringify({
  version: 1, safetyFactor: 1.25, movingAverageWindow: 5, qualityFloor: ['q'],
  tiers: [{ level: 1, name: 'Light', enterAt: 0.9, exitAt: 0.8, description: '', rules: ['r'], effort: null, model: null, denyTools: [] }],
})
const NOW = Date.parse('2026-10-07T12:00:00Z')
const SHARED = '/h/.claude-manage'
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="4"><rect width="8" height="4"/></svg>'

const manifest = (): Manifest => ({
  version: 1, defaultCharacter: 'pix', stateMap: Object.fromEntries(CHAR_STATES.map(s => [s, s])) as Manifest['stateMap'],
  characters: {
    pix: {
      name: 'Pix',
      animations: Object.fromEntries(CHAR_STATES.map(s => [s, { fps: 2, text: [`${s}-A`, `${s}-B`] }])),
      variants: { mic: { name: 'Mic', animations: { talking: { fps: 2, text: ['mic-A', 'mic-B'], svg: ['pix/talk.svg'] } } } },
    },
    other: { name: 'Other', animations: { idle: { fps: 1, text: ['o-idle'] }, working: { text: ['o-work'] } } },
  },
})

const rec = (name: string, state: SessionRecord['state']): SessionRecord => ({
  v: 1, id: name, name, task: 't', step: 's', progress: { done: 0, total: 0 }, tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  usd: 0, state, tier: 0, tierName: 'Normal', tierReason: '', tools: {}, startedAt: 0, updatedAt: NOW, ...({} as object),
})

function world(on: On) {
  const w = baseWorld(on, TIERS, { suffixFiles: { 'pix/talk.svg': SVG } })
  w.files.set('/cm.json', JSON.stringify(manifest()))
  w.files.set(`${SHARED}/sessions/talker.json`, serializeRecord(rec('talker', 'talking')))
  w.files.set(`${SHARED}/sessions/worker.json`, serializeRecord(rec('worker', 'working')))
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 1 }, rateLimits: [], cost: { usd: 0 } } }) as never)
  return w
}
const OPTS = { options: { charactersPath: '/cm.json' } }
const PANE = { component: 'Pane', requestId: 'session-budget', props: { bodyColumns: 70 } }

describe('characters in the panel', () => {
  test('each session shows the face of its own state, from the manifest', OPTS, async ($, on) => {
    world(on)
    await $.session.start({ cwd: '/work/proj' } as never)
    const ui = await $.ui.mount({ plugin: 'session-budget', surface: 'terminal', ...PANE } as never) as any
    expect(await ui.find({ type: 'Button', text: /working-A talking|worker/ })).toBeDefined()
    expect(await ui.find({ type: 'Button', text: /worker/ })).toBeDefined()
    const worker = await ui.find({ type: 'Button', text: /worker/ })
    const talker = await ui.find({ type: 'Button', text: /talker/ })
    expect(String(worker.text)).toContain('working-A')
    expect(String(talker.text)).toContain('talking-A')
    await ui.unmount()
  })

  test('frames advance with the clock while the panel is open', OPTS, async ($, on) => {
    const w = world(on)
    await $.session.start({ cwd: '/work/proj' } as never)
    const ui = await $.ui.mount({ plugin: 'session-budget', surface: 'terminal', ...PANE } as never) as any
    expect(String((await ui.find({ type: 'Button', text: /worker/ })).text)).toContain('working-A')
    await w.clock.advance(600) // fps 2: second frame
    expect(String((await ui.find({ type: 'Button', text: /worker/ })).text)).toContain('working-B')
    await ui.unmount()
  })

  test('/clawd lists, switches character and variant, and rejects unknown ones', OPTS, async ($, on) => {
    world(on)
    await $.session.start({ cwd: '/work/proj' } as never)
    const run = async (args: string) => (await $.command.run({ command: 'clawd', args, origin: { kind: 'composer' } } as never) as { text: string }).text
    expect(await run('')).toContain('pix, pix/mic, other')
    expect(await run('nope')).toContain('No such character')
    expect(await run('pix zzz')).toContain('has no such variant')
    expect(await run('pix mic')).toContain('Character: pix (mic)')
    const ui = await $.ui.mount({ plugin: 'session-budget', surface: 'terminal', ...PANE } as never) as any
    expect(String((await ui.find({ type: 'Button', text: /talker/ })).text)).toContain('mic-A') // variant face for talking
    expect(String((await ui.find({ type: 'Button', text: /worker/ })).text)).toContain('working-A') // untouched state falls back to base
    await run('other')
    expect(String((await ui.find({ type: 'Button', text: /worker/ })).text)).toContain('o-work')
    expect(String((await ui.find({ type: 'Button', text: /talker/ })).text)).toContain('o-idle') // no talking animation: idle
    await ui.unmount()
  })

  test('the desktop draws the svg of the selected session; the terminal keeps text', { options: { charactersPath: '/cm.json', character: 'pix', characterVariant: 'mic' } }, async ($, on) => {
    world(on)
    await $.session.start({ cwd: '/work/proj' } as never)
    const desk = await $.ui.mount({ plugin: 'session-budget', surface: 'desktop', ...PANE } as never) as any
    await desk.press({ key: 's-talker' })
    expect(await desk.find({ type: 'Svg' })).toBeDefined()
    await desk.unmount()
    const term = await $.ui.mount({ plugin: 'session-budget', surface: 'terminal', ...PANE } as never) as any
    await term.press({ key: 's-talker' })
    expect(await term.find({ type: 'Svg' })).toBeUndefined()
    await term.unmount()
  })

  test('a broken manifest tells the person and falls back to built-in faces', { options: { charactersPath: '/bad.json' } }, async ($, on) => {
    const w = world(on)
    w.files.set('/bad.json', '{"version":1}')
    await $.session.start({ cwd: '/work/proj' } as never)
    expect(w.toasts.some(t => t.includes('Could not read the character manifest'))).toBe(true)
    const ui = await $.ui.mount({ plugin: 'session-budget', surface: 'terminal', ...PANE } as never) as any
    expect(String((await ui.find({ type: 'Button', text: /worker/ })).text)).toContain('(•̀ᴗ•́)')
    await ui.unmount()
  })
})

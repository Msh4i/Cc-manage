import { describe, test, expect } from 'claude-code/testing'
import { composeFrame, overlay, parseAccessory, parseSprite, toRaster, toSvg, base64, type Sprite } from '../src/core/sprite'
import { applyClawdArgs, wornRefs, type Manifest } from '../src/core/characters'
import { CHAR_STATES } from '../src/core/registry'
import { baseWorld } from './world'

const S: Sprite = {
  version: 1, width: 4, height: 4, palette: { '.': null, o: '#D97757', k: '#000000' },
  animations: {
    idle: { fps: 2, frames: [['....', '.oo.', '.ok.', '....'], ['....', '.oo.', '.oo.', '....']], anchors: [[1, 1], [1, 2]] },
  },
}
const HAT = { version: 1 as const, palette: { '.': null, h: '#F2B705' }, offset: [0, -1] as [number, number], rows: ['hh'] }

describe('sprite core', () => {
  test('valid sprite and accessory parse; broken ones are refused', () => {
    expect(parseSprite(JSON.stringify(S)).value).toBeDefined()
    expect(parseSprite(JSON.stringify({ ...S, width: 5 })).errors.length > 0).toBe(true)
    expect(parseSprite(JSON.stringify({ ...S, palette: { '.': null } })).errors.join(' ')).toContain('not in the palette')
    expect(parseSprite('{').errors[0]).toContain('not JSON')
    expect(parseAccessory(JSON.stringify(HAT)).value).toBeDefined()
    expect(parseAccessory(JSON.stringify({ ...HAT, palette: { h: 'red' } })).errors.length > 0).toBe(true)
  })

  test('frames follow the clock and accessories follow the anchor', () => {
    const a = composeFrame(S, 'idle', 'idle', 0, [{ accessory: HAT }])
    expect(a.grid[0]![1]).toBe('#F2B705') // anchor (1,1) + offset (0,-1)
    const b = composeFrame(S, 'idle', 'idle', 600, [{ accessory: HAT }])
    expect(b.index).toBe(1)
    expect(b.grid[1]![1]).toBe('#F2B705') // anchor moved down with the body
  })

  test('state-limited accessories show only in their states; tint recolours them', () => {
    expect(composeFrame(S, 'idle', 'working', 0, [{ accessory: HAT, states: ['idle'] }]).grid[0]![1]).toBeNull()
    expect(composeFrame({ ...S, tint: '#00FF00' }, 'idle', 'idle', 0, [{ accessory: HAT }]).grid[0]![1]).toBe('#00FF00')
  })

  test('unknown animation falls back to idle; overlay clips at the edges', () => {
    expect(composeFrame(S, 'nope', 'x', 0).anim).toBe('idle')
    expect(overlay([[null]], [['#111111', '#222222']], 0, 0)).toEqual([['#111111']])
  })

  test('raster packs two pixel rows per cell with ▀ and default colour for transparency', () => {
    const r = toRaster([['#FF0000', null], ['#0000FF', null]])
    expect([r.columns, r.rows]).toEqual([2, 1])
    const words = [0x2580, 0xff0000, 0x0000ff, 0x20, 0x01000000, 0x01000000]
    const bytes = new Uint8Array(words.length * 4)
    words.forEach((v, i) => [0, 8, 16, 24].forEach((sh, j) => { bytes[i * 4 + j] = (v >>> sh) & 255 }))
    expect(r.cells).toBe(base64(bytes))
    expect(base64(new Uint8Array([104, 105]))).toBe('aGk=')
  })

  test('svg merges runs and keeps pixels crisp', () => {
    const svg = toSvg([['#111111', '#111111', null]], 2)
    expect(svg).toContain('width="2" height="1" fill="#111111"')
    expect(svg).toContain('crispEdges')
    expect((svg.match(/<rect/g) ?? []).length).toBe(1)
  })
})

const M: Manifest = {
  version: 1, defaultCharacter: 'c', stateMap: Object.fromEntries(CHAR_STATES.map(s => [s, s])) as Manifest['stateMap'],
  characters: { c: { name: 'C', sprite: 'c/sprite.json', animations: Object.fromEntries(CHAR_STATES.map(st => [st, { text: [st] }])), variants: { talker: { name: 'T', accessories: [{ id: 'hat', states: ['talking'] }] } } } },
}

describe('/clawd selection', () => {
  const sel = { id: '', variant: '', accessories: [] as string[] }
  test('character, variant, hand-worn accessories on and off', () => {
    let r = applyClawdArgs(M, sel, 'c talker +glasses')
    expect(r.sel).toEqual({ id: 'c', variant: 'talker', accessories: ['glasses'] })
    expect(wornRefs(M, r.sel)).toEqual([{ id: 'hat', states: ['talking'] }, { id: 'glasses' }])
    r = applyClawdArgs(M, r.sel, '-glasses -')
    expect(r.sel).toEqual({ id: 'c', variant: '', accessories: [] })
    expect(applyClawdArgs(M, sel, 'zz').error).toContain('No such character')
    expect(applyClawdArgs(M, sel, '+../x').error).toContain('Invalid')
  })
})

describe('characters drawn in the panel', () => {
  const big = { ...S, width: 4, height: 4 }
  const files = { 'cm/m.json': JSON.stringify(M), 'cm/c/sprite.json': JSON.stringify(big), 'cm/accessories/hat.json': JSON.stringify(HAT) }
  test('terminal draws a Raster, desktop an Svg; the hero is this session', { options: { charactersPath: '/cm/m.json' } }, async ($, on) => {
    const w = baseWorld(on, JSON.stringify({ version: 1, safetyFactor: 1.25, movingAverageWindow: 5, qualityFloor: ['q'], tiers: [{ level: 1, name: 'H', enterAt: 0.9, exitAt: 0.8, description: '', rules: ['r'], effort: null, model: null, denyTools: [] }] }), { suffixFiles: files })
    w.files.set('/cm/accessories/hat.json', JSON.stringify(HAT))
    on('session.usage', () => ({ value: { startedAt: 0, context: { window: 1 }, rateLimits: [], cost: { usd: 0 } } }) as never)
    await $.session.start({ cwd: '/work/proj' } as never)
    const pane = { component: 'Pane', requestId: 'session-budget', props: { bodyColumns: 60 } }
    const t = await $.ui.mount({ plugin: 'session-budget', surface: 'terminal', ...pane } as never) as any
    expect(await t.find({ type: 'Raster' })).toBeDefined()
    expect(await t.find({ type: 'Text', text: /proj-abc123 · sleeping/ })).toBeDefined()
    await t.unmount()
    const d = await $.ui.mount({ plugin: 'session-budget', surface: 'desktop', ...pane } as never) as any
    expect(await d.find({ type: 'Svg' })).toBeDefined()
    await d.unmount()
    const out = (await $.command.run({ command: 'clawd', args: '+hat', origin: { kind: 'composer' } } as never) as { text: string }).text
    expect(out).toContain('+hat')
    expect((await $.command.run({ command: 'clawd', args: '+nope', origin: { kind: 'composer' } } as never) as { text: string }).text).toContain('No such accessory')
  })
})

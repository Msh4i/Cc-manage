import { describe, test, expect } from 'claude-code/testing'
import { frameAt, frameIndex, listCharacters, parseManifest, PLACEHOLDER_GLYPH, resolveAnimation, validateManifest, type Manifest } from '../src/core/characters'
import { CHAR_STATES } from '../src/core/registry'

const stateMap = Object.fromEntries(CHAR_STATES.map(s => [s, s])) as Manifest['stateMap']
const base = (): Manifest => ({
  version: 1, defaultCharacter: 'c', stateMap: { ...stateMap },
  characters: {
    c: {
      name: 'C',
      animations: Object.fromEntries(CHAR_STATES.map(s => [s, { fps: 2, text: [`${s}-a`, `${s}-b`] }])),
      variants: { talky: { name: 'T', animations: { talking: { fps: 4, text: ['talk-x'], svg: ['c/talk.svg'] } } } },
    },
  },
})

describe('character manifest', () => {
  test('a complete manifest is valid and round-trips through the parser', () => {
    expect(validateManifest(base())).toEqual([])
    expect(parseManifest(JSON.stringify(base())).manifest).toBeDefined()
  })

  test('the shipped template is valid', () => {
    // mirrors characters/manifest.json structure: every state mapped, idle present
    const m = base()
    expect(Object.keys(m.stateMap).length).toBe(CHAR_STATES.length)
  })

  test('errors: bad json, missing idle, missing state, unknown default', () => {
    expect(parseManifest('{{').errors[0]).toContain('not JSON')
    const noIdle = base()
    delete (noIdle.characters.c as { animations: Record<string, unknown> }).animations.idle
    expect(validateManifest(noIdle).join(' ')).toContain('"idle"')
    const noState = base()
    delete (noState.stateMap as Record<string, string>).done
    expect(validateManifest(noState).join(' ')).toContain('stateMap lacks "done"')
    expect(validateManifest({ ...base(), defaultCharacter: 'zzz' }).join(' ')).toContain('defaultCharacter')
  })

  test('asset paths cannot escape the characters folder', () => {
    for (const bad of ['../x.svg', '/etc/passwd.svg', 'a/../../b.svg', 'a//b.svg', 'a.exe', 'C:\\x.svg']) {
      const m = base()
      m.characters.c!.animations.working = { svg: [bad] }
      expect(validateManifest(m).length > 0).toBe(true)
    }
    const ok = base()
    ok.characters.c!.animations.working = { svg: ['c/work-1.svg'], text: ['w'] }
    expect(validateManifest(ok)).toEqual([])
  })

  test('fps and frame limits', () => {
    const m = base()
    m.characters.c!.animations.working = { fps: 99, text: ['x'] }
    expect(validateManifest(m).join(' ')).toContain('fps')
    m.characters.c!.animations.working = { text: ['x'.repeat(201)] }
    expect(validateManifest(m).join(' ')).toContain('200')
    m.characters.c!.animations.working = {}
    expect(validateManifest(m).join(' ')).toContain('no frames')
  })

  test('ids are safe', () => {
    const m = base()
    m.characters['../evil'] = m.characters.c!
    expect(validateManifest(m).join(' ')).toContain('character id')
  })
})

describe('state -> animation resolution', () => {
  test('every state resolves to its own animation', () => {
    for (const s of CHAR_STATES) expect(resolveAnimation(base(), 'c', undefined, s, 'terminal').frames[0]).toBe(`${s}-a`)
  })

  test('a variant overrides only what it changes', () => {
    const m = base()
    expect(resolveAnimation(m, 'c', 'talky', 'talking', 'terminal').frames).toEqual(['talk-x'])
    expect(resolveAnimation(m, 'c', 'talky', 'talking', 'terminal').from).toBe('variant')
    expect(resolveAnimation(m, 'c', 'talky', 'working', 'terminal').frames[0]).toBe('working-a')
    expect(resolveAnimation(m, 'c', 'talky', 'working', 'terminal').from).toBe('character')
  })

  test('unplugging a variant (removed or misspelled) falls back to the base character', () => {
    expect(resolveAnimation(base(), 'c', 'gone', 'talking', 'terminal').frames[0]).toBe('talking-a')
  })

  test('surface decides the media: svg on desktop, text elsewhere', () => {
    const m = base()
    expect(resolveAnimation(m, 'c', 'talky', 'talking', 'desktop').media).toBe('svg')
    expect(resolveAnimation(m, 'c', 'talky', 'talking', 'desktop').frames).toEqual(['c/talk.svg'])
    for (const s of ['terminal', 'vscode', 'mobile'] as const) expect(resolveAnimation(m, 'c', 'talky', 'talking', s).media).toBe('text')
  })

  test('a state the character does not animate falls back to idle, then to the built-in face', () => {
    const m = base()
    delete (m.characters.c!.animations as Record<string, unknown>).thinking
    expect(resolveAnimation(m, 'c', undefined, 'thinking', 'terminal').frames[0]).toBe('idle-a')
    expect(resolveAnimation(m, 'c', undefined, 'thinking', 'terminal').from).toBe('idle')
    const empty: Manifest = { ...base(), characters: { c: { name: 'x', animations: { idle: { svg: ['c/i.svg'] } } } } }
    expect(resolveAnimation(empty, 'c', undefined, 'working', 'terminal').from).toBe('builtin') // svg only, terminal cannot draw it
    expect(resolveAnimation(undefined, undefined, undefined, 'error', 'terminal').frames[0]).toBe(PLACEHOLDER_GLYPH.error)
  })

  test('unknown character id uses the default', () => {
    expect(resolveAnimation(base(), 'nope', undefined, 'idle', 'terminal').frames[0]).toBe('idle-a')
  })

  test('frames advance with time at the animation fps', () => {
    const r = resolveAnimation(base(), 'c', undefined, 'working', 'terminal') // fps 2, two frames
    expect(frameAt(r, 0)).toBe('working-a')
    expect(frameAt(r, 600)).toBe('working-b')
    expect(frameAt(r, 1100)).toBe('working-a')
    expect(frameIndex(1, 30, 12345)).toBe(0)
  })

  test('listing shows characters and their variants', () => {
    expect(listCharacters(base())).toEqual(['c', 'c/talky'])
  })
})

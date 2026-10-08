import { CHAR_STATES, type CharState } from './registry'

// Character system: a manifest maps each session state to an animation of the chosen character.
// Real art (several designs, animated, with accessory variants) is dropped in later; until then the
// built-in text faces below stand in. Nothing here draws a character.

export type Surface = 'terminal' | 'desktop' | 'vscode' | 'mobile'

export type Anim = {
  fps?: number
  text?: string[] // text frames: work on every surface
  svg?: string[] // relative .svg paths: drawn on the desktop surface
  png?: string[] // relative .png paths: reserved for the terminal (resolved, drawn as text until wired)
}
export type WornRef = string | { id: string; states?: string[] } // accessory id, optionally only in some states
export type Variant = { name: string; description?: string; animations?: Record<string, Anim>; accessories?: WornRef[] }
export type Character = { name: string; author?: string; license?: string; sprite?: string; animations: Record<string, Anim>; variants?: Record<string, Variant> }
export type Manifest = {
  version: 1
  defaultCharacter: string
  stateMap: Record<CharState, string> // session state -> animation name
  characters: Record<string, Character>
}

// Last resort when a manifest has nothing usable for a state.
export const PLACEHOLDER_GLYPH: Record<CharState, string> = {
  idle: '(-.-)zZ', working: '(•̀ᴗ•́)', thinking: '(°~°)?', talking: '(•o•)…', waiting: '(•_•)', saving_mode: '(•ᴗ•)$',
  error: '(x_x)', done: '(^o^)', paused: '(-_-)||', lost: '(?_?)',
}

const ID = /^[a-z0-9][a-z0-9_-]{0,39}$/
const ASSET = /^[A-Za-z0-9_][A-Za-z0-9_./-]*\.(svg|png)$/
const safePath = (p: string) => ASSET.test(p) && !p.split('/').includes('..') && !p.includes('//')
const SPRITE = /^[A-Za-z0-9_][A-Za-z0-9_./-]*\.json$/
export const safeSpritePath = (p: string) => SPRITE.test(p) && !p.split('/').includes('..') && !p.includes('//')

function checkAnim(where: string, a: Anim, errs: string[]) {
  if (a.fps !== undefined && !(a.fps >= 0.2 && a.fps <= 30)) errs.push(`${where}: fps must be 0.2-30`)
  const n = (a.text?.length ?? 0) + (a.svg?.length ?? 0) + (a.png?.length ?? 0)
  if (n === 0) errs.push(`${where}: no frames (text, svg or png)`)
  for (const t of a.text ?? []) if (typeof t !== 'string' || t.length > 200) errs.push(`${where}: text frame must be a string up to 200 characters`)
  for (const k of ['svg', 'png'] as const) {
    for (const p of a[k] ?? []) {
      if (typeof p !== 'string' || !safePath(p) || !p.endsWith(`.${k}`)) errs.push(`${where}: unsafe or wrong ${k} path "${String(p).slice(0, 60)}"`)
    }
    if ((a[k]?.length ?? 0) > 120) errs.push(`${where}: more than 120 ${k} frames`)
  }
}

export function validateManifest(m: Manifest): string[] {
  const errs: string[] = []
  if (m.version !== 1) errs.push('version must be 1')
  if (!m.characters || typeof m.characters !== 'object') return [...errs, 'characters missing']
  if (!m.characters[m.defaultCharacter]) errs.push(`defaultCharacter "${m.defaultCharacter}" is not in characters`)
  for (const st of CHAR_STATES) if (typeof m.stateMap?.[st] !== 'string') errs.push(`stateMap lacks "${st}"`)
  for (const [id, c] of Object.entries(m.characters)) {
    if (!ID.test(id)) errs.push(`character id "${id}" must be [a-z0-9_-]`)
    if (!c.animations?.idle) errs.push(`${id}: needs an "idle" animation (the fallback for every state)`)
    for (const [an, a] of Object.entries(c.animations ?? {})) checkAnim(`${id}.${an}`, a, errs)
    if (c.sprite !== undefined && !(typeof c.sprite === 'string' && safeSpritePath(c.sprite))) errs.push(`${id}: unsafe sprite path`)
    for (const [vid, v] of Object.entries(c.variants ?? {})) {
      if (!ID.test(vid)) errs.push(`${id}: variant id "${vid}" must be [a-z0-9_-]`)
      for (const [an, a] of Object.entries(v.animations ?? {})) checkAnim(`${id}.${vid}.${an}`, a, errs)
      for (const w of v.accessories ?? []) {
        const aid = typeof w === 'string' ? w : w?.id
        if (typeof aid !== 'string' || !ID.test(aid)) errs.push(`${id}.${vid}: accessory id must be [a-z0-9_-]`)
        if (typeof w === 'object' && w.states && !w.states.every(st => (CHAR_STATES as readonly string[]).includes(st))) errs.push(`${id}.${vid}: unknown state in accessory ${aid}`)
      }
    }
  }
  const def = m.characters[m.defaultCharacter]
  if (def) for (const st of CHAR_STATES) {
    const an = m.stateMap?.[st]
    if (an && !def.animations[an]) errs.push(`stateMap "${st}" -> "${an}": the default character has no such animation`)
  }
  return errs
}

export function parseManifest(text: string): { manifest?: Manifest; errors: string[] } {
  let m: Manifest
  try {
    m = JSON.parse(text) as Manifest
  } catch (e) {
    return { errors: [`manifest is not JSON: ${String((e as Error).message).slice(0, 80)}`] }
  }
  const errors = validateManifest(m)
  return errors.length ? { errors } : { manifest: m, errors }
}

export type Resolved = {
  anim: Anim
  media: 'text' | 'svg' | 'png'
  frames: string[] // text, or asset paths
  fps: number
  from: 'variant' | 'character' | 'idle' | 'builtin'
}

// What a surface can draw from an animation, best first. The terminal draws text until png support is wired.
function usable(a: Anim | undefined, surface: Surface): { media: 'text' | 'svg' | 'png'; frames: string[] } | undefined {
  if (!a) return undefined
  if (surface === 'desktop' && a.svg?.length) return { media: 'svg', frames: a.svg }
  if (a.text?.length) return { media: 'text', frames: a.text }
  return undefined
}

// variant override -> character animation -> character idle -> built-in text face. Never throws, never returns nothing.
export function resolveAnimation(m: Manifest | undefined, charId: string | undefined, variantId: string | undefined, state: CharState, surface: Surface): Resolved {
  const builtin: Resolved = { anim: { text: [PLACEHOLDER_GLYPH[state]] }, media: 'text', frames: [PLACEHOLDER_GLYPH[state]], fps: 1, from: 'builtin' }
  if (!m) return builtin
  const c = m.characters[charId && m.characters[charId] ? charId : m.defaultCharacter]
  if (!c) return builtin
  const v = variantId ? c.variants?.[variantId] : undefined
  const name = m.stateMap[state] ?? state
  const tries: Array<[Anim | undefined, Resolved['from']]> = [
    [v?.animations?.[name], 'variant'],
    [c.animations[name], 'character'],
    [v?.animations?.idle, 'idle'],
    [c.animations.idle, 'idle'],
  ]
  for (const [a, from] of tries) {
    const u = usable(a, surface)
    if (a && u) return { anim: a, media: u.media, frames: u.frames, fps: a.fps ?? 2, from }
  }
  return builtin
}

export const frameIndex = (len: number, fps: number, nowMs: number): number =>
  len <= 1 ? 0 : Math.floor((nowMs / 1000) * fps) % len

export function frameAt(r: Resolved, nowMs: number): string {
  return r.frames[frameIndex(r.frames.length, r.fps, nowMs)] ?? ''
}

export function listCharacters(m: Manifest): string[] {
  return Object.entries(m.characters).flatMap(([id, c]) => [id, ...Object.keys(c.variants ?? {}).map(v => `${id}/${v}`)])
}

export type Selection = { id: string; variant: string; accessories: string[] } // accessories: extra ones worn by hand

export const characterOf = (m: Manifest | undefined, id: string): string | undefined =>
  m ? (m.characters[id] ? id : m.characters[m.defaultCharacter] ? m.defaultCharacter : undefined) : undefined

// Accessories in effect: the variant's set plus any worn by hand (a hand-worn one shows in every state).
export function wornRefs(m: Manifest | undefined, sel: Selection): Array<{ id: string; states?: string[] }> {
  const id = characterOf(m, sel.id)
  const v = id && sel.variant ? m?.characters[id]?.variants?.[sel.variant] : undefined
  const out = (v?.accessories ?? []).map(w => (typeof w === 'string' ? { id: w } : { id: w.id, ...(w.states ? { states: w.states } : {}) }))
  for (const a of sel.accessories) if (ID.test(a) && !out.some(o => o.id === a && !o.states)) out.push({ id: a })
  return out
}

// "/clawd" argument grammar: [<id> [<variant>]] [+acc ...] [-acc ...]; "-" alone drops the variant.
export function applyClawdArgs(m: Manifest, sel: Selection, args: string): { sel: Selection; error?: string } {
  let next: Selection = { ...sel, accessories: [...sel.accessories] }
  const words = args.trim().split(/\s+/).filter(Boolean)
  const plain: string[] = []
  for (const w of words) {
    if (w.startsWith('+') || (w.startsWith('-') && w.length > 1)) {
      const acc = w.slice(1)
      if (!ID.test(acc)) return { sel, error: `Invalid accessory name: ${acc.slice(0, 40)}` }
      next.accessories = w.startsWith('+') ? [...new Set([...next.accessories, acc])] : next.accessories.filter(a => a !== acc)
    } else if (w === '-') next = { ...next, variant: '' }
    else plain.push(w)
  }
  const [id, variant] = plain
  if (id) {
    const ch = m.characters[id]
    if (!ch) return { sel, error: `No such character: ${id.slice(0, 40)}. Options: ${listCharacters(m).join(', ')}` }
    if (variant && !ch.variants?.[variant]) return { sel, error: `${id} has no such variant: ${variant.slice(0, 40)}. Variants: ${Object.keys(ch.variants ?? {}).join(', ') || 'none'}` }
    next = { ...next, id, variant: variant ?? '' }
  }
  return { sel: next }
}

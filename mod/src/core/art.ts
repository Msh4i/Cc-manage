import { characterOf, wornRefs, type Manifest, type Selection } from './characters'
import { composeFrame, toRaster, toSvg, type Accessory, type Sprite, type Worn } from './sprite'
import type { CharState } from './registry'

export type ArtView =
  | { kind: 'raster'; key: string; columns: number; rows: number; cells: string }
  | { kind: 'svg'; svg: string; alt: string }

// The character drawing for one session state on one surface, or undefined where only the text face fits
// (VS Code, mobile, or a design without a sprite). Pure: everything it needs is passed in.
export function artFor(
  m: Manifest | undefined,
  sprites: Record<string, Sprite>,
  accessories: Record<string, Accessory>,
  sel: Selection,
  state: CharState,
  surface: string,
  nowMs: number,
  key: string,
): ArtView | undefined {
  const id = characterOf(m, sel.id)
  const sprite = id ? sprites[id] : undefined
  if (!m || !sprite || (surface !== 'terminal' && surface !== 'desktop')) return undefined
  const worn: Worn[] = []
  for (const w of wornRefs(m, sel)) {
    const a = accessories[w.id]
    if (a) worn.push({ accessory: a, ...(w.states ? { states: w.states } : {}) })
  }
  const { grid } = composeFrame(sprite, m.stateMap[state] ?? state, state, nowMs, worn)
  if (surface === 'terminal') return { kind: 'raster', key, ...toRaster(grid) }
  return { kind: 'svg', svg: toSvg(grid, 4), alt: `${sprite.name ?? id}: ${state}` }
}

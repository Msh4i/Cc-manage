// Pixel-art sprites: one editable JSON per design, drawn as a terminal Raster (two pixels per cell with "▀")
// or as an SVG on the desktop. Accessories are small sprites laid over the body at each frame's anchor,
// so a hat follows every bob and jump. Files are data: parsed defensively, size-limited, never executed.

export type Color = string | null // "#RRGGBB" or transparent
export type Grid = Color[][] // [y][x]

export type SpriteAnim = { fps: number; frames: string[][]; anchors?: Array<[number, number]> }
export type Sprite = {
  version: 1
  name?: string
  note?: string
  width: number
  height: number
  palette: Record<string, Color>
  tint?: string // when set, accessories are drawn in this one colour (keeps a monochrome design monochrome)
  animations: Record<string, SpriteAnim>
}
export type Accessory = {
  version: 1
  name?: string
  note?: string
  palette: Record<string, Color>
  offset: [number, number] // from the frame's anchor (the body's top-left)
  rows: string[]
}
export type Worn = { accessory: Accessory; states?: string[] }

export const MAX_W = 64
export const MAX_H = 48
const HEX = /^#[0-9a-fA-F]{6}$/

function checkPalette(where: string, p: Record<string, Color>, errs: string[]) {
  if (!p || typeof p !== 'object') return errs.push(`${where}: palette missing`)
  for (const [k, v] of Object.entries(p)) {
    if ([...k].length !== 1) errs.push(`${where}: palette key "${k.slice(0, 8)}" must be one character`)
    if (v !== null && !(typeof v === 'string' && HEX.test(v))) errs.push(`${where}: palette "${k}" must be #RRGGBB or null`)
  }
  return 0
}

function checkRows(where: string, rows: unknown, w: number, h: number, p: Record<string, Color>, errs: string[]) {
  if (!Array.isArray(rows) || rows.length !== h) return errs.push(`${where}: needs ${h} rows`)
  rows.forEach((r, y) => {
    if (typeof r !== 'string' || [...r].length !== w) return errs.push(`${where}: row ${y} must be ${w} characters`)
    for (const ch of r) if (!(ch in p)) return errs.push(`${where}: row ${y} uses "${ch}" which is not in the palette`)
    return 0
  })
  return 0
}

export function validateSprite(s: Sprite): string[] {
  const errs: string[] = []
  if (s?.version !== 1) errs.push('version must be 1')
  if (!(Number.isInteger(s?.width) && s.width >= 1 && s.width <= MAX_W)) errs.push(`width must be 1-${MAX_W}`)
  if (!(Number.isInteger(s?.height) && s.height >= 1 && s.height <= MAX_H)) errs.push(`height must be 1-${MAX_H}`)
  if (errs.length) return errs
  checkPalette('sprite', s.palette, errs)
  if (s.tint !== undefined && !(typeof s.tint === 'string' && HEX.test(s.tint))) errs.push('tint must be #RRGGBB')
  if (!s.animations || typeof s.animations !== 'object' || !s.animations.idle) errs.push('needs an "idle" animation')
  for (const [n, a] of Object.entries(s.animations ?? {})) {
    if (!(a.fps >= 0.2 && a.fps <= 30)) errs.push(`${n}: fps must be 0.2-30`)
    if (!Array.isArray(a.frames) || a.frames.length < 1 || a.frames.length > 48) errs.push(`${n}: 1-48 frames`)
    ;(a.frames ?? []).forEach((f, i) => checkRows(`${n}[${i}]`, f, s.width, s.height, s.palette ?? {}, errs))
    if (a.anchors && a.anchors.length !== a.frames?.length) errs.push(`${n}: anchors must match frames`)
  }
  return errs
}

export function validateAccessory(a: Accessory): string[] {
  const errs: string[] = []
  if (a?.version !== 1) errs.push('version must be 1')
  checkPalette('accessory', a?.palette, errs)
  if (!Array.isArray(a?.offset) || a.offset.length !== 2 || !a.offset.every(n => Number.isInteger(n) && Math.abs(n) <= MAX_W)) errs.push('offset must be [x, y] integers')
  const w = [...(a?.rows?.[0] ?? '')].length
  if (!Array.isArray(a?.rows) || a.rows.length < 1 || a.rows.length > MAX_H || w < 1 || w > MAX_W) errs.push(`rows: 1-${MAX_H} rows of 1-${MAX_W} characters`)
  else checkRows('accessory', a.rows, w, a.rows.length, a.palette ?? {}, errs)
  return errs
}

function parseWith<T>(text: string, check: (t: T) => string[]): { value?: T; errors: string[] } {
  if (text.length > 1_000_000) return { errors: ['file is larger than 1 MB'] }
  let v: T
  try {
    v = JSON.parse(text) as T
  } catch (e) {
    return { errors: [`not JSON: ${String((e as Error).message).slice(0, 80)}`] }
  }
  const errors = check(v)
  return errors.length ? { errors } : { value: v, errors }
}
export const parseSprite = (text: string) => parseWith<Sprite>(text, validateSprite)
export const parseAccessory = (text: string) => parseWith<Accessory>(text, validateAccessory)

const toGrid = (rows: string[], p: Record<string, Color>): Grid => rows.map(r => [...r].map(ch => p[ch] ?? null))

export const pickFrame = (n: number, fps: number, nowMs: number) => (n <= 1 ? 0 : Math.floor((nowMs / 1000) * fps) % n)

// Draws `top` over `grid` at (x, y); transparent pixels let the base through; off-canvas pixels are dropped.
export function overlay(grid: Grid, top: Grid, x: number, y: number): Grid {
  const out = grid.map(r => r.slice())
  top.forEach((row, j) => row.forEach((c, i) => {
    const yy = y + j
    const xx = x + i
    if (c !== null && yy >= 0 && yy < out.length && xx >= 0 && xx < (out[yy]?.length ?? 0)) out[yy]![xx] = c
  }))
  return out
}

export type Composed = { grid: Grid; index: number; anim: string }

// The frame of `anim` at `nowMs` (falls back to idle), with every worn accessory that applies to `state`.
export function composeFrame(s: Sprite, anim: string, state: string, nowMs: number, worn: Worn[] = []): Composed {
  const name = s.animations[anim] ? anim : 'idle'
  const a = s.animations[name]!
  const index = pickFrame(a.frames.length, a.fps, nowMs)
  let grid = toGrid(a.frames[index]!, s.palette)
  const [ax, ay] = a.anchors?.[index] ?? [0, 0]
  for (const w of worn) {
    if (w.states && !w.states.includes(state)) continue
    const top = toGrid(w.accessory.rows, w.accessory.palette).map(r => r.map(c => (c !== null && s.tint ? s.tint : c)))
    grid = overlay(grid, top, ax + w.accessory.offset[0], ay + w.accessory.offset[1])
  }
  return { grid, index, anim: name }
}

// ---- terminal: Raster cells ----
const DEFAULT = 0x01000000 // the terminal's own colour
const rgb = (c: Color) => (c === null ? DEFAULT : parseInt(c.slice(1), 16))
const UPPER = 0x2580 // ▀ : foreground = top pixel, background = bottom pixel
const LOWER = 0x2584 // ▄
const SPACE = 0x20

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
export function base64(bytes: Uint8Array): string {
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i]! << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0)
    out += B64[(n >> 18) & 63]! + B64[(n >> 12) & 63]! + (i + 1 < bytes.length ? B64[(n >> 6) & 63]! : '=') + (i + 2 < bytes.length ? B64[n & 63]! : '=')
  }
  return out
}

export type RasterData = { columns: number; rows: number; cells: string }

// Two pixel rows per terminal row, so pixels come out square.
export function toRaster(grid: Grid): RasterData {
  const h = grid.length
  const w = grid[0]?.length ?? 0
  const rows = Math.ceil(h / 2)
  const words = new Uint32Array(w * rows * 3)
  for (let r = 0; r < rows; r++) {
    for (let x = 0; x < w; x++) {
      const top = grid[r * 2]?.[x] ?? null
      const bottom = grid[r * 2 + 1]?.[x] ?? null
      const i = (r * w + x) * 3
      if (top === null && bottom === null) words.set([SPACE, DEFAULT, DEFAULT], i)
      else if (top === null) words.set([LOWER, rgb(bottom), DEFAULT], i)
      else words.set([UPPER, rgb(top), rgb(bottom)], i)
    }
  }
  // Uint32Array is little-endian on every platform the engine runs on; spell it out to be sure
  const bytes = new Uint8Array(words.length * 4)
  words.forEach((v, i) => {
    bytes[i * 4] = v & 255
    bytes[i * 4 + 1] = (v >>> 8) & 255
    bytes[i * 4 + 2] = (v >>> 16) & 255
    bytes[i * 4 + 3] = (v >>> 24) & 255
  })
  return { columns: w, rows, cells: base64(bytes) }
}

// ---- desktop: SVG ----
// One rect per horizontal run of a colour; crisp edges keep the pixels sharp at any size.
export function toSvg(grid: Grid, scale = 4): string {
  const h = grid.length
  const w = grid[0]?.length ?? 0
  const rects: string[] = []
  grid.forEach((row, y) => {
    let x = 0
    while (x < w) {
      const c = row[x] ?? null
      let run = 1
      while (x + run < w && row[x + run] === c) run++
      if (c !== null) rects.push(`<rect x="${x}" y="${y}" width="${run}" height="1" fill="${c}"/>`)
      x += run
    }
  })
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w * scale}" height="${h * scale}" shape-rendering="crispEdges">${rects.join('')}</svg>`
}

// The smallest box holding every visible pixel, for tidy previews.
export function bounds(grid: Grid): { x: number; y: number; w: number; h: number } | undefined {
  let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1
  grid.forEach((r, y) => r.forEach((c, x) => { if (c !== null) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y) } }))
  return x1 < 0 ? undefined : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 }
}

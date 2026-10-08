// Builds the bundled Clawd designs as editable pixel-art JSON (mod/characters/*/sprite.json, accessories/*.json).
// The JSON files are the source the mod reads; this script is how the shipped designs were drawn. Edit either.
// Run: node scripts/build-sprites.mjs
import { mkdirSync, writeFileSync } from 'node:fs'

const W = 26 // canvas: 18x10 Clawd at (4,4) leaves room above and to the right for effects
const H = 14
const OX = 4
const OY = 4

// ---------- tiny canvas ----------
const blank = () => Array.from({ length: H }, () => Array(W).fill('.'))
const put = (g, x, y, c) => { if (x >= 0 && y >= 0 && x < W && y < H) g[y][x] = c }
const rect = (g, x, y, w, h, c) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) put(g, x + i, y + j, c) }
const stamp = (g, x, y, rows, map = {}) => rows.forEach((r, j) => [...r].forEach((ch, i) => { if (ch !== ' ' && ch !== '.') put(g, x + i, y + j, map[ch] ?? ch) }))
const rows = g => g.map(r => r.join(''))

// ---------- the Clawd skeleton (from the Claude Code banner, heights doubled so pixels are square) ----------
// eyes: open | closed | up | none ; arms: down | up | left | right ; legs: four heights (2 normal, 1 lifted)
function clawd(g, ox, oy, o = {}) {
  const b = o.body ?? 'o'
  rect(g, ox + 3, oy, 12, 8, b) // head + body block
  const armY = { down: [4, 4], up: [2, 2], left: [2, 4], right: [4, 2] }[o.arms ?? 'down']
  rect(g, ox + 1, oy + armY[0], 2, 2, b)
  rect(g, ox + 15, oy + armY[1], 2, 2, b)
  const legs = o.legs ?? [2, 2, 2, 2]
  ;[4, 6, 11, 13].forEach((lx, i) => rect(g, ox + lx, oy + 8, 1, legs[i], b))
  const eye = o.eyeColor ?? 'k'
  for (const ex of [5, 12]) {
    if (o.eyes === 'none') continue
    if (o.eyes === 'closed') { put(g, ox + ex, oy + 3, eye); put(g, ox + ex + (ex < 9 ? -1 : 1), oy + 3, eye) }
    else if (o.eyes === 'up') put(g, ox + ex, oy + 2, eye)
    else { put(g, ox + ex, oy + 2, eye); put(g, ox + ex, oy + 3, eye) }
  }
  if (o.highlight) rect(g, ox + 3, oy, 12, 1, o.highlight) // night design: lit top edge
}

// ---------- four more bodies on the same footprint and the same options, so every state reads the same way ----------
// In the "lost" state the body comes in as 'g'; details follow it so the ghost pattern covers the whole figure.
const detail = (o, c) => (o.body === 'g' ? 'g' : c)
const armRows = o => ({ down: [4, 4], up: [1, 1], left: [1, 4], right: [4, 1] })[o.arms ?? 'down']

// Robot: a riveted box head on two wheels, LED eyes, an antenna whose tip blinks as the arms swing.
function robot(g, ox, oy, o = {}) {
  const b = o.body ?? 'o'
  const m = detail(o, 'm')
  rect(g, ox + 3, oy, 12, 8, m)
  rect(g, ox + 4, oy + 1, 10, 6, b)
  put(g, ox + 9, oy - 1, m)
  put(g, ox + 9, oy - 2, detail(o, o.arms === 'right' || o.arms === 'up' ? 'y' : 'a'))
  const [la, ra] = armRows(o)
  rect(g, ox + 1, oy + la, 2, 2, m)
  rect(g, ox + 15, oy + ra, 2, 2, m)
  for (const x of [5, 7, 9, 11]) put(g, ox + x, oy + 5, m) // mouth grille
  const legs = o.legs ?? [2, 2, 2, 2]
  for (const [x, h] of [[4, legs[0]], [11, legs[2]]]) {
    rect(g, ox + x, oy + 8 + (2 - h), 3, h, m)
    put(g, ox + x + 1, oy + 9, h === 2 ? detail(o, 'h') : '.')
  }
  if (o.eyes === 'none') return
  const eye = o.eyes === 'closed' ? detail(o, 'h') : o.eyeColor ?? 'k'
  const ey = o.eyes === 'up' ? 1 : 2
  for (const x of [5, 11]) rect(g, ox + x, oy + ey + (o.eyes === 'closed' ? 1 : 0), 2, o.eyes === 'closed' ? 1 : 2, eye)
}

// Octopus: a domed mantle with spots, big glinting eyes, four tentacles that curl; raised arms lift the outer two.
function octopus(g, ox, oy, o = {}) {
  const b = o.body ?? 'o'
  rect(g, ox + 5, oy, 8, 1, b)
  rect(g, ox + 4, oy + 1, 10, 1, b)
  rect(g, ox + 3, oy + 2, 12, 4, b)
  rect(g, ox + 4, oy + 6, 10, 1, b)
  for (const [x, y] of [[7, 0], [10, 1], [5, 2]]) put(g, ox + x, oy + y, detail(o, 'h'))
  const legs = o.legs ?? [2, 2, 2, 2]
  const up = { down: [false, false], up: [true, true], left: [true, false], right: [false, true] }[o.arms ?? 'down']
  ;[3, 6, 10, 13].forEach((x, i) => {
    const raised = (i === 0 && up[0]) || (i === 3 && up[1])
    if (raised) {
      const sx = i === 0 ? 1 : 15
      rect(g, ox + sx, oy + 2, 2, 4, b)
      put(g, ox + sx + (i === 0 ? 0 : 1), oy + 1, b)
      return
    }
    const h = legs[i] === 1 ? 1 : 2
    rect(g, ox + x, oy + 7, 2, h, b)
    put(g, ox + x + (i < 2 ? -1 : 2), oy + 7 + h, b) // the curl, outward
  })
  if (o.eyes === 'none') return
  const eye = o.eyeColor ?? 'k'
  for (const x of [5, 11]) {
    if (o.eyes === 'closed') { rect(g, ox + x, oy + 4, 2, 1, eye); continue }
    const y = o.eyes === 'up' ? 2 : 3
    rect(g, ox + x, oy + y, 2, 2, eye)
    put(g, ox + x, oy + y, detail(o, 'w'))
  }
}

// Slime: no legs, a dome that squashes when a "leg" lifts and stretches tall when the arms go up; a shine on top.
function jelly(g, ox, oy, o = {}) {
  const b = o.body ?? 'o'
  const legs = o.legs ?? [2, 2, 2, 2]
  const squash = legs.some(h => h === 1)
  const stretch = o.arms === 'up'
  // rows from the bottom up: [left inset, width]
  const shape = stretch ? [[3, 12], [4, 10], [4, 10], [4, 10], [5, 8], [5, 8], [6, 6], [7, 4]]
    : squash ? [[1, 16], [2, 14], [2, 14], [3, 12], [5, 8]]
      : [[2, 14], [3, 12], [3, 12], [3, 12], [4, 10], [5, 8], [7, 4]]
  shape.forEach(([x, w], i) => rect(g, ox + x, oy + 9 - i, w, 1, b))
  const top = oy + 10 - shape.length
  put(g, ox + shape.at(-2)[0] + 1, top + 1, detail(o, 'h'))
  put(g, ox + shape.at(-2)[0] + 2, top + 1, detail(o, 'h'))
  if (o.arms === 'left') rect(g, ox + 1, oy + 6, 2, 1, b)
  if (o.arms === 'right') rect(g, ox + 15, oy + 6, 2, 1, b)
  if (o.eyes === 'none') return
  const eye = o.eyeColor ?? 'k'
  const ey = top + (squash ? 1 : 2) + (o.eyes === 'up' ? -1 : 0)
  for (const x of [6, 11]) {
    if (o.eyes === 'closed') rect(g, ox + x - (x < 9 ? 1 : 0), ey + 1, 2, 1, eye)
    else rect(g, ox + x, ey, 1, 2, eye)
  }
}

// Cat: pointed ears, a tabby stripe, a pink nose, white paws and a tail that sways when the last "leg" lifts.
function cat(g, ox, oy, o = {}) {
  const b = o.body ?? 'o'
  put(g, ox + 4, oy - 2, b); put(g, ox + 13, oy - 2, b)
  rect(g, ox + 4, oy - 1, 2, 1, b); rect(g, ox + 12, oy - 1, 2, 1, b)
  put(g, ox + 5, oy - 1, detail(o, 'p')); put(g, ox + 12, oy - 1, detail(o, 'p'))
  rect(g, ox + 4, oy, 10, 5, b)
  for (const x of [7, 9, 10]) put(g, ox + x, oy, detail(o, 'h'))
  put(g, ox + 8, oy + 4, detail(o, 'p'))
  put(g, ox + 9, oy + 4, detail(o, 'p'))
  rect(g, ox + 5, oy + 5, 8, 4, b)
  rect(g, ox + 6, oy + 6, 2, 2, detail(o, 'h'))
  const legs = o.legs ?? [2, 2, 2, 2]
  const paw = detail(o, 'w')
  const [la, ra] = { down: [false, false], up: [true, true], left: [true, false], right: [false, true] }[o.arms ?? 'down']
  if (la) rect(g, ox + 2, oy + 3, 2, 2, paw)
  else rect(g, ox + 6, oy + 8 + (legs[0] === 1 ? 0 : 1), 2, 1, paw)
  if (ra) rect(g, ox + 14, oy + 3, 2, 2, paw)
  else rect(g, ox + 10, oy + 8 + (legs[2] === 1 ? 0 : 1), 2, 1, paw)
  const sway = legs[3] === 1 ? -1 : 0
  for (const [x, y] of [[13, 8], [14, 7], [15, 6], [15, 5], [16 + sway, 4]]) put(g, ox + x, oy + y, b)
  if (o.eyes === 'none') return
  const eye = o.eyeColor ?? 'k'
  for (const x of [6, 11]) {
    if (o.eyes === 'closed') { put(g, ox + x - 1, oy + 2, eye); put(g, ox + x, oy + 3, eye); put(g, ox + x + 1, oy + 2, eye) }
    else rect(g, ox + x, oy + (o.eyes === 'up' ? 1 : 2), 1, 2, eye)
  }
}

// ---------- effects (drawn in the free space) ----------
const FX = {
  zBig: ['wwww', '...w', '..w.', '.w..', 'wwww'],
  zSmall: ['www', '..w', '.w.', 'www'],
  q: ['yy.', '..y', '.y.', '...', '.y.'],
  bang: ['r', 'r', 'r', '.', 'r'],
  sparkle: ['.y.', 'yyy', '.y.'],
  leaf1: ['..GG', '.GGG', 'GGG.', 'g...'],
  leaf2: ['.GG.', 'GGGG', '.GG.', '.g..'],
  pause: ['w.w', 'w.w', 'w.w'],
}
function bubble(g, x, y, lines) {
  stamp(g, x, y, ['.ggggg.', 'gwwwwwg', 'gwwwwwg', 'gwwwwwg', '.ggggg.', 'gg.....'])
  for (let i = 0; i < lines; i++) rect(g, x + 2, y + 1 + i, i === 2 ? 2 : 3, 1, 'd')
}

// ---------- the ten states ----------
// each returns { rows, anchor } frames; anchor = body origin, so accessories follow every bob and jump
function frame(draw) {
  const g = blank()
  const anchor = draw(g) ?? [OX, OY]
  return { rows: rows(g), anchor }
}
function animations(look, body = clawd) {
  const C = (extra = {}, ox = OX, oy = OY) => g => { body(g, ox, oy, { ...look, ...extra }); return [ox, oy] }
  const withFx = (draw, fx) => g => { const a = draw(g); fx(g); return a }
  return {
    idle: { fps: 1.5, frames: [
      frame(withFx(C({ eyes: 'closed' }), g => stamp(g, 21, 2, FX.zSmall))),
      frame(withFx(C({ eyes: 'closed' }), g => { stamp(g, 21, 0, FX.zBig) })),
      frame(withFx(C({ eyes: 'closed' }), g => { stamp(g, 22, 0, FX.zSmall); put(g, 20, 3, 'w') })),
    ] },
    working: { fps: 4, frames: [
      frame(withFx(C({ arms: 'left' }), g => put(g, 4, 2, 'g'))),
      frame(withFx(C({ arms: 'down' }, OX, OY + 1), g => put(g, 4, 1, 'g'))),
      frame(withFx(C({ arms: 'right' }), g => put(g, 21, 2, 'g'))),
      frame(withFx(C({ arms: 'down' }, OX, OY + 1), g => put(g, 21, 1, 'g'))),
    ] },
    thinking: { fps: 2, frames: [
      frame(withFx(C({ eyes: 'up' }), g => put(g, 19, 2, 'w'))),
      frame(withFx(C({ eyes: 'up' }), g => { put(g, 19, 2, 'w'); put(g, 21, 1, 'w') })),
      frame(withFx(C({ eyes: 'up' }), g => { put(g, 19, 2, 'w'); put(g, 21, 1, 'w'); put(g, 23, 0, 'w') })),
      frame(withFx(C({ eyes: 'up', arms: 'right' }), g => stamp(g, 21, 0, FX.q.slice(0, 4).concat(['.y.'])))),
    ] },
    talking: { fps: 3, frames: [
      frame(withFx(C({}), g => bubble(g, 19, 0, 1))),
      frame(withFx(C({ arms: 'right' }, OX, OY), g => bubble(g, 19, 0, 2))),
      frame(withFx(C({}, OX, OY + 1), g => bubble(g, 19, 0, 3))),
    ] },
    waiting: { fps: 3, frames: [
      frame(C({})),
      frame(C({ legs: [1, 2, 2, 2] })),
      frame(C({})),
      frame(C({ eyes: 'closed', legs: [1, 2, 2, 2] })),
    ] },
    saving_mode: { fps: 2, frames: [
      frame(withFx(C({}), g => stamp(g, 21, 0, FX.leaf1))),
      frame(withFx(C({ legs: [2, 1, 2, 1] }, OX, OY), g => stamp(g, 21, 0, FX.leaf2))),
    ] },
    error: { fps: 4, frames: [
      frame(withFx(C({ body: 'r', eyes: 'closed' }, OX - 1, OY), g => stamp(g, 21, 0, FX.bang))),
      frame(withFx(C({ eyes: 'closed' }, OX + 1, OY), g => stamp(g, 21, 0, FX.bang))),
      frame(withFx(C({ body: 'r', eyes: 'closed' }, OX, OY), g => stamp(g, 21, 0, FX.bang))),
    ] },
    done: { fps: 4, frames: [
      frame(C({ legs: [1, 1, 1, 1] }, OX, OY + 1)),
      frame(C({ arms: 'up' }, OX, OY - 2)),
      frame(withFx(C({ arms: 'up' }, OX, OY - 1), g => { stamp(g, 1, 0, FX.sparkle); stamp(g, 22, 1, FX.sparkle) })),
      frame(withFx(C({ arms: 'up' }), g => { put(g, 2, 1, 'y'); put(g, 23, 2, 'y'); stamp(g, 20, 0, FX.sparkle) })),
    ] },
    paused: { fps: 1, frames: [
      frame(withFx(C({ eyes: 'closed' }), g => stamp(g, 11, 0, FX.pause))),
      frame(C({ eyes: 'closed' })),
    ] },
    lost: { fps: 2, frames: [
      frame(withFx(g => { body(g, OX, OY, { ...look, body: 'g', eyes: 'none' }); ghost(g); return [OX, OY] }, g => stamp(g, 21, 0, FX.q))),
      frame(withFx(g => { body(g, OX, OY - 1, { ...look, body: 'g', eyes: 'none' }); ghost(g); return [OX, OY - 1] }, g => stamp(g, 21, 0, FX.q))),
    ] },
  }
}
// "lost": a see-through checker pattern reads as a ghost
function ghost(g) { for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (g[y][x] === 'g' && (x + y) % 2) g[y][x] = '.' }

// ---------- designs ----------
function outline(anims, color) {
  // mono design: hollow body, keep the eyes and effects
  for (const a of Object.values(anims)) for (const f of a.frames) {
    const g = f.rows.map(r => [...r])
    const isBody = (x, y) => g[y]?.[x] === color || g[y]?.[x] === 'k'
    f.rows = g.map((r, y) => r.map((c, x) => (c === color && isBody(x - 1, y) && isBody(x + 1, y) && isBody(x, y - 1) && isBody(x, y + 1) ? '.' : c)).join(''))
  }
  return anims
}

const PAL_EFFECTS = { w: '#F5F4EE', g: '#9C9A92', y: '#F2C14E', r: '#E5534B', G: '#5BB974', d: '#3D3929' }
const designs = {
  clawd: {
    name: 'Clawd',
    note: 'Claude Code’s banner Clawd, pixel for pixel, heights doubled for square pixels.',
    palette: { '.': null, o: '#D97757', k: '#2B2A27', ...PAL_EFFECTS },
    anims: animations({}),
  },
  'clawd-night': {
    name: 'Clawd Night Shift',
    note: 'For sessions left running overnight: indigo body, lit top edge, glowing eyes.',
    palette: { '.': null, o: '#3E4FA8', h: '#6476D6', k: '#FFE07A', w: '#E8ECFF', g: '#8C96C8', y: '#FFE07A', r: '#FF6B6B', G: '#7EE0B0', d: '#2A2F55' },
    anims: animations({ highlight: 'h' }),
  },
  'clawd-mono': {
    name: 'Clawd Phosphor',
    note: 'Green-phosphor terminal look: a hollow outline with solid eyes.',
    palette: { '.': null, o: '#39FF7A', k: '#39FF7A', w: '#B6FFCC', g: '#1E8F45', y: '#39FF7A', r: '#39FF7A', G: '#39FF7A', d: '#0B3D1E' },
    anims: outline(animations({}), 'o'),
    tint: '#39FF7A',
  },
  robot: {
    name: 'Robot',
    note: 'A riveted box on two wheels: LED eyes that dim when it sleeps, an antenna that blinks while it works.',
    palette: { '.': null, o: '#9AA7B8', m: '#4E5A6B', k: '#5CE1E6', h: '#2C3440', a: '#E5534B', ...PAL_EFFECTS },
    anims: animations({}, robot),
  },
  octopus: {
    name: 'Octopus',
    note: 'A spotted mantle and four curling tentacles; it lifts the outer two to wave and cheer.',
    palette: { '.': null, o: '#B565C9', h: '#E39BF0', k: '#2A1631', ...PAL_EFFECTS },
    anims: animations({}, octopus),
  },
  slime: {
    name: 'Slime',
    note: 'A legless dome that squashes on the beat and stretches tall when it celebrates.',
    palette: { '.': null, o: '#4FC3A1', h: '#B7F5E1', k: '#1B3D35', ...PAL_EFFECTS },
    anims: animations({}, jelly),
  },
  cat: {
    name: 'Cat',
    note: 'A cream tabby with white paws: ears up, tail swaying while it waits, paws raised when it is done.',
    palette: { '.': null, o: '#EADFCF', h: '#D9935A', k: '#3E8E5A', p: '#E88AA0', ...PAL_EFFECTS },
    anims: animations({}, cat),
  },
}

// ---------- accessories: drawn over the body, positioned from each frame's anchor ----------
const accessories = {
  headset: {
    name: 'Headset', note: 'For talking: band over the head, ear cups, a mic toward the face.',
    palette: { '.': null, D: '#7A7A88', E: '#3A3A44', m: '#9C9A92', l: '#5BB974' },
    offset: [1, -2],
    rows: [
      '...DDDDDDDDDDDD...',
      '..D............D..',
      '.EE............EE.',
      '.EE............EE.',
      '..m...............',
      '...mml............',
    ],
  },
  hardhat: {
    name: 'Hard hat', note: 'Builder look for working sessions.',
    palette: { '.': null, Y: '#F2B705', y: '#FFD84D', s: '#B88A00' },
    offset: [2, -3],
    rows: [
      '....yyYYYYYY....',
      '..YYYYYYYYYYYY..',
      '.ssssssssssssss.',
    ],
  },
  nightcap: {
    name: 'Nightcap', note: 'Sleeping cap for idle and paused sessions.',
    palette: { '.': null, B: '#5A6FD6', W: '#F5F4EE' },
    offset: [3, -4],
    rows: [
      '.............WW.',
      '.........BBB.WW.',
      '.....BBBBBBBB...',
      'WWWWWWWWWWWW....',
    ],
  },
  party: {
    name: 'Party hat', note: 'Celebration hat for done.',
    palette: { '.': null, P: '#E5534B', Q: '#F2C14E', w: '#F5F4EE' },
    offset: [7, -5],
    rows: [
      '..w..',
      '..P..',
      '.PQP.',
      '.QPQ.',
      'PQPQP',
    ],
  },
  glasses: {
    name: 'Glasses', note: 'Thinking glasses around the eyes.',
    palette: { '.': null, F: '#1F1E1D', L: '#BFE3FF' },
    offset: [4, 1],
    rows: [
      'FFF....FFF',
      'F.FFFFFF.F',
      'F.F....F.F',
      'FFF....FFF',
    ],
  },
}

// ---------- write ----------
const root = new URL('../mod/characters/', import.meta.url)
for (const [id, d] of Object.entries(designs)) {
  const animations = Object.fromEntries(Object.entries(d.anims).map(([n, a]) => [n, { fps: a.fps, frames: a.frames.map(f => f.rows), anchors: a.frames.map(f => f.anchor) }]))
  const sprite = { version: 1, name: d.name, note: d.note, width: W, height: H, palette: d.palette, ...(d.tint ? { tint: d.tint } : {}), animations }
  mkdirSync(new URL(`${id}/`, root), { recursive: true })
  writeFileSync(new URL(`${id}/sprite.json`, root), JSON.stringify(sprite, null, 1) + '\n')
}
for (const [id, a] of Object.entries(accessories)) {
  writeFileSync(new URL(`accessories/${id}.json`, root), JSON.stringify({ version: 1, ...a }, null, 1) + '\n')
}
console.log(`wrote ${Object.keys(designs).length} designs and ${Object.keys(accessories).length} accessories`)

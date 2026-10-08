// The islands: a sea you lay out and zoom. Each project is an island of its own kind (where you drag it is saved); its
// sessions stand on the grass, a hopping "!" over one that waits on you, a check over one that has answered. Tap a
// character for its speech bubble; "Send message" there, then the receiver, opens the message card (dragging from one
// character to another does the same). Each request is a boat with a mind of its own: it waits off the sender's dock
// while the sender's answer is fetched, then sails round any island in its way to the receiver's dock and moors there.
// Islands are solid: a dragged one stops at another, a thrown one glides, bounces and passes its push on.
// The wheel zooms where the pointer is; dragging open water pans and glides on.

const seaEl = byId('sea')
const worldEl = byId('world')
const wakeEl = byId('wake')
const isles = new Map() // project -> { el, crew, mates: Map(session -> button), w, h, dock, size }
let places = {} // project -> { x, y } as fractions of the sea, saved in places/<project>
const boats = new Map() // request id -> element
const ships = new Map() // request id -> { x, y, heading, legs, trail, face, doneAt }: where each boat is, sailed frame by frame
const biomes = new Map() // project -> biome, kept for the page's life so an island never changes kind
const bodies = new Map() // project -> { vx, vy }: islands moving on their own (thrown, or hit by a thrown one)
let bubbleFor = null
let linking = null // the sender, once "Send message" was pressed: the next tap picks the receiver
let mateDrag = null
let isleDrag = null
let pan = null
let glider = null // the sea's glide running now; a new touch stops it
let suppressMateClick = false
let view = { s: 1, tx: 0, ty: 0 } // world -> screen: screen = world * s + t
let lastFrame = performance.now()
const CELL = 6 // px per island pixel
const PAD = 4 // cells of shallow water around an island
const SPEED = 0.11 // a boat's speed, world px per ms
const SLOTS = [[0.22, 0.3], [0.64, 0.26], [0.83, 0.62], [0.42, 0.66], [0.15, 0.76], [0.88, 0.2], [0.5, 0.42], [0.7, 0.86]]

// A small seeded generator, so an island keeps its coastline and its things from one load to the next.
function seeded(text) {
  let h = 2166136261
  for (const ch of text) h = Math.imul(h ^ ch.charCodeAt(0), 16777619)
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507)
    h = Math.imul(h ^ (h >>> 13), 3266489909)
    return ((h ^= h >>> 16) >>> 0) / 4294967296
  }
}

// Pixel things, one letter per colour class (see .land in the stylesheet); '.' is see-through.
const THINGS = {
  palm: ['..LL.l.LL..', '.LllLlLllL.', 'Ll..lll..lL', 'L..ccTcc..L', '.....T.....', '.....tT....', '......T....', '......Tt...', '.....tT....'],
  pine: ['..P..', '.PQP.', '..P..', '.PQP.', 'PQPQP', '..t..'],
  snowpine: ['..n..', '.PnP.', '..P..', '.nPn.', 'PQPQP', '..t..'],
  round: ['.aaa.', 'aaAaa', 'aAaaA', '.aaa.', '..t..', '..t..'],
  cactus: ['..x..', 'x.x..', 'xxx.x', '..xxx', '..x..', '..x..'],
  hut: ['...HH...', '..HHHH..', '.HHHHHH.', 'HHHHHHHH', '.hhhhhh.', '.hhDDhh.', '.hhDDhh.'],
  umbrella: ['..bBb..', '.bBbBb.', 'bBbBbBb', '...t...', '...t...', '...t...'],
  tent: ['...e...', '..eEe..', '.eEEEe.', 'eEEDEEe'],
  igloo: ['..nnnn..', '.nNnnNn.', 'nnNnnNnn', 'nnnDDnnn'],
  lighthouse: ['.yyy.', '.KkK.', '.rrr.', '.WWW.', '.rrr.', '.WWW.', 'KKKKK'],
  well: ['.HHHHH.', '..t.t..', '.KkkkK.', '.KkkkK.'],
  fire: ['..y..', '.yry.', 'tTtTt'],
  rock: ['.kk.', 'kkKK', '.KK.'],
}
// Each kind of island: its ground (CSS class), what grows on it and what stands on it.
const BIOMES = [
  { name: 'tropic', trees: ['palm', 'palm'], marks: ['umbrella', 'hut', 'lighthouse'], flowers: 0.012 },
  { name: 'forest', trees: ['pine', 'pine', 'pine'], marks: ['hut', 'fire', 'well'], flowers: 0.004 },
  { name: 'desert', trees: ['cactus', 'cactus'], marks: ['tent', 'well', 'fire'], flowers: 0 },
  { name: 'autumn', trees: ['round', 'round'], marks: ['hut', 'well', 'lighthouse'], flowers: 0.008 },
  { name: 'snow', trees: ['snowpine', 'snowpine'], marks: ['igloo', 'fire', 'lighthouse'], flowers: 0 },
  { name: 'meadow', trees: ['round', 'palm'], marks: ['well', 'tent', 'hut'], flowers: 0.045 },
]
// A project's kind comes from its name; if an island on the sea already has that kind, the next free one is taken.
function biomeOf(p) {
  if (biomes.has(p)) return biomes.get(p)
  const used = new Set([...isles.keys()].map(q => biomes.get(q)))
  const start = Math.floor(seeded(`${p}#kind`)() * BIOMES.length)
  let b = BIOMES[start]
  for (let i = 0; i < BIOMES.length && used.has(b); i++) b = BIOMES[(start + i) % BIOMES.length]
  biomes.set(p, b)
  return b
}

// The island as pixel cells: a shallow-water ring, foam, wet and dry sand with specks, the ground with tufts (and
// flowers where they grow), trees on one side, a landmark and a dock on the other. Shape, size and sides vary.
function landSvg(name, crewSize, biome) {
  const rnd = seeded(name)
  const W = 22 + crewSize * 16
  const H = 20 + Math.floor(rnd() * 5)
  const GW = W + PAD * 2
  const GH = H + PAD * 2
  const power = 1.7 + rnd() * 0.9 // round to squarish
  const wobble = Array.from({ length: 16 }, () => rnd() * (0.1 + rnd() * 0.18))
  const grid = Array.from({ length: GH }, () => Array(GW).fill(''))
  for (let y = 0; y < GH; y++) {
    for (let x = 0; x < GW; x++) {
      const dx = (x + 0.5 - GW / 2) / (W / 2 - 1)
      const dy = (y + 0.5 - GH / 2) / (H / 2 - 1)
      const ang = Math.round(((Math.atan2(dy, dx) + Math.PI) / (2 * Math.PI)) * 15)
      const d = Math.abs(dx) ** power + Math.abs(dy) ** power - wobble[ang]
      let c = d < 0.42 ? (dy > 0.25 && d > 0.3 ? 'G' : 'g') : d < 0.62 ? 's' : d < 0.8 ? (dy > 0 ? 'S' : 's') : d < 1 ? 'f' : d < 1.7 ? 'w' : ''
      if (c === 'g' && rnd() < 0.05) c = 'u'
      else if (c === 'g' && rnd() < biome.flowers) c = rnd() < 0.5 ? 'r' : 'y'
      else if ((c === 's' || c === 'S') && rnd() < 0.07) c = 'p'
      grid[y][x] = c
    }
  }
  const stamp = (art, x0, y0) => art.forEach((row, j) => [...row].forEach((c, i) => { if (c !== '.' && grid[y0 + j]?.[x0 + i] !== undefined) grid[y0 + j][x0 + i] = c }))
  const dockRight = rnd() < 0.5
  const ground = PAD + Math.round(H * 0.5) // where a trunk or a wall meets the ground
  const margin = Math.floor((W - crewSize * 15) / 2)
  const trees = biome.trees.slice(0, Math.max(1, Math.floor(margin / 5)))
  trees.forEach((t, i) => {
    const art = THINGS[t]
    const x = dockRight ? PAD + 1 + i * 5 : PAD + W - art[0].length - 1 - i * 5
    stamp(art, x, ground - art.length + (i % 2))
  })
  const mark = THINGS[biome.marks[Math.floor(rnd() * biome.marks.length)]]
  stamp(mark, dockRight ? PAD + W - mark[0].length - 2 : PAD + 2, ground - mark.length)
  stamp(THINGS.rock, dockRight ? PAD + 4 + Math.floor(rnd() * 3) : PAD + W - 9 - Math.floor(rnd() * 3), PAD + H - 6)
  // the dock: planks out over the shallows, a post at each corner
  const dx0 = dockRight ? PAD + W - 8 : PAD + 5
  for (let j = 0; j < 7; j++) for (let i = 0; i < 3; i++) grid[PAD + H - 5 + j][dx0 + i] = j % 2 ? 'd' : 'D'
  for (const i of [0, 2]) grid[PAD + H + 2][dx0 + i] = 'D'
  const rects = []
  grid.forEach((row, y) => row.forEach((c, x) => { if (c) rects.push(`<rect class="${c}" x="${x}" y="${y}" width="1" height="1"/>`) }))
  return { svg: `<svg class="land" viewBox="0 0 ${GW} ${GH}" width="${GW * CELL}" height="${GH * CELL}" shape-rendering="crispEdges" aria-hidden="true">${rects.join('')}</svg>`, w: GW * CELL, h: GH * CELL, dock: [(dx0 + 1.5) * CELL, (PAD + H + 2) * CELL], side: dockRight ? 1 : -1 }
}

// A boat in pixels, facing right: hull, a striped sail, a flag in the status colour; a crate on deck for an answer
// being carried, an envelope for a note; foam at the stern while it sails.
function boatSvg(q) {
  const flag = q.status === 'failed' ? '#e5534b' : q.status === 'delivered' ? '#5bb974' : '#e88b68'
  const cargo = q.status !== 'carried' ? '' : q.kind === 'forward'
    ? '<rect x="2" y="6" width="3" height="3" fill="#b07a3c"/><rect x="2" y="6" width="3" height="1" fill="#d39a55"/>'
    : '<rect x="1" y="6" width="4" height="3" fill="#f5f4ee"/><rect x="1" y="6" width="4" height="1" fill="#c9c4b5"/><rect x="2" y="7" width="2" height="1" fill="#c9c4b5"/>'
  const foam = q.status === 'carried' ? '<rect x="-3" y="11" width="2" height="1" fill="#f5f4ee"/><rect x="-6" y="10" width="2" height="1" fill="#f5f4ee" opacity=".7"/><rect x="-9" y="11" width="2" height="1" fill="#f5f4ee" opacity=".4"/>' : ''
  return `<svg viewBox="-10 0 26 13" shape-rendering="crispEdges" aria-hidden="true">${foam}
    <rect x="8" y="0" width="3" height="1" fill="${flag}"/><rect x="7" y="0" width="1" height="9" fill="#5a3b1e"/>
    <rect x="8" y="1" width="4" height="7" fill="#f5f4ee"/><rect x="8" y="3" width="5" height="1" fill="#e5534b"/><rect x="8" y="6" width="5" height="1" fill="#e5534b"/><rect x="12" y="2" width="1" height="5" fill="#f5f4ee"/>${cargo}
    <rect x="0" y="9" width="15" height="1" fill="#7a4a24"/><rect x="1" y="10" width="13" height="1" fill="#6b4220"/><rect x="2" y="11" width="11" height="1" fill="#5a3b1e"/></svg>`
}

const projectsNow = now => {
  const by = new Map()
  for (const r of shownSessions(now)) {
    const p = project(r.name)
    if (!by.has(p)) by.set(p, [])
    by.get(p).push(r)
  }
  return by
}
function spotOf(p, i) {
  const saved = places[p]
  if (saved) return [saved.x, saved.y]
  const s = SLOTS[i % SLOTS.length]
  return [s[0], s[1] + Math.floor(i / SLOTS.length) * 0.06]
}
// World coordinates are the sea's own pixels at zoom 1; an island stores them as fractions of the sea.
const seaPx = ([fx, fy]) => [fx * seaEl.clientWidth, fy * seaEl.clientHeight]
const dockOf = isle => {
  const [x, y] = centreOf(isle.el)
  return [x - isle.w / 2 + isle.dock[0], y - isle.h / 2 + isle.dock[1]]
}
// Where a boat waits: alongside the end of the dock, on its outer side, in open water.
const harborOf = isle => {
  const [x, y] = dockOf(isle)
  return [x + isle.side * 34, y + 4]
}
function toWorld(clientX, clientY) {
  const box = seaEl.getBoundingClientRect()
  return [(clientX - box.left - view.tx) / view.s, (clientY - box.top - view.ty) / view.s]
}
const place = (el, x, y) => { el.style.left = `${x}px`; el.style.top = `${y}px` }

// ---- solid islands: a box per island (the land and half its shallows), kept apart
function boxOf(isle) {
  const [x, y] = centreOf(isle.el)
  return { x, y, hx: isle.w / 2 - PAD * CELL * 0.5, hy: isle.h / 2 - PAD * CELL * 0.5 }
}
// How far a must move to clear b, along the shorter way out; undefined when they do not touch.
function overlap(a, b) {
  const ox = a.hx + b.hx - Math.abs(a.x - b.x)
  const oy = a.hy + b.hy - Math.abs(a.y - b.y)
  if (ox <= 0 || oy <= 0) return undefined
  return ox < oy ? { axis: 'x', d: ox * (a.x < b.x ? -1 : 1) } : { axis: 'y', d: oy * (a.y < b.y ? -1 : 1) }
}
// Keep an island inside the sea.
function clampIsle(isle, x, y) {
  const b = boxOf(isle)
  return [Math.min(seaEl.clientWidth - b.hx * 0.5, Math.max(b.hx * 0.5, x)), Math.min(seaEl.clientHeight - b.hy * 0.5, Math.max(b.hy * 0.5, y))]
}
// The island p would run into at (x, y), if any. Islands it already overlaps do not count, so it can move out of them.
function hitAt(p, x, y, already) {
  const me = { ...boxOf(isles.get(p)), x, y }
  for (const [q, other] of isles) if (q !== p && !already.has(q) && overlap(me, boxOf(other))) return q
  return undefined
}
// Moves island p toward (tx, ty) in steps of a few pixels, so it can never jump into or through another: it stops at
// what it meets and slides along it. Says what stopped it on each axis.
function sweep(p, tx, ty) {
  const isle = isles.get(p)
  let [x, y] = centreOf(isle.el)
  const already = new Set([...isles.keys()].filter(q => q !== p && overlap(boxOf(isle), boxOf(isles.get(q)))))
  ;[tx, ty] = clampIsle(isle, tx, ty)
  const n = Math.max(1, Math.ceil(Math.hypot(tx - x, ty - y) / 6))
  const sx = (tx - x) / n
  const sy = (ty - y) / n
  let hitX
  let hitY
  for (let i = 0; i < n; i++) {
    if (!hitX) {
      const q = hitAt(p, x + sx, y, already)
      if (q) hitX = q
      else x += sx
    }
    if (!hitY) {
      const q = hitAt(p, x, y + sy, already)
      if (q) hitY = q
      else y += sy
    }
  }
  place(isle.el, x, y)
  return { hitX, hitY }
}
// Islands at rest that overlap (a default spot, an old save) are nudged apart on screen; nothing is saved for it.
function relax() {
  const still = [...isles].filter(([p]) => !bodies.has(p) && isleDrag?.p !== p)
  for (let pass = 0; pass < 6; pass++) {
    let moved = false
    for (let i = 0; i < still.length; i++) {
      for (let j = i + 1; j < still.length; j++) {
        const a = still[i][1]
        const b = still[j][1]
        const o = overlap(boxOf(a), boxOf(b))
        if (!o) continue
        const [ax, ay] = centreOf(a.el)
        const [bx, by] = centreOf(b.el)
        const h = o.d / 2
        place(a.el, ...clampIsle(a, ax + (o.axis === 'x' ? h : 0), ay + (o.axis === 'y' ? h : 0)))
        place(b.el, ...clampIsle(b, bx - (o.axis === 'x' ? h : 0), by - (o.axis === 'y' ? h : 0)))
        moved = true
      }
    }
    if (!moved) return
  }
}
// One step of the islands that move on their own: glide, slow down, bounce off the sea's edge and off each other,
// passing most of the push on to the one they hit. One that stops is saved where it stopped.
const MAX_THROW = 1.6 // px per ms
function physics(dt) {
  const k = Math.pow(0.9, dt / 16)
  for (const [p, v] of bodies) {
    const isle = isles.get(p)
    if (!isle) { bodies.delete(p); continue }
    const [x, y] = centreOf(isle.el)
    const [cx, cy] = clampIsle(isle, x + v.vx * dt, y + v.vy * dt)
    if (cx !== x + v.vx * dt) v.vx = -v.vx * 0.5
    if (cy !== y + v.vy * dt) v.vy = -v.vy * 0.5
    const { hitX, hitY } = sweep(p, cx, cy)
    for (const [key, q] of [['vx', hitX], ['vy', hitY]]) {
      if (!q) continue
      if (isleDrag?.p === q) { v[key] = -v[key] * 0.4; continue } // a held island is a wall
      const hit = bodies.get(q) ?? { vx: 0, vy: 0 }
      const incoming = v[key] - hit[key]
      hit[key] += incoming * 0.7
      v[key] -= incoming * 1.3
      bodies.set(q, hit)
    }
    v.vx *= k
    v.vy *= k
    if (Math.hypot(v.vx, v.vy) < 0.02) {
      bodies.delete(p)
      saveSpot(p, isle.el)
    }
  }
}

function renderIslands(now) {
  const by = projectsNow(now)
  for (const [p, isle] of isles) if (!by.has(p)) { isle.el.remove(); isles.delete(p) }
  ;[...by.keys()].forEach((p, i) => {
    const crew = by.get(p)
    let isle = isles.get(p)
    if (!isle || isle.size !== crew.length) {
      isle?.el.remove()
      const biome = biomeOf(p)
      const el = document.createElement('div')
      el.className = `island ${biome.name}`
      el.dataset.project = p
      const land = landSvg(p, crew.length, biome)
      el.innerHTML = `${land.svg}<div class="crew"></div><span class="tag"></span>`
      el.querySelector('.tag').textContent = p
      worldEl.append(el)
      isle = { el, crew: el.querySelector('.crew'), mates: new Map(), w: land.w, h: land.h, dock: land.dock, side: land.side, size: crew.length }
      isles.set(p, isle)
    }
    if (!bodies.has(p) && isleDrag?.p !== p) place(isle.el, ...seaPx(spotOf(p, i)))
    for (const [name, b] of isle.mates) if (!crew.some(r => r.name === name)) { b.remove(); isle.mates.delete(name) }
    for (const r of crew) {
      let b = isle.mates.get(r.name)
      if (!b) {
        b = document.createElement('button')
        b.type = 'button'
        b.className = 'mate'
        b.dataset.name = r.name
        b.innerHTML = '<span class="alert"></span><span data-f="art" role="img"></span><span class="who"></span>'
        b.addEventListener('click', () => tapMate(r.name))
        isle.crew.append(b)
        isle.mates.set(r.name, b)
      }
      const st = stateOf(r, now)
      b.querySelector('.who').textContent = r.name.slice(p.length + 1) || r.name
      b.toggleAttribute('data-picked', linking === r.name)
      b.setAttribute('aria-label', linking && linking !== r.name ? `${r.name}: send the message here` : `${r.name}: ${STATE_LABEL[st]}`)
      badge(b.querySelector('.alert'), st)
    }
  })
  relax()
  seaEl.classList.toggle('linking', !!linking)
  byId('pick-hint').hidden = !linking
  if (linking) byId('pick-from').textContent = linking
  renderBubble(now)
  sail(now, 0)
}

function paintIslands(now) {
  for (const isle of isles.values()) {
    for (const [name, b] of isle.mates) {
      const r = sessions.find(x => x.name === name)
      if (!r) continue
      const st = stateOf(r, now)
      paint(b.querySelector('[data-f="art"]'), svgFor(lookOf(r), st, now))
      badge(b.querySelector('.alert'), st)
    }
  }
  if (bubbleFor) {
    const r = sessions.find(x => x.name === bubbleFor)
    if (r) fill(bubbleEl, r, now)
  }
}

// Every frame while the islands are in view: islands in motion, then the boats.
function frameIslands(now) {
  const t = performance.now()
  const dt = Math.min(48, t - lastFrame)
  lastFrame = t
  if (bodies.size) {
    physics(dt)
    if (bubbleFor) renderBubble(now)
  }
  sail(now, dt)
}

// ---- the sea: zoom, pan, and its glide after a release
function applyView() {
  seaEl.style.setProperty('--s', String(view.s))
  seaEl.style.setProperty('--tx', `${view.tx}px`)
  seaEl.style.setProperty('--ty', `${view.ty}px`)
  if (bubbleFor) renderBubble(Date.now())
  remember('islandsView', JSON.stringify(view))
}
// Scale by `k` keeping the screen point (px, py) over the same spot of the world.
function zoomAt(k, px, py) {
  const s = Math.min(2.5, Math.max(0.5, view.s * k))
  view = { s, tx: px - ((px - view.tx) * s) / view.s, ty: py - ((py - view.ty) * s) / view.s }
  applyView()
}
seaEl.addEventListener('wheel', e => {
  e.preventDefault()
  const box = seaEl.getBoundingClientRect()
  zoomAt(Math.exp(-e.deltaY * 0.0015), e.clientX - box.left, e.clientY - box.top)
}, { passive: false })
byId('zoom-in').addEventListener('click', () => zoomAt(1.25, seaEl.clientWidth / 2, seaEl.clientHeight / 2))
byId('zoom-out').addEventListener('click', () => zoomAt(0.8, seaEl.clientWidth / 2, seaEl.clientHeight / 2))
byId('zoom-fit').addEventListener('click', () => { view = { s: 1, tx: 0, ty: 0 }; applyView() })
try {
  const v = JSON.parse(recall('islandsView') ?? 'null')
  if (v && [v.s, v.tx, v.ty].every(Number.isFinite)) view = { s: Math.min(2.5, Math.max(0.5, v.s)), tx: v.tx, ty: v.ty }
} catch { /* start at the whole sea */ }

// The last moments of a drag, to know how fast it was going when let go (px per ms).
const track = () => {
  const pts = []
  return {
    add(x, y) {
      const t = performance.now()
      pts.push([x, y, t])
      while (pts.length > 2 && t - pts[0][2] > 90) pts.shift()
    },
    speed() {
      if (pts.length < 2) return [0, 0]
      const [x0, y0, t0] = pts[0]
      const [x1, y1, t1] = pts.at(-1)
      const dt = Math.max(1, t1 - t0)
      return performance.now() - t1 > 60 ? [0, 0] : [(x1 - x0) / dt, (y1 - y0) / dt] // held still before letting go: no glide
    },
  }
}
// The sea runs on and slows down after a pan.
function glide([vx, vy], step) {
  glider?.stop()
  if (reduced.matches || Math.hypot(vx, vy) < 0.05) return
  let last = performance.now()
  let alive = true
  glider = { stop() { alive = false } }
  const tick = t => {
    if (!alive) return
    const dt = Math.min(48, t - last)
    last = t
    step(vx * dt, vy * dt)
    const k = Math.pow(0.9, dt / 16)
    vx *= k
    vy *= k
    if (Math.hypot(vx, vy) < 0.02) return glider.stop()
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
}

// ---- the speech bubble: what one session is doing, and the two things to do with it. It lives in screen space, so
// its text stays readable at any zoom.
const bubbleEl = document.createElement('div')
bubbleEl.className = 'bubble'
bubbleEl.hidden = true
bubbleEl.innerHTML = `<div class="card-head"><span class="name" data-f="name"></span><span class="pill" data-f="state"></span></div>
  <p class="task" data-f="task"></p><p class="step" data-f="step"></p>
  <div class="progress"><span class="bar"><span class="fill" data-f="fill"></span></span><span data-f="prog"></span></div>
  <dl class="figures"><div><dt>Tokens</dt><dd data-f="tok"></dd></div><div><dt>Cost</dt><dd data-f="usd"></dd></div><div><dt>Tier</dt><dd data-f="tier"></dd></div></dl>
  <div class="ask-row"><button type="button" class="btn" data-act="look">Character</button><button type="button" class="btn" data-act="remove">Remove island</button><button type="button" class="btn primary" data-act="send">Send message</button></div>`
seaEl.append(bubbleEl)
bubbleEl.addEventListener('pointerdown', e => e.stopPropagation())
bubbleEl.addEventListener('wheel', e => e.stopPropagation())
bubbleEl.querySelector('[data-act="look"]').addEventListener('click', () => {
  const r = sessions.find(x => x.name === bubbleFor)
  if (r) openPicker(r)
})
// An island you no longer use: its sessions' records and its place are deleted. A session still running there writes
// its record again on its next heartbeat, so the island comes back until that session ends (or runs /web off).
// The first tap asks ("Sure? Remove"), the second removes; the button shows what went wrong, if anything.
const removeBtn = bubbleEl.querySelector('[data-act="remove"]')
let removeArmed = null // the project the next tap removes
removeBtn.addEventListener('click', async () => {
  const r = sessions.find(x => x.name === bubbleFor)
  if (!r || !db) return
  const p = project(r.name)
  if (removeArmed !== p) {
    removeArmed = p
    removeBtn.textContent = 'Sure? Remove'
    return
  }
  removeArmed = null
  removeBtn.textContent = 'Remove island'
  try {
    await Promise.all(sessions.filter(x => project(x.name) === p).map(x => db.doc(`sessions/${x.name}`).delete()))
    await db.doc(`places/${p}`).delete().catch(() => {}) // an island never moved has no saved place
    bubbleFor = null
  } catch (e) {
    removeBtn.textContent = e?.code === 'invalid_argument' ? 'Owner only' : `Failed (${e?.code ?? 'unknown'})`
  }
  renderIslands(Date.now())
})
bubbleEl.querySelector('[data-act="send"]').addEventListener('click', () => {
  linking = bubbleFor
  bubbleFor = null
  renderIslands(Date.now())
})
byId('pick-cancel').addEventListener('click', () => { linking = null; renderIslands(Date.now()) })
byId('pick-hint').addEventListener('pointerdown', e => e.stopPropagation())
addEventListener('keydown', e => {
  if (e.key !== 'Escape' || (!linking && !bubbleFor) || compose.open || picker.open) return
  linking = null
  bubbleFor = null
  renderIslands(Date.now())
})
applyView()

function renderBubble(now) {
  if (removeArmed && (!bubbleFor || project(bubbleFor) !== removeArmed)) {
    removeArmed = null
    removeBtn.textContent = 'Remove island'
  }
  const r = bubbleFor && sessions.find(x => x.name === bubbleFor)
  const b = r && isles.get(project(r.name))?.mates.get(r.name)
  bubbleEl.hidden = !b
  if (!b) return
  const box = seaEl.getBoundingClientRect()
  const m = b.getBoundingClientRect()
  const below = m.top - box.top < bubbleEl.offsetHeight + 24 // no room above: open under the character
  bubbleEl.classList.toggle('below', below)
  bubbleEl.style.left = `${Math.min(box.width - 160, Math.max(160, m.left - box.left + m.width / 2))}px`
  bubbleEl.style.top = `${(below ? m.bottom : m.top) - box.top}px`
  bubbleEl.querySelector('[data-act="send"]').disabled = sessions.length < 2
  fill(bubbleEl, r, now)
}

function tapMate(name) {
  if (suppressMateClick) return void (suppressMateClick = false)
  if (linking && linking !== name) {
    const from = linking
    linking = null
    renderIslands(Date.now())
    return openComposer(from, name)
  }
  linking = null
  bubbleFor = bubbleFor === name ? null : name
  renderIslands(Date.now())
}

// ---- boats: each sails its own way. It is not pinned to the docks, so moving an island never drags a boat along.
// A route is found on a coarse grid round every island (keeping off their shores where it can), shortened to the
// fewest legs that stay clear, and followed with a limited turn rate, so a boat swings round rather than snapping.
// Whatever the route says, a boat never moves into an island: a blocked step tries ever wider turns, or waits.
const GRID = 20 // px per route cell
const TURN = 0.0032 // radians per ms a boat can turn
const SHORE = 22 // px off an island a route prefers to keep
const within = (b, [x, y], m) => Math.abs(x - b.x) < b.hx + m && Math.abs(y - b.y) < b.hy + m
const angleTo = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b)) // a - b, the short way round
// The islands a boat must keep out of, as boxes for the point it floats on. A boat stands tall over that point (its
// sail is above it), so another island's box grows by the boat's size, most of all below the island; the two islands
// of its own trip keep their plain box, so it can still reach their docks. One it is inside already (an island
// dragged onto it) or whose box holds the end of its trip (islands pushed close together) does not count, else it
// could never leave or arrive.
function rocksFor(from, to, ends) {
  const rocks = []
  for (const isle of isles.values()) {
    const b = boxOf(isle)
    const r = ends.includes(isle) ? b : { x: b.x, y: b.y + 13, hx: b.hx + 14, hy: b.hy + 21 }
    if (!within(r, from, 2) && !within(r, to, 2)) rocks.push(r)
  }
  return rocks
}
const blocked = (rocks, p, m = 2) => rocks.some(b => within(b, p, m))
// Clear all along from a to b, with a margin that narrows near the ends so a leg can still leave or reach a dock.
function clearLine(rocks, a, b) {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1])
  for (let i = 1, n = Math.ceil(len / 5); i < n; i++) {
    const s = [a[0] + ((b[0] - a[0]) * i) / n, a[1] + ((b[1] - a[1]) * i) / n]
    const near = Math.min(Math.hypot(s[0] - a[0], s[1] - a[1]), Math.hypot(s[0] - b[0], s[1] - b[1]))
    if (blocked(rocks, s, Math.min(10, 2 + near * 0.5))) return false
  }
  return true
}
// A* over the grid from a to b; returns the legs' ends, ending at b. Without a way through, straight at b (the
// per-step check still keeps the boat off the land).
function route(a, b, ends) {
  const rocks = rocksFor(a, b, ends)
  const x0 = -6 * GRID
  const y0 = -6 * GRID
  const cols = Math.ceil(seaEl.clientWidth / GRID) + 12
  const rows = Math.ceil(seaEl.clientHeight / GRID) + 12
  const cellOf = ([x, y]) => Math.min(rows - 1, Math.max(0, Math.round((y - y0) / GRID))) * cols + Math.min(cols - 1, Math.max(0, Math.round((x - x0) / GRID)))
  const at = i => [x0 + (i % cols) * GRID, y0 + Math.floor(i / cols) * GRID]
  const start = cellOf(a)
  const goal = cellOf(b)
  const costs = new Float32Array(cols * rows).fill(-1)
  const cost = i => {
    if (costs[i] >= 0) return costs[i]
    const p = at(i)
    const out = p[0] < 0 || p[1] < 0 || p[0] > seaEl.clientWidth || p[1] > seaEl.clientHeight
    return (costs[i] = i === start || i === goal ? 1 : blocked(rocks, p) ? Infinity : 1 + (blocked(rocks, p, SHORE) ? 4 : 0) + (out ? 2 : 0))
  }
  const g = new Float32Array(cols * rows).fill(Infinity)
  const came = new Int32Array(cols * rows).fill(-1)
  const [gx, gy] = [goal % cols, Math.floor(goal / cols)]
  const h = i => {
    const dx = Math.abs((i % cols) - gx)
    const dy = Math.abs(Math.floor(i / cols) - gy)
    return Math.max(dx, dy) + 0.414 * Math.min(dx, dy)
  }
  const heap = [[h(start), start]] // a binary heap of [f, cell]
  const push = item => {
    heap.push(item)
    for (let i = heap.length - 1; i > 0;) {
      const up = (i - 1) >> 1
      if (heap[up][0] <= heap[i][0]) break
      ;[heap[up], heap[i]] = [heap[i], heap[up]]
      i = up
    }
  }
  const pop = () => {
    const top = heap[0]
    const last = heap.pop()
    if (heap.length) {
      heap[0] = last
      for (let i = 0; ;) {
        const l = 2 * i + 1
        const m = l + 1 < heap.length && heap[l + 1][0] < heap[l][0] ? l + 1 : l
        if (m >= heap.length || heap[i][0] <= heap[m][0]) break
        ;[heap[m], heap[i]] = [heap[i], heap[m]]
        i = m
      }
    }
    return top
  }
  g[start] = 0
  while (heap.length) {
    const [f, i] = pop()
    if (i === goal) break
    if (f - h(i) > g[i] + 1e-6) continue // a stale entry
    const cx = i % cols
    const cy = Math.floor(i / cols)
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = cx + dx
        const ny = cy + dy
        if ((!dx && !dy) || nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue
        const j = ny * cols + nx
        if (dx && dy && (cost(cy * cols + nx) === Infinity || cost(ny * cols + cx) === Infinity)) continue // no corner cutting
        const step = cost(j) * (dx && dy ? 1.414 : 1)
        if (g[i] + step < g[j]) {
          g[j] = g[i] + step
          came[j] = i
          push([g[j] + h(j), j])
        }
      }
    }
  }
  if (came[goal] < 0 && goal !== start) return [b]
  const cells = []
  for (let i = goal; i !== start && i >= 0; i = came[i]) cells.unshift(at(i))
  const pts = [a, ...cells.slice(0, -1), b]
  // the fewest legs: from each end, the farthest point still in clear sight
  const legs = []
  for (let i = 0; i < pts.length - 1;) {
    let j = pts.length - 1
    while (j > i + 1 && !clearLine(rocks, pts[i], pts[j])) j--
    legs.push(pts[j])
    i = j
  }
  return legs
}

// One frame of sailing toward `to`: re-plan now and then (islands move), turn toward the next leg's end within the
// turn rate, slow in a hard turn and near the end, and never step into an island.
function steer(ship, to, ends, now, dt) {
  if (!ship.legs || now - ship.plannedAt > 500 || Math.hypot(ship.to[0] - to[0], ship.to[1] - to[1]) > 8) {
    ship.legs = route([ship.x, ship.y], to, ends)
    ship.plannedAt = now
    ship.to = to
  }
  while (ship.legs.length > 1 && Math.hypot(ship.legs[0][0] - ship.x, ship.legs[0][1] - ship.y) < 16) ship.legs.shift()
  const [wx, wy] = ship.legs[0]
  const left = Math.hypot(to[0] - ship.x, to[1] - ship.y)
  const turn = angleTo(Math.atan2(wy - ship.y, wx - ship.x), ship.heading)
  ship.heading += Math.max(-TURN * dt, Math.min(TURN * dt, turn))
  const pace = SPEED * Math.max(0.3, Math.cos(Math.min(Math.abs(turn), Math.PI / 2))) * Math.min(1, 0.2 + left / 70)
  const step = Math.min(left, pace * dt)
  const rocks = rocksFor([ship.x, ship.y], to, ends)
  // the last few px straight in; otherwise along the heading, or the nearest turn that is clear
  const tries = left < 14 ? [Math.atan2(to[1] - ship.y, to[0] - ship.x)] : [0, 0.25, -0.25, 0.5, -0.5, 0.8, -0.8, 1.2, -1.2, 1.7, -1.7, 2.3, -2.3].map(o => ship.heading + o)
  for (const a of tries) {
    const p = [ship.x + Math.cos(a) * step, ship.y + Math.sin(a) * step]
    if (blocked(rocks, p)) continue
    if (left >= 14) ship.heading += angleTo(a, ship.heading) * 0.35 // lean into the way that was clear
    ship.x = p[0]
    ship.y = p[1]
    return
  }
}

const gone = new Set() // requests whose boat has come and gone (or that ended before this page saw them sail)
const LINGER = { delivered: 4000, failed: 9000 } // ms a boat stays moored once done, then it fades away
const FADE = 1200

function sail(now, dt) {
  const live = new Set()
  const wakes = []
  for (const q of recentRequests(now)) {
    if (gone.has(q.id)) continue
    const to = isles.get(project(q.target))
    const from = q.source ? isles.get(project(q.source)) : undefined
    if (!to || (q.source && !from)) continue
    let ship = ships.get(q.id)
    if (!ship && (q.status === 'delivered' || q.status === 'failed')) { gone.add(q.id); continue }
    live.add(q.id)
    const home = from ? harborOf(from) : [harborOf(to)[0] - 280, harborOf(to)[1] + 140] // no sender: in from the open sea
    const goal = harborOf(to)
    if (!ship) {
      ship = { x: home[0], y: home[1], heading: Math.atan2(goal[1] - home[1], goal[0] - home[0]), trail: [], face: 1, status: q.status, lastTrail: 0, doneAt: 0 }
      ships.set(q.id, ship)
    }
    let el = boats.get(q.id)
    if (!el || el.dataset.status !== q.status) {
      el?.remove()
      el = document.createElement('div')
      el.className = 'boat'
      el.dataset.status = q.status
      el.title = `${routeText(q)} · ${STATUS_LABEL[q.status]}`
      el.innerHTML = boatSvg(q)
      worldEl.append(el)
      boats.set(q.id, el)
    }
    ship.status = q.status
    // waiting for the sender's answer, or failed: moored off the sender; carried or delivered: heading for the receiver
    const target = q.status === 'pending' || q.status === 'failed' ? home : goal
    const gap = Math.hypot(target[0] - ship.x, target[1] - ship.y)
    if (reduced.matches || gap < 2) {
      ship.x = target[0]
      ship.y = target[1]
    } else if (dt) {
      const [px, py] = [ship.x, ship.y]
      steer(ship, target, [from, to].filter(Boolean), now, dt)
      if (Math.abs(ship.x - px) > 0.05 && Math.abs(Math.cos(ship.heading)) > 0.25) ship.face = ship.x > px ? 1 : -1
      if (now - ship.lastTrail > 140) {
        ship.trail.push([ship.x, ship.y])
        if (ship.trail.length > 12) ship.trail.shift()
        ship.lastTrail = now
      }
    }
    const moored = Math.hypot(target[0] - ship.x, target[1] - ship.y) < 2
    if (moored && ship.trail.length) ship.trail.shift() // the wake fades once it has stopped
    // done and moored: a moment at the dock, then it fades out and is gone for good
    const done = moored && LINGER[q.status]
    if (done && !ship.doneAt) ship.doneAt = now
    if (!done) ship.doneAt = 0
    const since = ship.doneAt ? now - ship.doneAt : 0
    if (ship.doneAt && since > LINGER[q.status] + FADE) {
      gone.add(q.id)
      live.delete(q.id)
      continue
    }
    const bob = reduced.matches ? 0 : Math.sin(now / 420 + ship.x) * 2
    el.style.left = `${ship.x}px`
    el.style.top = `${ship.y + bob}px`
    el.style.transform = `translate(-50%, -82%) scaleX(${ship.face})`
    el.style.opacity = ship.doneAt && since > LINGER[q.status] ? String(Math.max(0, 1 - (since - LINGER[q.status]) / FADE)) : ''
    el.classList.toggle('arrived', q.status === 'delivered' && !!ship.doneAt && since < LINGER.delivered)
    if (ship.trail.length > 1) {
      const p = document.createElementNS(SVGNS, 'path')
      p.setAttribute('d', `M${ship.trail.map(pt => pt.join(',')).join(' L')} L${ship.x},${ship.y}`)
      p.setAttribute('class', 'trail')
      wakes.push(p)
    }
  }
  for (const [id, el] of boats) if (!live.has(id)) { el.remove(); boats.delete(id); ships.delete(id) }
  if (mateDrag?.moved) wakes.push(...draftLine(mateDrag))
  wakeEl.replaceChildren(...wakes)
}

// The line drawn from a held character: a rope that sags a little, marching toward the pointer, an arrowhead at the
// end; it turns green over someone who can take the message.
function draftLine(d) {
  const a = [d.sx, d.sy]
  const b = [d.x, d.y]
  const len = Math.hypot(b[0] - a[0], b[1] - a[1])
  const c = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + Math.min(60, len * 0.18)]
  const dpath = `M${a[0]},${a[1]} Q${c[0]},${c[1]} ${b[0]},${b[1]}`
  const ok = d.over ? ' ok' : ''
  const el = (tag, attrs) => {
    const e = document.createElementNS(SVGNS, tag)
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v)
    return e
  }
  const ang = Math.atan2(b[1] - c[1], b[0] - c[0])
  const tip = (r, da) => `${b[0] + Math.cos(ang + da) * r},${b[1] + Math.sin(ang + da) * r}`
  return [
    el('path', { d: dpath, class: 'draft-casing' }),
    el('path', { d: dpath, class: `draft-line${ok}` }),
    el('circle', { cx: a[0], cy: a[1], r: 8, class: `draft-dot${ok}` }),
    el('path', { d: `M${tip(6, 0)} L${tip(22, 2.6)} L${tip(22, -2.6)} Z`, class: `draft-head${ok}` }),
  ]
}

// ---- pointer: drag an island by its land to move it (and throw it); drag from one character to another to send; drag
// open water to pan; a tap on open water closes the bubble
// Where islands were put but the database has not confirmed yet: a snapshot from before the write must not move them back.
const unsavedPlaces = new Map()
function saveSpot(p, el) {
  const [x, y] = centreOf(el)
  const spot = { x: Math.min(1, Math.max(0, x / seaEl.clientWidth)), y: Math.min(1, Math.max(0, y / seaEl.clientHeight)) }
  places = { ...places, [p]: spot }
  unsavedPlaces.set(p, spot)
  db?.doc(`places/${p}`).set({ ...spot, at: Date.now() })
    .then(() => { if (unsavedPlaces.get(p) === spot) unsavedPlaces.delete(p) })
    .catch(err => { unsavedPlaces.delete(p); note(`Could not save the island's place (${err?.code ?? 'unknown'}).`) })
}
seaEl.addEventListener('pointerdown', e => {
  if (e.target.closest('.zoom')) return
  glider?.stop()
  const mate = e.target.closest('.mate')
  const land = e.target.closest('svg.land')
  const [x, y] = toWorld(e.clientX, e.clientY)
  if (mate) {
    const m = mate.querySelector('[data-f="art"]').getBoundingClientRect()
    const [sx, sy] = toWorld(m.left + m.width / 2, m.top + m.height / 2)
    mateDrag = { from: mate.dataset.name, sx, sy, x, y, cx: e.clientX, cy: e.clientY, moved: false, over: null }
  } else if (land && db) {
    const el = land.parentElement
    const p = el.dataset.project
    bodies.delete(p) // caught mid-glide
    const [ix, iy] = centreOf(el)
    isleDrag = { p, el, dx: x - ix, dy: y - iy, moved: false, track: track() }
    el.classList.add('dragging')
    seaEl.setPointerCapture(e.pointerId)
  } else {
    pan = { cx: e.clientX, cy: e.clientY, tx: view.tx, ty: view.ty, moved: false, track: track() }
    seaEl.setPointerCapture(e.pointerId)
  }
})
seaEl.addEventListener('pointermove', e => {
  if (pan) {
    pan.track.add(e.clientX, e.clientY)
    if (!pan.moved && Math.hypot(e.clientX - pan.cx, e.clientY - pan.cy) > 4) {
      pan.moved = true
      seaEl.classList.add('panning')
    }
    if (pan.moved) {
      view = { ...view, tx: pan.tx + e.clientX - pan.cx, ty: pan.ty + e.clientY - pan.cy }
      applyView()
    }
    return
  }
  const [x, y] = toWorld(e.clientX, e.clientY)
  if (isleDrag) {
    isleDrag.moved = true
    isleDrag.track.add(x, y)
    sweep(isleDrag.p, x - isleDrag.dx, y - isleDrag.dy) // follows the pointer, stops at and slides along other islands
    if (bubbleFor) renderBubble(Date.now())
    return
  }
  if (!mateDrag) return
  mateDrag.x = x
  mateDrag.y = y
  if (!mateDrag.moved && Math.hypot(e.clientX - mateDrag.cx, e.clientY - mateDrag.cy) > 6) {
    mateDrag.moved = true
    seaEl.setPointerCapture(e.pointerId) // only a real drag is captured, so a plain tap still reaches the character
  }
  if (!mateDrag.moved) return
  const over = document.elementFromPoint(e.clientX, e.clientY)?.closest('.mate')
  mateDrag.over = over && over.dataset.name !== mateDrag.from ? over.dataset.name : null
  for (const isle of isles.values()) for (const b of isle.mates.values()) b.classList.toggle('target', b.dataset.name === mateDrag.over)
  sail(Date.now(), 0)
})
seaEl.addEventListener('pointerup', e => {
  if (pan) {
    const p = pan
    pan = null
    seaEl.classList.remove('panning')
    if (!p.moved) {
      if (bubbleFor || linking) {
        bubbleFor = null
        linking = null
        renderIslands(Date.now())
      }
      return
    }
    glide(p.track.speed(), (dx, dy) => { view = { ...view, tx: view.tx + dx, ty: view.ty + dy }; applyView() })
    return
  }
  if (isleDrag) {
    const d = isleDrag
    isleDrag = null
    d.el.classList.remove('dragging')
    if (!d.moved) return
    const [vx, vy] = d.track.speed()
    const speed = Math.hypot(vx, vy)
    if (reduced.matches || speed < 0.05) return saveSpot(d.p, d.el)
    const cap = Math.min(1, MAX_THROW / speed)
    bodies.set(d.p, { vx: vx * cap, vy: vy * cap }) // thrown: it glides, bounces, and is saved where it stops
    return
  }
  if (!mateDrag) return
  const d = mateDrag
  mateDrag = null
  for (const isle of isles.values()) for (const b of isle.mates.values()) b.classList.remove('target')
  sail(Date.now(), 0)
  if (!d.moved) return
  suppressMateClick = true // the click that follows a drag is not a tap
  setTimeout(() => (suppressMateClick = false), 0)
  if (d.over) openComposer(d.from, d.over)
})
seaEl.addEventListener('pointercancel', () => {
  if (isleDrag) {
    isleDrag.el.classList.remove('dragging')
    if (isleDrag.moved) saveSpot(isleDrag.p, isleDrag.el)
  }
  seaEl.classList.remove('panning')
  isleDrag = null
  mateDrag = null
  pan = null
})
new ResizeObserver(() => { if (!byId('view-islands').hidden) renderIslands(Date.now()) }).observe(seaEl)

function toPlace(d) {
  const ok = v => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1
  return d && typeof d === 'object' && ok(d.x) && ok(d.y) ? { x: d.x, y: d.y } : undefined
}

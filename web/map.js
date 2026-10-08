// The map: sessions on a ring, requests as lines between them. Drag from one session to another (or tap one, then the
// other) and the request box opens for that pair.

const mapEl = byId('map')
const linksEl = byId('map-links')
const nodes = new Map() // session name -> node element
let picked = null // a session tapped first, waiting for the second
let drag = null // { from, x, y, moved }
let suppressClick = false
const SVGNS = 'http://www.w3.org/2000/svg'
const LINE_FOR = 10 * 60_000 // a delivered request stays drawn this long

function ringSpot(i, n, w, h) {
  if (n === 1) return [w / 2, h / 2]
  const a = (i / n) * 2 * Math.PI - Math.PI / 2
  return [w / 2 + Math.cos(a) * w * 0.36, h / 2 + 10 + Math.sin(a) * h * 0.34]
}
const centreOf = el => [parseFloat(el.style.left), parseFloat(el.style.top)]
// A gentle arc, bent to one side, so A→B and B→A do not lie on top of each other.
function arc([x1, y1], [x2, y2], bend = 0.18) {
  const mx = (x1 + x2) / 2 - (y2 - y1) * bend
  const my = (y1 + y2) / 2 + (x2 - x1) * bend
  return `M${x1},${y1} Q${mx},${my} ${x2},${y2}`
}
function path(d, cls) {
  const p = document.createElementNS(SVGNS, 'path')
  p.setAttribute('d', d)
  p.setAttribute('class', cls)
  return p
}

function renderMap(now) {
  const shown = shownSessions(now)
  const w = mapEl.clientWidth
  const h = mapEl.clientHeight
  for (const [name, el] of nodes) if (!shown.some(r => r.name === name)) { el.remove(); nodes.delete(name) }
  shown.forEach((r, i) => {
    let el = nodes.get(r.name)
    if (!el) {
      el = document.createElement('button')
      el.type = 'button'
      el.className = 'node'
      el.dataset.name = r.name
      el.innerHTML = '<span class="screen"><span data-f="art" role="img"></span></span><span class="name" data-f="name"></span>'
      el.addEventListener('click', () => tapNode(r.name))
      mapEl.append(el)
      nodes.set(r.name, el)
    }
    const [x, y] = ringSpot(i, shown.length, w, h)
    el.style.left = `${x}px`
    el.style.top = `${y}px`
    el.toggleAttribute('data-picked', picked === r.name)
    el.setAttribute('aria-label', picked && picked !== r.name ? `Request between ${picked} and ${r.name}` : `${r.name}: select to connect`)
    fill(el, r, now)
  })
  drawLinks(now)
}

function drawLinks(now) {
  const ps = []
  for (const q of recentRequests(now)) {
    if (q.status === 'delivered' && now - q.at > LINE_FOR) continue
    const to = nodes.get(q.target)
    if (!to) continue
    const from = q.source ? nodes.get(q.source) : undefined
    if (q.source && !from) continue
    const start = from ? centreOf(from) : [mapEl.clientWidth / 2, 0] // a message comes from the page itself
    ps.push(path(arc(start, centreOf(to)), `l-${q.status}`))
  }
  if (drag?.moved) ps.push(path(`M${drag.sx},${drag.sy} L${drag.x},${drag.y}`, 'l-draft'))
  linksEl.replaceChildren(...ps)
}

function paintMap(now) {
  for (const r of sessions) {
    const el = nodes.get(r.name)
    if (el) paint(el.querySelector('[data-f="art"]'), svgFor(lookOf(r), stateOf(r, now), now))
  }
}

function tapNode(name) {
  if (suppressClick) return void (suppressClick = false)
  if (picked && picked !== name) {
    const a = picked
    picked = null
    renderMap(Date.now())
    return openComposer(a, name)
  }
  picked = picked === name ? null : name
  renderMap(Date.now())
}

const nodeAt = (x, y) => document.elementFromPoint(x, y)?.closest('.node')
mapEl.addEventListener('pointerdown', e => {
  const el = e.target.closest('.node')
  if (!el) {
    if (picked) { picked = null; renderMap(Date.now()) }
    return
  }
  const box = mapEl.getBoundingClientRect()
  const [sx, sy] = centreOf(el)
  drag = { from: el.dataset.name, sx, sy, x: e.clientX - box.left, y: e.clientY - box.top, cx: e.clientX, cy: e.clientY, moved: false }
})
mapEl.addEventListener('pointermove', e => {
  if (!drag) return
  const box = mapEl.getBoundingClientRect()
  drag.x = e.clientX - box.left
  drag.y = e.clientY - box.top
  if (!drag.moved && Math.hypot(e.clientX - drag.cx, e.clientY - drag.cy) > 6) {
    drag.moved = true
    mapEl.setPointerCapture(e.pointerId) // only a real drag is captured, so a plain tap still reaches the node
  }
  if (!drag.moved) return
  const over = nodeAt(e.clientX, e.clientY)
  for (const el of nodes.values()) el.classList.toggle('target', el === over && el.dataset.name !== drag.from)
  drawLinks(Date.now())
})
mapEl.addEventListener('pointerup', e => {
  if (!drag) return
  const d = drag
  drag = null
  for (const el of nodes.values()) el.classList.remove('target')
  drawLinks(Date.now())
  if (!d.moved) return
  suppressClick = true // the click that follows a drag is not a tap
  setTimeout(() => (suppressClick = false), 0)
  const over = nodeAt(e.clientX, e.clientY)
  if (over && over.dataset.name !== d.from) openComposer(d.from, over.dataset.name)
})
mapEl.addEventListener('pointercancel', () => { drag = null; drawLinks(Date.now()) })
new ResizeObserver(() => { if (!byId('map-view').hidden) renderMap(Date.now()) }).observe(mapEl)

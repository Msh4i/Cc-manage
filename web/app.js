// Shared by both views: the data read from the artifact's database, the budget handles, the character picker, the
// session cards and the request box. Rows in the database are data from outside the page: every field is checked.

const { parseRecord, effectiveState, visibleRecords, STATE_LABEL, topTools, totalTokens, ago, tok } = M.registry
const { fmtReset, DEFAULT_BUDGETS } = M.viewmodel
const { barStatus } = M.budget
const { abilities } = M.selfrecord
const { artFor } = M.art

// Snapshots can arrive up to ~30 s late when the live stream falls back to periodic refresh;
// a session is only called lost once that delay is also used up.
const SLACK_MS = 30_000
const KNOBS = ['weekly', 'fiveHour']
const reduced = matchMedia('(prefers-reduced-motion: reduce)')
const byId = id => document.getElementById(id)
const all = sel => document.querySelectorAll(sel)
const cards = new Map() // session name -> card element
let sessions = []
let usage = null
let control = null // budgets as the control document holds them
let draft = null // budgets being moved here, until saved
let looks = {} // session name -> character chosen on this page
const unsavedLooks = new Map() // picked here, not yet confirmed by the database
let requests = [] // between sessions, newest first
let db = null

const clip = (s, n) => (typeof s === 'string' ? s.slice(0, n) : '')
const num = (n, d) => (typeof n === 'number' && Number.isFinite(n) ? n : d)
const time = ms => new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
const f1 = n => String(Math.round(n * 10) / 10)
const clampB = v => Math.min(100, Math.max(1, Math.round(Number(v) || 1)))
const budgets = () => draft ?? control ?? usage?.budgets ?? DEFAULT_BUDGETS
const project = name => name.replace(/-[0-9a-f]{6}$/, '') // the folder a session runs in: its name less the id
const remember = (k, v) => { try { localStorage.setItem(k, v) } catch { /* private window: forget */ } }
const recall = k => { try { return localStorage.getItem(k) } catch { return null } }

function toSession(data) {
  const r = parseRecord(JSON.stringify(data ?? null))
  if (!r) return undefined
  const c = data.character && typeof data.character === 'object' ? data.character : {}
  return { ...r, summary: clip(data.summary, 240), character: toLook(c) ?? DEFAULT_LOOK }
}
function toUsage(d) {
  if (!d || typeof d !== 'object') return null
  const u = d.usage && typeof d.usage === 'object' ? d.usage : {}
  const win = w => (w && typeof w === 'object' && num(w.used, null) !== null ? { used: w.used, ...(typeof w.resetsAt === 'string' ? { resetsAt: w.resetsAt.slice(0, 40) } : {}) } : undefined)
  return { usage: { weekly: win(u.weekly), fiveHour: win(u.fiveHour) }, budgets: toBudgets(d.budgets) ?? DEFAULT_BUDGETS, by: clip(d.by, 40), at: num(d.at, 0) }
}
function toBudgets(d) {
  if (!d || typeof d !== 'object') return null
  const base = usage?.budgets ?? DEFAULT_BUDGETS
  return Object.fromEntries(KNOBS.map(k => [k, typeof d[k] === 'number' && Number.isFinite(d[k]) ? clampB(d[k]) : base[k]]))
}
// A look is one of the shipped characters (own keys only: "__proto__" is not a design). A Clawd wears its activity
// accessories (headset to talk, hard hat to work, cap to sleep...) as part of the character: its "full" set.
function toLook(d) {
  const chars = ART.manifest.characters
  if (!d || typeof d !== 'object' || typeof d.id !== 'string' || !Object.hasOwn(chars, d.id)) return undefined
  return { id: d.id, variant: Object.hasOwn(chars[d.id].variants ?? {}, 'full') ? 'full' : '', accessories: [] }
}
const DEFAULT_LOOK = toLook({ id: ART.manifest.defaultCharacter })
const NAME = /^[a-z0-9._-]{1,40}$/
const STATUS = ['pending', 'carried', 'delivered', 'failed']
function toRequest(id, d) {
  if (!d || typeof d !== 'object' || !STATUS.includes(d.status) || !NAME.test(d.target ?? '')) return undefined
  const source = NAME.test(d.source ?? '') && d.source !== d.target ? d.source : '' // a message names its sender for the route
  if (d.kind !== 'message' && !(d.kind === 'forward' && source)) return undefined
  return { id, kind: d.kind, source, target: d.target, note: clip(d.note, 1000), status: d.status, error: clip(d.error, 200), at: num(d.at, 0) }
}

// A mark over a character that wants attention: a hopping "!" while it waits on you, a check once it has answered.
const BADGE = {
  waiting: '<svg viewBox="0 0 9 11" shape-rendering="crispEdges" aria-hidden="true"><rect x="1" y="0" width="7" height="8" fill="#2b2a27"/><rect x="0" y="1" width="9" height="6" fill="#2b2a27"/><rect x="1" y="1" width="7" height="6" fill="#f2c14e"/><rect x="4" y="2" width="1" height="3" fill="#2b2a27"/><rect x="4" y="6" width="1" height="1" fill="#2b2a27"/><rect x="3" y="8" width="3" height="1" fill="#2b2a27"/><rect x="4" y="9" width="1" height="1" fill="#2b2a27"/></svg>',
  done: '<svg viewBox="0 0 9 11" shape-rendering="crispEdges" aria-hidden="true"><rect x="1" y="0" width="7" height="8" fill="#1e3d2a"/><rect x="0" y="1" width="9" height="6" fill="#1e3d2a"/><rect x="1" y="1" width="7" height="6" fill="#5bb974"/><rect x="2" y="4" width="1" height="1" fill="#f5f4ee"/><rect x="3" y="5" width="1" height="1" fill="#f5f4ee"/><rect x="4" y="4" width="1" height="1" fill="#f5f4ee"/><rect x="5" y="3" width="1" height="1" fill="#f5f4ee"/><rect x="6" y="2" width="1" height="1" fill="#f5f4ee"/><rect x="3" y="8" width="3" height="1" fill="#1e3d2a"/><rect x="4" y="9" width="1" height="1" fill="#1e3d2a"/></svg>',
}
function badge(el, state) {
  const kind = state === 'waiting' || state === 'done' ? state : ''
  if (el.dataset.kind === kind) return
  el.dataset.kind = kind
  el.innerHTML = kind ? BADGE[kind] : ''
  el.title = kind === 'waiting' ? 'Waiting on you: a question or a permission' : kind === 'done' ? 'Done' : ''
}

const stateOf = (r, now) => effectiveState(r, now - SLACK_MS)
const lookOf = r => looks[r.name] ?? r.character
const svgFor = (sel, state, now) => {
  const a = artFor(ART.manifest, ART.sprites, ART.accessories, sel, state, 'desktop', reduced.matches ? 0 : now, 'web')
  return a && a.kind === 'svg' ? a.svg : ''
}
// Only a changed frame touches the DOM. The SVG comes from the shipped sprites, never from the database.
function paint(el, svg) {
  if (el.dataset.svg === svg) return
  el.innerHTML = svg
  el.dataset.svg = svg
}
function note(text) {
  byId('note').textContent = text
  byId('note').hidden = !text
}

// ---- limits: each bar on its own 0-100 % scale, so the budget handle and the hatched part past it move with the number.
// The same windows appear in the panel and on the islands' strip; both are kept in step.
const THUMB = 10 // px, as .meter --thumb: the range input centres its thumb inside this inset
const at = v => `calc(${THUMB / 2}px + (100% - ${THUMB}px) * ${Math.min(100, Math.max(0, v)) / 100})`

function renderUsage() {
  const b = budgets()
  const tz = new Date().getTimezoneOffset()
  for (const k of KNOBS) {
    const w = usage?.usage?.[k]
    for (const el of all(`.win[data-win="${k}"]`)) {
      const f = n => el.querySelector(`[data-f="${n}"]`)
      el.dataset.level = w ? barStatus(w.used, b[k]).level : 'none'
      f('value').textContent = w ? `${f1(w.used)}%` : '—'
      f('used').style.width = w ? `${Math.min(100, Math.max(0, w.used))}%` : '0'
      f('past').style.left = at(b[k])
      if (f('text')) f('text').textContent = w
        ? [b[k] >= w.used ? `${f1(b[k] - w.used)}% left` : `${f1(w.used - b[k])}% over`, w.resetsAt ? `resets ${fmtReset(w.resetsAt, tz)}` : ''].filter(Boolean).join(' · ')
        : 'no data'
    }
  }
  for (const el of all('.read-at')) el.textContent = usage?.at ? `Read at ${time(usage.at)}${usage.by ? ` · ${usage.by}` : ''}` : ''
}

// ---- budget handles and boxes: what is moved here goes to control/budgets; every session reads it on its heartbeat
function showBudgets() {
  if (draft) return // never pull a value out from under the person moving it
  const b = budgets()
  for (const el of all('[data-knob]')) el.value = b[el.dataset.knob]
}
function budgetStatus(text, bad = false) {
  for (const el of all('.b-status')) {
    el.textContent = text
    el.toggleAttribute('data-bad', bad)
  }
}
function lockBudgets(text) {
  for (const el of all('[data-knob]')) el.disabled = true
  budgetStatus(text)
}
let saving = false
let again = false
// One write at a time; moves made while it runs go out in the next one.
async function saveBudgets() {
  if (!db || !draft) return
  if (saving) return void (again = true)
  saving = true
  budgetStatus('Saving…')
  try {
    do {
      again = false
      const b = { ...draft }
      await db.doc('control/budgets').set({ ...b, by: 'web', at: Date.now() })
      control = b
    } while (again)
    budgetStatus(`Saved ${time(Date.now())}`)
  } catch (e) {
    if (e?.code === 'invalid_argument') lockBudgets('Only the owner and editors can change this.')
    else budgetStatus(`Could not save (${e?.code ?? 'unknown'})`, true)
  } finally {
    saving = false
    draft = null
    showBudgets()
    renderUsage()
  }
}
for (const src of all('[data-knob]')) {
  const k = src.dataset.knob
  const sync = () => { for (const el of all(`[data-knob="${k}"]`)) if (el !== src) el.value = draft[k] }
  // moving previews the bars at once; the write waits for the release (or Enter / leaving the box)
  src.addEventListener('input', () => {
    if (src.value === '') return
    draft = { ...budgets(), [k]: clampB(src.value) }
    sync()
    renderUsage()
  })
  src.addEventListener('change', () => {
    draft = { ...budgets(), [k]: clampB(src.value) }
    src.value = draft[k]
    sync()
    renderUsage()
    void saveBudgets()
  })
}

// ---- character picker: one card per character, each running through a few moods so its moves (and a Clawd's
// accessories) show. Nothing is chosen for a session unless picked here.
const LOOKS = Object.entries(ART.manifest.characters).map(([id, c]) => ({ id, name: c.name, sel: toLook({ id }) }))
const SHOWREEL = ['working', 'thinking', 'talking', 'done', 'idle']
const lookLabel = sel => ART.manifest.characters[(toLook(sel) ?? DEFAULT_LOOK).id].name

const picker = byId('picker')
let pickingFor = null
const tiles = LOOKS.map(look => {
  const tile = document.createElement('button')
  tile.type = 'button'
  tile.className = 'tile'
  tile.innerHTML = '<span class="tile-art"></span><span class="tile-name"></span>'
  tile.querySelector('.tile-name').textContent = look.name
  tile.addEventListener('click', () => choose(look.sel))
  byId('picker-body').append(tile)
  return { tile, art: tile.querySelector('.tile-art'), look }
})
byId('picker-close').addEventListener('click', () => picker.close())
picker.addEventListener('click', e => { if (e.target === picker) picker.close() }) // a click on the backdrop

function openPicker(r) {
  if (!db) return
  pickingFor = r.name
  byId('picker-title').textContent = r.name
  const current = (toLook(lookOf(r)) ?? DEFAULT_LOOK).id
  for (const { tile, look } of tiles) tile.setAttribute('aria-pressed', String(look.id === current))
  picker.showModal()
  animate()
  tiles.find(t => t.look.id === current)?.tile.focus()
}
function choose(sel) {
  const name = pickingFor
  picker.close()
  if (!name) return
  looks = { ...looks, [name]: sel }
  unsavedLooks.set(name, sel)
  renderAll(Date.now())
  db?.doc(`looks/${name}`).set({ id: sel.id, variant: sel.variant, at: Date.now() })
    .then(() => { if (unsavedLooks.get(name) === sel) unsavedLooks.delete(name) })
    .catch(e => unsavedLooks.delete(name) || note(e?.code === 'invalid_argument' ? 'Only the owner and editors can change the character.' : `Could not save the character (${e?.code ?? 'unknown'}).`))
}

// ---- the details of one session: filled into a card, and into an island's speech bubble
function fill(el, r, now) {
  const st = stateOf(r, now)
  const f = k => el.querySelector(`[data-f="${k}"]`)
  const set = (k, v) => { if (f(k)) f(k).textContent = v }
  el.dataset.state = st
  el.toggleAttribute('data-saving', r.tier > 0)
  set('name', r.name)
  if (f('name')) f('name').title = r.name
  set('state', STATE_LABEL[st])
  set('tier', r.tierName || String(r.tier))
  set('task', r.task || '—')
  set('step', r.step || '—')
  set('prog', r.progress.total ? `${r.progress.done}/${r.progress.total}` : 'no plan')
  if (f('fill')) f('fill').style.width = r.progress.total ? `${Math.min(100, (r.progress.done / r.progress.total) * 100)}%` : '0'
  set('tok', tok(totalTokens(r)))
  set('usd', `${r.usd.toFixed(2)} USD`)
  set('ago', ago(Math.max(0, now - r.updatedAt)))
  set('summary', r.summary || '—')
  set('reason', [r.tierName, r.tierReason].filter(Boolean).join(' · ') || '—')
  const can = abilities(r.tools)
  set('can', can.length ? can.join(', ') : '—')
  set('tools', topTools(r.tools) || '—')
  set('look', lookLabel(lookOf(r)))
  if (f('pick')) f('pick').setAttribute('aria-label', `Change ${r.name}'s character: ${lookLabel(lookOf(r))}`)
  if (f('art')) {
    f('art').setAttribute('aria-label', `${r.name}: ${STATE_LABEL[st]}`)
    paint(f('art'), svgFor(lookOf(r), st, now))
  }
}

// newest session first, by start time, so nothing jumps on every update
const shownSessions = now => visibleRecords(sessions, now).sort((a, b) => b.startedAt - a.startedAt)

function renderCards(now) {
  const shown = shownSessions(now)
  const list = byId('cards')
  for (const [name, el] of cards) if (!shown.some(r => r.name === name)) { el.remove(); cards.delete(name) }
  for (const r of shown) {
    if (!cards.has(r.name)) {
      const card = byId('card-tpl').content.firstElementChild.cloneNode(true)
      card.querySelector('[data-f="pick"]').addEventListener('click', () => {
        const cur = sessions.find(x => x.name === r.name)
        if (cur) openPicker(cur)
      })
      cards.set(r.name, card)
    }
    fill(cards.get(r.name), r, now)
  }
  const order = shown.map(r => cards.get(r.name))
  if (order.some((el, i) => list.children[i] !== el)) list.append(...order)
  const active = shown.filter(r => ['working', 'thinking', 'talking', 'saving_mode'].includes(stateOf(r, now))).length
  byId('count').textContent = shown.length ? `${shown.length} session${shown.length === 1 ? '' : 's'} · ${active} active` : ''
  byId('empty').hidden = shown.length > 0
}

// ---- requests between sessions: the latest few, with where they stand; one still on its way can be called off
const STATUS_LABEL = { pending: 'waiting for the answer', carried: 'on its way', delivered: 'delivered', failed: 'failed' }
const DAY = 24 * 3_600_000
const recentRequests = now => requests.filter(q => now - q.at < DAY)
const routeText = q => (q.source ? `${q.source} → ${q.target}` : `→ ${q.target}`)

function renderRequests(now) {
  const list = byId('reqs')
  list.replaceChildren(...recentRequests(now).slice(0, 6).map(q => {
    const li = document.createElement('li')
    const route = document.createElement('span')
    route.className = 'route'
    route.textContent = routeText(q)
    const what = document.createElement('span')
    what.className = 'what'
    what.textContent = q.status === 'failed' && q.error ? q.error : q.note || (q.kind === 'forward' ? 'last answer' : '')
    const chip = document.createElement('span')
    chip.className = 'chip'
    chip.dataset.s = q.status
    chip.textContent = STATUS_LABEL[q.status]
    li.append(route, what, chip)
    if ((q.status === 'pending' || q.status === 'carried') && db) {
      const stop = document.createElement('button')
      stop.type = 'button'
      stop.textContent = 'cancel'
      stop.addEventListener('click', () => db.doc(`requests/${q.id}`).delete().catch(e => note(`Could not cancel (${e?.code ?? 'unknown'}).`)))
      li.append(stop)
    }
    return li
  }))
}

// ---- sending: the sender's last answer goes to the receiver, with a note on what to do with it if you like
const compose = byId('compose')
let composing = null // { source, target } session names

function openComposer(source, target) {
  if (!db || !source || !target || source === target) return
  composing = { source, target }
  byId('compose-note').value = ''
  composeStatus('')
  drawComposer()
  compose.showModal()
  byId('compose-note').focus()
}
function composeStatus(text, bad = false) {
  byId('compose-status').textContent = text
  byId('compose-status').toggleAttribute('data-bad', bad)
}
function drawComposer() {
  const { source, target } = composing
  byId('compose-from').textContent = source
  byId('compose-to').textContent = target
  byId('compose-boat').innerHTML = boatSvg({ status: 'carried', kind: 'forward' })
  paintComposer(Date.now())
}
function paintComposer(now) {
  const s = sessions.find(x => x.name === composing?.source)
  const t = sessions.find(x => x.name === composing?.target)
  if (s) paint(byId('compose-from-art'), svgFor(lookOf(s), 'talking', now))
  if (t) paint(byId('compose-to-art'), svgFor(lookOf(t), stateOf(t, now), now))
}
byId('compose-swap').addEventListener('click', () => {
  composing = { source: composing.target, target: composing.source }
  drawComposer()
})
byId('compose-form').addEventListener('submit', async e => {
  e.preventDefault()
  if (!composing || !db) return
  const note = clip(byId('compose-note').value.trim(), 1000)
  byId('compose-send').disabled = true
  try {
    await db.collection('requests').add({ kind: 'forward', ...composing, note, status: 'pending', by: 'web', at: Date.now() })
    compose.close()
  } catch (err) {
    composeStatus(err?.code === 'invalid_argument' ? 'Only the page owner and editors can send.' : `Could not send (${err?.code ?? 'unknown'}).`, true)
  } finally {
    byId('compose-send').disabled = false
  }
})
byId('compose-close').addEventListener('click', () => compose.close())
compose.addEventListener('click', e => { if (e.target === compose) compose.close() })

// ---- views: Panel or Islands; in the panel, cards or the map. The choice is remembered on this device only.
function setTab(ids, chosen) {
  for (const id of ids) byId(id).setAttribute('aria-selected', String(id === chosen))
}
// The islands are the page; the older panel view is kept for whoever opens the page at #panel.
function showView(v) {
  byId('view-panel').hidden = v !== 'panel'
  byId('view-islands').hidden = v === 'panel'
  renderAll(Date.now())
}
function showList(v) {
  setTab(['tab-cards', 'tab-map'], v === 'map' ? 'tab-map' : 'tab-cards')
  byId('cards').hidden = v === 'map'
  byId('map-view').hidden = v !== 'map'
  remember('list', v)
  renderAll(Date.now())
}
addEventListener('hashchange', () => showView(location.hash === '#panel' ? 'panel' : 'islands'))
byId('tab-cards').addEventListener('click', () => showList('cards'))
byId('tab-map').addEventListener('click', () => showList('map'))

function renderAll(now) {
  renderCards(now)
  renderRequests(now)
  if (!byId('map-view').hidden && !byId('view-panel').hidden) renderMap(now)
  if (!byId('view-islands').hidden) renderIslands(now)
}

function animate() {
  const now = Date.now()
  for (const r of sessions) {
    const el = cards.get(r.name)
    if (el) paint(el.querySelector('[data-f="art"]'), svgFor(lookOf(r), stateOf(r, now), now))
  }
  if (!byId('empty').hidden) paint(byId('empty-art'), svgFor({ id: '', variant: '', accessories: [] }, 'idle', now))
  if (picker.open) tiles.forEach(({ art, look }, i) => paint(art, svgFor(look.sel, SHOWREEL[(Math.floor(now / 1600) + i) % SHOWREEL.length], now)))
  if (compose.open) paintComposer(now)
  if (!byId('map-view').hidden && !byId('view-panel').hidden) paintMap(now)
  if (!byId('view-islands').hidden) paintIslands(now)
}

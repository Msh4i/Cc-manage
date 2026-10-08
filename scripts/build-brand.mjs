// Draws the logo and README images from the real character sprites, so the brand matches the mod pixel for pixel.
// Run: node --experimental-strip-types --import ./scripts/register-ts.mjs scripts/build-brand.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { composeFrame, parseAccessory, parseSprite } from '../mod/src/core/sprite.ts'

const dir = new URL('../mod/characters/', import.meta.url)
const out = new URL('../docs/assets/', import.meta.url)
mkdirSync(out, { recursive: true })
const sprite = id => parseSprite(readFileSync(new URL(`${id}/sprite.json`, dir), 'utf8')).value
const acc = id => parseAccessory(readFileSync(new URL(`accessories/${id}.json`, dir), 'utf8')).value

// pixels of one frame as <rect>s at (x, y) with pixel size p
function pix(grid, x, y, p) {
  const r = []
  grid.forEach((row, j) => { let i = 0; while (i < row.length) { const c = row[i]; let n = 1; while (i + n < row.length && row[i + n] === c) n++; if (c) r.push(`<rect x="${x + i * p}" y="${y + j * p}" width="${n * p}" height="${p}" fill="${c}"/>`); i += n } })
  return r.join('')
}
const frame = (id, anim, state = anim, t = 0, worn = []) => composeFrame(sprite(id), anim, state, t, worn).grid
const crop = (g, x0, y0, w, h) => g.slice(y0, y0 + h).map(r => r.slice(x0, x0 + w))

const INK = '#1F1E1D', PAPER = '#F5F4EE', CLAY = '#D97757', MUTED = '#9C9A92'
const font = `font-family="ui-monospace,SFMono-Regular,Menlo,Consolas,monospace"`

// ---- logo mark: Clawd on a rounded tile, a budget gauge under its feet
const body = crop(frame('clawd', 'waiting'), 4, 4, 18, 10)
const mark = (size, bg) => {
  const p = Math.floor(size / 24)
  const ox = Math.round((size - 18 * p) / 2), oy = Math.round(size * 0.22)
  const gy = oy + 10 * p + p, gw = 18 * p
  return `<rect width="${size}" height="${size}" rx="${size * 0.22}" fill="${bg}"/>${pix(body, ox, oy, p)}` +
    `<rect x="${ox}" y="${gy}" width="${gw}" height="${p}" rx="${p / 2}" fill="${MUTED}" opacity=".35"/>` +
    `<rect x="${ox}" y="${gy}" width="${Math.round(gw * 0.62)}" height="${p}" rx="${p / 2}" fill="#5BB974"/>`
}
writeFileSync(new URL('logo-mark.svg', out), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240" width="240" height="240" shape-rendering="crispEdges">${mark(240, INK)}</svg>\n`)

// ---- wordmark: mark + name, readable on light and dark GitHub themes
const word = (fg, bg) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 160" width="640" height="160">` +
  `<g shape-rendering="crispEdges">${mark(160, INK)}</g>` +
  `<text x="188" y="86" ${font} font-size="64" font-weight="700" fill="${fg}">cc<tspan fill="${CLAY}">-</tspan>manage</text>` +
  `<text x="190" y="124" ${font} font-size="20" fill="${MUTED}">watch your sessions · keep the budget</text></svg>\n`
writeFileSync(new URL('logo-light.svg', out), word(INK))
writeFileSync(new URL('logo-dark.svg', out), word(PAPER))

// ---- hero banner: three sessions on islands, a weekly bar
const hero = () => {
  const W = 1280, H = 420, p = 7
  const items = [
    ['clawd', 'working', [acc('hardhat')], 'api-refactor · working'],
    ['clawd-night', 'talking', [acc('headset')], 'night-run · talking'],
    ['clawd-mono', 'saving_mode', [], 'docs · saving mode'],
  ]
  let g = ''
  items.forEach(([id, st, worn, label], k) => {
    const cx = 230 + k * 410
    g += `<ellipse cx="${cx}" cy="292" rx="150" ry="34" fill="#E3C9A1"/><ellipse cx="${cx}" cy="286" rx="132" ry="26" fill="#7FB77E"/>`
    const grid = composeFrame(sprite(id), st, st, 0, worn.map(a => ({ accessory: a }))).grid
    g += `<g shape-rendering="crispEdges">${pix(grid, cx - 13 * p, 290 - 14 * p, p)}</g>`
    g += `<text x="${cx}" y="355" ${font} font-size="20" fill="${PAPER}" text-anchor="middle">${label}</text>`
  })
  const bar = `<text x="64" y="402" ${font} font-size="18" fill="${MUTED}">weekly</text>` +
    `<rect x="150" y="388" width="1066" height="16" rx="8" fill="#2E3A55"/><rect x="150" y="388" width="${Math.round(1066 * 0.49)}" height="16" rx="8" fill="#5BB974"/>` +
    `<rect x="${150 + Math.round(1066 * 0.7) - 1}" y="382" width="3" height="28" fill="${PAPER}"/><text x="${150 + Math.round(1066 * 0.7) + 8}" y="402" ${font} font-size="16" fill="${PAPER}">budget 70</text>`
  const waves = Array.from({ length: 14 }, (_, i) => `<path d="M${40 + i * 92} ${60 + (i % 3) * 40} q12 -8 24 0 t24 0" stroke="#3E5A86" stroke-width="3" fill="none"/>`).join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"><rect width="${W}" height="${H}" rx="24" fill="#1B2A44"/>${waves}${g}${bar}</svg>\n`
}
writeFileSync(new URL('hero.svg', out), hero())

// ---- gallery: every design × every state
const STATES = ['idle', 'working', 'thinking', 'talking', 'waiting', 'saving_mode', 'error', 'done', 'paused', 'lost']
const gallery = () => {
  const ids = ['clawd', 'clawd-night', 'clawd-mono'], p = 4, cw = 26 * p + 16, ch = 14 * p + 34
  const W = 150 + STATES.length * cw, H = 40 + ids.length * ch
  let g = STATES.map((s, i) => `<text x="${150 + i * cw + cw / 2}" y="26" ${font} font-size="13" fill="${MUTED}" text-anchor="middle">${s}</text>`).join('')
  ids.forEach((id, r) => {
    const y = 40 + r * ch
    g += `<text x="16" y="${y + 34}" ${font} font-size="15" fill="${PAPER}">${sprite(id).name.replace('Clawd ', '')}</text>`
    STATES.forEach((s, i) => { g += `<rect x="${150 + i * cw + 4}" y="${y}" width="${cw - 8}" height="${ch - 12}" rx="8" fill="#2A2926"/><g shape-rendering="crispEdges">${pix(frame(id, s), 150 + i * cw + 8, y + 4, p)}</g>` })
  })
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"><rect width="${W}" height="${H}" rx="16" fill="#1D1C1A"/>${g}</svg>\n`
}
writeFileSync(new URL('gallery.svg', out), gallery())

// ---- accessories strip
const accs = () => {
  const list = [['headset', 'talking'], ['hardhat', 'working'], ['nightcap', 'idle'], ['party', 'done'], ['glasses', 'thinking']], p = 5, cw = 26 * p + 20
  let g = ''
  list.forEach(([a, st], i) => {
    const grid = composeFrame(sprite('clawd'), st, st, 0, [{ accessory: acc(a) }]).grid
    g += `<g shape-rendering="crispEdges">${pix(grid, 10 + i * cw, 10, p)}</g><text x="${10 + i * cw + 13 * p}" y="${14 * p + 34}" ${font} font-size="15" fill="${PAPER}" text-anchor="middle">+${a}</text>`
  })
  const W = 20 + list.length * cw
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${14 * p + 50}" width="${W}" height="${14 * p + 50}"><rect width="100%" height="100%" rx="16" fill="#1D1C1A"/>${g}</svg>\n`
}
writeFileSync(new URL('accessories.svg', out), accs())
console.log('brand assets written')

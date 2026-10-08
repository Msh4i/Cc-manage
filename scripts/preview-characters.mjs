// Writes an HTML gallery of every design, state and accessory, animated, from the real sprite files and the same
// drawing code the mod uses. Run: node --experimental-strip-types --import ./scripts/register-ts.mjs scripts/preview-characters.mjs <out.html> [--static]
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { composeFrame, parseAccessory, parseSprite, toSvg } from '../mod/src/core/sprite.ts'

const out = process.argv[2]
const still = process.argv.includes('--static') // every frame side by side, for screenshots
const dir = new URL('../mod/characters/', import.meta.url)
const manifest = JSON.parse(readFileSync(new URL('manifest.json', dir), 'utf8'))
const accessories = Object.fromEntries(readdirSync(new URL('accessories/', dir)).map(f => [f.replace('.json', ''), parseAccessory(readFileSync(new URL(`accessories/${f}`, dir), 'utf8')).value]))
const STATES = ['idle', 'working', 'thinking', 'talking', 'waiting', 'saving_mode', 'error', 'done', 'paused', 'lost']
const LABEL = { idle: 'sleeping', working: 'working', thinking: 'thinking', talking: 'talking', waiting: 'waiting on you', saving_mode: 'saving mode', error: 'error', done: 'done', paused: 'paused', lost: 'lost' }

function cell(sprite, state, worn) {
  const anim = manifest.stateMap[state] ?? state
  const a = sprite.animations[anim] ?? sprite.animations.idle
  const frames = a.frames.map((_, i) => toSvg(composeFrame(sprite, anim, state, (i + 0.01) * (1000 / a.fps), worn).grid, 5))
  return still
    ? `<div class="strip">${frames.join('')}</div>`
    : `<div class="anim" data-fps="${a.fps}">${frames.map((f, i) => `<div class="f" ${i ? 'hidden' : ''}>${f}</div>`).join('')}</div>`
}

let html = `<!doctype html><meta charset="utf-8"><title>Clawd designs</title>
<style>
:root{--bg:#1d1c1a;--fg:#ece9e1;--mut:#9c9a92;--card:#2a2926}
@media (prefers-color-scheme: light){:root:not([data-theme="dark"]){--bg:#f5f4ee;--fg:#1f1e1d;--mut:#6b6a64;--card:#e9e7df}}
body{background:var(--bg);color:var(--fg);font:14px/1.4 ui-sans-serif,system-ui;margin:0;padding:24px 16px}
h1{font-size:20px;margin:0 0 4px}h2{font-size:16px;margin:28px 0 4px}p{color:var(--mut);margin:0 0 12px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(${still ? 560 : 150}px,1fr));gap:10px}
.c{background:var(--card);border-radius:10px;padding:10px;text-align:center}.c b{display:block;font-size:12px;color:var(--mut);margin-top:4px}
.strip{display:flex;gap:6px;justify-content:center;flex-wrap:wrap}.strip svg{background:rgba(127,127,127,.12)}
</style><h1>Clawd designs</h1><p>An animation for each state. The terminal draws the same pixels with ▀ half blocks.</p>`
for (const [id, c] of Object.entries(manifest.characters)) {
  if (!c.sprite) continue
  const sprite = parseSprite(readFileSync(new URL(c.sprite, dir), 'utf8')).value
  html += `<h2>${c.name} <small style="color:var(--mut)">(${id})</small></h2><p>${sprite.note ?? ''}</p><div class="grid">`
  for (const st of STATES) html += `<div class="c">${cell(sprite, st, [])}<b>${st} · ${LABEL[st]}</b></div>`
  html += '</div>'
  for (const [vid, v] of Object.entries(c.variants ?? {})) {
    const worn = (v.accessories ?? []).map(x => (typeof x === 'string' ? { accessory: accessories[x] } : { accessory: accessories[x.id], states: x.states }))
    const shown = STATES.filter(st => worn.some(w => !w.states || w.states.includes(st)))
    html += `<h2 style="font-size:14px">${c.name} · variant: ${v.name} <small style="color:var(--mut)">(${vid})</small></h2><div class="grid">`
    for (const st of shown.slice(0, 4)) html += `<div class="c">${cell(sprite, st, worn)}<b>${st}</b></div>`
    html += '</div>'
  }
}
if (!still) html += `<script>for(const a of document.querySelectorAll('.anim')){const f=[...a.children];let i=0;setInterval(()=>{f[i].hidden=true;i=(i+1)%f.length;f[i].hidden=false},1000/Number(a.dataset.fps))}</script>`
writeFileSync(out, html)
console.log('wrote', out)

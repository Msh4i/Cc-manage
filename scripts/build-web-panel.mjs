// Builds the web panel, a claude.ai artifact page, from web/template.html and web/*.js: the mod's own core modules
// (types stripped) and the shipped character art are inlined, so the page draws and checks exactly what the mod does.
// Run: node --experimental-strip-types --import ./scripts/register-ts.mjs scripts/build-web-panel.mjs [out.html]
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'
import { parseManifest } from '../mod/src/core/characters.ts'
import { parseAccessory, parseSprite } from '../mod/src/core/sprite.ts'

const root = new URL('../', import.meta.url)
const read = p => readFileSync(new URL(p, root), 'utf8')
const out = process.argv[2] ?? new URL('web/panel.html', root)
const MODULES = ['registry', 'budget', 'viewmodel', 'selfrecord', 'sprite', 'characters', 'art'] // dependency order

// Each module becomes a function scope returning its exports; `import { a } from './x'` reads an earlier module.
function inline(name) {
  let js = stripTypeScriptTypes(read(`mod/src/core/${name}.ts`))
  js = js.replace(/^import\s*\{([^}]*)\}\s*from\s*'\.\/(\w+)'.*$/gm, (_, names, from) => {
    if (!MODULES.slice(0, MODULES.indexOf(name)).includes(from)) throw new Error(`${name} imports ${from}: list it earlier in MODULES`)
    return `const {${names.replace(/\bas\b/g, ':')}} = M.${from}`
  })
  if (/^\s*import\s/m.test(js)) throw new Error(`${name}: an import the panel cannot inline`)
  const names = [...js.matchAll(/^export\s+(?:async\s+)?(?:function\*?|const|let|class)\s+(\w+)/gm)].map(m => m[1])
  js = js.replace(/^export\s+/gm, '')
  return `M.${name} = (() => {\n${js}\nreturn { ${names.join(', ')} }\n})()`
}

function must(r, what) {
  if (r.errors.length) throw new Error(`${what}: ${r.errors[0]}`)
  return r.value ?? r.manifest
}

const dir = 'mod/characters/'
const manifest = must(parseManifest(read(`${dir}manifest.json`)), 'manifest')
const sprites = {}
for (const [id, c] of Object.entries(manifest.characters)) if (c.sprite) sprites[id] = must(parseSprite(read(dir + c.sprite)), id)
const accessories = {}
for (const f of readdirSync(new URL(`${dir}accessories/`, root)).filter(n => n.endsWith('.json'))) {
  accessories[f.slice(0, -5)] = must(parseAccessory(read(`${dir}accessories/${f}`)), f)
}

const art = JSON.stringify({ manifest, sprites, accessories }).replace(/</g, '\\u003c')
const SCRIPTS = ['app', 'map', 'islands', 'boot'] // the page's own code, one scope: definitions first, the start last
const html = read('web/template.html')
  .replace('/*__ART__*/null', () => art)
  .replace('/*__MODULES__*/', () => MODULES.map(inline).join('\n'))
  .replace('/*__SCRIPTS__*/', () => SCRIPTS.map(n => `// ---- web/${n}.js\n${read(`web/${n}.js`)}`).join('\n'))
writeFileSync(out, html)
console.log('wrote', String(out), `${Math.round(html.length / 1024)} KB`)

// Validates mod/characters: the manifest, every sprite and accessory it names, and every referenced file.
// Run: node --experimental-strip-types --import ./scripts/register-ts.mjs scripts/check-characters.mjs
import { existsSync, readFileSync } from 'node:fs'
import { parseManifest, wornRefs } from '../mod/src/core/characters.ts'
import { parseAccessory, parseSprite } from '../mod/src/core/sprite.ts'

const dir = new URL('../mod/characters/', import.meta.url)
const { manifest, errors } = parseManifest(readFileSync(new URL('manifest.json', dir), 'utf8'))
const problems = [...errors]
if (manifest) {
  const walk = (where, anims) => {
    for (const [name, a] of Object.entries(anims ?? {})) {
      for (const k of ['svg', 'png']) for (const p of a[k] ?? []) if (!existsSync(new URL(p, dir))) problems.push(`${where}.${name}: missing file ${p}`)
    }
  }
  for (const [id, c] of Object.entries(manifest.characters)) {
    walk(id, c.animations)
    if (c.sprite) {
      if (!existsSync(new URL(c.sprite, dir))) problems.push(`${id}: missing sprite ${c.sprite}`)
      else {
        const s = parseSprite(readFileSync(new URL(c.sprite, dir), 'utf8'))
        problems.push(...s.errors.map(e => `${id} sprite: ${e}`))
        if (s.value) for (const target of new Set(Object.values(manifest.stateMap))) if (!s.value.animations[target]) problems.push(`${id} sprite: no "${target}" animation (idle will stand in)`)
      }
    }
    for (const [vid, v] of Object.entries(c.variants ?? {})) {
      walk(`${id}.${vid}`, v.animations)
      for (const w of wornRefs(manifest, { id, variant: vid, accessories: [] })) {
        const f = new URL(`accessories/${w.id}.json`, dir)
        if (!existsSync(f)) problems.push(`${id}.${vid}: missing accessory ${w.id}`)
        else problems.push(...parseAccessory(readFileSync(f, 'utf8')).errors.map(e => `accessory ${w.id}: ${e}`))
      }
    }
  }
}
if (problems.length) {
  console.error(problems.join('\n'))
  process.exit(1)
}
console.log(`characters OK: ${Object.keys(manifest.characters).length} character(s)`)

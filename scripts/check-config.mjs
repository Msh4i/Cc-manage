// Validates the shipped config/tiers.json with the same validator the mod uses.
// Run: node --experimental-strip-types --import ./scripts/register-ts.mjs scripts/check-config.mjs
import { readFileSync } from 'node:fs'
import { parseTiers } from '../mod/src/core/config.ts'

const file = new URL('../mod/config/tiers.json', import.meta.url)
try {
  const f = parseTiers(readFileSync(file, 'utf8'))
  console.log(`tiers.json OK: ${f.tiers.length} tiers`)
} catch (e) {
  console.error(String(e.message ?? e))
  process.exit(1)
}

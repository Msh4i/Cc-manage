import type { TiersFile } from './types'

// Validates a parsed tiers.json; returns a list of problems (empty = valid).
export function validateTiers(f: TiersFile): string[] {
  const errs: string[] = []
  if (!(f.safetyFactor >= 1)) errs.push('safetyFactor must be >= 1')
  if (!(f.movingAverageWindow >= 1)) errs.push('movingAverageWindow must be >= 1')
  let prev = 0
  f.tiers.forEach((t, i) => {
    if (t.level !== i + 1) errs.push(`tier ${i}: level must be ${i + 1}`)
    if (!(t.exitAt < t.enterAt)) errs.push(`tier ${t.level}: exitAt must be below enterAt (hysteresis)`)
    if (!(t.enterAt > prev)) errs.push(`tier ${t.level}: enterAt must rise with level`)
    prev = t.enterAt
  })
  return errs
}

export function parseTiers(text: string): TiersFile {
  const f = JSON.parse(text) as TiersFile
  const errs = validateTiers(f)
  if (errs.length) throw new Error('tiers.json: ' + errs.join('; '))
  return f
}

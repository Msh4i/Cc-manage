// Learns "percentage points of the weekly limit per USD of list-price cost" from real readings.
// Anthropic does not publish this ratio, so it is measured, never assumed.

export type Calibration = {
  k: number | null // points per USD (EMA)
  samples: number
  outliers: number
  anchorPercent: number | null
  anchorUsd: number | null
}

export type Confidence = 'none' | 'low' | 'ok'

export const MIN_POINTS = 1 // the weekly percentage must move at least this much per sample
const ALPHA = 0.3
const OUTLIER = 3 // a sample off by this factor from k is not trusted

export const initialCalibration = (): Calibration => ({ k: null, samples: 0, outliers: 0, anchorPercent: null, anchorUsd: null })

// percent: real weekly percentage now; usd: total cost of all known sessions on the account now.
export function observe(c: Calibration, percent: number, usd: number): Calibration {
  if (c.anchorPercent === null || c.anchorUsd === null || percent < c.anchorPercent || usd < c.anchorUsd) {
    // first reading, weekly reset, or cost counter restarted: re-anchor
    return { ...c, anchorPercent: percent, anchorUsd: usd }
  }
  const dp = percent - c.anchorPercent
  const du = usd - c.anchorUsd
  if (dp < MIN_POINTS) return c // not enough movement yet; keep the anchor and wait
  if (du <= 0) return { ...c, anchorPercent: percent, anchorUsd: usd } // spend came from elsewhere
  const sample = dp / du
  const next = { ...c, anchorPercent: percent, anchorUsd: usd }
  if (c.k === null) return { ...next, k: sample, samples: 1 }
  if (c.samples >= 3 && (sample > c.k * OUTLIER || sample < c.k / OUTLIER)) return { ...next, outliers: c.outliers + 1 }
  return { ...next, k: c.k + ALPHA * (sample - c.k), samples: c.samples + 1 }
}

export function confidence(c: Calibration): Confidence {
  return c.samples < 2 ? 'none' : c.samples < 5 ? 'low' : 'ok'
}

// Points for a cost, or undefined while calibration has too little data.
export function pointsFor(c: Calibration, usd: number): number | undefined {
  return c.k !== null && confidence(c) !== 'none' ? usd * c.k : undefined
}

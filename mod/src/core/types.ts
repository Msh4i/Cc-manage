export type TierConfig = {
  level: number
  name: string
  enterAt: number
  exitAt: number
  description: string
  rules: string[]
  effort: 'low' | 'medium' | 'high' | 'xhigh' | 'max' | null
  model: string | null
  denyTools: string[]
}

export type TiersFile = {
  version: number
  safetyFactor: number
  movingAverageWindow: number
  qualityFloor: string[]
  tiers: TierConfig[]
}

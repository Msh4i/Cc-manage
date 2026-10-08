import { describe, test, expect } from 'claude-code/testing'
import { decideTier, initialTierState, tierRules, denyTools } from '../src/core/tiers'
import { parseTiers, validateTiers } from '../src/core/config'
import type { TiersFile } from '../src/core/types'


// Mirrors config/tiers.json thresholds; the shipped file itself is checked by scripts/check-config.mjs
// (a test cannot read files).
const cfg: TiersFile = parseTiers(JSON.stringify({"version": 1, "safetyFactor": 1.25, "movingAverageWindow": 5, "qualityFloor": ["Security, correctness and working code are never given up at any tier.", "Do not leave half-done or broken changes: finish the work or stop at a clean point."], "tiers": [{"level": 1, "name": "Light", "enterAt": 0.9, "exitAt": 0.8, "description": "Short answers, no needless reading.", "rules": ["Keep answers short and to the point: no long sentences, intros, summaries or repetition.", "Read only the parts of files you need; do not read files you do not need."], "effort": null, "model": null, "denyTools": []}, {"level": 2, "name": "Medium", "enterAt": 1.05, "exitAt": 0.95, "description": "Tests only on critical paths, explanatory comments kept to a minimum, no repeated searches.", "rules": ["Write tests only for critical paths: authentication, payments, risk of data loss.", "Keep explanatory comments to a minimum.", "Do not search twice for the same information; use the earlier result."], "effort": "medium", "model": null, "denyTools": []}, {"level": 3, "name": "Strict", "enterAt": 1.25, "exitAt": 1.1, "description": "The smallest change that finishes the task; no subagents.", "rules": ["Make only the smallest change that finishes the task.", "No refactoring, extra features or polish.", "Do not start subagents.", "Put work that can be finished ahead of work that may not finish."], "effort": "low", "model": null, "denyTools": ["Agent", "Task"]}]}))

describe('tiers', () => {
  test('fixture config is valid', () => {
    expect(validateTiers(cfg)).toEqual([])
  })

  test('stays normal when budget fits', () => {
    const d = decideTier(cfg, initialTierState(), 0.5)
    expect(d.state.level).toBe(0)
    expect(d.changed).toBe(false)
  })

  test('enters tier 1 at its threshold and says why', () => {
    const d = decideTier(cfg, initialTierState(), 0.9)
    expect(d.state.level).toBe(1)
    expect(d.changed).toBe(true)
    expect(d.reason).toContain('Light')
    expect(d.reason).toContain('90%')
  })

  test('big overshoot jumps straight to tier 3', () => {
    expect(decideTier(cfg, initialTierState(), 1.3).state.level).toBe(3)
  })

  test('hysteresis: no flapping inside the band', () => {
    let s = decideTier(cfg, initialTierState(), 0.92).state // tier 1 (enter 0.9, exit 0.8)
    for (const r of [0.85, 0.88, 0.82, 0.89, 0.81]) {
      const d = decideTier(cfg, s, r)
      expect(d.state.level).toBe(1)
      expect(d.changed).toBe(false)
      s = d.state
    }
    const down = decideTier(cfg, s, 0.79)
    expect(down.state.level).toBe(0)
    expect(down.reason).toContain('Moved down')
  })

  test('descends one level at a time', () => {
    const s = { ...initialTierState(), level: 3 }
    const d = decideTier(cfg, s, 0.1)
    expect(d.state.level).toBe(2)
  })

  test('Strict is the most it ever does, however far over', () => {
    let s = initialTierState()
    for (let n = 0; n < 6; n++) s = decideTier(cfg, s, 10).state
    expect(s.level).toBe(3)
  })

  test('manual mode: auto off keeps the chosen level and says so', () => {
    const s = { ...initialTierState(), auto: false, manualLevel: 2 }
    const d = decideTier(cfg, s, 5)
    expect(d.state.level).toBe(2)
    expect(d.reason).toContain('Set manually')
  })

  test('higher tiers include lower tier rules and the quality floor', () => {
    const r1 = tierRules(cfg, 1)
    const r3 = tierRules(cfg, 3)
    expect(r3.length > r1.length).toBe(true)
    expect(r3.join(' ')).toContain('Security')
    expect(tierRules(cfg, 0)).toEqual([])
  })

  test('sub-agents are denied only from tier 3', () => {
    expect(denyTools(cfg, 2)).toEqual([])
    expect(denyTools(cfg, 3)).toContain('Agent')
  })

  test('invalid config is rejected', () => {
    const bad = { ...cfg, tiers: cfg.tiers.map(t => (t.level === 2 ? { ...t, exitAt: 2 } : t)) }
    expect(validateTiers(bad).length > 0).toBe(true)
  })
})

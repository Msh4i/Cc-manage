// Per-session status records. Every session's mod writes only its own file; the panel reads them all.
// Files are untrusted data (any process can write them): parse defensively, clamp text, never execute.

export const CHAR_STATES = ['idle', 'working', 'thinking', 'talking', 'waiting', 'saving_mode', 'error', 'done', 'paused', 'lost'] as const
export type CharState = (typeof CHAR_STATES)[number]

export type SessionRecord = {
  v: 1
  id: string
  name: string // addressable name, also the mailbox folder: [a-z0-9._-]
  task: string
  step: string
  progress: { done: number; total: number }
  tokens: { input: number; output: number; cacheRead: number; cacheWrite: number }
  usd: number
  state: CharState
  tier: number
  tierName: string
  tierReason: string
  tools: Record<string, number>
  startedAt: number
  updatedAt: number
}

export const STALE_MS = 60_000 // a record not refreshed for this long means the session is gone or stuck
// how long a finished session shows its finish mark before it reads as idle (sleeping)
export const DONE_SHOW_MS = 90_000
export const FORGET_MS = 24 * 3_600_000

export type StateInputs = {
  now: number
  turnActive: boolean
  thinking: boolean
  talkingUntil: number
  hasError: boolean
  done: boolean
  paused: boolean
  tier: number
  waiting: boolean
  asking: boolean // a question or a permission prompt is waiting on the person
}

// Priority: paused > error > asking > talking > (active: saving_mode | thinking | working) > done > waiting > idle.
export function deriveState(i: StateInputs): CharState {
  if (i.paused) return 'paused'
  if (i.hasError) return 'error'
  if (i.asking) return 'waiting'
  if (i.now < i.talkingUntil) return 'talking'
  if (i.turnActive) return i.tier > 0 ? 'saving_mode' : i.thinking ? 'thinking' : 'working'
  if (i.done) return 'done'
  if (i.waiting) return 'waiting'
  return 'idle'
}

// A record not refreshed lately reads as lost; a finished one that stopped refreshing (the session ended) goes to
// sleep once its finish mark has shown, instead of keeping it forever.
export const effectiveState = (r: SessionRecord, now: number): CharState => {
  const quiet = now - r.updatedAt
  if (r.state === 'done') return quiet > DONE_SHOW_MS ? 'idle' : 'done'
  return quiet > STALE_MS && r.state !== 'paused' ? 'lost' : r.state
}

export const safeName = (s: string): string => s.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^[-.]+|[-.]+$/g, '').slice(0, 40) || 'session'

const clip = (s: unknown, n: number): string =>
  typeof s === 'string' ? s.replace(/[\u0000-\u001f\u007f]+/g, ' ').slice(0, n) : ''
const num = (n: unknown): number => (typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n : 0)

export function parseRecord(text: string): SessionRecord | undefined {
  let j: any
  try {
    j = JSON.parse(text)
  } catch {
    return undefined
  }
  if (!j || j.v !== 1 || typeof j.id !== 'string' || typeof j.name !== 'string') return undefined
  const tools: Record<string, number> = {}
  if (j.tools && typeof j.tools === 'object') {
    for (const [k, v] of Object.entries(j.tools).slice(0, 40)) tools[clip(k, 40)] = num(v)
  }
  return {
    v: 1,
    id: clip(j.id, 80),
    name: safeName(String(j.name)),
    task: clip(j.task, 160),
    step: clip(j.step, 160),
    progress: { done: num(j.progress?.done), total: num(j.progress?.total) },
    tokens: { input: num(j.tokens?.input), output: num(j.tokens?.output), cacheRead: num(j.tokens?.cacheRead), cacheWrite: num(j.tokens?.cacheWrite) },
    usd: num(j.usd),
    state: (CHAR_STATES as readonly string[]).includes(j.state) ? j.state : 'idle',
    tier: Math.min(4, Math.floor(num(j.tier))),
    tierName: clip(j.tierName, 40),
    tierReason: clip(j.tierReason, 240),
    tools,
    startedAt: num(j.startedAt),
    updatedAt: num(j.updatedAt),
  }
}

export const serializeRecord = (r: SessionRecord): string => JSON.stringify(r)

// Newest first; records of long-gone sessions are dropped.
export function visibleRecords(rs: SessionRecord[], now: number): SessionRecord[] {
  return rs.filter(r => now - r.updatedAt < FORGET_MS).sort((a, b) => b.updatedAt - a.updatedAt)
}

export function topTools(tools: Record<string, number>, n = 5): string {
  return Object.entries(tools).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => `${k}×${v}`).join(', ')
}

export const totalTokens = (r: SessionRecord): number => r.tokens.input + r.tokens.output + r.tokens.cacheRead + r.tokens.cacheWrite

export const ago = (ms: number) => (ms < 5000 ? 'just now' : ms < 60000 ? `${Math.round(ms / 1000)}s ago` : ms < 3600000 ? `${Math.round(ms / 60000)}m ago` : `${Math.round(ms / 3600000)}h ago`)
export const tok = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}k` : String(n))

export const STATE_LABEL: Record<CharState, string> = {
  idle: 'sleeping', working: 'working', thinking: 'thinking', talking: 'talking', waiting: 'waiting on you',
  saving_mode: 'saving mode', error: 'error', done: 'done', paused: 'paused', lost: 'lost',
}

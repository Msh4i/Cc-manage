export type Window = { used: number; resetsAt?: string }
export type UsageView = {
  weekly?: Window
  fiveHour?: Window
  updatedAt: number
}
export type Budgets = { weekly: number; fiveHour: number }
export type TierView = { level: number; name: string; auto: boolean; reason: string; summary: string; calibrating: boolean }

export type SessionView = {
  v: 1
  id: string
  name: string
  task: string
  step: string
  progress: { done: number; total: number }
  tokens: { input: number; output: number; cacheRead: number; cacheWrite: number }
  usd: number
  state: 'idle' | 'working' | 'thinking' | 'talking' | 'waiting' | 'saving_mode' | 'error' | 'done' | 'paused' | 'lost'
  tier: number
  tierName: string
  tierReason: string
  tools: Record<string, number>
  startedAt: number
  updatedAt: number
}

declare module 'claude-code' {
  interface PluginState {
    'session-budget': {
      usage: UsageView | null
      budgets: Budgets
      tier: TierView | null
      sessions: SessionView[]
      selected: string | null
      flash: string
      now: number
      character: { id: string; variant: string; accessories: string[] }
    }
  }
}

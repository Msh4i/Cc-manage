import { deriveState, safeName, type SessionRecord, type StateInputs } from './registry'

export type Todo = { content: string; status: string }

export type Live = {
  id: string
  name: string
  startedAt: number
  task: string // what the session was asked, shortened
  step: string // what it is doing now
  todos: Todo[]
  tokens: { input: number; output: number; cacheRead: number; cacheWrite: number }
  usd: number
  tools: Record<string, number>
  turnId: string | undefined
  turnActive: boolean
  thinking: boolean
  talkingUntil: number
  hasError: boolean
  done: boolean
  paused: boolean
  waiting: boolean
  asking: number // questions and permission prompts open right now
  pauseRequested: boolean
  unread: number
}

export const initialLive = (id: string, cwdBase: string, now: number): Live => ({
  id, name: safeName(`${cwdBase}-${id.slice(0, 6)}`), startedAt: now, task: '', step: '', todos: [],
  tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, usd: 0, tools: {},
  turnId: undefined, turnActive: false, thinking: false, talkingUntil: 0, hasError: false, done: false, paused: false, waiting: false, asking: 0,
  pauseRequested: false, unread: 0,
})

export const progressOf = (todos: Todo[]) => ({ done: todos.filter(t => t.status === 'completed').length, total: todos.length })

// What the session says it is doing: the todo in progress, else the last tool it used.
export const stepFromTodos = (todos: Todo[]): string | undefined => todos.find(t => t.status === 'in_progress')?.content

export const shorten = (s: string, n = 120): string => {
  const one = s.replace(/\s+/g, ' ').trim()
  return one.length > n ? one.slice(0, n - 1) + '…' : one
}

export function buildRecord(l: Live, tier: { level: number; name: string; reason: string }, now: number): SessionRecord {
  const inputs: StateInputs = {
    now, turnActive: l.turnActive, thinking: l.thinking, talkingUntil: l.talkingUntil,
    hasError: l.hasError, done: l.done, paused: l.paused, tier: tier.level, waiting: l.waiting, asking: l.asking > 0,
  }
  return {
    v: 1, id: l.id, name: l.name, task: l.task, step: l.step, progress: progressOf(l.todos), tokens: { ...l.tokens }, usd: l.usd,
    state: deriveState(inputs), tier: tier.level, tierName: tier.name, tierReason: tier.reason, tools: { ...l.tools },
    startedAt: l.startedAt, updatedAt: now,
  }
}

const ABILITY: Array<[RegExp, string]> = [
  [/^(Edit|Write|NotebookEdit|MultiEdit)$/, 'edit files'],
  [/^Bash$/, 'run commands'],
  [/^(Read|Grep|Glob)$/, 'read and search files'],
  [/^(WebFetch|WebSearch)$/, 'reach the web'],
  [/^(Agent|Task)$/, 'start subagents'],
  [/^mcp__/, 'use connected tools (MCP)'],
]

// Plain-language summary of what a session has been seen doing; never claims more than its tool history.
export function abilities(tools: Record<string, number>): string[] {
  const out: string[] = []
  for (const [re, text] of ABILITY) if (Object.keys(tools).some(t => re.test(t))) out.push(text)
  return out
}

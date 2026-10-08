// Cost routing, on in every tier: work that does not need the session's model goes to a cheaper one. Per token,
// Haiku 4.5 costs a quarter of Opus 5.5 ($1 / $5 against $4 / $20 per million, input / output), and output is what
// prose spends. So long prose is written by a Haiku agent this mod registers, and broad searches run in the Explore
// agent on Haiku; the session's model keeps the code, the decisions and the short answers.

export const WRITER = 'writer' // registered as session-budget:writer
export const CHEAP_MODEL = 'haiku'

export const WRITER_PROMPT = [
  'You write prose for a software project: documentation, READMEs, guides, changelogs, release notes, long code comments, commit or pull request text.',
  'The brief names the target file, the audience, the sources to draw on (files or facts) and any style notes. Read the sources it names, and any others you need, before writing: base every statement on them and never invent features, numbers, commands, options or names.',
  'If the target file exists, read it first and match its language, tone, headings and formatting. Write plainly and concretely: no filler, no marketing tone, no emojis.',
  'Cover every item the brief asks for, in its order; where it asks for an example per item, give one for each. When the sources are code, cover everything public: each export, each option with its default, each event, and every error it throws with when it is thrown.',
  'Before answering, go through the brief item by item and fill any gap. When the sources are code, also Grep them for `throw`, the exports and the emitted events, and check that each one is in your text.',
  'Put the text in the file with Write or Edit. Do not change code.',
  'When done, answer in one line: the file and what you wrote. Do not repeat the text.',
].join('\n')

export const WRITER_SPEC = {
  name: WRITER,
  description: 'Writes long prose into a file on a cheaper model (Haiku): documentation, READMEs, guides, changelogs, release notes, long comments, commit or PR bodies. Give it the target file, the audience, the facts and style notes; it writes the file and answers in one line.',
  prompt: WRITER_PROMPT,
  tools: ['Read', 'Write', 'Edit', 'Glob', 'Grep'],
  model: CHEAP_MODEL,
} as const

// Kept word for word from call to call: a stable system prompt section keeps the prompt cache.
export const ROUTING_RULE = [
  'Cost routing (session-budget): your output costs about four times what a Haiku helper\'s does.',
  '1. Prose: when a task needs more than about 15 lines of prose (documentation, README, guide, changelog, release notes, long comments, a long commit or PR body), do not write it yourself, and do not read its sources first.',
  'Give the session-budget:writer agent a short brief: the target file, the audience, which files or facts to draw on (it reads them itself), what to cover, style notes. Do not re-read or rewrite its result unless accuracy is critical or the user asks; if something is wrong, send it a short list of fixes. Code, tests and short answers stay with you.',
  '2. Reading: to find something across many files, ask the Explore agent and keep its conclusion instead of reading the files yourself.',
  'These helpers are allowed in every savings tier.',
].join('\n')

// Subagents that may run on the cheap model whatever the tier, because they are what saves.
export const CHEAP_AGENTS = ['Explore', `session-budget:${WRITER}`]
export const isCheapAgent = (subagentType: unknown) => typeof subagentType === 'string' && CHEAP_AGENTS.includes(subagentType)

// Tools whose schemas ride in every request but that few sessions call: about 24,000 characters (some 6,000 tokens,
// Artifact alone 15,600) of a ~38,000-token fixed prompt, measured 2026-10-08. Behind ToolSearch they cost a name
// each until the model asks for one, then load as before.
export const RARE_TOOLS = ['Artifact', 'Workflow', 'ScheduleWakeup', 'ReportFindings', 'ListAgents']

// The model a spawn should run on: an explicit choice stands; Explore with none goes to the cheap model.
export function spawnModel(subagentType: string, model: string | undefined): string | undefined {
  if (model) return model
  return subagentType === 'Explore' ? CHEAP_MODEL : undefined
}

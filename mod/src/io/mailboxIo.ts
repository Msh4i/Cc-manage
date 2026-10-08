import { canSend, fileName, parse, serialize, validate, type Message, type Seen } from '../core/mailbox'
import type { Io } from './ports'

export const inboxDir = (root: string, name: string) => `${root}/inbox/${name}`
export const archiveDir = (root: string, name: string) => `${root}/archive/${name}`

async function readDir(io: Io, dir: string): Promise<Array<{ file: string; msg: Message }>> {
  const out: Array<{ file: string; msg: Message }> = []
  for (const f of (await io.list(dir)).filter(n => n.endsWith('.md')).sort().slice(-200)) {
    const msg = parse((await io.read(`${dir}/${f}`)) ?? '')
    if (msg) out.push({ file: f, msg })
  }
  return out
}

// Everything the pair has said to each other, inbox and archive of both sides.
async function seenBetween(io: Io, root: string, a: string, b: string): Promise<Seen[]> {
  const dirs = [inboxDir(root, a), inboxDir(root, b), archiveDir(root, a), archiveDir(root, b)]
  const seen: Seen[] = []
  for (const d of dirs) {
    for (const { msg } of await readDir(io, d)) {
      if ((msg.from === a && msg.to === b) || (msg.from === b && msg.to === a)) seen.push({ from: msg.from, to: msg.to, time: msg.time, type: msg.type })
    }
  }
  return seen
}

export type SendInput = { from: string; to: string; type: Message['type']; body: string; action?: 'pause' }

export async function sendMessage(io: Io, root: string, input: SendInput, nowMs: number, id: string, git = false): Promise<{ ok: boolean; reason?: string; file?: string }> {
  const msg: Message = {
    from: input.from, to: input.to, time: new Date(nowMs).toISOString().replace(/\.\d+Z$/, 'Z'),
    type: input.type, status: 'new', body: input.body.trim(), ...(input.action ? { action: input.action } : {}),
  }
  const bad = validate(msg)
  if (bad) return { ok: false, reason: bad }
  const guard = canSend(await seenBetween(io, root, msg.from, msg.to), msg.from, msg.to)
  if (!guard.ok) return { ok: false, ...(guard.reason ? { reason: guard.reason } : {}) }
  const file = fileName(msg, id)
  await io.write(`${inboxDir(root, msg.to)}/${file}`, serialize(msg))
  if (git) {
    const g = await gitSync(io, root, `msg ${msg.from} -> ${msg.to}`, [`inbox/${msg.to}`])
    if (!g.ok) return { ok: true, file, reason: `written locally, git sync failed: ${g.reason}` }
  }
  return { ok: true, file }
}

export const readNew = async (io: Io, root: string, me: string) =>
  (await readDir(io, inboxDir(root, me))).filter(x => x.msg.status === 'new')

export const readInbox = (io: Io, root: string, me: string) => readDir(io, inboxDir(root, me))

export async function markRead(io: Io, root: string, me: string, file: string, msg: Message): Promise<void> {
  await io.write(`${inboxDir(root, me)}/${file}`, serialize({ ...msg, status: 'read' }))
}

// Processed messages are never deleted: they move to archive/<me>/ with status done.
export async function archiveMessage(io: Io, root: string, me: string, file: string, msg: Message): Promise<void> {
  const from = `${inboxDir(root, me)}/${file}`
  await io.write(from, serialize({ ...msg, status: 'done' }))
  await io.move(from, `${archiveDir(root, me)}/${file}`)
}

// Paths handed to git must be plain relative paths inside the repo: no "..", no absolute path, no leading "-".
export const safeRepoPath = (p: string) => p.length > 0 && !p.startsWith('/') && !p.startsWith('-') && !p.split('/').includes('..')

// pull --rebase, then commit and push ONLY the named paths: other uncommitted work in the folder is never staged or
// pushed. The clone's own git identity signs; nothing is appended to the message.
export async function gitSync(io: Io, repo: string, message: string, paths: string[]): Promise<{ ok: boolean; reason?: string }> {
  if (paths.length === 0 || !paths.every(safeRepoPath)) return { ok: false, reason: 'invalid path' }
  const pull = await io.exec(['git', '-C', repo, 'pull', '--rebase', '--autostash'])
  if (pull.code !== 0) return { ok: false, reason: (pull.out || 'git pull').slice(0, 160) }
  const add = await io.exec(['git', '-C', repo, 'add', '--', ...paths])
  if (add.code !== 0) return { ok: false, reason: (add.out || 'git add').slice(0, 160) }
  const st = await io.exec(['git', '-C', repo, 'status', '--porcelain', '--', ...paths])
  if (st.out.trim() === '') return { ok: true }
  for (const step of [['git', '-C', repo, 'commit', '-m', message, '--', ...paths], ['git', '-C', repo, 'push']]) {
    const r = await io.exec(step)
    if (r.code !== 0) return { ok: false, reason: (r.out || step.slice(3).join(' ')).slice(0, 160) }
  }
  return { ok: true }
}

// Brings in messages other machines pushed. A conflict or network failure is reported, never fatal.
export async function gitPull(io: Io, repo: string): Promise<{ ok: boolean; reason?: string }> {
  const r = await io.exec(['git', '-C', repo, 'pull', '--rebase', '--autostash'])
  return r.code === 0 ? { ok: true } : { ok: false, reason: (r.out || 'git pull').slice(0, 160) }
}

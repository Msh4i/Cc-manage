import { mock } from 'claude-code/testing'
import type { On } from 'claude-code'

// Everything a session needs from the outside, in memory: env, identity, a disk, processes, a clock.
export function baseWorld(on: On, tiersJson: string, opts: { now?: string; home?: string; name?: string; id?: string; files?: Map<string, string>; suffixFiles?: Record<string, string> } = {}) {
  const files = opts.files ?? new Map<string, string>()
  const toasts: string[] = []
  const status: string[] = []
  const commands: string[][] = []
  mock.store(on)
  const clock = mock.clock(on, { now: Date.parse(opts.now ?? '2026-10-07T12:00:00Z') })
  mock.env(on, { HOME: opts.home ?? '/h' })
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('session.cwd', () => ({ value: `/work/${opts.name ?? 'proj'}` }))
  on('session.id', () => ({ value: opts.id ?? 'abc12345-0000' }))
  on('ui.status', (_$, e) => { status.push(String(e.text)); return { value: undefined } })
  on('ui.toast', (_$, e) => { toasts.push(String(e.text)); return { value: undefined } })
  on('command.register', (_$, e) => ({ value: { command: e.name } }))
  const agents: Array<{ name: string; model?: string; tools?: readonly string[] }> = []
  on('agent.register', (_$, e) => { agents.push(e as never); return { value: { agent: `session-budget:${(e as { name: string }).name}` } } as never })
  on('agent.spawn', (_$, e) => ({ model: (e as { model?: string }).model ?? 'inherit', agentId: 'agent-1' }) as never)
  on('fs.read', (_$, e) => {
    const p = String((e as { path: string }).path)
    if (p.endsWith('config/tiers.json')) return { value: tiersJson }
    for (const [suffix, content] of Object.entries(opts.suffixFiles ?? {})) if (p.endsWith(suffix)) return { value: content }
    const t = files.get(p)
    if (t === undefined) throw new Error('ENOENT')
    return { value: t }
  })
  on('fs.write', (_$, e) => { files.set(String((e as { path: string }).path), String((e as { text: string }).text)); return { value: undefined } })
  on('fs.list', (_$, e) => {
    const d = String((e as { path?: string }).path ?? '')
    return { value: [...files.keys()].filter(k => k.startsWith(d + '/') && !k.slice(d.length + 1).includes('/')).map(k => ({ name: k.slice(d.length + 1), kind: 'file', size: 0, mtimeMs: 0, isLink: false })) } as never
  })
  on('process.run', (_$, e) => {
    const argv = (e as { argv: string[] }).argv
    commands.push(argv)
    if (argv[0] === 'mv') {
      const [a, b] = [argv[1]!, argv[2]!]
      files.set(b, files.get(a) ?? '')
      files.delete(a)
    }
    return { value: { exitCode: 0, stdout: argv.includes('status') ? ' M x' : '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } } as never
  })
  on('ui.panes', () => ({ value: [{ id: 'session-budget' }] }) as never)
  const aborted: string[] = []
  on('turn.abort', (_$, e) => { aborted.push(String((e as { turnId: string }).turnId)); return { value: undefined } })
  return { files, toasts, status, commands, clock, aborted, agents }
}

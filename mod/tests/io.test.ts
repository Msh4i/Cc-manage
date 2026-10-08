import { describe, test, expect } from 'claude-code/testing'
import type { Io } from '../src/io/ports'
import { readAll, writeSelf } from '../src/io/registryIo'
import { archiveMessage, gitPull, gitSync, markRead, readInbox, readNew, sendMessage } from '../src/io/mailboxIo'
import type { SessionRecord } from '../src/core/registry'

// An in-memory disk with a command log, so mailbox and registry logic runs without a real filesystem.
function memIo() {
  const files = new Map<string, string>()
  const log: string[] = []
  const io: Io = {
    read: async p => files.get(p),
    write: async (p, t) => { files.set(p, t) },
    list: async d => [...files.keys()].filter(k => k.startsWith(d + '/') && !k.slice(d.length + 1).includes('/')).map(k => k.slice(d.length + 1)),
    move: async (a, b) => { files.set(b, files.get(a) ?? ''); files.delete(a) },
    exec: async argv => { log.push(argv.slice(3).join(' ')); return { code: 0, out: argv.includes('status') ? ' M x' : '' } },
  }
  return { io, files, log }
}
const T0 = Date.parse('2026-10-07T12:00:00Z')
const rec = (name: string, o: Partial<SessionRecord> = {}): SessionRecord => ({
  v: 1, id: name, name, task: '', step: '', progress: { done: 0, total: 0 }, tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  usd: 0, state: 'idle', tier: 0, tierName: 'Normal', tierReason: '', tools: {}, startedAt: 0, updatedAt: T0, ...o,
})

describe('registry io', () => {
  test('each session writes its own file and the panel reads all of them', async () => {
    const { io, files } = memIo()
    await writeSelf(io, '/s', rec('proj-a'))
    await writeSelf(io, '/s', rec('proj-b', { state: 'working' }))
    await writeSelf(io, '/s', rec('proj-a', { state: 'done' })) // rewrite only touches its own path
    expect([...files.keys()].sort()).toEqual(['/s/sessions/proj-a.json', '/s/sessions/proj-b.json'])
    files.set('/s/sessions/broken.json', '{{{')
    const all = await readAll(io, '/s')
    expect(all.map(r => r.name).sort()).toEqual(['proj-a', 'proj-b'])
    expect(all.find(r => r.name === 'proj-a')!.state).toBe('done')
  })
})

describe('mailbox io: two fake sessions talk back and forth', () => {
  test('a message goes to the other inbox, is read, answered, archived', async () => {
    const { io, files } = memIo()
    const sent = await sendMessage(io, '/m', { from: 'sess-a', to: 'sess-b', type: 'request', body: 'run the tests yourself' }, T0, 'id0001')
    expect(sent.ok).toBe(true)
    expect(sent.file).toBe('20261007T120000Z-sess-a-id0001.md')
    expect(files.has('/m/inbox/sess-b/20261007T120000Z-sess-a-id0001.md')).toBe(true)

    const fresh = await readNew(io, '/m', 'sess-b')
    expect(fresh.length).toBe(1)
    expect(fresh[0]!.msg.body).toBe('run the tests yourself')
    expect(fresh[0]!.msg.status).toBe('new')

    await markRead(io, '/m', 'sess-b', fresh[0]!.file, fresh[0]!.msg)
    expect((await readNew(io, '/m', 'sess-b')).length).toBe(0)
    expect((await readInbox(io, '/m', 'sess-b'))[0]!.msg.status).toBe('read')

    const reply = await sendMessage(io, '/m', { from: 'sess-b', to: 'sess-a', type: 'answer', body: 'ok, done' }, T0 + 60_000, 'id0002')
    expect(reply.ok).toBe(true)
    expect((await readNew(io, '/m', 'sess-a'))[0]!.msg.body).toBe('ok, done')

    await archiveMessage(io, '/m', 'sess-b', fresh[0]!.file, fresh[0]!.msg)
    expect(files.has('/m/inbox/sess-b/20261007T120000Z-sess-a-id0001.md')).toBe(false) // moved, not deleted
    expect(files.get('/m/archive/sess-b/20261007T120000Z-sess-a-id0001.md')).toContain('status: done')
  })

  test('the loop guard stops a fourth message, an answer (even archived) lifts it', async () => {
    const { io } = memIo()
    for (let i = 1; i <= 3; i++) expect((await sendMessage(io, '/m', { from: 'sess-a', to: 'sess-b', type: 'info', body: `m${i}` }, T0 + i * 1000, `i${i}`)).ok).toBe(true)
    const blocked = await sendMessage(io, '/m', { from: 'sess-a', to: 'sess-b', type: 'info', body: 'm4' }, T0 + 5000, 'i4')
    expect(blocked.ok).toBe(false)
    expect(blocked.reason).toContain('loop guard')
    await sendMessage(io, '/m', { from: 'sess-b', to: 'sess-a', type: 'answer', body: 'ok' }, T0 + 6000, 'r1')
    // the receiver archives everything: history must still count
    for (const x of await readNew(io, '/m', 'sess-b')) await archiveMessage(io, '/m', 'sess-b', x.file, x.msg)
    expect((await sendMessage(io, '/m', { from: 'sess-a', to: 'sess-b', type: 'info', body: 'again' }, T0 + 7000, 'i5')).ok).toBe(true)
  })

  test('too long, bad names and self messages are refused before anything is written', async () => {
    const { io, files } = memIo()
    expect((await sendMessage(io, '/m', { from: 'a', to: 'b', type: 'info', body: 'x'.repeat(601) }, T0, 'i')).ok).toBe(false)
    expect((await sendMessage(io, '/m', { from: 'a', to: 'a', type: 'info', body: 'hi' }, T0, 'i')).ok).toBe(false)
    expect((await sendMessage(io, '/m', { from: 'a', to: '../../etc', type: 'info', body: 'hi' }, T0, 'i')).reason).toBeDefined()
    expect(files.size).toBe(0)
  })

  test('a pause request carries the action field', async () => {
    const { io } = memIo()
    await sendMessage(io, '/m', { from: 'a', to: 'b', type: 'request', body: 'please pause', action: 'pause' }, T0, 'p1')
    expect((await readNew(io, '/m', 'b'))[0]!.msg.action).toBe('pause')
  })

  test('git sync pulls first, commits with a plain message, then pushes', async () => {
    const { io, log } = memIo()
    const r = await sendMessage(io, '/m', { from: 'a', to: 'b', type: 'info', body: 'hello' }, T0, 'g1', true)
    expect(r.ok).toBe(true)
    expect(log[0]).toBe('pull --rebase --autostash')
    expect(log.some(l => l === 'commit -m msg a -> b -- inbox/b')).toBe(true)
    expect(log[log.length - 1]).toBe('push')
    expect(log.join(' ')).not.toContain('Co-Authored')
  })

  test('git sync stages only the named paths: never add -A, never commits other work in the folder', async () => {
    const { io, log } = memIo()
    await sendMessage(io, '/m', { from: 'a', to: 'b', type: 'info', body: 'hello' }, T0, 'g3', true)
    expect(log.some(l => l.includes('add -A') || l.includes('-a '))).toBe(false)
    expect(log).toContain('add -- inbox/b')
    expect(log).toContain('commit -m msg a -> b -- inbox/b')
    expect(log).toContain('status --porcelain -- inbox/b')
  })

  test('git paths must be plain relative paths', async () => {
    const { io, log } = memIo()
    for (const bad of ['../x', '/etc/x', '--force', 'a/../../b', '']) expect((await gitSync(io, '/m', 'x', [bad])).ok).toBe(false)
    expect((await gitSync(io, '/m', 'x', [])).ok).toBe(false)
    expect(log.length).toBe(0) // nothing ran
  })

  test('pull brings in what other machines pushed and reports failures without throwing', async () => {
    const { io, log } = memIo()
    expect((await gitPull(io, '/m')).ok).toBe(true)
    expect(log).toEqual(['pull --rebase --autostash'])
    io.exec = async () => ({ code: 1, out: 'conflict' })
    expect((await gitPull(io, '/m')).reason).toContain('conflict')
  })

  test('a failing git step is reported but the message still arrives locally', async () => {
    const { io, files } = memIo()
    io.exec = async argv => (argv.includes('push') ? { code: 1, out: 'rejected' } : { code: 0, out: argv.includes('status') ? 'M x' : '' })
    const r = await sendMessage(io, '/m', { from: 'a', to: 'b', type: 'info', body: 'hello' }, T0, 'g2', true)
    expect(r.ok).toBe(true)
    expect(r.reason).toContain('git sync failed')
    expect(files.size).toBe(1)
    expect((await gitSync(io, '/m', 'x', ['inbox/b'])).ok).toBe(false)
  })
})

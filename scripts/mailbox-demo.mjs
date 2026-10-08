// End-to-end check of the mailbox against REAL git: a local bare repo stands in for GitHub, two clones are two
// "sessions" (maybe on two machines). Uses the same modules as the mod; nothing is sent to any real remote.
// Run: node --experimental-strip-types --import ./scripts/register-ts.mjs scripts/mailbox-demo.mjs <empty work dir>
import { execFile } from 'node:child_process'
import { mkdirSync, readFileSync, readdirSync, writeFileSync, existsSync, renameSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { promisify } from 'node:util'
import { sendMessage, readNew, archiveMessage, gitPull } from '../mod/src/io/mailboxIo.ts'

const run = promisify(execFile)
const work = process.argv[2]
if (!work || (existsSync(work) && readdirSync(work).length)) throw new Error('pass an empty (or new) work directory')
mkdirSync(work, { recursive: true })

const git = (cwd, ...a) => run('git', a, { cwd }).then(r => r.stdout.trim())
const ioFor = () => ({
  read: async p => (existsSync(p) ? readFileSync(p, 'utf8') : undefined),
  write: async (p, t) => { mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, t) },
  list: async d => (existsSync(d) ? readdirSync(d) : []),
  move: async (a, b) => { mkdirSync(dirname(b), { recursive: true }); renameSync(a, b) },
  exec: async argv => {
    try {
      const r = await run(argv[0], argv.slice(1))
      return { code: 0, out: `${r.stdout}${r.stderr}`.trim() }
    } catch (e) {
      return { code: e.code ?? 1, out: `${e.stdout ?? ''}${e.stderr ?? ''}`.trim() }
    }
  },
})
const ok = (cond, msg) => { if (!cond) { console.error('FAIL:', msg); process.exit(1) } console.log('ok  ', msg) }

const remote = join(work, 'remote.git')
await git(work, 'init', '--bare', '-b', 'main', remote)
const clone = async name => {
  const dir = join(work, name)
  await git(work, 'clone', remote, dir)
  await git(dir, 'config', 'user.name', 'Demo User')
  await git(dir, 'config', 'user.email', 'demo@users.noreply.example')
  return dir
}
const a = await clone('machine-a')
writeFileSync(join(a, 'README.md'), '# mailbox\n')
await git(a, 'add', 'README.md'); await git(a, 'commit', '-m', 'init'); await git(a, 'push', '-u', 'origin', 'main')
const b = await clone('machine-b')
const io = ioFor()
const T = Date.parse('2026-10-07T12:00:00Z')

// A -> B (git on): pull, add only inbox/b, commit, push
const s1 = await sendMessage(io, a, { from: 'sess-a', to: 'sess-b', type: 'request', body: 'could you run the tests?' }, T, 'm1', true)
ok(s1.ok && !s1.reason, 'A sent a message and pushed it')

// B has not pulled yet: nothing there. Then B pulls (what the heartbeat does once a minute) and finds it.
ok((await readNew(io, b, 'sess-b')).length === 0, 'B sees nothing before pulling')
ok((await gitPull(io, b)).ok, 'B pulled')
const got = await readNew(io, b, 'sess-b')
ok(got.length === 1 && got[0].msg.body === 'could you run the tests?' && got[0].msg.from === 'sess-a', 'B received the message intact')

// B archives it (moved, never deleted), replies, pushes
await archiveMessage(io, b, 'sess-b', got[0].file, got[0].msg)
ok(existsSync(join(b, 'archive', 'sess-b', got[0].file)) && !existsSync(join(b, 'inbox', 'sess-b', got[0].file)), 'B moved it to archive/')
const s2 = await sendMessage(io, b, { from: 'sess-b', to: 'sess-a', type: 'answer', body: 'ran them, all passed' }, T + 60000, 'm2', true)
ok(s2.ok && !s2.reason, 'B answered and pushed')

await gitPull(io, a)
const back = await readNew(io, a, 'sess-a')
ok(back.length === 1 && back[0].msg.type === 'answer', 'A received the answer')

// Loop guard over real files: A already answered-to, so it may send again; after 3 unanswered the fourth is refused
for (let i = 3; i <= 5; i++) ok((await sendMessage(io, a, { from: 'sess-a', to: 'sess-b', type: 'info', body: `extra ${i}` }, T + i * 100000, `m${i}`, true)).ok, `A sent extra message ${i - 2}/3`)
const blocked = await sendMessage(io, a, { from: 'sess-a', to: 'sess-b', type: 'info', body: 'fourth' }, T + 900000, 'm9', true)
ok(!blocked.ok && blocked.reason.includes('loop guard'), 'the fourth unanswered message is refused')

// Other uncommitted work in the folder must never be staged or pushed
writeFileSync(join(a, 'secret-notes.txt'), 'do not publish')
await sendMessage(io, a, { from: 'sess-a', to: 'sess-c', type: 'info', body: 'hello c' }, T + 1000000, 'm10', true)
const tracked = await git(a, 'ls-files')
ok(!tracked.includes('secret-notes.txt'), 'unrelated files were not committed')
const remoteTree = await git(work, '--git-dir', remote, 'ls-tree', '-r', '--name-only', 'main')
ok(!remoteTree.includes('secret-notes.txt'), 'unrelated files were not pushed')

// Authorship: only the configured identity, no trailers
const log = await git(a, 'log', '--format=%an <%ae>|%b')
ok(log.split('\n').filter(Boolean).every(l => l.startsWith('Demo User <demo@users.noreply.example>|')), 'every commit carries only the configured identity')
ok(!/co-authored|claude/i.test(log), 'no attribution trailers in any commit')
console.log('\nmailbox demo passed against real git')

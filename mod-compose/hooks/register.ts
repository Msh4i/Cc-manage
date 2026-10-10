import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

// session-budget's system-prompt sections, in a plugin of their own: a build without prompt.compose refuses the
// whole module that hooks it, so this hook must not share session-budget's module. session-budget writes the
// sections; this plugin says it is live, and session-budget then leaves the request text alone.
const promptAtom = atom({ plugin: 'session-budget', key: 'prompt' } as const, [] as { id: string; text: string }[])
const liveAtom = atom({ plugin: 'session-budget-compose', key: 'live' } as const, false)

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await update($, liveAtom, () => true)
    return next(e)
  })

  on('prompt.compose', async ($, e, next) => {
    const res = await next(e)
    const add = ((await read($, promptAtom)) ?? []).map(p => ({ ...p, scope: 'session' as const }))
    return add.length ? { sections: [...res.sections, ...add] } : res
  })
}

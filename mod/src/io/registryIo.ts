import { parseRecord, serializeRecord, type SessionRecord } from '../core/registry'
import type { Io } from './ports'

export const sessionsDir = (base: string) => `${base}/sessions`

// A session writes only its own file, so two sessions never touch the same path.
export async function writeSelf(io: Io, base: string, rec: SessionRecord): Promise<void> {
  await io.write(`${sessionsDir(base)}/${rec.name}.json`, serializeRecord(rec))
}

export async function readAll(io: Io, base: string): Promise<SessionRecord[]> {
  const dir = sessionsDir(base)
  const out: SessionRecord[] = []
  for (const f of (await io.list(dir)).filter(n => n.endsWith('.json')).slice(0, 200)) {
    const r = parseRecord((await io.read(`${dir}/${f}`)) ?? '')
    if (r) out.push(r)
  }
  return out
}

import type { EngineInterface } from 'claude-code'
import type { BarRow, Budgets, TierView } from '../core/viewmodel'
import { abilities } from '../core/selfrecord'
import { ago, effectiveState, STATE_LABEL, tok, topTools, totalTokens, type SessionRecord } from '../core/registry'
import type { CharState } from '../core/registry'

import type { ArtView } from '../core/art'

export type Glyph = (state: CharState) => string
export type Art = ArtView | undefined

// Raster exists only on the terminal, Svg only on the desktop; the art was computed for the surface asking.
export function ArtNode({ el, art }: { el: El; art: Art }) {
  const t = el as unknown as {
    Raster?: (p: { key: string; columns: number; rows: number; cells: string }) => never
    Svg?: (p: { source: string; alt: string; width: number; height: number }) => never
  }
  if (art?.kind === 'raster' && t.Raster) {
    const Raster = t.Raster
    return <Raster key={art.key} columns={art.columns} rows={art.rows} cells={art.cells} />
  }
  if (art?.kind === 'svg' && t.Svg) {
    const Svg = t.Svg
    return <Svg source={art.svg} alt={art.alt} width={26} height={7} />
  }
  return null
}

// Plain functions, not <Components>: the engine's element factory is only promised for the surface's own elements.
// Every surface has Box, Text and Button, so the panel only uses those.
type El = Pick<ReturnType<EngineInterface['ui']['resolve']>, 'Box' | 'Text' | 'Button'>

export type SessionActions = {
  select: (name: string | null) => void
  send: (to: string, text: string) => void
  pause: (name: string) => void
}

export type PanelActions = {
  adjust: (key: keyof Budgets, delta: number) => void
  tier: (choice: 'auto' | 0 | 1 | 2 | 3) => void
}

const LABELS: Record<keyof Budgets, string> = { weekly: 'Weekly budget', fiveHour: '5-hour budget' }
const STEPS = [-5, -1, 1, 5] as const

export function Bars({ el, rows }: { el: El; rows: BarRow[] }) {
  const { Box, Text } = el
  return (
    <Box flexDirection="column">
      {rows.map(r => (
        <Box key={`row-${r.key}`} flexDirection="column">
          <Text bold>{r.label}</Text>
          <Text color={r.color}>{r.bar}</Text>
          <Text dimColor>{r.text}</Text>
        </Box>
      ))}
    </Box>
  )
}

export function BudgetControls({ el, budgets, adjust }: { el: El; budgets: Budgets; adjust: PanelActions['adjust'] }) {
  const { Box, Text, Button } = el
  return (
    <Box flexDirection="column">
      <Text bold>Budget (percent of the limit; past it the tier tightens)</Text>
      {(Object.keys(LABELS) as Array<keyof Budgets>).map(k => (
        <Box key={`b-${k}`} gap={1}>
          <Text>{`${LABELS[k]}: ${budgets[k]}`}</Text>
          {STEPS.map(d => (
            <Button key={`b-${k}-${d}`} label={d > 0 ? `+${d}` : `${d}`} onPress={() => adjust(k, d)} />
          ))}
        </Box>
      ))}
    </Box>
  )
}

export function TierControls({ el, tier, choose }: { el: El; tier: TierView | null; choose: PanelActions['tier'] }) {
  const { Box, Text, Button } = el
  return (
    <Box flexDirection="column">
      <Text bold>Savings tier</Text>
      <Text>{tier ? `${tier.name} · ${tier.auto ? 'automatic' : 'set manually'}` : 'Normal · automatic'}</Text>
      {tier?.summary ? <Text dimColor>{tier.summary}</Text> : null}
      {tier?.reason ? <Text dimColor>{tier.reason}</Text> : null}
      <Box gap={1}>
        <Button key="t-auto" label="Auto" variant="primary" onPress={() => choose('auto')} />
        {([0, 1, 2, 3] as const).map(l => (
          <Button key={`t-${l}`} label={`${l}`} onPress={() => choose(l)} />
        ))}
      </Box>
      <Text dimColor>0 normal · 1 light · 2 medium · 3 strict. Choosing one by hand turns automatic off.</Text>
    </Box>
  )
}

// Right-hand session list: one button per running session with the state, step, progress and tokens.
export function Sessions({ el, sessions, now, selected, me, select, glyph }: { el: El; sessions: SessionRecord[]; now: number; selected: string | null; me: string; select: SessionActions['select']; glyph: Glyph }) {
  const { Box, Text, Button } = el
  return (
    <Box flexDirection="column">
      <Text bold>{`Sessions (${sessions.length})`}</Text>
      {sessions.length === 0 ? <Text dimColor>No other records yet.</Text> : null}
      {sessions.map(r => {
        const st = effectiveState(r, now)
        const pr = r.progress.total > 0 ? ` ${r.progress.done}/${r.progress.total}` : ''
        return (
          <Box key={`sr-${r.name}`} flexDirection="column">
            <Button key={`s-${r.name}`} plain label={`${selected === r.name ? '▸' : ' '} ${glyph(st)} ${r.name}${r.name === me ? ' (this)' : ''} · ${STATE_LABEL[st]}${pr} · ${tok(totalTokens(r))} tok`} onPress={() => select(selected === r.name ? null : r.name)} />
            <Text dimColor>{`   ${r.step || r.task || '—'}`}</Text>
          </Box>
        )
      })}
    </Box>
  )
}

// What a click shows: what the session does, what it is able to do (from its own tool history), and the controls.
export function Detail({ el, rec, now, me, flash, actions, glyph, art }: { el: El; rec: SessionRecord | undefined; now: number; me: string; flash: string; actions: SessionActions; glyph: Glyph; art: Art }) {
  const { Box, Text, Button } = el
  if (!rec) return <Box />
  const st = effectiveState(rec, now)
  const can = abilities(rec.tools)
  const isMe = rec.name === me
  return (
    <Box flexDirection="column" borderStyle="round" paddingX={1}>
      {ArtNode({ el, art })}
      <Text bold>{`${glyph(st)} ${rec.name} · ${STATE_LABEL[st]}`}</Text>
      <Text>{`Task: ${rec.task || '—'}`}</Text>
      <Text>{`Now: ${rec.step || '—'}`}</Text>
      <Text>{`Progress: ${rec.progress.total > 0 ? `${rec.progress.done}/${rec.progress.total}` : 'no plan'} · tokens ${tok(totalTokens(rec))} (output ${tok(rec.tokens.output)}) · ${rec.usd.toFixed(2)} USD`}</Text>
      <Text>{`Tier: ${rec.tierName}${rec.tierReason ? ` — ${rec.tierReason}` : ''}`}</Text>
      <Text dimColor>{`Can do: ${can.length ? can.join(', ') : 'no tools used yet'}${rec.tools && Object.keys(rec.tools).length ? ` (recent tools: ${topTools(rec.tools)})` : ''}`}</Text>
      <Text dimColor>{`Last update: ${ago(now - rec.updatedAt)}`}</Text>
      <Box gap={1}>
        <Button key="pause" label={isMe ? 'Pause' : 'Ask to pause'} onPress={() => actions.pause(rec.name)} />
        <Button key="close" label="Close" onPress={() => actions.select(null)} />
      </Box>
      {isMe ? null : <Text dimColor>Message: /msg {rec.name} text (up to 600 characters, at most 3 without an answer)</Text>}
      {flash ? <Text color="warning">{flash}</Text> : null}
    </Box>
  )
}

export function SessionArea(props: { el: El; sessions: SessionRecord[]; now: number; selected: string | null; me: string; flash: string; actions: SessionActions; glyph: Glyph; art: Art }) {
  const { Box } = props.el
  return (
    <Box flexDirection="column" gap={1}>
      {Sessions({ el: props.el, sessions: props.sessions, now: props.now, selected: props.selected, me: props.me, select: props.actions.select, glyph: props.glyph })}
      {Detail({ el: props.el, rec: props.sessions.find(r => r.name === props.selected), now: props.now, me: props.me, flash: props.flash, actions: props.actions, glyph: props.glyph, art: props.art })}
    </Box>
  )
}

export function Panel(props: { el: El; rows: BarRow[]; budgets: Budgets; tier: TierView | null; actions: PanelActions; extra?: unknown; hero?: Art; heroLabel?: string }) {
  const { Box, Text } = props.el
  return (
    <Box flexDirection="column" gap={1}>
      <Text bold>Session Budget</Text>
      {props.hero ? <Box flexDirection="column">{ArtNode({ el: props.el, art: props.hero })}{props.heroLabel ? <Text dimColor>{props.heroLabel}</Text> : null}</Box> : null}
      {Bars({ el: props.el, rows: props.rows })}
      {BudgetControls({ el: props.el, budgets: props.budgets, adjust: props.actions.adjust })}
      {TierControls({ el: props.el, tier: props.tier, choose: props.actions.tier })}
      {props.extra as never}
    </Box>
  )
}

// One line above the prompt: compact bars for the weekly and the five-hour window.
export function Band({ el, rows, tier }: { el: El; rows: BarRow[]; tier: TierView | null }) {
  const { Box, Text } = el
  const w = rows.find(r => r.key === 'weekly')
  const d = rows.find(r => r.key === 'fiveHour')
  return (
    <Box gap={2}>
      {w ? <Text color={w.color}>{`Week ${w.used === undefined ? '?' : Math.round(w.status.ratio * 100) + '%'} ${w.bar}`}</Text> : null}
      {d ? <Text color={d.color}>{`5h ${d.used === undefined ? '?' : Math.round(d.status.ratio * 100) + '%'} ${d.bar}`}</Text> : null}
      {tier && tier.level > 0 ? <Text color="warning">{`Savings: ${tier.name}`}</Text> : null}
    </Box>
  )
}

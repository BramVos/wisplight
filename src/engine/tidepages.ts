import { GameClock } from './clock'
import { tideState } from './tides'
import type { World } from './world'

// The great lines in sight, and not too often (M10.22): the journal's page
// "The great lines" with where each line stands and what moved it, the land
// map that colours a tense border, and the chronicle of the game that names
// every judgement. Read from the state tides.ts keeps; nothing here changes it.

const STAGE = { calm: 'calm', threat: 'a threat', event: 'broken' } as const

/** The journal page: per line where it stands, what pushed it last, and its judgements. */
export function tidesPage(world: World): string[] {
  const lines: string[] = []
  for (const tide of world.content.tides.values()) {
    const st = tideState(world, tide.id)
    lines.push(`${tide.name.charAt(0).toUpperCase()}${tide.name.slice(1)} (${tide.kind}): ${STAGE[st.stage]}; ${Math.round(st.pressure)} of ${tide.threshold} (a threat from ${tide.threat}).`)
    if (st.moved.length) lines.push(`  Moved by: ${st.moved.join('; ')}.`)
    for (const h of st.history.slice(-3).reverse()) lines.push(`  ${new GameClock(h.t).short(world.calendar)}: ${h.judged === 'nothing' ? 'nothing came of it' : h.judged === 'threat' ? 'it threatened' : 'it broke'}. ${h.why}`)
    lines.push('')
  }
  return lines.length ? lines.slice(0, -1) : ['This world has no great lines.']
}

/** The lines under a threat or just broken, for the land map to colour the region's border. */
export function tenseLines(world: World): { name: string; stage: 'threat' | 'event' }[] {
  return [...world.content.tides.values()].flatMap((tide) => {
    const st = tideState(world, tide.id)
    return st.stage === 'calm' ? [] : [{ name: tide.name, stage: st.stage }]
  })
}

/** Every judgement of every line, for the chronicle of the game. */
export function tidesChronicle(world: World): string[] {
  const out: string[] = []
  for (const tide of world.content.tides.values()) {
    const history = world.state.tides?.lines[tide.id]?.history ?? []
    for (const h of history) out.push(`  ${new GameClock(h.t).short(world.calendar)}, ${tide.name}: ${h.judged === 'nothing' ? 'nothing' : h.judged === 'threat' ? 'a threat' : 'it broke'} (${h.why}).`)
  }
  return out
}

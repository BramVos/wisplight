import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Engine } from '../src/engine'
import type { LlmClient, LlmRejection } from '../src/engine/dialogue/llm'
import { loadContentFromDir } from '../src/node/content'

// M10.35 I, the overall measure (the researcher, 1 October 2026): every line the stranger may reasonably take as a deed
// to do, a promise or a hint to use goes back to what the game holds, or to a lie it means (G). The probe asks not only
// "can I get a forbidden thing?" but "can I make someone make up a place to look, a leave, a way out or a promise?",
// again after the world changed and in a second talk. Each probe line is what a model might say, played through the
// whole talk as the game plays it: the guards send it back, or it gets through. Bram's transcripts of 29 and 30
// September give most of them; the rest are of the same kinds. True lines go along, and must get through.

const quiet = await loadContentFromDir(join(import.meta.dirname, '../content'), 'quietreach')

type Kind = 'place to look' | 'leave' | 'way out' | 'promise'
interface Probe { kind: Kind; who: string; at: string; line: string; asks: string }

const PROBES: Probe[] = [
  // A place to look (vindplaats).
  { kind: 'place to look', who: 'niko', at: 'loc_orison_listening_room', asks: 'Where would I find a multimeter?', line: 'Niko points. "The multimeter is under the bench."' },
  { kind: 'place to look', who: 'niko', at: 'loc_orison_listening_room', asks: 'Is there anything else here?', line: 'Niko shrugs. "Maybe there\'s something under the bench."' },
  { kind: 'place to look', who: 'tessa', at: 'loc_workshop', asks: 'How do I get into the ship?', line: 'Tessa nods. "There\'s an access hatch from the workshop side into the ship\'s belly."' },
  { kind: 'place to look', who: 'tessa', at: 'loc_workshop', asks: 'Where are the run logs?', line: 'Tessa nods. "The last three run logs are on the slate by the briefing table."' },
  { kind: 'place to look', who: 'sana', at: 'loc_commons', asks: 'Where is a field lamp?', line: 'Sana nods. "The field lamp is in the Commons."' },
  { kind: 'place to look', who: 'sana', at: 'loc_commons', asks: 'Where can I get a cable?', line: 'Sana nods. "You\'ll find a spare cable reel behind the water tanks."' },
  // A leave (toestemming).
  { kind: 'leave', who: 'sana', at: 'loc_commons', asks: 'How do I get into the hangar?', line: 'Sana nods. "Mara can let you in to the hangar."' },
  { kind: 'leave', who: 'sana', at: 'loc_commons', asks: 'Who has the code?', line: 'Sana nods. "Sorell has the code to the hangar."' },
  { kind: 'leave', who: 'tessa', at: 'loc_workshop', asks: 'Who has the code?', line: 'Tessa frowns. "Mara has the code. Ask Mara for the code."' },
  { kind: 'leave', who: 'sana', at: 'loc_commons', asks: 'Can I go in?', line: 'Sana nods. "You\'ll need Mara\'s permission."' },
  { kind: 'leave', who: 'sana', at: 'loc_commons', asks: 'Who decides?', line: 'Sana nods. "Ask Sorell for the code."' },
  // A way out (oplossing).
  { kind: 'way out', who: 'niko', at: 'loc_orison_listening_room', asks: 'What should I do?', line: 'Niko nods. "Could you photograph the panel for me?"' },
  { kind: 'way out', who: 'niko', at: 'loc_orison_listening_room', asks: 'What should I do?', line: 'Niko nods. "You should check the connector readings."' },
  { kind: 'way out', who: 'mara', at: 'loc_arrival_lock', asks: 'What should I do?', line: 'Mara nods. "Ask Sorell for the raw power traces."' },
  { kind: 'way out', who: 'tessa', at: 'loc_workshop', asks: 'What do you need?', line: 'Tessa nods. "I need you to recalibrate the drive coils."' },
  { kind: 'way out', who: 'sana', at: 'loc_commons', asks: 'Anything I can do?', line: 'Sana nods. "Bring me the crates from the lock."' },
  { kind: 'way out', who: 'ilyan', at: 'loc_medical_bay', asks: 'What now?', line: 'Ilyan nods. "Bring whatever you need for the ridge."' },
  // A promise (toezegging).
  { kind: 'promise', who: 'ilyan', at: 'loc_medical_bay', asks: 'What now?', line: 'Ilyan nods. "Meet me at the Peregrine Hangar in ten minutes."' },
  { kind: 'promise', who: 'sana', at: 'loc_commons', asks: 'Can you help?', line: 'Sana smiles. "I\'ll take you to the hangar myself."' },
  { kind: 'promise', who: 'tessa', at: 'loc_workshop', asks: 'Can you help?', line: 'Tessa nods. "I\'ll bring you the logs tonight."' },
  { kind: 'promise', who: 'sana', at: 'loc_commons', asks: 'Can you help?', line: 'Sana nods. "I\'ll tell Mara for you."' },
  { kind: 'promise', who: 'niko', at: 'loc_orison_listening_room', asks: 'Can I see it?', line: 'Niko slides his notebook across the desk. "Here, take it."' },
]

// True lines: what the game holds, and a guess at a person. They must get through.
const TRUE: Omit<Probe, 'kind'>[] = [
  { who: 'sana', at: 'loc_commons', asks: 'Who has the code?', line: 'Sana nods. "Tessa has the code to the hangar."' },
  { who: 'sana', at: 'loc_commons', asks: 'How do I get in?', line: 'Sana nods. "Tessa can let you in."' },
  { who: 'sana', at: 'loc_commons', asks: 'Is Sorell hiding something?', line: 'Sana sighs. "If you ask me, Sorell knows more than he says."' },
  { who: 'niko', at: 'loc_orison_listening_room', asks: 'Is the antenna damaged?', line: 'Niko frowns. "The wiring is old. I\'d start there."' },
  { who: 'niko', at: 'loc_orison_listening_room', asks: 'What did you write down?', line: 'Niko nods. "I have my notebook here."' },
]

/** Plays one line through a talk: the model says it first and something plain after; whether a guard sent it back. */
async function play(probe: Omit<Probe, 'kind'>, change?: (engine: Engine) => void, second = false): Promise<{ caught: boolean; why: string[] }> {
  const reports: LlmRejection[] = []
  let n = 0
  const llm: LlmClient = {
    complete: async () => {
      const reply = n++ === 0 ? probe.line : 'A nod. "I couldn\'t say."'
      const body = { reply, names: [], mentioned_topics: [], effects: [], memory_note: 'The stranger asked me something.', ends_conversation: false, keep_talking: 'no', action: 'none', propose: 'none' }
      return { text: JSON.stringify(body), provider: 'mock', model: 'script-1', usage: { inputTokens: 10, outputTokens: 10, cachedTokens: 0 }, latencyMs: 1 }
    },
    report: (r) => reports.push(r),
  }
  const engine = new Engine(quiet, { seed: 3, builder: true })
  engine.start()
  for (const c of [`@goto ${probe.at}`, `@bring ${probe.who}`]) await engine.handle(c)
  change?.(engine)
  // A second talk: one before it, on the mock's plain words.
  if (second) {
    for (const c of [`talk ${probe.who}`, '"Good day.', 'bye']) await engine.handle(c)
    engine.tick(30)
  }
  engine.setLlm(llm)
  n = 0
  await engine.handle(`talk ${probe.who}`)
  n = 0
  await engine.handle(`"${probe.asks}`)
  const why = reports.filter((r) => r.role === 'voice' || !r.role).map((r) => `${r.reason}${r.detail ? `: ${r.detail}` : ''}`)
  return { caught: why.length > 0, why }
}

describe('M10.35 I: every deed, promise or hint goes back to the game', () => {
  it('sends back the made-up place to look, leave, way out and promise, and lets the true lines through', async () => {
    const table: Record<Kind, { caught: number; through: string[] }> = { 'place to look': { caught: 0, through: [] }, leave: { caught: 0, through: [] }, 'way out': { caught: 0, through: [] }, promise: { caught: 0, through: [] } }
    for (const probe of PROBES) {
      const { caught } = await play(probe, probe.line.includes('field lamp') ? (e) => void (e.state.ground['loc_workshop'] = { field_lamp: 1 }) : undefined)
      if (caught) table[probe.kind].caught++
      else table[probe.kind].through.push(probe.line)
    }
    for (const t of TRUE) expect((await play(t)).why, t.line).toEqual([])
    // What gets through is named in the report of M10.35 (docs/CHANGELOG.md), per kind.
    expect(Object.fromEntries(Object.entries(table).map(([k, v]) => [k, v.caught]))).toEqual({ 'place to look': 5, leave: 5, 'way out': 5, promise: 5 })
    expect(table['place to look'].through).toEqual(['Tessa nods. "The last three run logs are on the slate by the briefing table."'])
    expect(table.leave.through).toEqual([])
    // The giver of a running story may ask a task of their own (M10.33 V), and "whatever you need" names nothing to look for.
    expect(table['way out'].through).toEqual(['Ilyan nods. "Bring whatever you need for the ridge."'])
    expect(table.promise.through).toEqual([])
  })

  it('tells it again after the world changed: the notebook passed to Tessa', async () => {
    const moved = (e: Engine) => {
      e.state.npcs['npc_niko_serrin']!.inventory = {}
      e.state.npcs['npc_tessa_rook']!.inventory = { niko_notebook: 1 }
    }
    expect((await play({ who: 'sana', at: 'loc_commons', asks: 'Where is the notebook?', line: 'Sana nods. "Niko has his notebook."' }, moved)).caught).toBe(true)
    expect((await play({ who: 'sana', at: 'loc_commons', asks: 'Where is the notebook?', line: 'Sana nods. "Tessa has Niko\'s notebook."' }, moved)).why).toEqual([])
  })

  it('tells it the same in a second talk', async () => {
    expect((await play({ who: 'sana', at: 'loc_commons', asks: 'How do I get into the hangar?', line: 'Sana nods. "Mara can let you in to the hangar."' }, undefined, true)).caught).toBe(true)
    expect((await play({ who: 'sana', at: 'loc_commons', asks: 'How do I get in?', line: 'Sana nods. "Tessa can let you in."' }, undefined, true)).why).toEqual([])
  })
})

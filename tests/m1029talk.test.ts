import { describe, expect, it } from 'vitest'
import { Engine, type LlmClient, type LlmRejection, type LlmRequest } from '../src/engine'
import { fallbackReply } from '../src/engine/dialogue/fallback'
import { deedKinds, promises, saysNothing, talksOfSelf } from '../src/engine/dialogue/guard'
import { improvisable, improviseRequest } from '../src/engine/improvise'
import { parseCommand } from '../src/engine/parser'
import { parseWhen } from '../src/engine/dialogue/offers'
import { listener } from '../src/engine/dialogue/prompt'
import { relation } from '../src/engine/dialogue/relations'
import { content } from './helpers'

// M10.29 A and B, from Bram's playtest of The Quiet Reach (29 September 2026).
// A: what the speaker knows of the stranger. A first greeting is not "there
// you are again"; the prompt says a stranger has no past with them; a memory
// holds only what happened; a reply is words; an age they say is told. B:
// words are never deeds. A deed told as done, a time kept or a way pointed
// without an offer is asked again, and a time and place the speaker names
// themselves is a meeting they propose, which the player's yes makes an
// agreement.

const DAY = 24 * 60
const said = (outs: { text: string }[]) => outs.map((o) => o.text).join('\n')

/** A model that says what it is told (a reply, and optionally its memory note and proposal), and keeps what was reported. */
function scripted(...replies: (string | { reply: string; memory_note?: string; propose?: string })[]): LlmClient & { reports: LlmRejection[]; calls: LlmRequest[] } {
  let i = 0
  const reports: LlmRejection[] = []
  const calls: LlmRequest[] = []
  return {
    reports,
    calls,
    complete: async (request) => {
      calls.push(request)
      const r = replies[Math.min(i++, replies.length - 1)]!
      const one = typeof r === 'string' ? { reply: r } : r
      const text = JSON.stringify({ reply: one.reply, names: [], mentioned_topics: [], effects: [], memory_note: one.memory_note ?? 'The stranger talked to me.', ends_conversation: false, keep_talking: 'no', ...(one.propose ? { action: 'none', propose: one.propose } : {}) })
      return { text, provider: 'mock', model: 'script-1', usage: { inputTokens: 10, outputTokens: 10, cachedTokens: 0 }, latencyMs: 1 }
    },
    report: (r) => reports.push(r),
  }
}

/** A talk with Mirte where she stands about, free, and the stranger says one line. */
async function talk(llm: LlmClient, line: string, hour = 9) {
  const engine = new Engine(content, { seed: 4, llm })
  engine.tick(((hour * 60 - (engine.world.now % DAY)) + DAY) % DAY)
  const s = engine.state.npcs['npc_mirte']!
  s.location = engine.state.player.location
  s.activity = 'standing about'
  s.busyUntil = engine.world.now + 600
  s.plan = []
  s.note = undefined
  await engine.handle('talk mirte')
  const out = said(await engine.handle(line))
  return { engine, out }
}

describe('M10.29 A: what the speaker knows of the stranger', () => {
  it('greets someone new as new, and someone known as known', () => {
    const engine = new Engine(content, { seed: 1 })
    const world = engine.world
    const packet = { known: [], unknown: [] } as unknown as Parameters<typeof fallbackReply>[3]
    expect(fallbackReply(world, 'npc_mirte', 'Greet', packet, 'Warm')).not.toMatch(/again/)
    expect(fallbackReply(world, 'npc_mirte', 'Greet', packet, 'Warm')).toMatch(/You'll be new here\./)
    relation(engine.state, 'npc_mirte').familiarity = 10
    expect(fallbackReply(world, 'npc_mirte', 'Greet', packet, 'Warm')).toMatch(/There you are again\./)
    // The prompt says a stranger has no past with them; someone known has.
    relation(engine.state, 'npc_harmen').familiarity = 0
    expect(listener(world, 'npc_harmen')).toMatch(/You do not know them: you have done nothing together/)
    expect(listener(world, 'npc_mirte')).not.toMatch(/done nothing together/)
  })

  it('keeps a memory of a deed only when an agreement bears it out', async () => {
    const { engine } = await talk(scripted({ reply: 'Mirte nods. "The bunks are through there."', memory_note: 'I showed the stranger the bunk this morning.' }), 'Where can I sleep?')
    const notes = engine.state.npcs['npc_mirte']!.memory!.map((m) => m.note)
    expect(notes.some((n) => /showed/.test(n))).toBe(false)
    expect(deedKinds('I gave the stranger a loaf.')).toEqual(['give', 'lend', 'errand'])
    expect(deedKinds('The stranger asked about the mill.')).toEqual([])
  })

  it('asks again for a reply that says nothing aloud', async () => {
    expect(saysNothing('Sana smiles warmly.', ['Sana'])).toBe(true)
    expect(saysNothing('Sana smiles. "Evening."', ['Sana'])).toBe(false)
    expect(saysNothing('Water finds the weakest board, stranger.', ['Sana'])).toBe(false)
    // Someone else's pronoun, a contraction, or what they say told, is words (M10.29 Q: six of Mara's answers lost).
    expect(saysNothing("He'll be in the hangar by now, I'd think.", ['Mara'], 'she')).toBe(false)
    expect(saysNothing('He is in the hangar.', ['Mara'], 'she')).toBe(false)
    expect(saysNothing('Mara says he is on the ship.', ['Mara'], 'she')).toBe(false)
    expect(saysNothing('She nods towards the door.', ['Mara'], 'she')).toBe(true)
    const llm = scripted('Mirte smiles warmly.', 'Mirte smiles. "Rye today, and the last of the wheat."')
    const { out } = await talk(llm, 'How is the bread today?')
    expect(llm.reports.map((r) => r.reason)).toContain('schema')
    expect(out).toMatch(/Rye today/)
  })

  it('takes an age the person says of themselves as told', async () => {
    const age = content.npcs.get('npc_mirte')!.age
    const { engine } = await talk(scripted(`Mirte laughs. "Me? I'm ${age}, and I've baked since I was twelve."`), 'Tell me about yourself, how old are you?')
    expect(engine.state.player.people?.['npc_mirte']?.age?.value).toBe(age)
  })
})

describe('M10.29 B: words are never deeds', () => {
  it('knows a deed told as done, a time kept and a way pointed, and not plain talk', () => {
    for (const promise of ['Mirte hands you the loaf.', 'Here, take it.', "I'll be done at seventeen thirty.", 'See you at the green.', "Come on, I'll point you right.", 'This way.', 'She gives you a nod and a loaf.']) expect(promises(promise), promise).toBe(true)
    for (const talkOnly of ["I'll tell you what I know.", 'The ferry leaves at six.', 'The miller gave up on the sails.']) expect(promises(talkOnly), talkOnly).toBe(false)
    // Spoken hours and minutes.
    const nine = 10 * DAY + 9 * 60
    expect(parseWhen("I'll be done at seventeen thirty", nine)! - 10 * DAY).toBe(17 * 60 + 30)
    expect(parseWhen('half past five', nine)! - 10 * DAY).toBe(17 * 60 + 30)
  })

  it('asks again for a deed in the text that no offer bears', async () => {
    const llm = scripted('Mirte hands you a loaf. "There, for the road."', 'Mirte shakes her head. "Nothing to spare today."')
    const { out } = await talk(llm, 'Do you have bread to spare?')
    expect(llm.reports.map((r) => r.reason)).toContain('promise')
    expect(out).not.toMatch(/hands you a loaf/)
  })

  // Since M10.33 AG a meeting is never read from her words: asked for later while she works, the game offers one at the
  // end of her work, and she proposes it in the schema.
  it('a meeting later is the game\'s offer she proposes; the yes makes it an agreement that takes her there', async () => {
    const here = new Engine(content, { seed: 4 }).state.player.location
    const { engine, out } = await talk(scripted({ reply: 'Mirte wipes her hands. "When I am done with the baking. Meet me here then?"', propose: `meet:${here}` }), 'Can we talk later?')
    expect(out).toMatch(/Mirte offers to meet you at Canal Quay, 12:00\. YES to agree/)
    await engine.handle('yes')
    const meeting = (engine.state.agreements?.list ?? []).find((a) => a.kind === 'meet' && a.by === 'npc_mirte')
    expect(meeting).toBeDefined()
    expect(meeting!.terms.place).toBeDefined()
  })
})

describe('M10.29 T: a time in the speaker\'s words, a speaker as I, and improvising without a past', () => {
  it('reads "in ten minutes", "after my shift" and "at first light" as a time', () => {
    const nine = 10 * DAY + 9 * 60
    expect(parseWhen('Meet me at the hangar in ten minutes.', nine)! - nine).toBe(10)
    expect(parseWhen('in half an hour', nine)! - nine).toBe(30)
    expect(parseWhen('in a few minutes', nine)! - nine).toBe(5)
    expect(parseWhen("I'll come after my shift", nine, { until: 10 * DAY + 17 * 60 })).toBe(10 * DAY + 17 * 60)
    expect(parseWhen("I'll come after my shift", nine)).toBeUndefined()
    expect(parseWhen('at first light', nine)).toBe(11 * DAY + 6 * 60)
  })

  it('asks again for a speaker who speaks of themselves as another', async () => {
    expect(talksOfSelf('"Niko didn\'t mention it. He\'s been worried."', ['Niko'])).toBe(true)
    expect(talksOfSelf("Niko's been at the ridge all week.", ['Niko'])).toBe(true)
    expect(talksOfSelf('Niko shrugs. "I didn\'t mention it."', ['Niko'])).toBe(false)
    expect(talksOfSelf('"Niko is my name, and the signal is my job."', ['Niko'])).toBe(false)
    const llm = scripted('Mirte laughs. "Mirte has baked since she was twelve."', 'Mirte laughs. "I have baked since I was twelve."')
    const { out } = await talk(llm, 'How long have you baked?')
    expect(llm.reports.map((r) => `${r.reason} ${r.detail ?? ''}`)).toContain('character spoke of self as another')
    expect(out).toMatch(/I have baked since I was twelve/)
  })

  it('tells an improvised act without a past', () => {
    const engine = new Engine(content, { seed: 31, builder: true })
    engine.start()
    return engine.handle('@goto loc_kabouterberg').then(() => {
      engine.state.player.inventory['milk'] = 2
      const imp = improvisable(engine.world, parseCommand('pour milk on the oak'))!
      expect(improviseRequest(engine.world, imp).system).toMatch(/never what happened here before or why/)
    })
  })
})

import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Engine, MockLlm, type Output } from '../src/engine'
import { givenWords, unfoundedClaim } from '../src/engine/dialogue/guard'
import { falseHint } from '../src/engine/dialogue/hints'
import { sentText, type LlmClient, type LlmRejection, type LlmRequest } from '../src/engine/dialogue/llm'
import { withoutRules } from '../src/engine/dialogue/prompt'
import { TopicRegistry } from '../src/engine/dialogue/topics'
import { loadContentFromDir } from '../src/node/content'

// M10.35 B, guessing about people, never about the world (Bram, 30 September 2026: Niko's "the multimeter under the
// bench" and Tessa's "an access hatch from the workshop side into the ship's belly" were embroidery said as fact, and he
// looked for both; the cause, in the rules: only fact or "I don't know", so the model's colour came on screen as fact;
// sharpened by the researcher on 1 October 2026: "maybe there is something under that bench" sends the player looking
// all the same, and "Mara has the key" can be false while Mara and the key both exist). The voice may guess at people's
// motives; a hint about the world holds only what the prompt gives, and who has a thing, where it lies and who lets the
// stranger in are told against the state of the game.

const quiet = await loadContentFromDir(join(import.meta.dirname, '../content'), 'quietreach')
const text = (out: Output[]) => out.map((o) => o.text).join('\n')

function scripted(...replies: string[]): LlmClient & { reports: LlmRejection[]; calls: LlmRequest[] } {
  const reports: LlmRejection[] = []
  const calls: LlmRequest[] = []
  return {
    reports,
    calls,
    complete: async (request) => {
      calls.push(request)
      const reply = replies[Math.min(calls.length - 1, replies.length - 1)]!
      const body = { reply, names: [], mentioned_topics: [], effects: [], memory_note: 'The stranger asked about the station.', ends_conversation: false, keep_talking: 'no', action: 'none', propose: 'none' }
      return { text: JSON.stringify(body), provider: 'mock', model: 'script-1', usage: { inputTokens: 10, outputTokens: 10, cachedTokens: 0 }, latencyMs: 1 }
    },
    report: (r) => reports.push(r),
  }
}

async function talkTo(llm: LlmClient, who = 'niko', place = 'loc_orison_listening_room'): Promise<Engine> {
  const engine = new Engine(quiet, { seed: 3, builder: true, llm })
  engine.start()
  for (const c of [`@goto ${place}`, `@bring ${who}`, `talk ${who}`]) await engine.handle(c)
  return engine
}

describe('M10.35 B: guessing about people, never about the world', () => {
  it('tells the voice it may guess at people\'s motives, and never where a thing is, who has it or who lets one in', async () => {
    const good = new MockLlm('good')
    const engine = await talkTo(good)
    await engine.handle('"What would you do in my place?')
    expect(sentText(good.calls.filter((c) => c.schemaName === 'npc_reply').at(-1)!)).toMatch(/guess at people's motives as your own \("I'd guess"\); never where a thing is, who has it, who lets one in or what helps/)
  })

  it('knows a thing, a way or a need the prompt does not give, a "maybe" or not, and lets a guess at people, a denial, an if and a question pass', async () => {
    const good = new MockLlm('good')
    const engine = await talkTo(good)
    await engine.handle('"Is the antenna damaged?')
    const given = givenWords(withoutRules(sentText(good.calls.filter((c) => c.schemaName === 'npc_reply').at(-1)!)))
    expect(unfoundedClaim('Niko points. "The multimeter is under the bench."', given)).toMatchObject({ missing: ['multimeter', 'bench'] })
    expect(unfoundedClaim('"If you ask me, there is a multimeter under the bench."', given)?.missing).toContain('multimeter')
    expect(unfoundedClaim('"Maybe there\'s something under the bench."', given)?.missing).toEqual(['bench'])
    expect(unfoundedClaim('"There\'s an access hatch from the workshop side into the ship\'s belly."', given)?.missing).toContain('belly')
    expect(unfoundedClaim('"Ask Sorell for the raw power traces."', given)?.missing).toEqual(['traces'])
    expect(unfoundedClaim('"If you ask me, Sorell knows more than he says."', given)).toBeUndefined()
    expect(unfoundedClaim('"There\'s no multimeter under the bench."', given)).toBeUndefined()
    expect(unfoundedClaim('"Is the multimeter under the bench?"', given)).toBeUndefined()
    expect(unfoundedClaim('"They say if a fool stands at the edge and mocks it, it takes him."', given)).toBeUndefined()
    expect(unfoundedClaim('"You want the old tale."', given)).toBeUndefined()
    expect(unfoundedClaim('"The recordings are kept in the Orison Listening Room."', given)).toBeUndefined()
  })

  it('tells who has a thing, where it lies and who lets the stranger in against the state of the game, also once it changes', () => {
    const engine = new Engine(quiet, { seed: 3, builder: true })
    engine.start()
    const topics = new TopicRegistry(quiet)
    const hint = (said: string) => falseHint(engine.world, `"${said}"`, (s) => topics.recognise(s), 'npc_sana_holt')?.phrase
    // Who lets the stranger in: Tessa keeps the hangar's word, Mara and Sorell do not.
    expect(hint('Mara can let you in to the hangar.')).toBe('Mara can let you in')
    expect(hint('Sorell has the code to the hangar.')).toBe('Sorell has the code to the hangar')
    expect(hint('Ask Sorell for the code.')).toBe('Ask Sorell for the code')
    expect(hint("You'll need Mara's permission.")).toBe("You'll need Mara's permission")
    for (const said of ['Tessa can let you in.', 'Tessa has the code to the hangar.', 'Ask Tessa for the code.', 'Mara cannot let you in.']) expect(hint(said), said).toBeUndefined()
    // Who has a thing, and where it lies; then the world changes and so does what is so.
    expect(hint("Niko has his notebook.")).toBeUndefined()
    expect(hint("Tessa has Niko's notebook.")).toBe("Tessa has Niko's notebook")
    engine.state.npcs['npc_niko_serrin']!.inventory = {}
    engine.state.npcs['npc_tessa_rook']!.inventory = { niko_notebook: 1 }
    expect(hint('Niko has his notebook.')).toBe('Niko has his notebook')
    expect(hint("Tessa has Niko's notebook.")).toBeUndefined()
    engine.state.ground['loc_workshop'] = { field_lamp: 1 }
    expect(hint('The field lamp is in the Workshop.')).toBeUndefined()
    expect(hint('The field lamp is in the Commons.')).toBe('The field lamp is in the Commons')
  })

  it('asks again for a hint that is not so, telling the voice only that it is not, and keeps a guess at a person', async () => {
    const llm = scripted('Sana nods. "Mara can let you in to the hangar."', 'Sana shrugs. "I\'d guess Tessa keeps that close, if you ask me."')
    const engine = await talkTo(llm, 'sana', 'loc_commons')
    const out = text(await engine.handle('"How do I get into the hangar?'))
    expect(llm.reports.map((r) => `${r.reason} ${r.detail ?? ''}`)).toContain('invented a false hint: Mara can let you in (npc_mara_venn keeps no lock of loc_peregrine_hangar)')
    const note = llm.calls.at(-1)!.prompt
    expect(note).toMatch(/NOTE: your last reply said "Mara can let you in", which is not so\. Never guess who has a thing, where it is or who lets someone in/)
    expect(note).not.toMatch(/7411|Tessa keeps/)
    expect(out).not.toMatch(/Mara can let you in/)
    expect(out).toMatch(/I'd guess \[?Tessa\]? keeps that close/)
  })

  it('asks again when a made-up thing is said, and keeps the answer without it', async () => {
    const llm = scripted('Niko frowns. "The multimeter is under the bench. Check the connector readings with it."', 'Niko frowns. "The wiring is old. I\'d start there."')
    const engine = await talkTo(llm)
    const out = text(await engine.handle('"What would you do in my place?'))
    expect(llm.reports.map((r) => `${r.reason} ${r.detail ?? ''}`)).toContain('invented a hint nothing gives: The multimeter is under the bench')
    expect(llm.calls.at(-1)!.prompt).toMatch(/NOTE: your last reply said "The multimeter is under the bench", but nothing you know gives "multimeter", "bench"\. Leave it out: of things, places and ways say only what you know\./)
    expect(out).not.toMatch(/multimeter/)
    expect(out).toMatch(/The wiring is old/)
  })
})

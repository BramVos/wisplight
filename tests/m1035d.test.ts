import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Engine, MockLlm } from '../src/engine'
import { hookLine, hooksFor } from '../src/engine/dialogue/hooks'
import { sentText } from '../src/engine/dialogue/llm'
import { loadContentFromDir } from '../src/node/content'

// M10.35 D, the question back comes from the content (the cause: THIS TIME asked the voice one turn in three for a
// question back or a hook "in your own way", and a false trail came in there). The game gives the hooks, each a thing the
// prompt holds; the voice picks one and says it in its own words, and with none it asks back about what was said.

const root = join(import.meta.dirname, '../content')
const quiet = await loadContentFromDir(root, 'quietreach')
const none = { known: [], unknown: [] }

describe('M10.35 D: the question back comes from the content', () => {
  it('gives the giver what they want, whoever is in the next step the Now line, and who only knows the story the story', () => {
    const engine = new Engine(quiet, { seed: 3, builder: true })
    engine.start()
    expect(hooksFor(engine.world, { npcId: 'npc_ilyan_sorell', packet: none })).toEqual(['what you want of the stranger now in The Orison Recordings (THE STORY AS YOU KNOW IT)'])
    expect(hooksFor(engine.world, { npcId: 'npc_niko_serrin', packet: none })).toEqual(['how the stranger is getting on with The Orison Recordings; their next step: Ask Niko about the station'])
    expect(hooksFor(engine.world, { npcId: 'npc_sana_holt', packet: none })).toEqual(['The Orison Recordings (THE STORY AS YOU KNOW IT)'])
  })

  it('adds a request, an offer said yes to, news heard and a topic known well; Skerrow plays it in its own words', async () => {
    const base = await loadContentFromDir(root, 'base')
    const engine = new Engine(base, { seed: 3, builder: true })
    engine.start()
    engine.tick(24 * 60)
    const known = { known: [{ topic: 'loc_de_zwaan', name: 'De Zwaan', level: 2 as const, facts: ['The mill on the green.'] }], unknown: [] }
    const harmen = hooksFor(engine.world, { npcId: 'npc_harmen', packet: known, proposals: [] })
    expect(harmen[0]).toBe('your request (YOUR REQUEST)')
    expect(harmen[1]).toMatch(/^news you heard: |^De Zwaan \(KNOWLEDGE\)$/)
    expect(hooksFor(engine.world, { npcId: 'npc_wendela', packet: none, proposals: ['a bed for the night in the chapel loft'] })).toEqual(['an offer of yours the game said yes to: a bed for the night in the chapel loft'])
    const isle = new Engine(await loadContentFromDir(root, 'isle'), { seed: 3, builder: true })
    isle.start()
    expect(hooksFor(isle.world, { npcId: 'npc_maren', packet: none })).toEqual(['what you want of the stranger now in Off Skerrow (THE STORY AS YOU KNOW IT)'])
  })

  it('asks back about what was said, bringing up nothing new, where the game has no hook (Pip on Skerrow)', async () => {
    const isle = new Engine(await loadContentFromDir(root, 'isle'), { seed: 3, builder: true })
    isle.start()
    expect(hookLine(isle.world, { npcId: 'npc_pip', packet: none })).toBe('THIS TIME: end with a question back about what the stranger just said; bring up nothing new.')
  })

  it('tells the voice the hooks, each one in the prompt, and never asks for a hook of its own', async () => {
    const good = new MockLlm('good')
    const engine = new Engine(quiet, { seed: 3, builder: true, llm: good })
    engine.start()
    for (const c of ['@goto loc_orison_listening_room', '@bring niko', 'talk niko']) await engine.handle(c)
    for (const line of ['"Good morning.', '"What is wrong with the listening station?', '"Tell me about the signal.', '"Is the antenna damaged?', '"Who else goes up to the ridge?', '"What would you do in my place?']) await engine.handle(line)
    const calls = good.calls.filter((c) => c.schemaName === 'npc_reply')
    const hooked = calls.filter((c) => c.prompt.includes('THIS TIME'))
    expect(hooked.length).toBeGreaterThan(0)
    for (const call of hooked) {
      const line = /THIS TIME: end with a question back to the stranger, or a hook to one of these, in your own words: (.*)\. No other hook\./.exec(call.prompt)!
      // Before his step is done, the Now line; once the talk did it, the story as he knows it.
      expect(line[1]).toMatch(/^(?:how the stranger is getting on with The Orison Recordings; their next step: Ask Niko about the station|The Orison Recordings \(THE STORY AS YOU KNOW IT\))/)
      expect(sentText(call)).toMatch(/THE STORY AS YOU KNOW IT/)
      // A topic as a hook is one this turn's KNOWLEDGE holds.
      for (const topic of line[1]!.matchAll(/; ([^;]+) \(KNOWLEDGE\)/g)) expect(sentText(call)).toMatch(new RegExp(`^  \\w+ \\(level \\d\\): ${topic[1]}|${topic[1]}`, 'm'))
    }
    expect(calls.map((c) => c.prompt).join('\n')).not.toMatch(/in your own way\.$/m)
  })
})

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Engine, MockLlm } from '../src/engine'
import { strangeWords } from '../src/engine/dialogue/voice'
import { WORLD_STEPS } from '../src/engine/worldguide'
import { loadContentFromDir } from '../src/node/content'

// M10.33 O, a model makes up no places and no distances (voorstel 17 of the
// review): the voice kit could keep words out (`not_here`), but the step Voice
// never asked which kinds of places and things a world has none of, and the
// voice got no walking time for the places it may name, so "distances only as
// given" was given nothing.

const root = join(import.meta.dirname, '../content')
const quiet = await loadContentFromDir(root, 'quietreach')

describe('M10.33 O: no made-up places and distances', () => {
  it('gives the voice the walking time of every place it may name', async () => {
    const good = new MockLlm('good')
    const engine = new Engine(quiet, { seed: 3, builder: true, llm: good })
    engine.start()
    for (const c of ['@goto loc_commons', '@bring sana', 'talk sana']) await engine.handle(c)
    await engine.handle('"What is the Workshop like?')
    const call = good.calls.filter((c) => c.schemaName === 'npc_reply').at(-1)!
    expect(call.prompt).toMatch(/ {2}loc_workshop \(level \d\): [^\n]*Workshop is [^\n]*walk from here[.:]/)
  })

  it('keeps out the kinds of places a world has none of: The Quiet Reach and Skerrow, and Deepwell plays the neutral default', async () => {
    expect(strangeWords({ content: quiet }, 'You could ask at the tavern.')).toContain('tavern')
    const isle = await loadContentFromDir(root, 'isle')
    expect(strangeWords({ content: isle }, 'A carriage waits by the river.')).toEqual(expect.arrayContaining(['carriage', 'river']))
    const deepwell = await loadContentFromDir(join(import.meta.dirname, 'worlds'), 'other')
    expect(strangeWords({ content: deepwell }, 'You could ask at the tavern.')).toEqual([])
  })

  it('asks the designer for them in the step Voice, and tells the chronicler', () => {
    const voice = WORLD_STEPS.find((s) => s.id === 'voice')!
    expect(voice.ask.join(' ')).toMatch(/kinds of places and things: a dock, a road, a horse/)
    expect(voice.prompt).toMatch(/kinds of places and things this world has none of/)
    expect(readFileSync(join(root, 'CHRONICLER.md'), 'utf8')).toMatch(/No places the world does not have/)
  })
})

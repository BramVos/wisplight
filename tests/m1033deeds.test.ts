import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Engine, type Output } from '../src/engine'
import { questWarnings } from '../src/engine/quests/check'
import { conversationActions } from '../src/engine/quests/engine'
import { placeThings } from '../src/engine/quests/sketch'
import { loadContentFromDir } from '../src/node/content'

// M10.33 AA, a deed shows as a deed, and a deed on the world is the player's
// own (Bram, 30 September 2026: "I don't know what the AI made up and what I
// really have to do"; with Niko the main line went three stages in four lines,
// the voice choosing "copy the recordings" and "trace the fault" for him). In
// a talk only a deed with that person can happen; a deed on the world is typed
// with the verb of a thing at its place, and Check names one that is only a
// sentence.

const root = join(import.meta.dirname, '../content')
const quiet = await loadContentFromDir(root, 'quietreach')
const text = (out: Output[]) => out.map((o) => o.text).join('\n')

describe('M10.33 AA: a deed shows as a deed, and one on the world is typed', () => {
  it('offers a talk only the deeds with that person', async () => {
    const engine = new Engine(quiet, { seed: 3, builder: true })
    engine.start()
    for (const c of ['@goto loc_orison_listening_room', '@bring niko']) await engine.handle(c)
    // Niko's own deed is there; the recordings, a deed on the world at the same place, are not.
    ;(engine.state.flags ??= {})['story_the_orison_recordings_1'] = true
    const offered = conversationActions(engine.world, 'npc_niko_serrin').map((a) => a.key)
    expect(offered.some((k) => k.endsWith(':a2'))).toBe(false)
    expect(offered.every((k) => engine.world.content.quests.get(k.split(':')[0]!)!.actions!.find((a) => a.id === k.split(':')[1])!.with === 'npc_niko_serrin')).toBe(true)
  })

  it('books a deed done with where the story stands, and says what to do now', async () => {
    const engine = new Engine(quiet, { seed: 3, builder: true })
    engine.start()
    for (const c of ['@goto loc_orison_listening_room', '@bring niko']) await engine.handle(c)
    const out = text(await engine.handle('ask niko about the station'))
    expect(out).toMatch(/^You ask Niko about the station\. \(The Orison Recordings, 1 of 5\)$/m)
    expect(out).toMatch(/^Now: .*[Cc]opy the original recordings/m)
  })

  it('names a deed on the world that is only a sentence, and not one typed on a thing of its place', () => {
    const quests = new Map(quiet.quests)
    const main = quests.get('story_the_orison_recordings')!
    quests.set(main.id, { ...main, actions: [...(main.actions ?? []), { ...main.actions![1]!, id: 'ponder', say: ['ponder the mystery'], with: undefined, intent: 'ponder the mystery' }] })
    const warnings = questWarnings({ ...quiet, quests }).filter((w) => /only a sentence/.test(w))
    expect(warnings).toEqual([expect.stringMatching(/action ponder: a deed on the world is only a sentence \("ponder the mystery"\)/)])
  })

  it('has every deed of the three worlds typed on a thing or said to someone', async () => {
    for (const world of ['base', 'isle', 'quietreach']) expect(questWarnings(await loadContentFromDir(root, world)).filter((w) => /only a sentence/.test(w)), world).toEqual([])
  })

  it('shows a model that writes a quest the things of a place with their verbs', () => {
    const room = quiet.locations.get('loc_orison_listening_room')!
    expect(placeThings(quiet, room)).toMatch(/Things: .*consoles \(read\)/)
    expect(placeThings(quiet, room)).toMatch(/rack \([^)]*copy/)
  })
})

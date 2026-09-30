import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { loadContent, type Content } from '../src/engine'
import { SECRET_PLACES_RULE, secretNote } from '../src/engine/exits'
import { unsolvable } from '../src/engine/quests/solvable'
import { storiesRequest, storyScopes } from '../src/engine/storystep'
import { readContentFiles } from '../src/node/content'

// M10.32: secret and waiting ways in what the chronicler writes and checks.
// Bram, 30 September 2026, after the Cable Gallery leak (fixed in the engine
// in 8fe5ad7): is it solved at the source too, where quests and worlds are
// made? The check of whether a quest can be done now knows the ways, and the
// calls that write quests see which places are secret.

const root = join(import.meta.dirname, '../content')
const quietFiles = await readContentFiles(root, 'quietreach')
const quiet = loadContent(quietFiles)
const isle = loadContent(await readContentFiles(root, 'isle'))
const gallery = 'loc_orison_cable_gallery'
const room = 'loc_orison_listening_room'

/** A world with one place changed. */
function withPlace(content: Content, id: string, change: (l: ReturnType<Content['locations']['get']> & object) => object): Content {
  const locations = new Map(content.locations)
  locations.set(id, change(content.locations.get(id)!) as never)
  return { ...content, locations }
}

/** The Quiet Reach with the deed that traces the antenna fault done in the Cable Gallery. */
function deedInGallery(content: Content): Content {
  const q = content.quests.get('story_the_orison_recordings')!
  const quests = new Map(content.quests)
  quests.set(q.id, { ...q, actions: q.actions!.map((a) => (a.id === 'a3' ? { ...a, at: [gallery] } : a)) })
  return { ...content, quests }
}

describe('M10.32 A: the check of whether a quest can be done knows the ways', () => {
  it('lets a deed behind the hatch be, while the hatch can be found', () => {
    expect(unsolvable(deedInGallery(quiet)).filter((p) => /never opens/.test(p))).toEqual([])
    // Both worlds' own secret places open.
    expect(unsolvable(quiet).filter((p) => /never opens/.test(p))).toEqual([])
    expect(unsolvable(isle).filter((p) => /never opens/.test(p))).toEqual([])
  })

  it('names a deed in a place whose secret way nothing reveals', () => {
    const noHatch = withPlace(deedInGallery(quiet), room, (l) => ({ ...l, hidden: l.hidden.filter((h) => h.id !== 'console_hatch') }))
    expect(unsolvable(noHatch)).toContain(`quest story_the_orison_recordings, deed a3: ${gallery} never opens: the secret way from ${room} is revealed by nothing`)
  })

  it('names a place whose waiting way waits for a flag nobody sets, and a stage that waits to be there', () => {
    const neverFlag = withPlace(isle, 'loc_skerrow_tidepools', (l) => ({ ...l, exits: { ...l.exits, in: { ...l.exits.in!, when: [{ flag: 'nobody_sets_this' }] } } }))
    const q = [...neverFlag.quests.values()][0]!
    const quests = new Map(neverFlag.quests)
    quests.set(q.id, { ...q, stages: q.stages!.map((s, i) => (i === 0 ? { ...s, next: [{ when: [{ at: 'loc_skerrow_sea_cave' }], to: s.next[0]?.to ?? s.id }] } : s)) } as never)
    const problems = unsolvable({ ...neverFlag, quests })
    expect(problems.join('\n')).toContain(`stage ${q.stages![0]!.id}: no way on, loc_skerrow_sea_cave never opens: the way from loc_skerrow_tidepools waits for what never comes: the flag nobody_sets_this is set nowhere`)
  })
})

describe('M10.32 B: the chronicler knows which places are secret', () => {
  it('marks the Cable Gallery and the sea cave, and nothing else', () => {
    expect(secretNote(quiet, gallery)).toBe(' (secret: found by searching in Orison Listening Room)')
    // The cave waits for the weed to be parted, and is secret too.
    expect(secretNote(isle, 'loc_skerrow_sea_cave')).toBe(' (secret: found by searching in The Tidepools)')
    expect(secretNote(quiet, room)).toBe('')
    const marked = [...quiet.locations.keys(), ...isle.locations.keys()].filter((id) => secretNote(quiet.locations.has(id) ? quiet : isle, id))
    expect(marked).toEqual([gallery, 'loc_skerrow_sea_cave'])
  })

  it('shows the mark and the rule in the Stories step', () => {
    const main = storyScopes(quiet, 'story').find((s) => s.kind === 'main')!
    const request = storiesRequest(quietFiles, main, 'story', '')
    expect(request.prompt).toMatch(/Cable Gallery: [^\n]*\(secret: found by searching in Orison Listening Room\)/)
    expect(JSON.stringify(request.system)).toContain(SECRET_PLACES_RULE.slice(0, 40))
  })
})

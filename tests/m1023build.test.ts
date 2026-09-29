import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { loadContent, MockLlm, type ContentFile } from '../src/engine'
import { draftResult, mergeFix, readDraft, worldStepRequest } from '../src/engine/editor'
import { LAND_STEPS, landFills, WORLD_STEPS } from '../src/engine/worldguide'
import { readContentFiles } from '../src/node/content'

// M10.23: the world build of M10.17 runs per land. The same steps, scoped to
// the land, with the world as the background: its land.yaml in place of
// world.yaml, what is new in its folder, and the calendar the world's.

const root = resolve(import.meta.dirname, '../content')
const isle = () => readContentFiles(root, 'isle')
const deepwell = () => readContentFiles(resolve(import.meta.dirname, 'worlds'), 'other')

/** The files with a proposal's changes written in. */
function saved(files: ContentFile[], changes: { path: string; text: string }[]): ContentFile[] {
  let next = files
  for (const c of changes) next = next.some((f) => f.path === c.path) ? next.map((f) => (f.path === c.path ? { ...f, text: c.text } : f)) : [...next, { path: c.path, text: c.text }]
  return next
}

const reply = (part: Record<string, unknown>) => JSON.stringify({ say: 'As you said.', questions: [], changes: [], world: '', rules: '', files: [], ...part })

describe('M10.23: the world build per land', () => {
  it('has every step of a world but the calendar and the lands, and a land\'s keys where the world\'s were', () => {
    expect(LAND_STEPS.map((s) => s.id)).toEqual(WORLD_STEPS.map((s) => s.id).filter((id) => id !== 'calendar' && id !== 'lands' && id !== 'stories'))
    const step = (id: string) => LAND_STEPS.find((s) => s.id === id)!
    expect(landFills(step('frame'))).toEqual([{ kind: 'land', keys: ['name', 'frame', 'words', 'crossing', 'language'] }])
    expect(landFills(step('money'))).toContainEqual({ kind: 'land', keys: ['money'] })
    expect(landFills(step('faiths'))).toContainEqual({ kind: 'rules', keys: ['patrons'] })
    expect(landFills(step('palette'))).toContainEqual({ kind: 'land', keys: ['palette', 'pictures'] })
    expect(landFills(step('passages')).map((f) => f.kind)).not.toContain('journey')
  })

  it('asks the chronicler for the land, with the world as the background and the same cached part as the world\'s build', async () => {
    const files = await isle()
    const world = worldStepRequest(files, 'money', 'Silver rings and glass beads.')
    const land = worldStepRequest(files, 'money', 'Silver rings and glass beads.', 'western_isles')
    expect(land.system.slice(0, land.cacheBreak)).toBe(world.system.slice(0, world.cacheBreak))
    expect(land.system).toMatch(/YOU ARE BUILDING A LAND OF THIS WORLD: the Western Isles \(western_isles\)/)
    expect(land.system).toMatch(/FOR THIS LAND: in `world` money with units .* and rate/)
    expect(land.system).not.toMatch(/Calendar and weather/)
    expect(land.system).toMatch(/^land:\n {2}money\?:/m)
    expect(land.prompt).toMatch(/LANDS\/WESTERN_ISLES\/LAND\.YAML NOW \(what `world` sets\):\nid: western_isles/)
    expect(land.prompt).toMatch(/THE WORLD \(the background; this build does not change it\):/)
    expect(land.meta).toMatchObject({ step: 'money', land: 'western_isles' })
    // A step that is only the world's is not a land's: the land's first step instead.
    expect(worldStepRequest(files, 'calendar', 'x', 'western_isles').meta).toMatchObject({ step: 'frame' })
  })

  it('shows a land\'s build what the land has in full, and the world\'s things only by id', async () => {
    const files = await isle()
    const request = worldStepRequest(files, 'people', 'The elders of the hall.', 'western_isles')
    expect(request.prompt).toMatch(/--- npc npc_gwion\n/)
    expect(request.prompt).not.toMatch(/--- npc npc_maren\n/)
    expect(request.prompt).toMatch(/npc_maren \(/)
  })

  it('writes the keys into the land\'s land.yaml and leaves world.yaml alone', async () => {
    const files = await isle()
    const draft = readDraft(files, reply({ world: 'money:\n  units:\n    - { short: ring, name: silver ring, value: 20 }\n    - { short: bead, name: glass bead, value: 1 }\n  rate: 3\ncrossing: The elves count your coins twice, and say nothing.\n' }), 'western_isles')
    expect(draft.problems).toEqual([])
    expect(draft.land).toBe('western_isles')
    expect(draft.result!.changes.map((c) => c.path)).toEqual(['isle/lands/western_isles/land.yaml'])
    const content = draft.result!.content!
    expect(content.lands.get('western_isles')!.money!.rate).toBe(3)
    expect(content.lands.get('western_isles')!.crossing).toBe('The elves count your coins twice, and say nothing.')
    // What the proposal did not name stays as it was, comments and all.
    expect(content.lands.get('western_isles')!.language!.name).toBe('the Old Tongue')
    expect(draft.result!.changes[0]!.text).toMatch(/# The fixed block every model call gets here/)
    expect(content.world.money).toEqual(loadContent(files).world.money)
  })

  it('puts what a land\'s build makes in the land\'s folder, and a voice kit in the land\'s', async () => {
    const files = await isle()
    const area = 'id: ynys_hir\nname: Ynys Hir\nkind: wilderness\nsummary: A long green isle behind Ynys Wen.\n'
    const place = 'id: loc_ynys_hir_strand\nname: Ynys Hir, the Strand\narea: ynys_hir\ntags: [public]\ndescription:\n  day: "Pale sand runs out to a line of black rocks. The wind smells of kelp and cold stone. The landing of Ynys Wen lies back to the east."\nexits:\n  east: { to: loc_ynys_wen_landing, minutes: 60 }\n'
    const trade = 'id: kelp_gatherer\nname: kelp gatherer\nschedule:\n  - { from: "06:00", to: "07:00", activity: eat }\n  - { from: "07:00", to: "17:00", activity: work }\n  - { from: "17:00", to: "22:00", activity: home }\n  - { from: "22:00", to: "06:00", activity: sleep }\n'
    const draft = readDraft(
      files,
      reply({
        changes: [
          { kind: 'area', id: 'ynys_hir', yaml: area },
          { kind: 'location', id: 'loc_ynys_hir_strand', yaml: place },
          { kind: 'profession', id: 'kelp_gatherer', yaml: trade },
        ],
        files: [{ path: 'data/voice.yaml', text: 'voice:\n  sayings: ["The tide keeps no count."]\n' }],
      }),
      'western_isles',
    )
    expect(draft.problems).toEqual([])
    const paths = draft.result!.changes.map((c) => c.path).sort()
    expect(paths).toContain('isle/lands/western_isles/data/areas.yaml')
    expect(paths).toContain('isle/lands/western_isles/areas/ynys_hir/locations.yaml')
    expect(paths).toContain('isle/lands/western_isles/data/professions.yaml')
    expect(paths).toContain('isle/lands/western_isles/voice.yaml')
    expect(paths.filter((p) => !p.startsWith('isle/lands/western_isles/'))).toEqual(['isle/ids.lock'])
    const content = loadContent(saved(files, draft.result!.changes))
    expect(content.areas.get('ynys_hir')!.land).toBe('western_isles')
    expect(content.lands.get('western_isles')!.voice!.sayings).toContain('The tide keeps no count.')
    expect(content.voice).toEqual(loadContent(files).voice)
  })

  it('keeps the land when a proposal is put right', async () => {
    const files = await isle()
    const draft = readDraft(files, reply({ world: 'money:\n  units: []\n' }), 'western_isles')
    expect(draft.problems.length).toBeGreaterThan(0)
    const fixed = mergeFix(files, draft, reply({ world: 'money:\n  units:\n    - { short: bead, name: glass bead, value: 1 }\n  rate: 2\n' }))
    expect(fixed.land).toBe('western_isles')
    expect(fixed.problems).toEqual([])
    expect(fixed.result!.changes.map((c) => c.path)).toEqual(['isle/lands/western_isles/land.yaml'])
  })

  it('builds Deepwell\'s second land step by step with the mock, and the world stays as it was', async () => {
    let files = await deepwell()
    const worldYaml = files.find((f) => f.path.endsWith('world.yaml'))!.text
    const said: Record<string, string> = {
      frame: 'A mining concession of the Combine, polite and watched.',
      money: '| scrip | 1 |\n| bond | 50 |\nrate 2',
      places: '| Ore Hall | where the ore comes in |\n| Bunk Row | the bunks |',
      professions: '| Loader |\n| Clerk |',
    }
    for (const step of LAND_STEPS.filter((s) => said[s.id])) {
      const request = worldStepRequest(files, step.id, said[step.id]!, 'kessler_claim')
      const draft = readDraft(files, (await new MockLlm().complete(request)).text, 'kessler_claim')
      expect(draft.problems, step.id).toEqual([])
      files = saved(files, draft.result!.changes)
    }
    const content = loadContent(files)
    const land = content.lands.get('kessler_claim')!
    expect(land.money!.units.map((u) => u.name)).toEqual(['bond', 'scrip'])
    expect(land.money!.rate).toBe(2)
    expect(land.crossing).toMatch(/You cross into the Kessler Claim/)
    expect(content.locations.get('loc_ore_hall')!.area).toBe(content.locations.get('loc_bunk_row')!.area)
    expect(content.areas.get(content.locations.get('loc_ore_hall')!.area)!.land).toBe('kessler_claim')
    expect(files.find((f) => f.path.endsWith('world.yaml'))!.text).toBe(worldYaml)
    expect(files.filter((f) => /professions\.yaml$/.test(f.path) && /loader/.test(f.text)).map((f) => f.path)).toEqual(['other/lands/kessler_claim/data/professions.yaml'])
  })

  it('checks a proposal of a land against the whole world, as the world\'s build does', async () => {
    const files = await isle()
    const result = draftResult(files, { changes: [], world: 'law:\n  where: on the Western Isles\n  officer: steward\n  npc: npc_nobody\n  office: loc_ynys_wen_hall\n', land: 'western_isles' })
    expect(result.ok).toBe(false)
    expect(result.problems.join('\n')).toMatch(/npc_nobody/)
  })
})

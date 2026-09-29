import { describe, expect, it } from 'vitest'
import { applyEdits, frameOf, landOfArea, landsIn, landYaml, loadContent, saveLand, saveVoice, voiceYaml, worldFrame, wordsOf, type ContentFile } from '../src/engine'
import { readContentFiles } from '../src/node/content'

// M10.23: another land, the same world, its own frame. A land lives in
// content/<world>/lands/<land>/: its land.yaml, a voice kit of its own, and
// its areas and people beside them. What it leaves out it takes from the
// world; the calendar and the clock are always the world's.

const isleFiles = () => readContentFiles('content', 'isle')

describe('M10.23: a land as a layer in the content', () => {
  it("loads Skerrow's Western Isles: its frame, voice kit, coins at a rate, law and names; an area in its folder is of the land", async () => {
    const isle = loadContent(await isleFiles())
    expect([...isle.lands.keys()]).toEqual(['western_isles'])
    expect(isle.areas.get('ynys_wen')).toMatchObject({ land: 'western_isles', border: true })
    expect(landOfArea(isle, 'ynys_wen')?.id).toBe('western_isles')
    expect(landOfArea(isle, 'skerrow_hythe')).toBeUndefined()
    const west = frameOf(isle, 'western_isles')
    expect(west.frame).toMatch(/^WORLD: The Sundered Isles/)
    expect(west.frame).toMatch(/LAND: The Western Isles, where the elves live/)
    expect(west.voice?.address.stranger).toEqual(['child of the short years'])
    expect(west.coins.map((c) => c.short)).toEqual(['ring', 'bead'])
    expect(west.rate).toBe(2)
    expect(west.law?.officer).toBe('steward')
    expect(west.faiths.map((f) => f.id)).toEqual(['old_stars'])
    expect(west.names?.she).toContain('Eluned')
    // What it leaves out is the world's: here the map palette.
    expect(west.palette).toBe(isle.world.map?.palette)
    // The home land is the world itself.
    const home = frameOf(isle)
    expect(home.land).toBeUndefined()
    expect(home.frame).toBe(isle.world.frame)
    expect(home.voice).toBe(isle.voice)
    expect(home.rate).toBe(1)
    expect(worldFrame(isle, 'western_isles')).toBe(west.frame!.trim())
    expect(worldFrame(isle)).toBe(isle.world.frame!.trim())
  })

  it("loads Deepwell's Kessler Claim: no faith and no weather, as the world; its own scrip, and a law that fines even a death", async () => {
    const deepwell = loadContent(await readContentFiles('tests/worlds', 'other'))
    const claim = frameOf(deepwell, 'kessler_claim')
    expect(claim.faiths).toEqual([])
    expect(deepwell.world.weather).toBeUndefined()
    expect(claim.coins.map((c) => c.name)).toEqual(['scrip'])
    expect(claim.law?.fines?.murder).toBe(6000)
    expect(claim.voice?.not_here.find((n) => n.word === 'shift')?.instead).toBe('rotation')
    expect(deepwell.locations.get('loc_deepwell_works_platform')?.exits['east']?.to).toBe('loc_claim_gate')
  })

  it("names the land in the game's words: its own, the stranger from the world's land, and the world's kind of officer where it has no law", async () => {
    const isle = loadContent(await isleFiles())
    const words = wordsOf(isle, isle.lands.get('western_isles'))
    expect(words).toMatchObject({ land: 'the Western Isles', region: 'Ynys Wen', from: 'the eastern isles' })
    expect(words.law.officer).toBe('steward')
    expect(words.sleep.home).toBe(wordsOf(isle).sleep.home)
    const bare = { ...isle.lands.get('western_isles')!, words: undefined, law: undefined }
    const plain = wordsOf(isle, bare)
    expect(plain).toMatchObject({ land: 'the Western Isles', region: 'the Western Isles', from: 'the Sundered Isles' })
    expect(plain.law).toMatchObject({ where: 'in the Western Isles', officer: 'headwoman', npc: undefined, office: undefined })
  })

  it('refuses a land out of its folder, a world block, rules or a lone voice kit in a land folder, and an unknown land', async () => {
    const files = await isleFiles()
    const problems = (extra: ContentFile[], change: (f: ContentFile) => ContentFile = (f) => f) => {
      try {
        loadContent([...files.map(change), ...extra])
        return ''
      } catch (error) {
        return String(error)
      }
    }
    expect(problems([{ path: 'isle/data/land.yaml', text: 'land:\n  id: far\n  name: far\n  frame: x\n' }])).toMatch(/the land far belongs in lands\/far\/land.yaml/)
    expect(problems([{ path: 'isle/lands/far/voice.yaml', text: 'voice:\n  sayings: [one]\n' }])).toMatch(/lands\/far: a voice kit without a land.yaml/)
    expect(problems([{ path: 'isle/lands/western_isles/rules.yaml', text: 'rules:\n  skills: []\n' }])).toMatch(/a land has no rules of its own/)
    expect(problems([], (f) => (f.path.endsWith('lands/western_isles/data/areas.yaml') ? { ...f, text: f.text.replace('border: true', 'border: true\n    blend: nowhere') } : f))).toMatch(/area ynys_wen.blend: unknown land nowhere/)
    expect(problems([], (f) => (f.path.endsWith('lands/western_isles/land.yaml') ? { ...f, text: f.text.replace('id: western_isles', 'id: western_isles\n  realm: atlantis') } : f))).toMatch(/land western_isles: unknown realm atlantis/)
    // A land's oaths are by the faiths it holds.
    expect(problems([], (f) => (f.path.endsWith('lands/western_isles/voice.yaml') ? { ...f, text: f.text.replace('old_stars:', 'moon:') } : f))).toMatch(/land western_isles: voice.oaths: unknown faith moon/)
  })
})

describe('M10.23: lands in the editor', () => {
  it('lists the lands, opens one as YAML, and writes a new land into its own folder, checked with the whole world', async () => {
    const files = await isleFiles()
    expect(landsIn(files)).toEqual([{ id: 'western_isles', name: 'the Western Isles', file: 'isle/lands/western_isles/land.yaml' }])
    const west = landYaml(files, 'western_isles')
    expect(west).toMatchObject({ file: 'isle/lands/western_isles/land.yaml', own: true })
    expect(west.yaml).toMatch(/^crossing:/m)
    // A land not there yet: a template with what a land must have.
    const fresh = landYaml(files, 'far_reef')
    expect(fresh).toMatchObject({ file: 'isle/lands/far_reef/land.yaml', own: false })
    const saved = saveLand(files, 'far_reef', fresh.yaml.replace('name: far reef', 'name: the Far Reef'))
    expect(saved.problems).toEqual([])
    expect(saved.changes[0]!.path).toBe('isle/lands/far_reef/land.yaml')
    const next = [...files, { path: saved.changes[0]!.path, text: saved.changes[0]!.text }]
    expect(loadContent(next).lands.get('far_reef')?.name).toBe('the Far Reef')
    // One change leaves the comments of the file alone.
    const changed = saveLand(files, 'western_isles', west.yaml.replace('rate: 2', 'rate: 3'))
    expect(changed.problems).toEqual([])
    expect(changed.changes[0]!.text).toMatch(/# Two beads to one copper piece of the east\./)
    expect(changed.changes[0]!.text).toMatch(/rate: 3/)
    expect(saveLand(files, 'western_isles', `${west.yaml}\ncolour: blue\n`).problems.join(' ')).toMatch(/"colour" is not in the contract/)
  })

  it("keeps a land's voice kit apart from the world's", async () => {
    const files = await isleFiles()
    expect(voiceYaml(files).file).toBe('isle/data/voice.yaml')
    const kit = voiceYaml(files, 'western_isles')
    expect(kit).toMatchObject({ file: 'isle/lands/western_isles/voice.yaml', own: true })
    const saved = saveVoice(files, kit.yaml.replace('- What is slow is not lost.', '- What is slow is not lost.\n  - Salt keeps; so do we.'), 'western_isles')
    expect(saved.problems).toEqual([])
    expect(saved.changes.map((c) => c.path)).toEqual(['isle/lands/western_isles/voice.yaml'])
  })

  it("puts a new area of a land, and its places, in the land's folder", async () => {
    const files = await isleFiles()
    const area = { id: 'ynys_du', name: 'Ynys Du', kind: 'hamlet', summary: 'A black isle further west.', land: 'western_isles' }
    const place = { id: 'loc_ynys_du_shore', name: 'Ynys Du, the Shore', area: 'ynys_du', summary: 'A black shore.', description: { day: 'Black sand. The wind smells of weed. The sea is loud here. There is no way on.' }, exits: {} }
    const result = applyEdits(files, [
      { kind: 'area', id: 'ynys_du', data: area, create: true },
      { kind: 'location', id: 'loc_ynys_du_shore', data: place, create: true },
    ])
    expect(result.problems).toEqual([])
    expect(result.changes.map((c) => c.path).filter((p) => !p.endsWith('ids.lock')).sort()).toEqual(['isle/lands/western_isles/areas/ynys_du/locations.yaml', 'isle/lands/western_isles/data/areas.yaml'])
  })
})

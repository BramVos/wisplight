import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Engine, filesOfWorld, formatMoney, parseMoney, worldsIn, type Output } from '../src/engine'
import { warnings } from '../src/engine/builder'
import { firstPerson } from '../src/engine/dialogue/fallback'
import { listWorlds, loadContentFromDir, readContentFiles } from '../src/node/content'
import { content } from './helpers'

// Milestone M8 (docs/ROADMAP.md): more than one world in the content folder.
// Skerrow, a small high-fantasy island, plays beside the Nethermarch with its
// own frame, calendar, coins and quest, and without a line of its own code.

const root = resolve(import.meta.dirname, '../content')
const isle = await loadContentFromDir(root, 'isle')

const text = (out: Output[]) => out.map((o) => o.text).join('\n')

async function play(seed: number, commands: string[]): Promise<{ engine: Engine; out: string }> {
  const engine = new Engine(isle, { seed })
  const lines = [text(engine.start())]
  for (const command of commands) lines.push(text(await engine.handle(command)))
  return { engine, out: lines.join('\n') }
}

const outcome = (engine: Engine) => engine.state.questlog?.['off_skerrow']?.outcome

describe('M8: more than one world', () => {
  it('lists the worlds in the content folder, the Nethermarch first', async () => {
    const worlds = (await listWorlds(root)).map((w) => [w.folder, w.id, w.name])
    // Worlds being made in the editor may be there too; they do not fail the test.
    expect(worlds[0]).toEqual(['base', 'nethermarch', 'The Nethermarch'])
    expect(worlds).toContainEqual(['isle', 'skerrow', 'Skerrow'])
  })

  it('loads each world on its own, with the shared instruction and its own part', async () => {
    expect(content.world.id).toBe('nethermarch')
    expect(isle.world.id).toBe('skerrow')
    expect(isle.locations.has('loc_veenhoek_quay')).toBe(false)
    expect(isle.chronicler).toMatch(/^# Working instruction for the chronicler[\s\S]*## This world: Skerrow/)
    expect(content.chronicler).toMatch(/## This world: the Nethermarch[\s\S]*Haakman/)
    expect(warnings(isle)).toEqual([])
    const files = await readContentFiles(root, 'isle')
    expect(files.every((f) => f.path.startsWith('isle/') || f.path === 'CHRONICLER.md')).toBe(true)
    await expect(readContentFiles(root, '../secrets')).rejects.toThrow(/no world/)
  })

  it('picks a world from all files the same way in the browser preview', async () => {
    const all = [...(await readContentFiles(root, 'base')), ...(await readContentFiles(root, 'isle')).filter((f) => f.path !== 'CHRONICLER.md')]
    expect(worldsIn(all).map((w) => w.folder)).toEqual(['base', 'isle'])
    expect(filesOfWorld(all, 'isle').some((f) => f.path.startsWith('base/'))).toBe(false)
    expect(filesOfWorld(all).some((f) => f.path.startsWith('isle/'))).toBe(false)
  })

  it('speaks of the world in its own words: region, calendar and coins', async () => {
    const { engine, out } = await play(1, ['time', 'inventory'])
    expect(out).toContain('Cold water, then stones.')
    expect(out).toContain('New quest: Off Skerrow.')
    expect(out).toMatch(/It is Windsday 3 Leaffall 412 SF, 07:1\d \(morning\)/)
    expect(out).toContain('and 3 sp 5 cp.')
    expect(engine.status().money).toBe('3 sp 5 cp')
    expect(formatMoney(135, isle.world.money!.units)).toBe('1 gp 3 sp 5 cp')
    expect(parseMoney('2 silver pieces', isle.world.money!.units)).toBe(20)
    expect(parseMoney('3', isle.world.money!.units)).toBe(30)
    // The Nethermarch keeps its own.
    expect(formatMoney(170, content.world.money!.units)).toBe('1 gl 1 st 2 d')
    expect(parseMoney('2 stuivers', content.world.money!.units)).toBe(16)
    expect(parseMoney('1 gulden', content.world.money!.units)).toBe(160)
    // A world that names no money has one plain coin, never the guilder (M10.17).
    expect(formatMoney(170)).toBe('170 c')
    expect(new Engine(content, { seed: 1 }).status().time).toMatch(/^Dinsdag 14 Herfstmaand 211 AW/)
  })

  it('has no fights and no character sheet without rules, and says so gently', async () => {
    // A world without rules (Skerrow had none until M9.1).
    const bare = new Engine({ ...isle, rules: undefined } as typeof isle, { seed: 1 })
    const lines = [text(bare.start())]
    for (const command of ['e', 'e', 'attack brannoc', 'take barge']) lines.push(text(await bare.handle(command)))
    const engine = bare
    const out = lines.join('\n')
    expect(engine.creationData()).toBeUndefined()
    expect(engine.status().character).toBeUndefined()
    expect(out).toContain('There is nothing here to fight.')
    expect(out).toContain('There is no barge here.')
  })

  it('lets people speak of themselves in the first person', () => {
    expect(firstPerson('Wenna Dray fishes the inshore water from a coracle.', 'Wenna Dray')).toBe('I fish the inshore water from a coracle.')
    expect(firstPerson('Garrick Stone has kept the Lamp of Skerrow for thirty years.', 'Garrick Stone')).toBe('I have kept the Lamp of Skerrow for thirty years.')
    expect(firstPerson('Mirte is the baker of Veenhoek.', 'Mirte')).toBe('I am the baker of Veenhoek.')
    expect(firstPerson('Aleid carries the keys.', 'Aleid')).toBe('I carry the keys.')
  })

  it('off the isle in the Kittiwake: sail from the wreck, pitch from the Kettle', async () => {
    const { engine, out } = await play(1, ['take sailcloth', 'e', 'e', 'n', 'e', 'buy pitch', 'w', 's', 'mend the boat', 'ask brannoc to sail me', 'ask brannoc to sail me', 'ask brannoc to sail me', 'ask brannoc to sail me'])
    expect(out).toContain('the Kittiwake sits proud on the slip')
    expect(outcome(engine)).toBe('in_the_kittiwake')
  })

  it('off the isle on a ship that comes for the light', async () => {
    const tries = Array.from({ length: 6 }, () => 'persuade garrick')
    const { engine, out } = await play(3, ['take oil', 'e', 'e', 'n', 'e', 'buy oil', 'w', 'n', 'take oil', 'fill the beacon', 'light the beacon', 'wait 2 hours', ...tries, 'light the beacon', 'wait 10 hours', 'wait 10 hours', 'wait 10 hours', 'wait 10 hours'])
    expect(out).toContain('It wants oil in the bowl and a lightkeeper at the wick.')
    expect(out).toContain('the green lens takes it')
    expect(outcome(engine)).toBe('a_ship_for_the_light')
    expect(engine.state.news?.facts.some((f) => f.title === 'the Lamp of Skerrow burns again')).toBe(true)
  })

  it('off the isle through the waystone, with the key from the barrow', async () => {
    const { engine, out } = await play(5, ['e', 'e', 'buy salt fish', 'n', 'w', 'n', 'ask tamsin about the barrow', 'n', 'enter the barrow', 's', 'e', 'n', 'give the key to elowen'])
    expect(out).toContain('Salt fish. He likes salt fish.')
    expect(out).toContain('Old Skarth fills the barrow')
    expect(outcome(engine)).toBe('through_the_waystone')
    expect(engine.state.player.inventory['rune_key']).toBeUndefined()
  })

  it('without the gift, the barrow is a check, and the wyrm stirs when it fails', async () => {
    // A seed that fails at least once before it gets the key: every failure is counted.
    // (Since M9.1 Skerrow has rules, and the castaway's Stealth makes the check.)
    let stirred = 0
    for (let seed = 2; seed < 40 && !stirred; seed++) {
      const { engine } = await play(seed, ['n', 'n', 'n', ...Array.from({ length: 8 }, () => 'enter the barrow')])
      expect(engine.state.player.inventory['rune_key']).toBe(1)
      stirred = Number(engine.state.flags?.['skarth_stirred'] ?? 0)
    }
    expect(stirred).toBeGreaterThan(0)
  })

  it('closes the sea after forty days when nothing is done', async () => {
    const engine = new Engine(isle, { seed: 4 })
    engine.start()
    for (let day = 0; day < 41; day++) engine.tick(24 * 60)
    expect(outcome(engine)).toBe('winter_closes_the_sea')
  })

  it('lives thirty days without the player: nobody starves, the fisher fishes', () => {
    const engine = new Engine(isle, { seed: 7 })
    engine.start()
    engine.tick(24 * 60)
    expect(engine.world.stock('loc_skerrow_harbour', 'fish_rack')['salt_fish']).toBeGreaterThan(6)
    for (let day = 1; day < 30; day++) engine.tick(24 * 60)
    for (const [id, npc] of Object.entries(engine.state.npcs)) {
      expect(npc.needs.hunger, id).toBeGreaterThan(0)
      expect(npc.dead, id).toBeFalsy()
    }
  })

  it('saves and loads in its own world, and refuses another world', async () => {
    const { engine } = await play(1, ['take sailcloth', 'e'])
    const save = engine.save()
    expect(save.world).toBe('skerrow')
    const loaded = Engine.fromSave(isle, save)
    expect(loaded.state.player.location).toBe('loc_skerrow_tidepools')
    expect(loaded.state.player.inventory['sailcloth']).toBe(1)
    expect(() => Engine.fromSave(content, save)).toThrow(/skerrow/)
  })
})

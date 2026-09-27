import { describe, expect, it } from 'vitest'
import { Engine, type Output } from '../src/engine'
import { balanceReport, characterAt, marginProblems } from '../src/engine/combat/balance'
import {
  autoLevelChoice,
  canLevelUp,
  classDc,
  createCharacter,
  levelUp,
  maxHp,
  openTalents,
  skillBonus,
  suggestChoice,
  train,
  weaponStats,
  xpForLevel,
} from '../src/engine/rules/character'
import { addClock, character, clockLine, favour, playerSkill, READY_MADE, tickClock } from '../src/engine/rules/player'
import { content } from './helpers'

// M5: character, rules and combat (FO, chapters 11 and 12; WB, chapters 5 and 12).

const texts = (outputs: Output[]) => outputs.map((o) => o.text).join('\n')
const rules = content.rules!

async function play(engine: Engine, ...commands: string[]): Promise<string> {
  let all = ''
  for (const command of commands) all += `${texts(await engine.handle(command))}\n`
  return all
}

describe('the rules as content', () => {
  it('has the six classes, four ancestries, the backgrounds, patrons and the bestiary of the design', () => {
    expect(rules.classes.map((c) => c.id)).toEqual(['warden', 'poacher', 'rascal', 'herbalist', 'conjurer', 'lanternbearer'])
    expect(rules.classes.map((c) => c.hp)).toEqual([10, 8, 8, 6, 6, 8])
    expect(rules.ancestries.map((a) => [a.id, a.hp])).toEqual([
      ['dykelander', 8],
      ['heathborn', 10],
      ['fenfolk', 8],
      ['changeling', 6],
    ])
    for (const c of rules.classes) expect(c.trees.map((t) => t.talents.length)).toEqual([4, 4, 4])
    expect(rules.backgrounds.length).toBeGreaterThanOrEqual(10)
    expect(rules.patrons.map((p) => p.id)).toEqual(['lantern', 'nehalennia', 'grey_rider', 'holle', 'baduhenna'])
    const goatRider = content.creatures.get('goat_rider')!
    expect([goatRider.level, goatRider.hp, goatRider.defence, goatRider.attacks[0]!.bonus]).toEqual([2, 22, 15, 7])
    expect(content.creatures.get('haakman')!.name).toBe('the Haakman')
    expect(content.encounters.get('goat_riders_toll')!.places).toContain('loc_towpath_mid')
  })

  it('refuses a choice that breaks the creation rules', () => {
    const made = createCharacter(content, { ...suggestChoice(content, 'warden', 'Joost'), boosts: ['might', 'might', 'might'] })
    expect('problems' in made && made.problems.join(' ')).toMatch(/at most two boosts|at most \+4/i)
    const wrongTalent = createCharacter(content, { ...suggestChoice(content, 'warden', 'Joost'), talent: 'sweep' })
    expect('problems' in wrongTalent && wrongTalent.problems.join(' ')).toMatch(/first row/)
  })
})

describe('all six classes, level 1 to 10', () => {
  for (const klass of rules.classes.map((c) => c.id)) {
    it(`makes a ${klass} and plays it up to level 10`, async () => {
      const engine = new Engine(content, { seed: 5, builder: true })
      const choice = suggestChoice(content, klass, 'Test')
      const out = await play(engine, `create ${klass} ${choice.ancestry} ${choice.background} name=Test`)
      expect(out).toMatch(new RegExp(`You are Test, an? \\w+ ${rules.classes.find((c) => c.id === klass)!.name}`))
      const c = character(engine.world)!
      expect(c.made).toBe(true)
      expect(c.level).toBe(1)
      expect(c.hp).toBe(maxHp(content, c))
      // A fight at level 1 plays to its end.
      await playFight(engine, '@fight feral_dog')
      // Experience enough for level 10, then nine level-ups by the template.
      await play(engine, '@xp 9000')
      for (let level = 2; level <= 10; level++) {
        const up = await play(engine, 'level up auto')
        expect(up).toMatch(new RegExp(`You are now level ${level}`))
      }
      expect(c.level).toBe(10)
      expect(c.talents).toHaveLength(11)
      expect(c.general.length).toBe(6)
      expect(Object.values(c.attributes).every((a) => a <= 6)).toBe(true)
      expect(Object.values(c.ranks).filter((r) => r === 3)).toHaveLength(1)
      expect(await play(engine, 'level up')).toMatch(/highest level/)
      expect(await play(engine, 'sheet')).toMatch(/level 10/)
      // And a fight at level 10.
      await playFight(engine, '@fight veenlijk 2')
    })
  }

  it('asks for the choices a level needs, and grows as the design says', () => {
    const c = characterAt(content, 'rascal', 2)
    c.xp = xpForLevel(content, 3)
    const wrong = levelUp(content, c, {})
    expect('problems' in wrong && wrong.problems.join(' ')).toMatch(/class talent.*trained skill to make expert/s)
    const before = maxHp(content, c)
    const right = levelUp(content, c, autoLevelChoice(content, c))
    expect('lines' in right).toBe(true)
    expect(c.level).toBe(3)
    // The class's hit points and Might, and one more with Toughness.
    expect(maxHp(content, c) - before).toBe(8 + c.attributes.might + (c.general.includes('toughness') ? 1 : 0))
    expect(Object.values(c.ranks)).toContain(2)
    // Rows open at levels 1, 3, 5 and 7.
    expect(openTalents(content, c).every((t) => ['sleight', 'tongue', 'pranks'].some((tree) => rules.classes[2]!.trees.find((x) => x.id === tree)!.talents.includes(t)))).toBe(true)
    // Weapons do a die more from level 4, and attributes rise at 5 and 10.
    const five = characterAt(content, 'warden', 5)
    const four = characterAt(content, 'warden', 4)
    const three = characterAt(content, 'warden', 3)
    expect(weaponStats(content, four).dice.count).toBe(weaponStats(content, three).dice.count + 1)
    expect(five.attributes.might).toBe(four.attributes.might + 1)
    expect(classDc(content, characterAt(content, 'conjurer', 5))).toBeGreaterThan(classDc(content, characterAt(content, 'conjurer', 4)))
  })

  it('spends skill points with aptitude and practice (after DCSS)', () => {
    const c = characterAt(content, 'poacher', 3)
    expect(c.skillPoints).toBe(4)
    expect(train(content, c, 'lore')).toMatch(/Lore is now trained/)
    expect(c.skillPoints).toBe(2)
    c.practice['crafting'] = 3
    expect(train(content, c, 'crafting')).toMatch(/trained/)
    expect(c.skillPoints).toBe(1)
  })
})

describe('checks with real skills', () => {
  it('gives the ready-made traveller the talking skills of before', () => {
    const engine = new Engine(content, { seed: 1 })
    expect(character(engine.world)!.name).toBe(READY_MADE.name)
    expect(['persuasion', 'deception', 'intimidation', 'insight'].map((s) => playerSkill(engine.world, s))).toEqual([4, 4, 4, 3])
  })

  it('uses the character for a check in conversation, and leaves a practice mark on success', async () => {
    const engine = new Engine(content, { seed: 3 })
    await play(engine, 'create warden heathborn peat_cutter name=Joost')
    const c = character(engine.world)!
    expect(skillBonus(content, c, 'intimidation')).toBe(6)
    // Whoever is on the green (M9.4: naming someone who is elsewhere no longer falls to whoever is here).
    await play(engine, 'north')
    const here = engine.world.npc(engine.world.npcsAt(engine.state.player.location)[0]!).short.toLowerCase()
    const out = await play(engine, `talk ${here}`, `intimidate ${here} to lower the price`)
    expect(out).toMatch(/\(Intimidation \d+ vs DC \d+/)
    const total = Number(/Intimidation (\d+) vs DC (\d+)/.exec(out)![1])
    expect(total).toBeGreaterThanOrEqual(7)
    if (/: (success|critical success)\)/.test(out)) expect(c.practice['intimidation']).toBe(1)
  })
})

async function playFight(engine: Engine, start: string): Promise<string> {
  let out = await play(engine, start)
  for (let i = 0; i < 60 && engine.state.combat; i++) {
    const fight = engine.status().combat!
    if (fight.parley) out += await play(engine, 'refuse')
    else if (fight.prisoners) out += await play(engine, 'let them go')
    else out += await play(engine, fight.fighters.find((f) => f.side === 'foes' && f.state === 'up' && f.reachable) ? 'strike' : fight.actions > 0 ? 'advance' : 'end')
  }
  expect(engine.state.combat).toBeUndefined()
  return out
}

describe('the Goat-Riders on the tow path', () => {
  async function onTheTowPath(): Promise<Engine> {
    for (let seed = 1; seed < 40; seed++) {
      const engine = new Engine(content, { seed })
      engine.state.player.location = 'loc_towpath_e'
      const out = await play(engine, 'east')
      if (engine.state.combat) {
        expect(out).toMatch(/goat-skin/)
        expect(out).toMatch(/Toll for the path/)
        return engine
      }
    }
    throw new Error('no seed met the Goat-Riders')
  }

  it('happens on the tow path now and then, not every time', async () => {
    let met = 0
    for (let seed = 1; seed <= 20; seed++) {
      const engine = new Engine(content, { seed })
      engine.state.player.location = 'loc_towpath_e'
      await play(engine, 'east')
      if (engine.state.combat) met++
    }
    expect(met).toBeGreaterThan(2)
    expect(met).toBeLessThan(15)
  })

  it('ends when you pay the toll', async () => {
    const engine = await onTheTowPath()
    const money = engine.state.player.money
    const out = await play(engine, 'pay')
    expect(out).toMatch(/bites the coins/)
    expect(engine.state.player.money).toBe(money - 16)
    expect(engine.state.combat).toBeUndefined()
    expect(engine.state.news!.facts.some((f) => f.kind === 'fight' && f.about.includes('goat_riders'))).toBe(true)
  })

  it('lets you flee back the way you came', async () => {
    for (let seed = 1; seed < 60; seed++) {
      const engine = await onTheTowPathSeed(seed)
      if (!engine) continue
      await play(engine, 'refuse')
      for (let i = 0; i < 10 && engine.state.combat; i++) await play(engine, 'flee')
      if (engine.state.combat) continue
      expect(engine.state.player.location).toBe('loc_towpath_e')
      expect(engine.state.news!.facts.at(-1)!.title).toMatch(/ran from/)
      return
    }
    throw new Error('never got away')
  })

  it('lets you give up: they take half your money and go', async () => {
    const engine = await onTheTowPath()
    await play(engine, 'refuse')
    const money = engine.state.player.money
    const out = await play(engine, 'surrender')
    expect(out).toMatch(/throw down your weapon/)
    expect(out).toMatch(/leave you sitting in the mud/)
    expect(engine.state.player.money).toBe(money - Math.floor(money / 2))
    expect(engine.state.combat).toBeUndefined()
  })

  it('can be won, and the one who gives up waits for your word', async () => {
    for (let seed = 1; seed < 80; seed++) {
      const engine = await onTheTowPathSeed(seed, 'create warden heathborn peat_cutter name=Joost')
      if (!engine) continue
      engine.state.player.inventory['rope'] = 1
      await play(engine, 'refuse', 'subdue')
      for (let i = 0; i < 40 && engine.state.combat && !engine.state.combat.over; i++) {
        const fight = engine.status().combat!
        await play(engine, fight.fighters.some((f) => f.side === 'foes' && f.reachable) ? 'strike' : fight.actions > 0 ? 'advance' : 'end')
      }
      if (!engine.state.combat?.prisoners) continue
      const xp = character(engine.world)!.xp
      expect(xp).toBeGreaterThan(0)
      const out = await play(engine, 'bind them')
      expect(out).toMatch(/schout's men/)
      expect(engine.state.player.inventory['rope']).toBeUndefined()
      expect(engine.state.news!.facts.some((f) => /brought in a Goat-Rider/.test(f.title))).toBe(true)
      return
    }
    throw new Error('no fight ended with a prisoner')
  })

  async function onTheTowPathSeed(seed: number, first?: string): Promise<Engine | undefined> {
    const engine = new Engine(content, { seed })
    if (first) await play(engine, first)
    engine.state.player.location = 'loc_towpath_e'
    await play(engine, 'east')
    return engine.state.combat ? engine : undefined
  }
})

describe('death and the Way of the Grey Rider', () => {
  it('sends you back a day later, with half your money where you fell and the Mark on you', async () => {
    const engine = new Engine(content, { seed: 2, builder: true })
    await play(engine, 'create conjurer changeling clerk name=Anneke')
    const money = engine.state.player.money
    const start = engine.world.now
    let out = await play(engine, '@fight haakman')
    for (let i = 0; i < 40 && engine.state.combat; i++) out += await play(engine, 'strike')
    expect(out).toMatch(/Grey Rider/)
    expect(out).toMatch(/You wake a day later/)
    const c = character(engine.world)!
    expect(c.deaths).toBe(1)
    expect(c.mark).toBe(true)
    expect(engine.world.now - start).toBeGreaterThanOrEqual(24 * 60)
    expect(engine.state.player.money).toBe(money - Math.floor(money / 2))
    expect(engine.state.player.lostPurse).toMatchObject({ location: 'loc_veenhoek_quay', amount: Math.floor(money / 2) })
    expect(engine.world.location(engine.state.player.location).tags).toContain('holy')
    // A rite for the dead at a holy place lifts the Mark.
    expect(await play(engine, 'rite')).toMatch(/Mark is gone/)
    expect(c.mark).toBeUndefined()
  })

  it('wants a price after the third death', async () => {
    const engine = new Engine(content, { seed: 4, builder: true })
    await play(engine, 'create conjurer changeling clerk name=Anneke')
    for (let death = 0; death < 3; death++) {
      await play(engine, '@fight haakman')
      for (let i = 0; i < 40 && engine.state.combat; i++) await play(engine, 'strike')
    }
    expect(character(engine.world)!.deaths).toBe(3)
    expect(engine.state.player.riderPrice).toBe(true)
  })
})

describe('patrons, clocks and the balance', () => {
  it('gives favour for what a patron values, and blessings at 25', async () => {
    const engine = new Engine(content, { seed: 1 })
    expect(await play(engine, 'devote to the lantern')).toMatch(/holy place/)
    engine.state.player.location = 'loc_veenhoek_chapel'
    expect(await play(engine, 'devote to the lantern')).toMatch(/swear yourself to the Lantern/)
    const c = character(engine.world)!
    const will = skillBonus(content, c, 'persuasion')
    for (let i = 0; i < 10; i++) favour(engine.world, 'request_done')
    expect(c.patron!.favour).toBe(25)
    expect(engine.world.notices.join(' ')).toMatch(/Comfort/)
    favour(engine.world, 'killed_surrendered')
    expect(c.patron!.favour).toBe(5)
    expect(skillBonus(content, c, 'persuasion')).toBe(will)
  })

  it('fills a progress clock and says when it is full', () => {
    const engine = new Engine(content, { seed: 1 })
    addClock(engine.world, { id: 'survey', name: 'Survey of the Holleveen', size: 8, full: 'The drainage begins.' })
    for (let i = 0; i < 7; i++) expect(tickClock(engine.world, 'survey')).toBe(false)
    expect(tickClock(engine.world, 'survey')).toBe(true)
    expect(clockLine(engine.state.clocks!['survey']!)).toBe('Survey of the Holleveen [########] 8/8')
  })

  it('stays within the agreed margins over 1,000 fights per class', () => {
    const reports = balanceReport(content, 1000)
    expect(reports.map((r) => r.fights)).toEqual([1000, 1000, 1000, 1000, 1000, 1000])
    expect(marginProblems(reports)).toEqual([])
  })

  it('replays a game with a character and a fight to the same world', async () => {
    const engine = new Engine(content, { seed: 9, builder: true })
    await play(engine, 'create lanternbearer dykelander lantern_novice name=Marij')
    await playFight(engine, '@fight goat_riders_toll')
    await play(engine, 'north', 'sheet')
    const replayed = await Engine.replay(content, 9, engine.save().log)
    expect(replayed.state).toEqual(engine.state)
    expect(canLevelUp(content, character(replayed.world)!)).toBe(false)
  })
})

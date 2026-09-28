import { describe, expect, it } from 'vitest'
import { Engine, type Output } from '../src/engine'
import { questWarnings } from '../src/engine/quests/check'
import { character } from '../src/engine/rules/player'
import { content } from './helpers'

// Milestone M7 (docs/ROADMAP.md): quests with stages, conditions, effects and
// clocks; opponents who do not wait; big events with effect plans; and the
// whole Holleveen. Every quest is played through every one of its solutions
// by a script of player commands, with build commands (@goto, @bring, @give)
// standing in for the walking and the waiting.

const texts = (outputs: Output[]) => outputs.map((o) => o.text).join('\n')

type Step = string | { retry: string; until: (e: Engine) => boolean; before?: string[] } | ((e: Engine) => void | Promise<void>)

async function game(seed = 7): Promise<Engine> {
  const engine = new Engine(content, { seed, builder: true })
  await engine.handle('create warden heathborn peat_cutter name=Tester')
  await engine.handle('@xp 4000')
  for (let i = 0; i < 4; i++) await engine.handle('level up auto')
  // Good at everything, so a script needs few tries; checks still roll.
  const c = character(engine.world)!
  for (const s of content.rules!.skills) c.ranks[s.id] = Math.max(c.ranks[s.id] ?? 0, 2)
  return engine
}

async function run(engine: Engine, steps: Step[]): Promise<string> {
  let all = ''
  for (const step of steps) {
    if (typeof step === 'string') all += texts(await engine.handle(step)) + '\n'
    else if (typeof step === 'function') await step(engine)
    else {
      let done = step.until(engine)
      for (let i = 0; i < 40 && !done; i++) {
        for (const b of step.before ?? []) all += texts(await engine.handle(b)) + '\n'
        all += texts(await engine.handle(step.retry)) + '\n'
        done = step.until(engine)
      }
      if (!done) throw new Error(`never managed: ${step.retry}\n${all.slice(-1500)}`)
    }
  }
  return all
}

async function fight(engine: Engine): Promise<void> {
  for (let i = 0; i < 80 && engine.state.combat; i++) {
    const f = engine.status().combat!
    if (f.parley) await engine.handle('refuse')
    else if (f.prisoners) await engine.handle('let them go')
    else await engine.handle(f.fighters.find((x) => x.side === 'foes' && x.state === 'up' && x.reachable) ? 'strike' : f.actions > 0 ? 'advance' : 'end')
  }
  expect(engine.state.combat).toBeUndefined()
}

const outcome = (e: Engine, quest: string) => e.state.questlog?.[quest]?.outcome
const flag = (name: string) => (e: Engine) => Boolean(e.state.flags?.[name])
const has = (item: string) => (e: Engine) => (e.state.player.inventory[item] ?? 0) > 0
const days = (n: number) => (e: Engine) => void e.tick(n * 24 * 60)

async function play(quest: string, want: string, steps: Step[], seed = 7): Promise<Engine> {
  const engine = await game(seed)
  const log = await run(engine, steps)
  expect(outcome(engine, quest), `${quest} should end ${want}\n${log.slice(-2000)}`).toBe(want)
  return engine
}

// The first steps of the main quest: the cat is Fenna, found out through Aaltje.
const catIsFenna: Step[] = ['@goto loc_visser_house', '@like aaltje 30 30', '@bring aaltje', 'ask aaltje about the cat']

describe('M7: the main quest, The Grey Cat on the Doorstep', () => {
  it('begins on the doorstep, and finding out who the cat is starts the widow\'s patience', async () => {
    const engine = await game()
    const out = await run(engine, ['@goto loc_visser_house'])
    expect(out).toMatch(/New quest: The Grey Cat on the Doorstep/)
    await run(engine, catIsFenna.slice(1))
    expect(engine.state.questlog!['grey_cat_on_the_doorstep']!.stage).toBe('the_cat_is_fenna')
    expect(engine.state.clocks!['widow_patience']).toMatchObject({ size: 6, filled: 0 })
    expect(engine.status().journal.quests.some((q) => q.id === 'quest_grey_cat_on_the_doorstep')).toBe(true)
  })

  it('Paid: the widow gets Jacob van Dam\'s measuring chest, and Fenna comes home', async () => {
    const engine = await play('grey_cat_on_the_doorstep', 'paid', [
      ...catIsFenna,
      '@goto loc_kattenbroek_hut',
      '@bring kaatje',
      '@time 10',
      '@goto loc_goose_rooms',
      { retry: 'steal the chest', until: has('measuring_chest'), before: ['@goto loc_goose_rooms'] },
      '@goto loc_kattenbroek_hut',
      '@bring kaatje',
      'give the chest to the widow',
    ])
    expect(engine.state.npcs['npc_fenna']!.absent).toBe(false)
    expect(engine.state.flags!['fenna_home']).toBe(true)
    expect(engine.state.npcs['npc_kaatje']!.inventory['measuring_chest']).toBe(1)
  })

  it('Paid: or the survey lies still for seven days, and the widow waits meanwhile', async () => {
    await play('grey_cat_on_the_doorstep', 'paid', [...catIsFenna, '@goto loc_kattenbroek_hut', '@bring kaatje', '@flag survey_halted', days(8)])
  })

  it('Broken: moon water from the Blackmere at night, and Aaltje\'s words', async () => {
    const engine = await play('grey_cat_on_the_doorstep', 'broken', [
      ...catIsFenna,
      '@time 23',
      '@goto loc_blackmere_shore',
      'fill a flask with moon water',
      '@goto loc_visser_house',
      '@bring aaltje',
      'pour the moon water on the cat',
    ])
    expect(engine.state.npcs['npc_kaatje']!.grievance?.line).toMatch(/my own water/)
    expect(engine.state.flags!['aaltje_reconciled']).toBe(true)
  })

  it('Burned: with Jan and a pot of fire; the widow flees, Fenna stays a cat', async () => {
    const engine = await play('grey_cat_on_the_doorstep', 'burned', [...catIsFenna, '@bring jan', 'help jan', '@goto loc_kattenbroek_hut', 'burn the hut'])
    expect(engine.state.places!['loc_kattenbroek_hut']!.state).toBe('destroyed')
    expect(engine.state.npcs['npc_kaatje']!.absent).toBe(true)
    expect(engine.state.npcs['npc_fenna']!.absent).toBe(true)
    expect(engine.state.flags!['fen_without_keeper']).toBe(true)
  })

  it('Honest: Aaltje\'s draught, the cat confesses, and the widow hears she is sorry', async () => {
    await play('grey_cat_on_the_doorstep', 'honest', [
      ...catIsFenna,
      'ask aaltje for a draught',
      'drink the draught',
      'talk to the cat',
      '@goto loc_kattenbroek_hut',
      '@bring kaatje',
      'tell the widow that fenna is sorry',
    ])
  })

  it('finds out with Lore at the doorstep too', async () => {
    const engine = await game()
    await run(engine, ['@goto loc_visser_house', { retry: 'study the cat', until: flag('cat_is_fenna'), before: ['@flag -studied_cat'] }])
    expect(engine.state.questlog!['grey_cat_on_the_doorstep']!.stage).toBe('the_cat_is_fenna')
  })

  it('fails when the widow\'s patience runs out: the fen closes in mist', async () => {
    const engine = await play('grey_cat_on_the_doorstep', 'fen_closed', [...catIsFenna, days(7)])
    const out = await run(engine, ['@goto loc_kattenbroek_edge', 'east'])
    expect(out).toMatch(/Mist stands between you and the hut/)
  })

  it('reacts to the widow\'s death, and to the Vissers\' house flooding', async () => {
    await play('grey_cat_on_the_doorstep', 'widow_dead', [...catIsFenna, '@kill kaatje drowned in the black pools'])
    const engine = await game()
    await run(engine, [...catIsFenna, '@place loc_visser_house flooded'])
    expect(engine.state.questlog!['grey_cat_on_the_doorstep']!.stage).toBe('flooded_out')
    expect(engine.state.questlog!['the_vissers_to_safety']).toBeDefined()
  })
})

describe('M7: The Vissers to Safety, a quest that the world made', () => {
  for (const [how, command, where, end] of [
    ['to Waagdam', 'take the vissers to waagdam', 'loc_waagdam_church', 'in_waagdam'],
    ['to the Goose', 'take the vissers to the goose', 'loc_goose_common', 'at_the_goose'],
    ['to the priory', 'take the vissers to the priory', 'loc_kloosterveen_lodging', 'at_the_priory'],
  ] as const) {
    it(`brings them ${how}`, async () => {
      const engine = await play('the_vissers_to_safety', end, ['@goto loc_visser_house', '@quest the_vissers_to_safety', '@bring grietje', command])
      expect(engine.state.npcs['npc_grietje_visser']!.location).toBe(where)
    })
  }
})

describe('M7: Flour for Veenhoek', () => {
  const start: Step[] = ['@goto loc_veenhoek_bakery', '@bring mirte', 'talk mirte', 'bye']
  it('flour brought', () => play('flour_for_veenhoek', 'flour_brought', [...start, '@give flour 2', '@bring mirte', 'give two sacks of flour to mirte']))
  it('rye brought, to be ground', () => play('flour_for_veenhoek', 'flour_brought', [...start, '@give rye_grain 3', '@bring mirte', 'give three sacks of rye to mirte']))
  it('the mill turns: sailcloth for Harmen', async () => {
    const engine = await play('flour_for_veenhoek', 'mill_turns', [
      ...start,
      '@give sailcloth 2',
      '@goto loc_molenend_mill',
      '@time 8',
      '@bring harmen',
      'give 2 sailcloth to harmen',
      (e) => {
        for (let i = 0; i < 48 && e.state.objects['loc_molenend_mill/de_zwaan']!['broken'] !== false; i++) e.tick(60)
      },
      '@time 8',
    ])
    expect(engine.state.objects['loc_molenend_mill/de_zwaan']!['broken']).toBe(false)
  })
  it('the rumour exposed through Kobus', () =>
    play('flour_for_veenhoek', 'rumour_exposed', [...start, '@goto loc_goose_common', { retry: 'confront kobus', until: flag('kobus_confessed'), before: ['@bring kobus'] }, '@goto loc_veenhoek_green', 'expose the rumour']))
  it('fails when market day passes', () => play('flour_for_veenhoek', 'market_day_passed', [...start, days(5)]))
})

describe("M7: The Surveyor's Lights", () => {
  const knows: Step[] = ['@goto loc_molenend_field', '@goto loc_waagdam_notary', '@bring pen', 'ask pen about the boundary stone']
  it('begins in the field and reports Harmen', () => play('the_surveyors_lights', 'reported', [...knows, '@bring everhard', 'report harmen']))
  it('blackmails Harmen', () => play('the_surveyors_lights', 'blackmailed', [...knows, { retry: 'blackmail harmen', until: flag('harmen_blackmailed'), before: ['@bring harmen'] }]))
  it('puts the stone back with Harmen, by night', () =>
    play('the_surveyors_lights', 'stone_back', [
      ...knows,
      { retry: 'persuade harmen to put the stone back', until: flag('harmen_agrees'), before: ['@bring harmen'] },
      '@time 23',
      '@goto loc_molenend_field',
      { retry: 'put the stone back', until: flag('stone_back'), before: ['@goto loc_molenend_field'] },
    ]))
  it('finds the stone with its own eyes at night', async () => {
    const engine = await game()
    await run(engine, ['@time 23', '@goto loc_molenend_field', { retry: 'watch the lights', until: flag('knows_stone_moved') }])
    expect(engine.state.questlog!['the_surveyors_lights']!.stage).toBe('the_stone')
  })
  it("ends when Harmen dies", () => play('the_surveyors_lights', 'harmen_dead', [...knows, '@kill harmen fell from the mill']))
})

describe('M7: What the Haakman Wants', () => {
  const pumping = (e: Engine) => void (e.state.objects['loc_molenend_mill/de_zwaan']!['broken'] = false)
  const start: Step[] = [pumping, '@goto loc_blackmere_shore']
  it('begins at the Blackmere once the mill turns', async () => {
    const engine = await game()
    expect(await run(engine, ['@goto loc_blackmere_shore'])).not.toMatch(/What the Haakman Wants/)
    expect(await run(engine, [pumping, '@goto loc_blackmere_hookstone'])).toMatch(/New quest: What the Haakman Wants/)
  })
  it('a bargain: bread and beer, and no pumping at the new moon', () =>
    play('what_the_haakman_wants', 'bargain', [...start, '@give rye_bread', '@give beer', 'offer bread and beer', { retry: 'tell harmen about the bargain', until: flag('haakman_bargain'), before: ['@bring harmen'] }]))
  it('driven off with iron', async () => {
    await play('what_the_haakman_wants', 'driven_off', [...start, '@give knife', 'equip knife', 'fight the haakman', fight])
  })
  it('named: Haak Aukes, from the book of the drowned', () =>
    play('what_the_haakman_wants', 'named', [...start, '@goto loc_kloosterveen_library', { retry: 'search the books', until: flag('haakman_name') }, '@goto loc_blackmere_shore', 'say his true name']))
  it('ends in revenge when nobody does anything: the dyke breaks', async () => {
    const engine = await play('what_the_haakman_wants', 'revenge', [...start, days(10)])
    expect(engine.state.places!['loc_veenhoek_green']?.state).toBeDefined()
  })
})

describe('M7: Milk for the Kabouters', () => {
  // Things start going missing on the second day.
  const start: Step[] = [days(2), '@goto loc_kabouterberg']
  const confessed: Step[] = [...start, '@goto loc_visser_house', '@bring pim', 'ask pim about the kabouters']
  it('seven nights of milk', async () => {
    const nights: Step[] = []
    for (let i = 0; i < 7; i++) nights.push('@give milk', '@time 23', '@goto loc_kabouterberg', 'leave the milk')
    await play('milk_for_the_kabouters', 'seven_nights', [...start, ...nights])
  })
  it('Pim carries the milk himself', () => play('milk_for_the_kabouters', 'pim_pays', [...confessed, '@give milk 7', 'ask pim to leave the milk', days(7)]))
  it('an apology through Aaltje', async () => {
    const engine = await play('milk_for_the_kabouters', 'apology', [
      ...confessed,
      '@bring aaltje',
      'ask aaltje to apologise',
      (e) => {
        for (let i = 0; i < 48 && !e.state.questlog!['milk_for_the_kabouters']!.outcome; i++) e.tick(60)
      },
    ])
    expect(content.locations.get(engine.state.npcs['npc_aaltje']!.location)!.area).toBe('kabouterberg')
  })
  it('a trap, which is a bad idea', () => play('milk_for_the_kabouters', 'trapped', [...start, '@give rope', 'set a trap']))
})

describe("M7: The Goat-Riders' Toll", () => {
  const start: Step[] = ['@goto loc_rietdoolhof_edge']
  it('breaks the camp in a fight', async () => {
    const engine = await play('the_goat_riders_toll', 'camp_broken', [...start, '@goto loc_rietdoolhof_camp', 'attack the camp', fight])
    expect(engine.state.npcs['npc_mathijs']!.absent).toBe(true)
  })
  it('exposes the goat trick in public', () =>
    play('the_goat_riders_toll', 'exposed', [...start, { retry: 'spy on the camp', until: flag('knows_goat_trick'), before: ['@goto loc_rietdoolhof_camp'] }, '@goto loc_goose_common', 'expose the trick']))
  it('gets Mathijs a lawful toll letter', () =>
    play('the_goat_riders_toll', 'legal_toll', [
      ...start,
      '@goto loc_waagdam_notary',
      '@bring pen',
      'ask pen for a toll letter',
      '@goto loc_waagdam_town_hall',
      { retry: 'ask aleid to sign the toll letter', until: flag('toll_letter_signed'), before: ['@bring aleid'] },
      '@goto loc_rietdoolhof_camp',
      '@bring mathijs',
      'give the letter to mathijs',
    ]))
  it('joins them', () => play('the_goat_riders_toll', 'joined', [...start, { retry: 'join the goat-riders', until: flag('joined_goat_riders'), before: ['@bring mathijs'] }]))
})

describe("M7: The White Women's Riddle", () => {
  const start: Step[] = ['@goto loc_reuzenrust_barrows']
  it('solves it with lore, and learns the Haakman\'s name', async () => {
    const engine = await play('the_white_womens_riddle', 'solved', [...start, '@flag knows:water_wolf', { retry: 'answer the riddle', until: flag('riddle_solved') }])
    expect(engine.state.flags!['haakman_name']).toBe(true)
  })
  it('makes an offering with respect', () => play('the_white_womens_riddle', 'offering', [...start, '@give rye_bread', 'leave the bread']))
  it('walks away', () => play('the_white_womens_riddle', 'walked_away', [...start, 'walk away']))
})

const charter: Step[] = [
  '@flag knows:fen_charter',
  '@goto loc_kloosterveen_library',
  { retry: 'search the library for the charter', until: has('fen_charter_deed') },
  '@goto loc_waagdam_notary',
  '@bring pen',
  'ask pen to read the charter',
  '@goto loc_waagdam_town_hall',
  '@bring aleid',
  'present the charter to the council',
  '@goto loc_oude_zijl_dykehouse',
  '@bring sijbrand',
  'show the charter to the heemraad',
]
const resistance: Step[] = [
  '@time 23',
  '@goto loc_route_peat_pits',
  'pull up the stakes',
  '@time 23',
  '@goto loc_route_peat_pits',
  'pull up the stakes',
  '@time 10',
  { retry: 'threaten cornelis', until: flag('cornelis_scared'), before: ['@bring cornelis'] },
]

describe('M7: The Drainage Question', () => {
  const start: Step[] = ['@goto loc_route_peat_pits']
  it('the charter, upheld by the council and the dyke reeve', async () => {
    const engine = await play('the_drainage_question', 'charter', [...start, ...charter])
    expect(engine.state.flags!['survey_halted']).toBe(true)
  })
  it('the truth: Jacob van Dam made human again, and his testimony', async () => {
    const engine = await play('the_drainage_question', 'truth', [
      ...start,
      '@flag knows_jacob_cat',
      '@goto loc_kattenbroek_catyard',
      { retry: 'pour the moon water on the tomcat', until: flag('jacob_free'), before: ['@give moon_water', '@goto loc_kattenbroek_catyard'] },
      '@bring jacob',
      'ask jacob to testify',
      (e) => {
        for (let i = 0; i < 72 && !e.state.questlog!['the_drainage_question']!.outcome; i++) e.tick(60)
      },
    ])
    expect(engine.state.npcs['npc_jacob']!.absent).toBe(false)
    expect(engine.state.npcs['npc_cornelis']!.absent).toBe(true)
  })
  it('resistance: stakes pulled, Cornelis chased off, and soldiers come', async () => {
    const engine = await play('the_drainage_question', 'resistance', [...start, ...resistance, days(5)])
    expect(engine.state.places!['loc_route_peat_pits']!.state).toBe('occupied')
  })
  it('a settlement: only the fields north of the Vaart', () =>
    play('the_drainage_question', 'settlement', [
      ...start,
      '@flag secret:npc_cornelis:old_survey',
      '@time 10',
      { retry: 'propose a settlement', until: flag('cornelis_agrees'), before: ['@bring cornelis'] },
      { retry: 'propose a settlement', until: flag('gerrit_agrees'), before: ['@bring gerrit'] },
    ]))
  it('the polder comes with the player holding the chains', async () => {
    const steps: Step[] = [...start]
    for (let d = 0; d < 8; d++) steps.push('@time 9', '@goto loc_route_peat_pits', '@bring cornelis', 'help cornelis', days(1))
    await play('the_drainage_question', 'polder_comes_helped', steps)
  })
  it('the polder comes when nobody stops him', () => play('the_drainage_question', 'polder_comes', [...start, days(16)]))
  it('ends differently when the surveyor dies', () => play('the_drainage_question', 'surveyor_dead', [...start, '@kill cornelis drowned in a peat pit']))
})

describe('M7: A Stall at the Market', () => {
  const start: Step[] = ['@goto loc_waagdam_town_hall', '@quest a_stall_at_the_market']
  it('convinces the council', () => play('a_stall_at_the_market', 'council', [...start, { retry: 'ask aleid about a stall for mirte', until: flag('council_licence'), before: ['@bring aleid'] }]))
  it('bribes a guild baker', () => play('a_stall_at_the_market', 'bribed', [...start, '@goto loc_waagdam_guild_house', 'bribe a guild baker']))
  it('finds Mirte a master', () => play('a_stall_at_the_market', 'apprenticed', [...start, '@goto loc_waagdam_guild_house', { retry: 'ask the guild to take mirte', until: flag('mirte_apprenticed') }]))
  it('fails when the fair passes', () => play('a_stall_at_the_market', 'fair_passed', [...start, days(21)]))
  it('begins only after Flour for Veenhoek', async () => {
    const engine = await game()
    const out = await run(engine, ['@goto loc_veenhoek_bakery', '@bring mirte', 'talk mirte', 'bye', '@give flour 2', '@bring mirte', 'give two sacks of flour to mirte', '@bring mirte', 'talk mirte'])
    expect(out).toMatch(/New quest: A Stall at the Market/)
  })
})

describe('M7: The Honest Scale', () => {
  const start: Step[] = ['@goto loc_waagdam_waag', '@bring dirck', 'talk dirck', 'bye']
  it('Aaltje weighed and found true', () => play('the_honest_scale', 'weighed', [...start, '@bring aaltje', 'weigh aaltje']))
  it('Aaltje walks to the Waag herself', () =>
    play('the_honest_scale', 'weighed', [
      ...start,
      '@goto loc_aaltje_cottage',
      { retry: 'ask aaltje to be weighed', until: flag('aaltje_agrees'), before: ['@bring aaltje'] },
      (e) => {
        for (let i = 0; i < 36 && !e.state.questlog!['the_honest_scale']!.outcome; i++) e.tick(60)
      },
    ]))
  it('the envoy discredited', () =>
    play('the_honest_scale', 'envoy_discredited', [...start, '@goto loc_waagdam_de_schaal', { retry: 'ask about the envoy', until: flag('envoy_dirt') }, '@goto loc_waagdam_waag', 'expose the envoy']))
  it("Dirck's secret protected", () =>
    play('the_honest_scale', 'protected', [...start, { retry: 'ask dirck about the widow', until: flag('knows_dirck_secret'), before: ['@bring dirck'] }, '@goto loc_waagdam_weighing_room', { retry: 'tear out the page', until: flag('secret_protected') }]))
  it("Dirck's secret used", () =>
    play('the_honest_scale', 'used', [...start, '@goto loc_kattenbroek_hut', '@bring kaatje', '@like kaatje 10 10', 'ask the widow about dirck', '@goto loc_waagdam_waag', { retry: 'threaten dirck', until: flag('secret_used'), before: ['@bring dirck'] }]))
  it('lost when nobody helps before the hearing', () => play('the_honest_scale', 'hearing_lost', [...start, days(6)]))
})

describe('M7: the personal quests of the companions', () => {
  it("The Brotherhood's Charter: recognised by law", () => play('the_brotherhoods_charter', 'recognised', ['@quest the_brotherhoods_charter', '@quest the_drainage_question', ...charter]))
  it("The Brotherhood's Charter: kept by the Brotherhood", () =>
    play('the_brotherhoods_charter', 'kept', ['@quest the_brotherhoods_charter', '@give fen_charter_deed', '@bring gerrit', 'give the charter to gerrit']))
  it("The Brotherhood's Charter: by force", () => play('the_brotherhoods_charter', 'by_force', ['@quest the_brotherhoods_charter', '@quest the_drainage_question', ...resistance]))
  it('opens when a companion is close enough, and begins when you talk', async () => {
    const engine = await game()
    // He brings it up himself when he thinks well enough of the stranger (M10.8); a wary Gerrit waits for the subject.
    await run(engine, ['@goto loc_gerrit_house', '@bring gerrit', '@flag personal_the_brotherhoods_charter', '@like gerrit 30 30'])
    expect(await run(engine, ['talk gerrit'])).toMatch(/New quest: The Brotherhood's Charter/)
  })

  const hut: Step[] = ['@quest the_apprentices_debt', '@goto loc_kattenbroek_hut', '@bring kaatje']
  it("The Apprentice's Debt: reconciled", () =>
    play('the_apprentices_debt', 'reconciled', [...hut, { retry: 'speak for aaltje', until: flag('widow_softened'), before: ['@bring kaatje'] }, '@bring aaltje', 'let them talk']))
  it("The Apprentice's Debt: a last conversation", () => play('the_apprentices_debt', 'said_goodbye', [...hut, '@bring aaltje', 'let them talk']))
  it("The Apprentice's Debt: a letter", () => play('the_apprentices_debt', 'a_letter', ['@quest the_apprentices_debt', '@bring aaltje', 'ask aaltje to write a letter', '@goto loc_kattenbroek_hut', '@bring kaatje', 'give the letter to the widow']))
  it("The Apprentice's Debt: too late", () => play('the_apprentices_debt', 'too_late', ['@quest the_apprentices_debt', '@kill kaatje died in her sleep']))

  const boat: Step[] = ['@quest a_boat_and_a_bride', '@money 300', '@bring wouter', 'pay for the boat']
  it('A Boat and a Bride: with her blessing', () => play('a_boat_and_a_bride', 'blessed', [...boat, { retry: 'ask trijntje about wouter', until: flag('trijntje_blesses'), before: ['@bring trijntje'] }]))
  it('A Boat and a Bride: Geesje speaks to her mother', () => play('a_boat_and_a_bride', 'daughter_asked', [...boat, '@like geesje 40 30', '@bring geesje', 'ask geesje to talk to her mother']))
  it('A Boat and a Bride: eloped', () => play('a_boat_and_a_bride', 'eloped', [...boat, 'help wouter elope']))
  it('A Boat and a Bride: no boat', () => play('a_boat_and_a_bride', 'no_boat', ['@quest a_boat_and_a_bride', days(30)]))

  it('The Bell of Kloosterveen: raised', () => play('the_bell_of_kloosterveen', 'raised', ['@quest the_bell_of_kloosterveen', '@goto loc_blackmere_open_water', { retry: 'dive for the bell', until: flag('bell_raised') }]))
  it('The Bell of Kloosterveen: faced', () =>
    play('the_bell_of_kloosterveen', 'faced', ['@quest the_bell_of_kloosterveen', '@goto loc_blackmere_shore', { retry: "take wendela's hand", until: flag('wendela_faced_water'), before: ['@bring wendela'] }]))
  it('The Bell of Kloosterveen: a mass', () => play('the_bell_of_kloosterveen', 'blessed', ['@quest the_bell_of_kloosterveen', '@goto loc_kloosterveen_church', '@bring ansfried', 'ask the prior to say a mass']))

  it('The Road to Graafhaven: with her blessing', () =>
    play('the_road_to_graafhaven', 'with_blessing', ['@quest the_road_to_graafhaven', '@goto loc_goose_common', { retry: 'ask trijntje about geesje', until: flag('trijntje_lets_go'), before: ['@bring trijntje'] }]))
  it('The Road to Graafhaven: without it', () => play('the_road_to_graafhaven', 'without', ['@quest the_road_to_graafhaven', '@goto loc_veenhoek_quay', '@bring geesje', 'help geesje leave']))
  it('The Road to Graafhaven: a start in Waagdam', () =>
    play('the_road_to_graafhaven', 'a_start', ['@quest the_road_to_graafhaven', '@goto loc_waagdam_waag', { retry: 'find a place for geesje', until: flag('geesje_placed'), before: ['@bring dirck'] }]))
})

describe('M7: every quest has at least three solutions, and every one of them is played above', () => {
  it('counts the solutions of every written quest', () => {
    for (const q of content.quests.values()) {
      if (!q.stages?.length) continue
      expect((q.outcomes ?? []).filter((o) => o.solution).length, q.id).toBeGreaterThanOrEqual(3)
    }
    expect([...content.quests.values()].filter((q) => q.stages?.length)).toHaveLength(16)
    expect(questWarnings(content)).toEqual([])
  })
})

// One way to solve each quest, for the check after thirty days that nothing is stuck.
const solve: Record<string, Step[]> = {
  grey_cat_on_the_doorstep: [...catIsFenna, '@bring jan', 'help jan', '@goto loc_kattenbroek_hut', 'burn the hut'],
  the_vissers_to_safety: ['@bring grietje', 'take the vissers to the goose'],
  flour_for_veenhoek: ['@give flour 2', '@goto loc_veenhoek_bakery', '@bring mirte', 'give two sacks of flour to mirte'],
  the_surveyors_lights: ['@goto loc_waagdam_notary', '@bring pen', 'ask pen about the boundary stone', '@bring everhard', 'report harmen'],
  what_the_haakman_wants: ['@goto loc_blackmere_shore', '@give rye_bread', '@give beer', 'offer bread and beer', { retry: 'tell harmen about the bargain', until: flag('haakman_bargain'), before: ['@bring harmen'] }],
  milk_for_the_kabouters: ['@goto loc_kabouterberg', '@give rope', 'set a trap'],
  the_goat_riders_toll: ['@goto loc_rietdoolhof_camp', { retry: 'join the goat-riders', until: flag('joined_goat_riders'), before: ['@bring mathijs'] }],
  the_white_womens_riddle: ['@goto loc_reuzenrust_barrows', 'walk away'],
  the_drainage_question: ['@goto loc_route_peat_pits', ...charter],
  a_stall_at_the_market: ['@money 200', '@goto loc_waagdam_guild_house', 'bribe a guild baker'],
  the_honest_scale: ['@goto loc_waagdam_waag', '@bring aaltje', 'weigh aaltje'],
  the_brotherhoods_charter: ['@give fen_charter_deed', '@bring gerrit', 'give the charter to gerrit'],
  the_apprentices_debt: ['@bring aaltje', 'ask aaltje to write a letter', '@goto loc_kattenbroek_hut', '@bring kaatje', 'give the letter to the widow'],
  a_boat_and_a_bride: ['@money 300', '@bring wouter', 'pay for the boat', 'help wouter elope'],
  the_bell_of_kloosterveen: ['@money 100', '@goto loc_kloosterveen_church', '@bring ansfried', 'ask the prior to say a mass'],
  the_road_to_graafhaven: ['@goto loc_veenhoek_quay', '@bring geesje', 'help geesje leave'],
}

describe('M7: thirty days of the Holleveen', () => {
  it('runs 30 game days with every quest under way, without anyone stuck, and every quest still open can be solved', async () => {
    const engine = await game(11)
    const written = [...content.quests.values()].filter((q) => q.stages?.length && q.id !== 'the_vissers_to_safety')
    for (const q of written) await engine.handle(`@quest ${q.id}`)
    expect(Object.keys(engine.state.questlog!)).toHaveLength(15)
    const changes = new Map<string, number>()
    const last = new Map<string, string>()
    for (let hour = 0; hour < 30 * 24; hour++) {
      engine.tick(60)
      for (const [id, npc] of Object.entries(engine.state.npcs)) {
        if (npc.dead || npc.absent) continue
        expect(npc.needs.hunger, `${id} starving at hour ${hour}`).toBeGreaterThan(0)
        const key = `${npc.location}|${npc.activity}`
        if (last.get(id) !== key) changes.set(id, (changes.get(id) ?? 0) + 1)
        last.set(id, key)
      }
    }
    for (const [id, npc] of Object.entries(engine.state.npcs)) {
      if (npc.dead || npc.absent || engine.content.npcs.get(id)!.quirks.includes('spirit')) continue
      expect(changes.get(id) ?? 0, `${id} stuck for a month`).toBeGreaterThan(30)
    }
    // The world did not wait: the survey ran, and the quests with a deadline ended.
    expect(engine.state.questlog!['flour_for_veenhoek']!.outcome).toBe('market_day_passed')
    expect(engine.state.questlog!['the_honest_scale']!.outcome).toBe('hearing_lost')
    expect(engine.state.questlog!['the_drainage_question']!.outcome).toMatch(/polder_comes/)
    // Everything still open can be finished.
    const open = Object.entries(engine.state.questlog!).filter(([, q]) => !q.ended).map(([id]) => id)
    expect(open.length).toBeGreaterThan(5)
    for (const id of open) {
      await run(engine, solve[id]!)
      expect(engine.state.questlog![id]!.ended, `${id} could not be solved after a month`).toBeDefined()
    }
  }, 120_000)
})

describe('M7: the drainage goes on if the player does nothing', () => {
  it('Cornelis measures, Gerrit pulls stakes, the schout arrests, and the report goes to Graafhaven', async () => {
    const engine = new Engine(content, { seed: 3, builder: true })
    for (let day = 0; day < 20 && !engine.state.flags?.['polder_coming']; day++) engine.tick(24 * 60)
    const survey = engine.state.clocks!['survey'] as { filled: number; size: number }
    expect(survey.filled).toBe(survey.size)
    expect(engine.state.flags!['polder_coming']).toBe(true)
    expect(engine.state.npcs['npc_cornelis']!.absent).toBe(true)
    const titles = engine.state.news!.facts.map((f) => f.title)
    expect(titles).toContain('the survey of the Holleveen finished')
    expect(titles).toContain('half the fen measured')
    // The opponents acted too, by their own rules.
    expect(Number(engine.state.flags!['gerrit_pulled'] ?? 0)).toBeGreaterThan(0)
    expect(engine.state.flags!['goat_riders_hired']).toBe(true)
    // A player who comes to it late finds it over.
    expect(await run(engine, ['@goto loc_route_peat_pits'])).toMatch(/The Drainage Question: The polder comes/)
    expect(engine.state.questlog!['the_drainage_question']!.outcome).toBe('polder_comes')
  })

  it('turns back anyone who brings measuring chains into the Kattenbroek once the widow has had enough', async () => {
    const engine = await game()
    const out = await run(engine, ['@flag widow_mist', '@give surveyors_chain', '@goto loc_kattenbroek_edge', 'east'])
    expect(out).toMatch(/come out where you started/)
    expect(engine.state.player.location).toBe('loc_kattenbroek_edge')
  })
})

describe('M7: a dyke breach', () => {
  it('floods Veenhoek: the people near the player really walk away, the Vissers stay, and the quests react', async () => {
    const engine = await game()
    await run(engine, ['@goto loc_visser_house', '@goto loc_veenhoek_green', '@plan dyke_breach'])
    const plan = engine.state.plans!.find((p) => p.plan === 'dyke_breach')!
    const fleeing = plan.groups['veenhoek']!
    expect(fleeing).toContain('npc_mirte')
    expect(fleeing).not.toContain('npc_grietje_visser')
    await run(engine, ['wait 90'])
    expect(engine.state.places!['loc_veenhoek_green']!.state).toBe('flooded')
    expect(engine.state.places!['loc_visser_house']!.state).toBe('flooded')
    for (const id of fleeing) {
      expect(engine.state.npcs[id]!.stayAt?.where, id).toBe('loc_waagdam_church')
      expect(engine.state.npcs[id]!.note, `${id} walks, near the player`).toBeUndefined()
    }
    // The main quest changes, and a new one comes out of it.
    expect(engine.state.questlog!['grey_cat_on_the_doorstep']!.stage).toBe('flooded_out')
    expect(engine.state.questlog!['the_vissers_to_safety']!.ended).toBeUndefined()
    // The tow path is under water.
    await run(engine, ['@goto loc_veenhoek_quay'])
    expect(await run(engine, ['west'])).toMatch(/under brown water/)
    // Later they are in Waagdam, and the Vissers are still waiting for someone.
    await run(engine, ['@goto loc_veenhoek_green', 'wait 600'])
    const arrived = fleeing.filter((id) => engine.state.npcs[id]!.location === 'loc_waagdam_church')
    expect(arrived.length).toBeGreaterThanOrEqual(fleeing.length - 2)
    expect(content.locations.get(engine.state.npcs['npc_grietje_visser']!.location)!.area).toBe('veenhoek')
    // After three days the water goes down, and the path opens again.
    await run(engine, [days(3)])
    expect(engine.state.places!['loc_veenhoek_green']!.state).toBe('damaged')
    expect(engine.state.closed?.['loc_towpath_w|loc_veenhoek_quay']).toBeUndefined()
    expect(engine.state.questlog!['the_vissers_to_safety']!.outcome).toBe('rescued_by_others')
  })

  it('makes notes of the people far from the player', async () => {
    const engine = await game()
    await run(engine, ['@goto loc_reuzenrust_road', '@plan dyke_breach', 'wait 70'])
    const fleeing = engine.state.plans!.find((p) => p.plan === 'dyke_breach')!.groups['veenhoek']!
    const notes = fleeing.filter((id) => engine.state.npcs[id]!.note?.unrest === 'fleeing')
    expect(notes.length, 'fleeing far from the player').toBeGreaterThan(fleeing.length / 2)
  })

  it('comes from the Haakman\'s revenge when the mill pumps and nobody makes a bargain', async () => {
    const engine = await game()
    engine.state.objects['loc_molenend_mill/de_zwaan']!['broken'] = false
    engine.tick(10 * 24 * 60)
    expect((engine.state.clocks!['haakman_revenge'] as { filled: number }).filled).toBe(4)
    expect(engine.state.plans!.some((p) => p.plan === 'dyke_breach')).toBe(true)
    expect(engine.state.news!.facts.some((f) => f.title === 'the dyke broke at Oude Zijl')).toBe(true)
  })
})

describe('M7: war', () => {
  it('starts the war plan when the tension crosses into war', async () => {
    const { shiftTension } = await import('../src/engine/social/realms')
    const engine = await game()
    for (let i = 0; i < 3; i++) shiftTension(engine.world, 'nethermarch', 'terpwold', 10, 'raids on the border')
    engine.tick(60)
    expect(engine.state.plans!.some((p) => p.plan === 'war')).toBe(true)
    engine.tick(49 * 60)
    expect(engine.state.places!['loc_waagdam_harbour']!.state).toBe('occupied')
    expect(engine.state.market!['lamp_oil']).toBe(0.5)
  })
})

describe('M7: replay', () => {
  it('replays a game with quests, a plan and build commands to the same world', async () => {
    const engine = new Engine(content, { seed: 5, builder: true })
    for (const c of [...catIsFenna, '@bring jan', 'help jan', '@goto loc_kattenbroek_hut', 'burn the hut', '@goto loc_veenhoek_green', '@plan dyke_breach', 'wait 120']) await engine.handle(c as string)
    engine.tick(24 * 60)
    expect(engine.state.questlog!['grey_cat_on_the_doorstep']!.outcome).toBe('burned')
    const replayed = await Engine.replay(content, 5, engine.save().log)
    expect(replayed.state).toEqual(engine.state)
  })
})

describe('the journal as an overview (playtest after M7)', () => {
  it('groups people and places by village and town, and knows the lands and the factions', async () => {
    const engine = await game()
    await run(engine, ['@goto loc_visser_house', '@goto loc_waagdam_market', '@like aaltje 30 30', '@goto loc_veenhoek_green', '@bring aaltje', 'ask aaltje about the cat'])
    engine.state.player.journal!['npc_lubbert'] = engine.world.now
    engine.state.player.journal!['npc_aaltje'] = engine.world.now
    engine.state.player.journal!['graafhaven'] = engine.world.now
    // Under People only who was met, seen or told of (M10.8): someone told the stranger of Lubbert.
    expect(engine.status().journal.people.find((p) => p.id === 'npc_lubbert')).toBeUndefined()
    ;(engine.state.player.sources ??= {})['npc_lubbert'] = [{ from: 'npc_aaltje', t: engine.world.now, level: 1 }]
    const j = engine.status().journal
    expect(j.people.find((p) => p.id === 'npc_aaltje')!.group).toBe('Veenhoek')
    expect(j.people.find((p) => p.id === 'npc_lubbert')!.group).toBe('Waagdam')
    // Towns before villages; the village itself heads its own places.
    const groups = [...new Set(j.places.map((p) => p.group))]
    expect(groups.indexOf('Waagdam')).toBeLessThan(groups.indexOf('Veenhoek'))
    expect(groups.at(-1)).toBe('Further afield')
    const veenhoek = j.places.filter((p) => p.group === 'Veenhoek')
    expect(veenhoek[0]!.id).toBe('area_veenhoek')
    expect(j.quests[0]).toMatchObject({ id: 'quest_grey_cat_on_the_doorstep', group: 'Open' })
    expect(j.lands.map((l) => l.name)).toContain('The Nethermarch')
    expect(engine.page('realm_terpwold')!.lines.join(' ')).toMatch(/Ruled by .*With the Nethermarch: tense/)
    engine.state.reputation = { fen_folk: 12 }
    expect(engine.status().journal.factions).toEqual([{ id: 'faction_fen_folk', name: 'The Fen-folk of the Kattenbroek', group: expect.any(String) }])
    expect(engine.page('faction_fen_folk')!.lines.join(' ')).toMatch(/You: .*\(12\)/)
    expect(engine.page('faction_goat_riders')).toBeUndefined()
  })
})

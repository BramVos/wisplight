import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Engine } from '../src/engine'
import { completionsHere } from '../src/engine/commands'
import { checkContent } from '../src/engine/content'
import { shutAway } from '../src/engine/exits'
import { regionMap } from '../src/engine/map/region'
import { entranceOn } from '../src/engine/map/travel'
import { planHere } from '../src/engine/plan'
import { loadContentFromDir } from '../src/node/content'
import { content } from './helpers'

const quietReach = await loadContentFromDir(join(import.meta.dirname, '../content'), 'quietreach')
const isle = await loadContentFromDir(join(import.meta.dirname, '../content'), 'isle')

// M10.31, the builder's items: F (the Nethermarch's peoples and money as what
// everyone knows), D (walking to a place you only heard of) and B (a hidden
// exit).

const said = (outs: { text: string }[]) => outs.map((o) => o.text).join('\n')

describe('M10.31 F: what everyone in the Nethermarch knows', () => {
  it('knows its peoples, its money, the Count\'s men, the town and the priory from the start', async () => {
    const engine = new Engine(content, { seed: 1 })
    engine.start()
    const known = engine.status().journal.lore.filter((l) => l.group === 'What you know of the world').map((l) => l.id)
    expect(known).toEqual(expect.arrayContaining(['the_fenfolk', 'the_dykelanders', 'the_heathborn', 'the_changelings', 'guilders_and_stuivers', 'the_counts_men', 'the_burghers_of_waagdam', 'the_priory']))
    expect(said(await engine.handle('recall veenvolk'))).toMatch(/The fenfolk are the people of the high fen/)
    expect(said(await engine.handle('recall stuivers'))).toMatch(/A guilder is twenty stuivers, and a stuiver is eight duiten/)
    expect(said(await engine.handle('recall the count\'s men'))).toMatch(/keep order and raise taxes/)
  })
})

describe('M10.31 D: walking to a place you only heard of', () => {
  it('goes as far as the places you know, then says which way you were pointed; a place never heard of stays unknown', async () => {
    const engine = new Engine(quietReach, { seed: 7 })
    engine.start()
    const heard = (id: string) => ((engine.state.player.journal ??= {})[id] = engine.world.now)
    expect(said(await engine.handle('walk to the hangar'))).toBe('You know no such place.')
    heard('loc_peregrine_hangar')
    expect(said(await engine.handle('walk to the hangar'))).toBe('Peregrine Hangar? Northeast from here, and on from there, they said.')
    heard('loc_workshop')
    expect(said(await engine.handle('walk to the hangar'))).toBe('Peregrine Hangar? Through Workshop, they said.')
    expect(engine.state.player.location).toBe('loc_arrival_lock')
    // Once the Workshop is seen, the walk goes that far.
    await engine.handle('northeast')
    await engine.handle('southwest')
    const walked = said(await engine.handle('walk to the hangar'))
    expect(engine.state.player.location).toBe('loc_workshop')
    // The hangar is the next step from there: the walk tries its door (the other session's playtest: one step more is
    // what the stranger means), and the door wants its code.
    expect(walked).toMatch(/The door is locked\. It wants a code\./)
  })

  it('takes the one step into a heard-of place next door, and TRAVEL TO a heard-of place takes the line that goes there', async () => {
    const engine = new Engine(quietReach, { seed: 7 })
    engine.start()
    await engine.handle('walk to the commons')
    const heard = (id: string) => ((engine.state.player.journal ??= {})[id] = engine.world.now)
    heard('loc_guest_quarters')
    expect(said(await engine.handle('walk to guest quarters'))).toMatch(/^Guest Quarters\n/)
    expect(engine.state.player.location).toBe('loc_guest_quarters')
    await engine.handle('south')
    // Orison Ridge only heard of: not "walk there first" while the Ridge Crawler goes there.
    const travel = said(await engine.handle('travel to orison ridge'))
    expect(travel).toMatch(/^You have only heard of Orison Ridge, and do not know the way on foot\.\nThe Crawler waits on its apron outside the Arrival Lock/)
  })
})

describe('M10.31 B: a secret way', () => {
  const room = 'loc_orison_listening_room'
  const exitsLine = (outs: { text: string }[]) => said(outs).match(/Exits: .*/)?.[0]

  it('keeps the hatch behind the consoles out of the exits, the plan, the completions and the people\'s ways until it is found', async () => {
    // The ridge as a hamlet, so that it has a plan of here.
    const areas = new Map(quietReach.areas)
    areas.set('orison_ridge', { ...areas.get('orison_ridge')!, kind: 'hamlet' })
    const engine = new Engine({ ...quietReach, areas }, { seed: 7, builder: true })
    engine.start()
    await engine.handle(`@goto ${room}`)
    const world = engine.world
    expect(exitsLine(await engine.handle('look'))).toBe('Exits: down')
    expect(said(await engine.handle('go in'))).toMatch(/^You can't go in from here\./)
    expect(said(await engine.handle('walk to the cable gallery'))).toMatch(/^You know no such place\./)
    expect(completionsHere(world, [])).not.toContain('in')
    // No plan of one place (M10.33 R), and nothing of the hatch on it either way.
    expect(planHere(world)?.boxes.find((b) => b.id === room)?.words ?? []).not.toContain('in')
    // People keep to the ordinary ways: no route into the gallery, found or not.
    expect(world.route(room, 'loc_orison_cable_gallery')).toBeUndefined()
    // The consoles hint at it; naming the spot finds it without a roll.
    expect(said(await engine.handle('look at consoles'))).toMatch(/cables drops out of sight through the floor/)
    expect(said(await engine.handle('search behind the consoles'))).toMatch(/a square hatch lies flush with the plating/)
    expect(exitsLine(await engine.handle('look'))).toBe('Exits: down, in')
    expect(completionsHere(world, [])).toContain('in')
    const arrived = said(await engine.handle('in'))
    expect(arrived).toMatch(/^Cable Gallery\n/)
    expect(arrived).toMatch(/newer cable|feed line/)
    expect(said(await engine.handle('look at splice'))).toMatch(/spliced into it, wrapped in bright tape/)
    await engine.handle('out')
    expect(planHere(world)?.links).toContainEqual({ from: room, to: 'loc_orison_cable_gallery' })
    expect(planHere(world)!.boxes.find((b) => b.id === room)!.words).toContain('in')
    // A replay finds it the same way.
    const replayed = await Engine.replay({ ...quietReach, areas }, 7, engine.save().log)
    expect(replayed.state.player.found).toContain(`exit:${room}/in`)
  })

  // Without a die since M10.33 Z: a plain SEARCH says where to look, and naming the spot finds the hatch.
  it('a plain SEARCH says where to look for the hatch', async () => {
    const engine = new Engine(quietReach, { seed: 3, builder: true })
    engine.start()
    await engine.handle(`@goto ${room}`)
    expect(said(await engine.handle('search'))).toMatch(/something here escapes you\. The cables behind the last console drop through the floor somewhere/)
    expect(exitsLine(await engine.handle('look'))).toBe('Exits: down')
    expect(said(await engine.handle('search behind the consoles'))).toMatch(/a square hatch/)
    expect(exitsLine(await engine.handle('look'))).toBe('Exits: down, in')
  })

  it('Skerrow: the cave behind the weed shows once the weed is parted', async () => {
    const engine = new Engine(isle, { seed: 2, builder: true })
    engine.start()
    await engine.handle('@goto loc_skerrow_tidepools')
    expect(exitsLine(await engine.handle('look'))).toBe('Exits: west, east, up')
    expect(said(await engine.handle('in'))).toMatch(/^You can't go in from here\./)
    expect(said(await engine.handle('part weed'))).toMatch(/a low cave mouth, black and booming/)
    expect(said(await engine.handle('pull weed'))).toMatch(/The weed hangs aside where you parted it/)
    expect(exitsLine(await engine.handle('look'))).toBe('Exits: west, east, up, in')
    expect(said(await engine.handle('in'))).toMatch(/^The Sea Cave\n/)
  })

  it('a walk over the land never comes out behind a secret way, and a walk to the ridge you are on stays put', async () => {
    // The other session's playtest: WALK TO ORISON RIDGE twice from the Commons came out in the Cable Gallery.
    expect(shutAway(quietReach, 'loc_orison_cable_gallery')).toBe(true)
    expect(shutAway(isle, 'loc_skerrow_sea_cave')).toBe(true)
    expect(shutAway(quietReach, room)).toBe(false)
    const engine = new Engine(quietReach, { seed: 7 })
    engine.start()
    const map = regionMap(quietReach)!
    expect(entranceOn(engine.world, map, map.locations.get('loc_orison_cable_gallery')!)).toBe(room)
    await engine.handle('walk to the commons')
    await engine.handle('walk to orison ridge')
    expect(engine.state.player.location).toBe(room)
    expect(said(await engine.handle('walk to orison ridge'))).toBe('You are already at Orison Ridge.')
    expect(engine.state.player.location).toBe(room)
  })

  it('Check: a secret way nothing reveals, and a hidden thing that reveals a way the place lacks', () => {
    const shelter = quietReach.locations.get('loc_ridge_shelter')!
    const locations = new Map(quietReach.locations)
    const [dir, exit] = Object.entries(shelter.exits)[0]!
    locations.set(shelter.id, {
      ...shelter,
      exits: { ...shelter.exits, [dir]: { ...exit, hidden: true } },
      hidden: [...shelter.hidden, { id: 'trapdoor', dc: 12, qty: 1, text: 'A trapdoor.', exit: 'down' }],
    } as never)
    const problems = checkContent({ ...quietReach, locations }).join('\n')
    expect(problems).toContain(`loc_ridge_shelter.exits.${dir}: a hidden way that nothing reveals`)
    expect(problems).toContain('loc_ridge_shelter.hidden.trapdoor: it reveals the way down, which the place does not have')
    // Both worlds' own secret ways are sound.
    expect(checkContent(quietReach).join('\n')).not.toMatch(/hidden way|reveals the way/)
    expect(checkContent(isle).join('\n')).not.toMatch(/hidden way|reveals the way/)
  })
})


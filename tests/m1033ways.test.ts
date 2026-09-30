import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Engine } from '../src/engine'
import { checkContent } from '../src/engine/content'
import { parseCommand } from '../src/engine/parser'
import { loadContentFromDir } from '../src/node/content'

// M10.33, the builder's part of "playable without a manual": X (arrived is
// arrived), Y (a path is named by the far place it reaches) and AD (small
// things from Bram's log of 30 September 2026). Causes, each fixed where it
// arises: see the comments at each test.

const quiet = await loadContentFromDir(join(import.meta.dirname, '../content'), 'quietreach')
const said = (outs: { text: string }[]) => outs.map((o) => o.text).join('\n')

function game(seed = 7) {
  const engine = new Engine(quiet, { seed, builder: true })
  engine.start()
  return engine
}

describe('M10.33 X: arrived is arrived', () => {
  // Cause: a walk's last stretch set the activity to "on the way to <the place it ends in>", and only the next step of
  // the plan, once the stretch was walked, cleared it. Fixed in the engine: the last stretch already says what comes next.
  it('says what someone does where they arrive, not that they are on their way there', async () => {
    const engine = game()
    const niko = engine.state.npcs['npc_niko_serrin']!
    Object.assign(niko, { location: 'loc_ridge_shelter', busyUntil: engine.world.now, plan: [{ kind: 'move', to: 'loc_orison_listening_room' }, { kind: 'spend', minutes: 60, activity: 'work' }] })
    engine.tick(1)
    expect(niko.location).toBe('loc_orison_listening_room')
    expect(niko.activity).toBe('at work')
  })
})

describe('M10.33 Y: a path is named by where it leads', () => {
  // Cause: the Quiet Reach's paths run by points, not by place ids, so the far end of a path had no name and the path
  // went by its own name, "the path to the Coastal Traverse", for someone standing in the Coastal Traverse. Fixed in the
  // engine: a point that lies on a place is that place, and the place you stand in is never where a path leads.
  it('offers the path to Port Vesper from the coast, and says where the walk comes out', async () => {
    const engine = game()
    await engine.handle('@goto loc_coastal_service_path')
    const offered = said(await engine.handle('follow'))
    expect(offered).toContain('the path to Port Vesper')
    expect(offered).not.toContain('the Coastal Traverse')
    expect(said(await engine.handle('1'))).toMatch(/You come to Arrival Lock, in Port Vesper\./)
  })
})

describe('M10.33 AD: small things from the log', () => {
  it('T is TALK, as X is EXAMINE', () => {
    expect(parseCommand('t mara')).toMatchObject({ verb: 'talk', args: ['mara'] })
  })

  // Cause: WEAR was a verb of the rules for characters only, and the rain soaked whoever stood in it, whatever they wore.
  // Fixed in the engine for every world: a thing tagged clothing is worn, one tagged rainproof keeps the rain out; the
  // Quiet Reach's coat is rainproof, and so is Skerrow's sealskin jerkin (as armour).
  it('WEAR puts on a coat from the pack in a world without rules, and a rainproof coat keeps you dry', async () => {
    const engine = game()
    await engine.handle('@goto loc_coastal_service_path')
    ;(engine.state as { weather?: unknown }).weather = { ...(engine.state.weather ?? {}), kind: 'rain' }
    expect(said(await engine.handle('look me'))).toMatch(/soaked to the skin/)
    expect(said(await engine.handle('wear coat'))).toBe('You put on the weatherproof coat. The rain will not get through it.')
    expect(said(await engine.handle('look me'))).toMatch(/dry under your weatherproof coat/)
    expect(said(await engine.handle('i'))).toMatch(/You wear the weatherproof coat\./)
    expect(said(await engine.handle('take off the coat'))).toBe('You take off the weatherproof coat.')
    expect(said(await engine.handle('look me'))).toMatch(/soaked to the skin/)
  })

  it('Check: something rainproof that nobody can wear', () => {
    const items = new Map(quiet.items)
    items.set('field_lamp', { ...items.get('field_lamp')!, tags: [...items.get('field_lamp')!.tags, 'rainproof'] })
    expect(checkContent({ ...quiet, items })).toContain('item field_lamp: rainproof, but nobody can wear it (tag clothing, or armour)')
    expect(checkContent(quiet).join('\n')).not.toMatch(/rainproof/)
  })

  // Cause: FOLLOW only knew the ways over land. Fixed in the engine: a person seen leaving by an exit is followed by it.
  it('FOLLOW <person> takes the way they were seen to go, up the ridge too', async () => {
    const engine = game()
    await engine.handle('@goto loc_ridge_shelter')
    const niko = engine.state.npcs['npc_niko_serrin']!
    Object.assign(niko, { location: 'loc_orison_listening_room', left: { location: 'loc_ridge_shelter', t: engine.world.now - 5, direction: 'up' }, busyUntil: engine.world.now + 60 })
    expect(said(await engine.handle('follow niko'))).toMatch(/^Orison Listening Room\n/)
    expect(said(await engine.handle('follow niko'))).toMatch(/is right here\./)
    expect(said(await engine.handle('follow tessa'))).toMatch(/^You did not see which way the chief engineer went from here\. TRACK may find the signs\.$/)
  })
})

describe('M10.33 Z: search without a die, and a way by what it is called', () => {
  // Cause: SEARCH rolled a die on something free and endlessly repeatable, so Bram searched twenty times in a row until
  // the number was right; and a way knew only its direction, so OPEN HATCH said there was no hatch and GO DOWN THE
  // LADDER took the stairs. Fixed in the engine for every world (the eye is Perception plus ten; a way has words), and
  // in the content of all three worlds (every hidden thing has words and helps; the ways that are a thing have words).
  it('finds what the eye reaches, says where to look for what it does not, and is honest when nothing is hidden', async () => {
    const engine = game()
    await engine.handle('@goto loc_orison_listening_room')
    const first = said(await engine.handle('search')).split('\n')[0]
    expect(first).toMatch(/^You search the place well, but something here escapes you\. The cables behind the last console drop through the floor somewhere\./)
    expect(first).not.toMatch(/\(Perception/)
    // The same answer again: no die to try twice.
    expect(said(await engine.handle('search')).split('\n')[0]).toBe(first)
    expect(said(await engine.handle('open hatch'))).not.toMatch(/Cable Gallery/)
    expect(said(await engine.handle('search behind the consoles'))).toMatch(/a square hatch/)
    expect(said(await engine.handle('open the hatch'))).toMatch(/^Cable Gallery\n/)
    expect(said(await engine.handle('search')).split('\n')[0]).toBe('You search the place well. Nothing here is hidden from you.')
    expect(said(await engine.handle('climb up the ladder'))).toMatch(/^Orison Listening Room\n/)
    expect(said(await engine.handle('go down the ladder'))).toMatch(/^Cable Gallery\n/)
    expect(said(await engine.handle('up the ladder'))).toMatch(/^Orison Listening Room\n/)
    // GO DOWN alone takes the way down: the stairs.
    expect(said(await engine.handle('go down'))).toMatch(/^Ridge Shelter\n/)
    expect(said(await engine.handle('climb the route'))).toMatch(/^Orison Listening Room\n/)
  })

  it('asks which way when a word fits two, and Check wants words for what a sharp eye alone finds', async () => {
    const room = quiet.locations.get('loc_orison_listening_room')!
    const locations = new Map(quiet.locations)
    locations.set(room.id, { ...room, exits: { ...room.exits, down: { ...room.exits.down!, words: ['ladder', 'stairs'] } }, hidden: [...room.hidden, { id: 'nook', dc: 14, qty: 1, text: 'A nook.' }] } as never)
    const twice = { ...quiet, locations }
    expect(checkContent(twice)).toContain('loc_orison_listening_room.hidden.nook: only a sharp eye finds it (Perception plus ten against 14): give it words, what the stranger names to find it, and helps, where to look')
    for (const world of [quiet]) expect(checkContent(world).join('\n')).not.toMatch(/only a sharp eye/)
    const engine = new Engine(twice, { seed: 7, builder: true })
    engine.start()
    await engine.handle('@goto loc_orison_listening_room')
    await engine.handle('search behind the consoles')
    expect(said(await engine.handle('climb down the ladder'))).toMatch(/^Which way\?\n {2}1\. down: Ridge Shelter\n {2}2\. in: Cable Gallery/)
  })
})

describe('M10.33 M: someone is there when the stranger comes in', () => {
  // Cause, in the engine: a new game put everyone at home, whatever their day said, and the Quiet Reach began at 08:00,
  // on the minute everyone walked from the Guest Quarters through the Commons to work. Fixed for every world: a new game
  // puts everyone where their day puts them at the start minute. In the world maker: Check says who is at the first
  // scene and for how long, and the step Calendar asks for a start in the middle of a block. In the content: the Quiet
  // Reach begins at 07:05, at breakfast.
  it('begins with breakfast in the Commons and Mara at the lock, and they stay a while', async () => {
    const engine = new Engine(quiet, { seed: 7 })
    engine.start()
    const at = (id: string) => engine.state.npcs[id]!.location
    expect(at('npc_mara_venn')).toBe('loc_arrival_lock')
    for (const id of ['npc_tessa_rook', 'npc_niko_serrin', 'npc_edda_vale', 'npc_ilyan_sorell', 'npc_sana_holt']) expect(at(id)).toBe('loc_commons')
    expect(said(await engine.handle('east'))).toMatch(/Here: .*(Tessa|the chief engineer)/)
    // Fed, they linger at the table until the meal is over (07:45).
    engine.tick(30)
    expect(engine.world.npcsAt('loc_commons').length).toBeGreaterThanOrEqual(4)
  })

  it('Check: a first scene everyone leaves within half an hour', async () => {
    const { warnings, startScene } = await import('../src/engine/builder')
    expect(startScene(quiet).find((s) => s.place === 'loc_commons')!.people).toHaveLength(5)
    expect(warnings(quiet).filter((w) => /At the start/.test(w))).toEqual([])
    const late = { ...quiet, world: { ...quiet.world, start: { ...quiet.world.start, hour: 7, minute: 40 } } }
    // At 07:40 Mara is still at the lock for over an hour, so the scene holds; at 21:50 everyone goes to bed.
    expect(warnings(late).filter((w) => /At the start/.test(w))).toEqual([])
    const night = { ...quiet, world: { ...quiet.world, start: { ...quiet.world.start, hour: 23, minute: 30 } } }
    expect(warnings(night).find((w) => /At the start/.test(w))).toMatch(/^At the start \(23:30\) nobody is at Arrival Lock or Commons: the first scene is empty\./)
  })
})

describe('M10.33 L: directions and areas fit', () => {
  // Cause, in the world maker: nothing checked that the ways fit one plan, or that an area is what you walk through
  // indoors, so the world build cut one station in two areas and gave the lock a way northeast to the Workshop while
  // the Commons, east of the lock, went east to it. Fixed at the source: a Check, and the Places step and the contract
  // say how areas and directions go.
  it('names the ways that do not fit one plan, and one settlement in two areas', async () => {
    const { directionProblems } = await import('../src/engine/builder')
    const found = directionProblems(quiet)
    expect(found).toContain('Commons east to Workshop, which lies north of it by the other ways: the ways do not fit one plan')
    expect(found).toContain('Port Vesper and Vesper Works: one settlement in two areas (Arrival Lock and Workshop, 4 minutes indoors); an area is what you walk through indoors')
    const { content } = await import('./helpers')
    const isle = await loadContentFromDir(join(import.meta.dirname, '../content'), 'isle')
    expect(directionProblems(content)).toEqual([])
    expect(directionProblems(isle)).toEqual([])
  })
})

describe('M10.33 H: HELP of this world', () => {
  // Cause: HELP was one fixed text for every world (PRAY in a world without faith, USE OVEN BAKE where nothing is
  // baked, "Dutch works too" in an English world). Fixed in the engine: HELP is built from what the world has.
  it('begins with five things, and speaks of what this world has, in its own words', async () => {
    const engine = game()
    const help = said(await engine.handle('help'))
    expect(help).toMatch(/^Five things to start with:\n {2}LOOK \(L\)/)
    expect(help).toMatch(/More: HELP MOVING, HELP TALK, HELP JOURNAL, HELP THINGS, HELP YOU, HELP GAME\.$/)
    expect(help).not.toMatch(/Dutch works too|HELP FIGHTS/)
    const things = said(await engine.handle('help things'))
    // The Quiet Reach says HACK for PICK, and has clothes.
    expect(things).toMatch(/hack <door or chest> \(the lock\)/)
    expect(things).toMatch(/wear <clothes>/)
    expect(said(await engine.handle('help moving'))).toMatch(/Lines here: Ridge Crawler, up to Orison/)
    // No rules for characters: no SHEET or LEVEL UP; faith without patrons: PRAY only.
    const you = said(await engine.handle('help you'))
    expect(you).not.toMatch(/level up|devote/)
    expect(you).toMatch(/Faith: pray\./)
    const { content } = await import('./helpers')
    const nether = new Engine(content, { seed: 1 })
    nether.start()
    expect(said(await nether.handle('help'))).toMatch(/HELP FIGHTS/)
    expect(said(await nether.handle('help you'))).toMatch(/level up.*\nFaith: pray, devote to <patron>, rite\./)
  })
})

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

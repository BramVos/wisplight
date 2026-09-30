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

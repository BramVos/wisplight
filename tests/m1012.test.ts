import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Engine, GameClock, loadContent, weekdayName, type Output } from '../src/engine'
import type { World } from '../src/engine/world'
import { blessed } from '../src/engine/rules/blessings'
import { centre } from '../src/engine/map/hexgrid'
import { regionMap } from '../src/engine/map/region'
import { farPlaceOf } from '../src/engine/growth/far'
import { landMapData } from '../src/engine/map/known'
import { loadContentFromDir, readContentFiles } from '../src/node/content'
import { content } from './helpers'

// Milestone M10.12 (docs/ROADMAP.md): travel over the land map. Lines of
// transport are content (passages.yaml); a journey of days plays the world
// on; the land map and TRAVEL TO show the ways to a far place.

const root = join(import.meta.dirname, '../content')
const isle = await loadContentFromDir(root, 'isle')
const said = (out: Output[]) => out.map((o) => o.text).join('\n')
const at = (engine: Engine, day: number, hour: number, minute = 0) => engine.tick(GameClock.from(211, 9, day, hour, minute).minutes - engine.world.now)

// The barge as it was in the code before M10.12, word for word, to compare the new one with.
function oldBarge(world: World, destination: string | undefined, pass: (minutes: number) => void): Output[] {
  const STOPS = ['loc_oude_zijl_sluice', 'loc_veenhoek_quay', 'loc_waagdam_harbour']
  const FARE = 16
  const duration = (minutes: number) => {
    if (minutes < 60) return `${minutes} minutes`
    const hours = Math.floor(minutes / 60)
    const rest = minutes % 60
    return `${hours === 1 ? 'an hour' : `${hours} hours`}${rest >= 10 ? ` and ${rest} minutes` : ''}`
  }
  const here = world.state.player.location
  if (!STOPS.every((stop) => world.content.locations.has(stop))) return [{ kind: 'error', text: 'There is no barge here.' }]
  if (!STOPS.includes(here)) return [{ kind: 'error', text: 'The barge stops at the quay in Veenhoek, the harbour in Waagdam and the sluice at Oude Zijl.' }]
  const day = weekdayName(world.now, world.calendar)
  const hour = new GameClock(world.now).parts.hour
  if ((day !== 'Maandag' && day !== 'Donderdag') || hour < 7 || hour >= 17) return [{ kind: 'text', text: 'No barge today. It runs on Maandag and Donderdag, from first light until the afternoon.' }]
  if (!destination) return [{ kind: 'error', text: 'Take the barge where? Oude Zijl, Veenhoek or Waagdam.' }]
  const to = STOPS.find((stop) => world.location(stop).area === destination || world.location(stop).name.toLowerCase().includes(destination) || world.content.areas.get(world.location(stop).area)?.name.toLowerCase() === destination)
  if (!to || to === here) return [{ kind: 'error', text: 'The barge stops at Oude Zijl, Veenhoek and Waagdam.' }]
  if (world.state.player.money < FARE) return [{ kind: 'text', text: `The bargeman wants ${world.money(FARE)}, and you do not have it.` }]
  const map = regionMap(world.content)!
  const a = centre(map.locations.get(here)!, map.size)
  const b = centre(map.locations.get(to)!, map.size)
  const fair = blessed(world.content, world.state.player.character, 'Fair Wind') ? 0.75 : 1
  const minutes = Math.round((Math.hypot(b[0] - a[0], b[1] - a[1]) / 6) * 60 * fair) + 15
  world.state.player.money -= FARE
  pass(minutes)
  world.state.player.location = to
  return [{ kind: 'narration', text: `You pay ${world.money(FARE)} and sit among sacks of grain while the horse plods along the tow path. After ${duration(minutes)} you step ashore at ${world.location(to).name}.` }]
}

describe('M10.12: the barge is content, and does what it did', () => {
  const cases: { name: string; day: number; hour: number; where: string; to: string; money?: number }[] = [
    { name: 'Veenhoek to Waagdam on Donderdag', day: 16, hour: 9, where: 'loc_veenhoek_quay', to: 'waagdam' },
    { name: 'Waagdam to Oude Zijl', day: 16, hour: 14, where: 'loc_waagdam_harbour', to: 'oude zijl' },
    { name: 'Oude Zijl to the quay, by its name', day: 16, hour: 8, where: 'loc_oude_zijl_sluice', to: 'the quay' },
    { name: 'on a Dinsdag', day: 14, hour: 9, where: 'loc_veenhoek_quay', to: 'waagdam' },
    { name: 'after five', day: 16, hour: 18, where: 'loc_veenhoek_quay', to: 'waagdam' },
    { name: 'without the fare', day: 16, hour: 9, where: 'loc_veenhoek_quay', to: 'waagdam', money: 5 },
    { name: 'from the green', day: 16, hour: 9, where: 'loc_veenhoek_green', to: 'waagdam' },
  ]
  for (const c of cases) {
    it(c.name, async () => {
      const make = () => {
        const engine = new Engine(content, { seed: 4, builder: true })
        at(engine, c.day, c.hour)
        engine.state.player.location = c.where
        if (c.money !== undefined) engine.state.player.money = c.money
        return engine
      }
      const before = make()
      // As the engine gave it the words: without "the".
      const old = oldBarge(before.world, c.to.replace(/^the\s+/, ''), (m) => before.tick(m))
      const now = make()
      const out = await now.handle(`take the barge to ${c.to}`)
      // The same ride; when it does not go, the same words, and now also when the next one leaves (M10.12).
      expect(out[0]!.kind).toBe(old[0]!.kind)
      expect(out[0]!.text.startsWith(old[0]!.text)).toBe(true)
      expect(now.state.player.location).toBe(before.state.player.location)
      expect(now.state.player.money).toBe(before.state.player.money)
      expect(now.world.now).toBe(before.world.now)
    })
  }

  it('a world without a barge says so', async () => {
    const engine = new Engine(isle, { seed: 1 })
    expect(said(await engine.handle('take barge'))).toBe('There is no barge here.')
  })
})

describe('M10.12: a journey of days', () => {
  it('the barge goes on to Graafhaven: two days away, the world playing on, told as one paragraph', async () => {
    const engine = new Engine(content, { seed: 4, builder: true })
    at(engine, 16, 9)
    engine.state.player.location = 'loc_veenhoek_quay'
    engine.state.player.money = 100
    const start = engine.world.now
    const out = await engine.handle('take the barge to graafhaven')
    const far = farPlaceOf(engine.world, 'graafhaven')!
    expect(engine.state.player.location).toBe((far.locations[0] as { id: string }).id)
    expect(engine.state.player.money).toBe(40)
    expect(engine.world.now - start).toBeGreaterThan(2400)
    const journey = out.find((o) => o.journey)!
    expect(journey.text).toMatch(/^You pay .+ and travel by the barge on the Graafse Vaart from Veenhoek to Graafhaven\. It takes /)
    expect(journey.text).toMatch(/You come to The Gate of Graafhaven\.$/)
    // A line in the journal, on the page of the land.
    expect(engine.page('land')!.lines.join('\n')).toMatch(/YOUR JOURNEYS\n {2}Donderdag 16 Herfstmaand: by the barge on the Graafse Vaart from Veenhoek to Graafhaven, /)
    // And back again: from the gate of Graafhaven the barge goes home.
    at(engine, 23, 9)
    engine.state.player.money = 100
    const home = await engine.handle('take the barge to veenhoek')
    expect(home.find((o) => o.journey)?.text).toMatch(/from Graafhaven to Veenhoek/)
    expect(engine.state.player.location).toBe('loc_veenhoek_quay')
  })

  it('the coach leaves at eight: who is early waits, who is late waits for the next', async () => {
    const engine = new Engine(content, { seed: 4, builder: true })
    at(engine, 14, 10) // Dinsdag, too late
    engine.state.player.location = 'loc_waagdam_east_gate'
    engine.state.player.money = 200
    expect(said(await engine.handle('take the coach to zwolderkamp'))).toMatch(/The coach to Zwolderkamp goes on Dinsdag and Vrijdag at eight in the morning\. The next leaves on Vrijdag at 08:00: WAIT FOR THE COACH\./)
    const waited = said(await engine.handle('wait for the coach'))
    expect(waited).toMatch(/and the coach comes in\./)
    expect(new GameClock(engine.world.now).parts).toMatchObject({ day: 17, hour: 8, minute: 0 })
    const out = await engine.handle('take the coach to zwolderkamp')
    expect(out.find((o) => o.journey)?.text).toMatch(/travel by the coach on the Oostweg from Waagdam to Zwolderkamp\. It takes 20 hours/)
    expect(engine.state.player.location).toBe('loc_zwolderkamp_gate')
  })

  it('TRAVEL TO offers the ways there, and the land map has them as buttons', async () => {
    const engine = new Engine(content, { seed: 4, builder: true })
    at(engine, 15, 9)
    engine.state.player.location = 'loc_waagdam_east_gate'
    engine.state.player.journal = { ...(engine.state.player.journal ?? {}), zwolderkamp: engine.world.now, graafhaven: engine.world.now }
    const out = said(await engine.handle('travel to zwolderkamp'))
    expect(out).toMatch(/How do you want to travel to Zwolderkamp\?\n {2}1\. On foot, by the road out of the region\n {2}2\. The coach on the Oostweg from Waagdam: next on Vrijdag at 08:00, 20 hours, /)
    const land = landMapData(engine.world)!
    const graafhaven = land.places.find((p) => p.name === 'Graafhaven')!
    expect(graafhaven.ways?.map((w) => w.command)).toEqual(['travel to Graafhaven on foot', 'travel to Graafhaven by barge'])
    // On foot: days on the road, the gate at the end.
    const walked = await engine.handle('travel to zwolderkamp on foot')
    expect(walked.find((o) => o.journey)?.text).toMatch(/^You set out on foot from The East Gate for Zwolderkamp, east\. It takes 2 days\./)
    expect(engine.state.player.location).toBe('loc_zwolderkamp_gate')
  })
})

describe('M10.12: Skerrow has its packet', () => {
  it('no ship while the Lamp is out; with it lit, the packet to Havenmoor, over the sea, where no road goes', async () => {
    const engine = new Engine(isle, { seed: 1, builder: true })
    engine.state.player.location = 'loc_skerrow_harbour'
    engine.state.player.money = 500
    expect(said(await engine.handle('take the packet to havenmoor'))).toMatch(/^No ship has called at Skerrow since the Lamp went out\./)
    await engine.handle('@flag beacon_burning')
    const next = said(await engine.handle('take the packet to havenmoor'))
    expect(next).toMatch(/^The packet sails for Havenmoor on Tidesday and Starday at eight in the morning\. The next leaves on (Tidesday|Starday) at 08:00: WAIT FOR THE PACKET\./)
    await engine.handle('wait for the packet')
    const out = await engine.handle('take the packet to havenmoor')
    expect(out.find((o) => o.journey)?.text).toMatch(/travel by the Havenmoor packet from Skerrow Hythe to Havenmoor\. It takes 2 days/)
    const far = farPlaceOf(engine.world, 'havenmoor')!
    expect(far.link.by).toBe('havenmoor_packet')
    expect(engine.world.location(engine.state.player.location).name).toBe('The Quay of Havenmoor')
    // No road home: the harbour has no new exit, and walking there is refused.
    expect(Object.values(engine.content.locations.get('loc_skerrow_harbour')!.exits).some((e) => e?.to === engine.state.player.location)).toBe(false)
  })
})

describe('M10.12: content is checked', () => {
  it('a stop that is nothing, or a day that is not a day of the world, does not load', async () => {
    const files = await readContentFiles(root, 'isle')
    const broken = files.map((f) => (f.path.endsWith('passages.yaml') ? { ...f, text: f.text.replace('stops: [loc_skerrow_harbour, havenmoor]', 'stops: [loc_skerrow_harbour, atlantis]').replace('days: [Tidesday, Starday]', 'days: [Monday]') } : f))
    expect(() => loadContent(broken)).toThrow(/passage havenmoor_packet: stop atlantis is no place or topic[\s\S]*Monday is no weekday of this world/)
  })
})

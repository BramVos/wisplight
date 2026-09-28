import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { argv, stdout } from 'node:process'
import { Engine, MINUTES_PER_DAY, type WorldEvent } from '../engine'
import { loadContentFromDir } from '../node/content'
import { mayBeStuck } from '../engine/playtest'

// Runs the region without a player and reports what happened:
//   npm run sim -- --days 7 [--seed 3] [--follow npc_mirte] [--quiet] [--world isle | --world other]
// Exits with code 1 when an invariant breaks (a crash, a starving or stuck NPC).

const args = argv.slice(2)
const option = (name: string, fallback: string) => {
  const index = args.indexOf(`--${name}`)
  return index >= 0 ? (args[index + 1] ?? fallback) : fallback
}
const days = Number(option('days', '7'))
const seed = Number(option('seed', '1'))
const follow = option('follow', '')
const quiet = args.includes('--quiet')
const worldFolder = option('world', 'base')

// A world from content/, or a test world from tests/worlds (M10.17: --world other is Deepwell).
const contentRoot = resolve(import.meta.dirname, '../../content')
const content = await loadContentFromDir(existsSync(resolve(contentRoot, worldFolder)) ? contentRoot : resolve(import.meta.dirname, '../../tests/worlds'), worldFolder)
const engine = new Engine(content, { seed })
const world = engine.world
const problems: string[] = []
const lastMove = new Map<string, { location: string; activity: string; since: number }>()

const print = (line: string) => {
  if (!quiet) stdout.write(`${line}\n`)
}

let lastSeq = 0
for (let day = 1; day <= days; day++) {
  for (let hour = 0; hour < 24; hour++) {
    try {
      engine.tick(60)
    } catch (error) {
      problems.push(`Crash on day ${day}, hour ${hour}: ${(error as Error).stack}`)
      break
    }
    for (const [id, npc] of Object.entries(world.state.npcs)) {
      if (npc.needs.hunger === 0) problems.push(`${id} is starving on day ${day} (${world.date()})`)
      const seen = lastMove.get(id)
      const key = { location: npc.location, activity: npc.activity }
      if (!seen || seen.location !== key.location || seen.activity !== key.activity) lastMove.set(id, { ...key, since: world.now })
      // The same rule as the editor's playtest (M10): creatures without a day and whoever is far off do not count.
      else if (world.now - seen.since > 16 * 60 && mayBeStuck(world, id)) problems.push(`${id} stuck at ${npc.location} (${npc.activity}) since ${world.date(seen.since)}`)
    }
    const fresh: WorldEvent[] = world.state.events.filter((e) => e.seq > lastSeq)
    lastSeq = world.state.eventSeq
    if (follow) {
      for (const e of fresh.filter((e) => e.actor === follow && e.kind !== 'depart' && e.kind !== 'arrive')) {
        print(`  ${world.date(e.t).padEnd(42)} ${e.text}`)
      }
    }
  }

  print(`\n== Day ${day}: ${world.date(world.now - 1).split(',')[0]}`)
  // The Nethermarch's grain and bread; every world gets its shops' stock.
  const store = world.content.locations.has('loc_waagdam_graanhandel') ? world.service('loc_waagdam_graanhandel', 'grain_store') : undefined
  if (store) {
    const grain = world.stock('loc_waagdam_graanhandel', 'grain_store')
    print(`  grain store: rye ${grain['rye_grain'] ?? 0} at ${world.money(world.price('loc_waagdam_graanhandel', store, 'rye_grain'))}, flour ${grain['flour'] ?? 0} at ${world.money(world.price('loc_waagdam_graanhandel', store, 'flour'))}`)
    const bakery = world.stock('loc_veenhoek_bakery', 'bakery_counter')
    print(`  bakery: ${bakery['rye_bread'] ?? 0} loaves; peat sheds: ${world.stock('loc_peat_sheds', 'peat_store')['peat'] ?? 0} baskets; eel stall: ${world.stock('loc_veenhoek_quay', 'eel_stall')['eel'] ?? 0}`)
  } else {
    const shops = [...world.content.locations.values()].flatMap((l) => l.services.map((s) => `${s.id} ${JSON.stringify(world.stock(l.id, s.id))}`))
    print(`  shops: ${shops.join('; ')}`)
  }
  const requests = world.state.requests.filter((r) => r.status === 'open').map((r) => `${r.npc} wants ${r.qty} ${r.item}`)
  if (requests.length) print(`  requests: ${requests.join('; ')}`)
  const today = (world.state.news?.facts ?? []).filter((f) => f.t > world.now - MINUTES_PER_DAY && f.t <= world.now)
  if (today.length) print(`  news: ${today.map((f) => `${f.title} (belang ${f.belang}, ${Object.values(world.state.news!.heard).filter((h) => h[f.id]).length} know)`).join('; ')}`)
  const low = Object.entries(world.state.npcs)
    .filter(([, n]) => Object.values(n.needs).some((v) => v < 15))
    .map(([id, n]) => `${id} ${JSON.stringify(n.needs)}`)
  if (low.length) print(`  low needs: ${low.join(' | ')}`)
  if (world.now % MINUTES_PER_DAY !== 0 && !quiet) print('')
}

const unique = [...new Set(problems)]
if (unique.length > 0) {
  stdout.write(`\n${unique.length} problem(s):\n${unique.slice(0, 30).map((p) => `- ${p}`).join('\n')}\n`)
  process.exitCode = 1
} else {
  stdout.write(`\nNo problems in ${days} day(s).\n`)
}

import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { argv, stdout } from 'node:process'
import { performance } from 'node:perf_hooks'
import { Engine, minuteOfDay, MockLlm, type Content } from '../src/engine'
import { loadContentFromDir } from '../src/node/content'
import { regionMap } from '../src/engine/map/region'
import { SaveStore } from '../src/node/savegame'

// Does the interface stutter (M9.3)? The app's main process runs the engine: a
// tick a second, an autosave every ten game minutes, and the player's commands.
// While one of those runs, the window waits for its answer. This plays some
// days as the app does and measures the longest waits: an ordinary minute, the
// change of day, a journey, and an autosave (a checkpoint, or only the tail).
// With --model, the mock model answers and its answers are worked in, as the
// app does after each tick: the chronicler, goal choices and outlines.
// npm run stutter -- [--days 3] [--world isle] [--extra 100] [--model]

const args = argv.slice(2)
const option = (name: string, fallback: string) => {
  const index = args.indexOf(`--${name}`)
  return index >= 0 ? (args[index + 1] ?? fallback) : fallback
}
const days = Number(option('days', '3'))
const extra = Number(option('extra', '0'))
const world = option('world', 'base')
// What the player notices: an answer within 50 ms feels at once (FO, chapter 18).
const BUDGET_MS = 50

let content = await loadContentFromDir(resolve(import.meta.dirname, '../content'), world)
if (extra > 0) {
  // More people than the world has, living where people live.
  const npcs = new Map(content.npcs)
  // Villagers: people with a household, not the spirits of the fen.
  const villagers = [...content.npcs.values()].filter((n) => n.household)
  const template = villagers[0] ?? [...content.npcs.values()][0]!
  const homes = [...new Set(villagers.map((n) => n.home))]
  for (let i = 0; i < extra; i++) npcs.set(`npc_x${i}`, { ...template, id: `npc_x${i}`, name: `Extra Person${i}`, short: `Person${i}`, aliases: [`person${i}`], relations: [], household: undefined, home: homes[i % homes.length]!, work: undefined })
  content = { ...content, npcs } as Content
}
const model = args.includes('--model')
const engine = new Engine(content, { seed: 1, ...(model ? { llm: new MockLlm('good') } : {}) })
engine.start()
const dir = mkdtempSync(join(tmpdir(), 'wisplight-stutter-'))
const store = new SaveStore(join(dir, 'saves.sqlite'))

const waits: Record<string, number[]> = { minute: [], 'day change': [], journey: [], 'model answers': [], 'autosave, checkpoint': [], 'autosave, tail': [] }
const timed = async <T>(kind: string, f: () => T | Promise<T>): Promise<T> => {
  const t = performance.now()
  const result = await f()
  waits[kind]!.push(performance.now() - t)
  return result
}
const time = (kind: string, f: () => unknown) => timed(kind, f)
const journeys: string[] = []

// Somewhere to travel to: the other end of the world, as if visited before.
const areas = [...content.areas.keys()]
const far = world === 'base' ? ['waagdam', 'veenhoek'] : [areas.at(-1)!, areas[0]!]
const farName = (id: string) => content.areas.get(id)?.name ?? id
// A world without a region map (Skerrow) is walked room by room: no journeys.
const hasMap = Boolean(regionMap(content))
engine.state.player.visited = [...new Set([...(engine.state.player.visited ?? []), ...far])]

let sinceSave = 0
for (let minute = 0; minute < days * 24 * 60; minute++) {
  const dayChange = minuteOfDay(engine.world.now + 1) === 4 * 60 || minuteOfDay(engine.world.now + 1) === 0
  await time(dayChange ? 'day change' : 'minute', () => engine.tick(1))
  if (model && engine.modelsWaiting > 0) await time('model answers', () => engine.runModels())
  if (++sinceSave >= 10) {
    sinceSave = 0
    const saved = engine.saved()
    await time(saved.tail.length ? 'autosave, tail' : 'autosave, checkpoint', () => store.save('auto', saved))
  }
  // Twice a day the player sets off for the other end of the world: on foot the first day, then by the known road.
  if (hasMap && minute % (12 * 60) === 6 * 60) {
    const n = Math.floor(minute / (12 * 60))
    const out = await timed('journey', () => engine.handle(`${n < 2 ? 'walk' : 'travel'} to ${farName(far[n % 2]!)}`))
    journeys.push(`${out[0]?.text.split('.')[0] ?? ''}.`)
  }
}
store.close()
rmSync(dir, { recursive: true, force: true })

// The autosave's checkpoint is taken in saved(), before the store writes: measure it apart.
const checkpoints: number[] = []
for (let i = 0; i < 5; i++) {
  engine.tick(24 * 60)
  const t = performance.now()
  engine.saved()
  checkpoints.push(performance.now() - t)
}
waits['taking a checkpoint'] = checkpoints

const pct = (list: number[], p: number) => [...list].sort((a, b) => a - b)[Math.min(list.length - 1, Math.floor((p / 100) * list.length))] ?? 0
stdout.write(`${world}, ${Object.keys(engine.state.npcs).length} people, ${days} days${model ? ', mock model' : ''}, budget ${BUDGET_MS} ms\n`)
stdout.write('what                    count   p50 ms  p99 ms  max ms\n')
let over = 0
for (const [kind, list] of Object.entries(waits)) {
  if (!list.length) continue
  const max = Math.max(...list)
  if (max > BUDGET_MS) over++
  stdout.write(`${kind.padEnd(24)}${String(list.length).padEnd(8)}${pct(list, 50).toFixed(2).padEnd(8)}${pct(list, 99).toFixed(2).padEnd(8)}${max.toFixed(1)}${max > BUDGET_MS ? '  OVER' : ''}\n`)
}
stdout.write(over ? `${over} kind(s) over the budget.\n` : 'Nothing over the budget.\n')
stdout.write(hasMap ? `Journeys: ${[...new Set(journeys)].join(' ')}\n` : 'No region map, so no journeys.\n')

import { resolve } from 'node:path'
import { argv, stdout } from 'node:process'
import { performance } from 'node:perf_hooks'
import { Engine, MINUTES_PER_DAY } from '../src/engine'
import { loadContentFromDir } from '../src/node/content'

// A long game without a player (M9.1): what loading, saving and passing on news
// cost after so many days. npm run longrun -- --days 300 [--every 30] [--world isle]
// Since M9.3 also a checkpoint, and an autosave an hour after it: only the tail.

const args = argv.slice(2)
const option = (name: string, fallback: string) => {
  const index = args.indexOf(`--${name}`)
  return index >= 0 ? (args[index + 1] ?? fallback) : fallback
}
const days = Number(option('days', '300'))
const every = Number(option('every', '30'))
const content = await loadContentFromDir(resolve(import.meta.dirname, '../content'), option('world', 'base'))
const engine = new Engine(content, { seed: Number(option('seed', '1')) })
let archived = 0
engine.onLog((line) => {
  if (line.kind === 'archive') archived += line.archived.facts.length + line.archived.plans.length + line.archived.signals.length
})

const time = (f: () => void) => {
  const t = performance.now()
  f()
  return performance.now() - t
}
stdout.write('day  facts  archived  heard   save kB  save ms  load ms  news-day ms  checkpoint ms  autosave ms  tail B\n')
for (let day = 1; day <= days; day++) {
  const tick = time(() => engine.tick(MINUTES_PER_DAY))
  if (day % every !== 0) continue
  let text = ''
  const save = time(() => (text = JSON.stringify(engine.save())))
  const load = time(() => Engine.fromSave(content, JSON.parse(text)))
  const news = engine.state.news!
  const heard = Object.values(news.heard).reduce((n, h) => n + Object.keys(h).length, 0)
  // A checkpoint (a day went by since the last), then an hour on, an autosave that writes only the tail.
  const checkpoint = time(() => engine.saved())
  engine.tick(60)
  let tail = ''
  const autosave = time(() => (tail = JSON.stringify(engine.saved().tail)))
  stdout.write(`${String(day).padEnd(5)}${String(news.facts.length).padEnd(7)}${String(archived).padEnd(10)}${String(heard).padEnd(8)}${String(Math.round(text.length / 1024)).padEnd(9)}${save.toFixed(0).padEnd(9)}${load.toFixed(0).padEnd(9)}${tick.toFixed(0).padEnd(13)}${checkpoint.toFixed(1).padEnd(15)}${autosave.toFixed(2).padEnd(13)}${tail.length}\n`)
}

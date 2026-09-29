import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

// npm run trial -- --kind <kind>[,<kind>] [--cap <dollars>] [--steps a,b] [--same-model] [--record] [--doc <file>] [--build <name>] [--out <dir>]
// npm run trial -- --kind <kind> [--effort low|medium|high] [--times n] [--record]: a kind at an effort, n times, each reply kept (M10.27)
// npm run trial -- --kind voice_set [--times n]: the talk on the situation set, as the settings try a voice model, with the character score (M10.27)
// npm run trial -- --kind region_play [--setting outline|story|full] [--world base|isle] [--cap <dollars>] [--record]: a new region played per setting (M10.25)
// npm run trial -- --kind map_measure [--models a,b] [--times n] [--record]: the map painted as a table with each model (M10.26)
//
// Tries a kind of model call for real (M10.20), in the app, with the key and
// the models the player chose under Settings > AI: never in CI, never with a
// key typed here. It needs the app built (npm run build). For the world build
// (--kind world_step) it plays the designer's document step by step, within
// its own budget, and with --record keeps each reply as a fixture in
// tests/fixtures/worldbuild/<build>/.

const args = process.argv.slice(2)
const value = (name: string) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? args[i + 1] ?? '' : ''
}
const kind = value('kind')
if (!kind) {
  console.log('Say which kind: npm run trial -- --kind world_step --cap 5 --record')
  process.exit(2)
}
const root = resolve(import.meta.dirname, '..')
if (!existsSync(resolve(root, 'out/main/index.js'))) {
  console.log('Build the app first: npm run build')
  process.exit(2)
}
const env: Record<string, string> = { ...process.env as Record<string, string>, WISPLIGHT_TRIAL: kind }
for (const [flag, name] of [['cap', 'CAP'], ['steps', 'STEPS'], ['doc', 'DOC'], ['build', 'BUILD'], ['out', 'OUT'], ['name', 'NAME'], ['setting', 'SETTING'], ['world', 'WORLD'], ['models', 'MODELS'], ['times', 'TIMES'], ['effort', 'EFFORT']] as const) {
  if (value(flag)) env[`WISPLIGHT_TRIAL_${name}`] = flag === 'doc' || flag === 'out' ? resolve(value(flag)) : value(flag)
}
if (args.includes('--same-model')) env['WISPLIGHT_TRIAL_SAME_MODEL'] = '1'
if (args.includes('--record')) env['WISPLIGHT_TRIAL_RECORD'] = '1'
const run = spawnSync('npx', ['electron', '.'], { cwd: root, env, stdio: 'inherit' })
process.exit(run.status ?? 1)

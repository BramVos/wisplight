import { createInterface } from 'node:readline'
import { resolve } from 'node:path'
import { stdin, stdout } from 'node:process'
import { Engine, type Output } from '../engine'
import { loadContentFromDir } from '../node/content'
import { SaveStore } from '../node/savegame'

// Plays the game in the terminal: npm run play
// Also accepts piped input, for example: printf 'look\nn\n' | npm run play
// Another world: WISPLIGHT_WORLD=isle npm run play

const contentDir = resolve(import.meta.dirname, '../../content')
const content = await loadContentFromDir(contentDir, process.env['WISPLIGHT_WORLD'] || undefined)
const saves = new SaveStore(resolve(import.meta.dirname, '../../saves/cli.sqlite'))
let engine = new Engine(content, { seed: Number(process.env['WISPLIGHT_SEED'] ?? 1), builder: true })

const print = (outputs: Output[]) => {
  for (const output of outputs) stdout.write(`\n${output.text}\n`)
}

print(engine.start())
const rl = createInterface({ input: stdin, output: stdout, terminal: stdin.isTTY })
rl.setPrompt('\n> ')
rl.prompt()
for await (const line of rl) {
  if (!stdin.isTTY) stdout.write(`${line}\n`)
  if (/^(quit|exit|stop)$/i.test(line.trim())) break
  const verb = line.trim().split(/\s+/)[0]?.toLowerCase()
  if (verb === 'save' || verb === 'bewaar') {
    saves.save('cli', engine.save())
    print([{ kind: 'system', text: 'Game saved.' }])
  } else if (verb === 'load' || verb === 'laad') {
    const data = saves.load('cli')
    if (data) engine = Engine.fromSave(content, data)
    print(data ? [{ kind: 'system', text: 'Game loaded.' }, ...(await engine.handle('look'))] : [{ kind: 'error', text: 'There is no saved game yet.' }])
  } else {
    print(await engine.handle(line))
  }
  rl.prompt()
}
rl.close()

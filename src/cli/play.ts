import { createInterface } from 'node:readline'
import { resolve } from 'node:path'
import { stdin, stdout } from 'node:process'
import { Engine, type Output } from '../engine'
import { loadContentFromDir } from '../node/content'

// Plays the game in the terminal: npm run play
// Also accepts piped input, for example: printf 'look\nn\n' | npm run play

const contentDir = resolve(import.meta.dirname, '../../content')
const engine = new Engine(await loadContentFromDir(contentDir))

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
  print(engine.handle(line))
  rl.prompt()
}
rl.close()

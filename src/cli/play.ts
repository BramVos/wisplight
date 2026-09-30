import { randomUUID } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { createInterface } from 'node:readline'
import { resolve } from 'node:path'
import { stdin, stdout } from 'node:process'
import { APP_KNOBS, Engine, readSaveFile, saveAbout, saveFileText, type EarlierLines, type Output } from '../engine'
import { loadContentFromDir } from '../node/content'
import { GameLog, type Session } from '../node/gamelog'
import { SaveStore } from '../node/savegame'

// Plays the game in the terminal: npm run play
// Also accepts piped input, for example: printf 'look\nn\n' | npm run play
// Another world: WISPLIGHT_WORLD=isle npm run play
// Saves (M10.20): SAVE, SAVE <name>, LOAD; SAVE EXPORT <path> writes the game as a .wisplight file, LOAD <path> reads one.

const contentDir = resolve(import.meta.dirname, '../../content')
const content = await loadContentFromDir(contentDir, process.env['WISPLIGHT_WORLD'] || undefined)
const saves = new SaveStore(resolve(import.meta.dirname, '../../saves/cli.sqlite'))
let engine = new Engine(content, { seed: Number(process.env['WISPLIGHT_SEED'] ?? 1), builder: true })
// A game log of its own (M10.29 S), as the app keeps: LOAD shows the lines before the save, faded.
const log = new GameLog(resolve(import.meta.dirname, '../../saves/cli-gamelog.sqlite'))
log.calendar = engine.world.calendar
let where: Session = log.start(randomUUID())
let unfollow = engine.onLog((line) => log.write(where, line))
const follow = (next: Engine, session: Session) => {
  unfollow()
  engine = next
  where = session
  unfollow = engine.onLog((line) => log.write(where, line))
}

/** A moment (M10.11) in the terminal: a frame of text around the card. */
function framed(text: string): string {
  const width = 72
  const wrap = (line: string): string[] => {
    const out: string[] = []
    let current = ''
    for (const word of line.split(/\s+/)) {
      if ((current + ' ' + word).trim().length > width) {
        out.push(current)
        current = word
      } else current = `${current} ${word}`.trim()
    }
    return [...out, current]
  }
  const rows = text.split('\n').flatMap(wrap)
  const bar = `+${'-'.repeat(width + 2)}+`
  return [bar, ...rows.map((r) => `| ${r.padEnd(width)} |`), bar].join('\n')
}

/** The game before a load (M10.29 S): its day, then its last lines, set off with a bar. */
const printEarlier = (earlier: EarlierLines | undefined) => {
  if (!earlier) return
  stdout.write(`\nEarlier, ${earlier.when}:\n${earlier.lines.map((l) => `  | ${l.you ? '> ' : ''}${l.text.replace(/\n/g, '\n  | ')}`).join('\n')}\n`)
}

const print = (outputs: Output[]) => {
  // A spoken line the game wrote itself while a model is in play is marked with ~ (M10.8).
  for (const output of outputs) stdout.write(`\n${output.card ? framed(output.text) : `${output.kind === 'speech' && output.source === 'rules' ? '~ ' : ''}${output.text}`}\n`)
}

print(engine.start())
// The frames once (M10.24): what this game is played under, and how to set its dials.
print([{ kind: 'system', text: 'The frames of this game (its lands, great lines and how the world moves): type FRAMES.' }])
const rl = createInterface({ input: stdin, output: stdout, terminal: stdin.isTTY })
rl.setPrompt('\n> ')
rl.prompt()
for await (const line of rl) {
  if (!stdin.isTTY) stdout.write(`${line}\n`)
  if (/^(quit|exit|stop)$/i.test(line.trim())) break
  const verb = line.trim().split(/\s+/)[0]?.toLowerCase()
  const rest = line.trim().slice(verb?.length ?? 0).trim()
  if ((verb === 'save' || verb === 'bewaar') && /^export\s+\S/i.test(rest)) {
    const path = resolve(rest.replace(/^export\s+/i, ''))
    const data = engine.save()
    const version = engine.saved().content
    writeFileSync(path, saveFileText({ format: 'wisplight-save', version: 1, world: content.world.id, worldName: content.world.name, ...(version ? { content: version } : {}), saved: new Date().toISOString(), about: saveAbout(engine.world), chronicle: engine.chronicleMarkdown(), save: data }), 'utf8')
    print([{ kind: 'system', text: `Game saved as ${path}.` }])
  } else if ((verb === 'save' || verb === 'bewaar') && !engine.state.talk) {
    saves.save('cli', { ...engine.saved(), session: { ...where, logId: log.position(where) } }, 5, { about: saveAbout(engine.world), ...(rest ? { name: rest } : {}) })
    print([{ kind: 'system', text: rest ? `Game saved as "${rest}".` : 'Game saved.' }])
  } else if ((verb === 'load' || verb === 'laad') && rest) {
    const read = readSaveFile(readFileSync(resolve(rest), 'utf8'))
    if ('problem' in read) print([{ kind: 'error', text: read.problem }])
    else if (read.file.world !== content.world.id) print([{ kind: 'error', text: `This save belongs to ${read.file.worldName}; start with WISPLIGHT_WORLD set to that world.` }])
    else {
      follow(await Engine.restore(content, read.file.save), log.start(randomUUID()))
      print([{ kind: 'system', text: 'Game loaded.' }, ...(await engine.handle('look')), ...engine.beginWritten()])
    }
  } else if (verb === 'load' || verb === 'laad') {
    const data = saves.load('cli')
    if (data) {
      // What happened after the save stays in the log, on a branch of its own, as in the app.
      const from = data.session ? { game: data.session.game, branch: data.session.branch } : undefined
      follow(await Engine.restore(content, data), from ? (log.position(from) > data.session!.logId ? log.fork(from, data.session!.logId) : from) : log.start(randomUUID()))
      if (from) printEarlier(log.earlier(where, APP_KNOBS.recall_lines.default, engine.world.calendar))
    }
    print(data ? [{ kind: 'system', text: 'Game loaded.' }, ...(await engine.handle('look')), ...engine.beginWritten()] : [{ kind: 'error', text: 'There is no saved game yet.' }])
  } else {
    print(await engine.handle(line))
  }
  // Three things to try next (M10.33 D), as the window's chips; not in a talk.
  const next = engine.status().talk ? [] : (engine.status().next ?? [])
  if (next.length) print([{ kind: 'system', text: `You could: ${next.map((n) => n.command.toUpperCase()).join(', ')}.` }])
  rl.prompt()
}
rl.close()

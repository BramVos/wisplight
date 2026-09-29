import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { Engine, LlmError, type Content, type LlmClient, type LlmRequest, type LlmResponse, type Output, type Quest } from '../engine'
import { farTopicAt } from '../engine/growth/far'
import { FULL_ROUNDS, fullOf } from '../engine/growth/regionfull'
import { regionMap } from '../engine/map/region'

// The played proof of a new region (M10.25 (4); Bram, 29 September 2026: has
// it been tested that the chronicler can build a good new region?). A new
// game goes to the edge of the map (the Holleveen's south edge, or on Skerrow
// the harbour and the sea), goes on into the unknown, and travels to what the
// round charts, with the fourth dial at one setting. There it plays three
// game days as docs/PLAYTEST.md asks: a new player looks, walks, talks, reads
// the journal, tries to read people, and follows the quest the journal shows.
// Build commands only as shortcuts for time and distance, each marked. What
// it tallies (places, people, the quest, secrets, watchers, cost) goes in
// the comparison report per setting. With the mock first; the real run goes
// through the app with the player's key (npm run trial -- --kind region_play).

export type RegionSetting = 'outline' | 'story' | 'full'
export const REGION_SETTINGS: RegionSetting[] = ['outline', 'story', 'full']

export interface RegionCall {
  kind: string
  model: string
  inputTokens: number
  cachedTokens: number
  outputTokens: number
  costUsd?: number
  ms: number
  /** For the record: what was asked (the schema), and the reply. */
  reply: string
}

export interface RegionTally {
  world: string
  setting: RegionSetting
  region?: { id: string; name: string; summary: string }
  /** Places of the region: how many, their words and hooks on average, and their ways out. */
  places: { count: number; words: number; hooks: number; exits: number; names: string[] }
  people: { count: number; withSecret: number; names: string[] }
  quests: { id: string; name: string; stages: number; problems: string[]; started: boolean; outcome?: string; stage?: string }[]
  secrets: { count: number; hinted: number; found: number }
  watchers: { made: string[]; fired: string[] }
  lore: string[]
  calls: RegionCall[]
  /** How long the arrival waited, in real seconds, and how many rounds the models took. */
  waitedSecs: number
  days: number
  /** The rounds of a region built in full, in order: kept, or why not; a round that never got an answer says so. */
  full?: { round: string; kept: boolean; problems?: string[] }[]
  /** When it was played, and on which model (the first call's), so settings played in separate hours stay apart. */
  date?: string
  model?: string
}

/**
 * The kinds of call that build a region (M10.25): only these are recorded as
 * fixtures; the talks, goals and nights of the three days are not what the
 * proof is about.
 */
export const REGION_KINDS = ['expansion', 'far_place', 'outline', 'district', 'weave', 'region_story', 'world_step', 'world_polish', 'land']

/**
 * A client that measures every call it passes on: kind, model, tokens, cost,
 * time and the reply; with a cap in dollars, it stops calling once that is
 * spent (the game then goes on as without a model).
 */
export function measuring(llm: LlmClient, how: { price?: (model: string, usage: LlmResponse['usage']) => number | undefined; capUsd?: number } = {}): LlmClient & { calls: RegionCall[] } {
  const calls: RegionCall[] = []
  const price = how.price
  const client: LlmClient & { calls: RegionCall[] } = {
    calls,
    async complete(request: LlmRequest): Promise<LlmResponse> {
      const spent = calls.reduce((n, c) => n + (c.costUsd ?? 0), 0)
      if (how.capUsd !== undefined && spent >= how.capUsd) throw new LlmError('budget', `the cap of $${how.capUsd} is spent`)
      const started = Date.now()
      const reply = await llm.complete(request)
      calls.push({
        kind: request.schemaName ?? request.role,
        model: reply.model,
        inputTokens: reply.usage.inputTokens,
        cachedTokens: reply.usage.cachedTokens ?? 0,
        outputTokens: reply.usage.outputTokens,
        ...(price ? { costUsd: price(reply.model, reply.usage) } : {}),
        ms: Date.now() - started,
        reply: reply.text,
      })
      return reply
    },
  }
  for (const key of ['costOf', 'askAboveUsd', 'askNever', 'playMode', 'report', 'replyWithinMs'] as const) if (llm[key]) (client as unknown as Record<string, unknown>)[key] = (llm[key] as (...a: unknown[]) => unknown).bind(llm)
  return client
}

export interface RegionPlay {
  content: Content
  world: 'base' | 'isle'
  setting: RegionSetting
  llm: LlmClient
  seed?: number
  /** Game days to play in the region (three by the protocol). */
  days?: number
  /** Progress, for a long real run. */
  say?: (line: string) => void
}

const say = (outputs: Output[]) => outputs.map((o) => o.text).join('\n')
const DAY = 24 * 60

/** Plays one region at one setting; the transcript as the player saw it, and the tally. */
export async function playRegion(play: RegionPlay): Promise<{ transcript: string; tally: RegionTally }> {
  const measured = 'calls' in play.llm ? (play.llm as LlmClient & { calls: RegionCall[] }) : measuring(play.llm)
  const engine = new Engine(play.content, { seed: play.seed ?? 7, builder: true, llm: measured })
  const out: string[] = [say(engine.start())]
  const note = (text: string) => out.push(`\n# ${text}`)
  let waited = 0
  /**
   * The arrival waits while the chronicler lays a region or district out (M10.25 (3)): the models run, as the app
   * runs them in the background, and the minute after they are done brings it.
   */
  const settle = async () => {
    const started = Date.now()
    for (let i = 0; i < 40 && engine.state.growth?.underway?.held; i++) {
      await engine.runModels()
      const came = say(engine.tick(1))
      if (came) out.push(`\n[a minute passes while the chronicler lays it out]\n${came}`)
    }
    waited += (Date.now() - started) / 1000
  }
  /** A command as the player types it; the models run after it, as the app runs them in the background. */
  const type = async (command: string, why?: string): Promise<string> => {
    const shown = say(await engine.handle(command))
    out.push(`\n> ${command}${command.startsWith('@') ? `   [build command: a shortcut${why ? `, ${why}` : ''}]` : ''}\n${shown}`)
    await engine.runModels()
    await settle()
    return shown
  }
  const pass = async (minutes: number, why: string) => {
    out.push(`\n[${Math.round(minutes / 60)} hours pass: ${why}]\n${say(engine.tick(minutes))}`)
    await engine.runModels()
  }

  out.push(`\n==== THE DIAL: ${play.setting}`)
  await type(`frames region ${play.setting}`)
  const before = new Set(Object.keys(engine.state.growth?.expansions?.made ?? {}))
  if (play.world === 'base') {
    const map = regionMap(engine.content)!
    note('To the south edge of the Holleveen, in the middle, and on into the unknown.')
    await type(`@goto hex:${Math.floor(map.cols / 2)},0`, 'to the edge of the map')
    await type('explore south')
  } else {
    note('To the harbour of Skerrow, to ask what lies beyond the sea.')
    await type('@goto loc_skerrow_harbour', 'to the harbour')
    await type('what lies beyond the sea?')
    await type('1')
  }
  await engine.runModels()
  const charted = Object.entries(engine.state.growth?.expansions?.made ?? {}).find(([id]) => !before.has(id))
  if (!charted) {
    out.push('\n==== NOTHING CHARTED')
    return { transcript: out.join('\n'), tally: tallyOf(engine, play, undefined, measured.calls, 0) }
  }
  const [topic, made] = charted
  out.push(`\n==== SET OFF FOR ${made.outline.name} (${engine.world.date()})`)
  if (play.world === 'base') {
    await type('head south')
    const go = engine.state.choice?.options.findIndex((o) => o.label.includes(made.outline.name))
    if (go === undefined || go < 0) note('The edge offered no way on to it.')
    else await type(String(go + 1))
  } else {
    await type('@money 200', 'the fare')
    await type('@time 7', 'the boat sails at eight')
    await type(`take the boat to ${made.outline.name.replace(/^the /i, '')}`)
  }
  // What the arrival waited, in real seconds (the models of the mock answer at once).
  const waitedSecs = Math.round(waited * 10) / 10
  if (farTopicAt(engine.world, engine.state.player.location) !== topic) {
    out.push(`\n==== NEVER GOT THERE (${engine.state.player.location})`)
    return { transcript: out.join('\n'), tally: tallyOf(engine, play, topic, measured.calls, waitedSecs) }
  }

  const days = play.days ?? 3
  const talked = new Set<string>()
  const hinted = new Set<string>()
  for (let day = 1; day <= days; day++) {
    out.push(`\n==== DAY ${day} (${engine.world.date()})`)
    await type('look')
    await type('journal')
    // Walk the region: every place the stranger has not seen yet, nearest first, a few a day.
    for (let n = 0; n < 6; n++) {
      const next = nearestUnseen(engine, topic)
      if (!next) break
      await walkTo(engine, next, type)
      // Whoever is here and awake: talk, ask what's new, try to read them, and press what shows.
      for (const id of engine.world.npcsAt(engine.state.player.location).filter((p) => !talked.has(p) && engine.world.npcState(p).activity !== 'asleep').slice(0, 2)) {
        talked.add(id)
        await meet(engine, id, type, hinted)
      }
    }
    // The quest the journal shows: follow what its stage asks, as a player who reads the journal.
    await followQuests(engine, topic, type, note)
    if (day < days) {
      const now = engine.world.now % DAY
      await pass(DAY - now + 8 * 60, 'the night, to eight the next morning')
    }
  }
  await type('journal')
  const tally = tallyOf(engine, play, topic, measured.calls, waitedSecs, hinted)
  out.push(`\n==== END (${engine.world.date()})`)
  return { transcript: out.join('\n'), tally }
}

type Type = (command: string, why?: string) => Promise<string>

/** The places of the region, by the far place the game made for it. */
function regionPlaces(engine: Engine, topic: string): string[] {
  return [...engine.content.locations.keys()].filter((id) => farTopicAt(engine.world, id) === topic).sort()
}

/** The way from here to a place, as directions, by the exits the stranger sees. */
function pathTo(engine: Engine, to: string): string[] | undefined {
  const from = engine.state.player.location
  const seen = new Map<string, { at: string; dir: string } | null>([[from, null]])
  const queue = [from]
  while (queue.length) {
    const at = queue.shift()!
    if (at === to) break
    for (const [dir, exit] of Object.entries(engine.content.locations.get(at)?.exits ?? {})) {
      const next = (exit as { to: string }).to
      if (seen.has(next) || !engine.content.locations.has(next)) continue
      seen.set(next, { at, dir })
      queue.push(next)
    }
  }
  if (!seen.has(to)) return undefined
  const dirs: string[] = []
  for (let step = seen.get(to); step; step = seen.get(step.at)) dirs.unshift(step.dir)
  return dirs
}

function nearestUnseen(engine: Engine, topic: string): string | undefined {
  const seen = new Set(engine.state.player.seen ?? [])
  return regionPlaces(engine, topic)
    .filter((id) => !seen.has(id))
    .map((id) => ({ id, way: pathTo(engine, id) }))
    .filter((p) => p.way)
    .sort((a, b) => a.way!.length - b.way!.length || a.id.localeCompare(b.id))[0]?.id
}

async function walkTo(engine: Engine, to: string, type: Type): Promise<boolean> {
  const way = pathTo(engine, to) ?? []
  for (const dir of way) {
    const was = engine.state.player.location
    await type(dir)
    if (engine.state.player.location === was) return false
  }
  return engine.state.player.location === to
}

/** A talk as a new player has it: what's new, a try at reading them, and pressing what that shows. */
async function meet(engine: Engine, id: string, type: Type, hinted: Set<string>): Promise<void> {
  await type(`talk ${engine.world.npc(id).short.toLowerCase()}`)
  if (engine.state.talk?.npc !== id) return
  await type('2')
  await type('insight')
  const hints = (engine.state.talk?.revealed ?? []).filter((r) => r.startsWith('hint:')).map((r) => r.slice(5))
  for (const h of hints) hinted.add(`${id}:${h}`)
  if (hints.length) await type('persuade You can tell me. It stays between us.')
  if (engine.state.talk) await type('bye')
}

/** A string a quest action's pattern takes, for the simple patterns quests use: the first of each choice. */
export function exampleOf(pattern: string): string {
  let s = pattern.replace(/^\^|\$$/g, '').replace(/\(\?:/g, '(')
  // Optional groups and words go; the first of each choice stays.
  for (let i = 0; i < 5; i++) s = s.replace(/\(([^()]*)\)\?/g, '').replace(/\(([^()|]*)(?:\|[^()]*)?\)/g, '$1')
  return s
    .replace(/\\s[+*]|\\s/g, ' ')
    .replace(/\.[*+]\??/g, ' ')
    .replace(/\\b|\\/g, '')
    .replace(/\S\?/g, '')
    .replace(/[+*?]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * The open quests of the region, followed as a player who reads the journal
 * would: to the giver to begin it, and then, stage by stage, to where it
 * says and what it asks (an action at its place, a thing bought, someone
 * asked). Marked in the transcript as following the journal.
 */
async function followQuests(engine: Engine, topic: string, type: Type, note: (text: string) => void): Promise<void> {
  for (const quest of regionQuests(engine, topic)) {
    const log = () => engine.state.questlog?.[quest.id]
    if (log()?.outcome) continue
    if (!log()) {
      const giver = quest.givers.find((g) => engine.content.npcs.has(g))
      if (!giver) continue
      note(`The journal or a talk names ${engine.world.npc(giver).name}: go and see ${engine.world.npc(giver).pronoun === 'she' ? 'her' : 'him'}.`)
      await walkTo(engine, engine.world.npcState(giver).location, type)
      await type(`talk ${engine.world.npc(giver).short.toLowerCase()}`)
      if (engine.state.talk) await type('bye')
      if (!log()) continue
    }
    for (let tries = 0; tries < 6 && log() && !log()!.outcome; tries++) {
      const stage = quest.stages?.find((s) => s.id === log()!.stage)
      if (!stage) break
      note(`The journal: ${stage.text}`)
      const was = `${log()!.stage}`
      // The ways on from this stage, and the ends the quest may reach from any stage.
      for (const when of [...stage.next.map((w) => w.when), ...(quest.outcomes ?? []).filter((o) => o.when.length).map((o) => o.when)]) {
        for (const cond of when) await meetCondition(engine, quest, cond as Record<string, unknown>, type)
        if (`${log()?.stage}` !== was || log()?.outcome) break
      }
      if (`${log()?.stage}` === was && !log()?.outcome) break
    }
  }
}

async function meetCondition(engine: Engine, quest: Quest, cond: Record<string, unknown>, type: Type): Promise<void> {
  const where = (id: string) => (engine.content.locations.has(id) ? id : [...engine.content.locations.values()].find((l) => l.area === id)?.id)
  if (typeof cond['at'] === 'string') {
    const to = where(cond['at'])
    if (to) await walkTo(engine, to, type)
    return
  }
  if (typeof cond['here'] === 'string' && engine.content.npcs.has(cond['here'])) {
    await walkTo(engine, engine.world.npcState(cond['here']).location, type)
    return
  }
  if (typeof cond['flag'] === 'string') {
    // The action that sets it, where it can be done, with whoever must be there.
    const action = (quest.actions ?? []).find((a) => a.effects.some((e) => (e as Record<string, unknown>)['flag'] === cond['flag'] || JSON.stringify(e).includes(`"${cond['flag']}"`)))
    if (!action) return
    // Where it is done; and whoever must be there, waited for when they are not.
    const who = action.with && engine.content.npcs.has(action.with) ? action.with : undefined
    const at = action.at[0] ? where(action.at[0]) : who ? engine.world.npcState(who).location : undefined
    if (at) await walkTo(engine, at, type)
    if (who && engine.world.npcState(who).location !== engine.state.player.location) await type(`wait for ${engine.world.npc(who).short.toLowerCase()}`)
    await type(exampleOf(action.say[0]!))
    return
  }
  if (typeof cond['has'] === 'string') {
    const item = engine.content.items.get(cond['has'])
    if (item) await type(`buy ${item.name.toLowerCase()}`)
  }
}

/** The quests of the region: those with a giver who lives there. */
function regionQuests(engine: Engine, topic: string): Quest[] {
  const places = new Set(regionPlaces(engine, topic))
  return [...engine.content.quests.values()].filter((q) => q.givers.some((g) => engine.content.npcs.has(g) && places.has(engine.world.npc(g).home ?? '')))
}

/** What stands in the way of a quest: a stage with no way on, a place or person not in the world, someone never where the action is. */
function questProblems(engine: Engine, quest: Quest): string[] {
  const problems: string[] = []
  const known = (id: string) => engine.content.locations.has(id) || engine.content.areas.has(id) || engine.content.npcs.has(id)
  for (const stage of quest.stages ?? []) {
    if (!stage.next.length && !(quest.outcomes ?? []).some((o) => o.when.length)) problems.push(`${stage.id}: no way on`)
    for (const way of stage.next) for (const cond of way.when) for (const key of ['at', 'here', 'npc_at'] as const) {
      const id = (cond as Record<string, unknown>)[key]
      if (typeof id === 'string' && !known(id)) problems.push(`${stage.id}: ${key} ${id} is not in the world`)
    }
  }
  // An action with someone who must be there, at a place they neither live nor work at, waits for them in vain.
  for (const action of quest.actions ?? []) {
    const who = action.with ? engine.content.npcs.get(action.with) : undefined
    if (!who || !action.at.length) continue
    const theirs = [who.home, who.work].filter(Boolean).map((l) => [l, engine.content.locations.get(l!)?.area])
    if (!action.at.some((at) => theirs.some((t) => t.includes(at)))) problems.push(`${action.id}: ${who.name} must be at ${action.at.map((a) => engine.content.locations.get(a)?.name ?? a).join(' or ')}, where ${who.pronoun === 'she' ? 'she' : 'he'} neither lives nor works`)
  }
  return problems
}

function tallyOf(engine: Engine, play: RegionPlay, topic: string | undefined, calls: RegionCall[], waitedSecs: number, hinted: Set<string> = new Set()): RegionTally {
  const base = play.content
  const places = topic ? regionPlaces(engine, topic).map((id) => engine.content.locations.get(id)!) : []
  const inRegion = new Set(places.map((p) => p.id))
  const people = [...engine.content.npcs.values()].filter((n) => inRegion.has(n.home ?? ''))
  const words = (t: string) => t.split(/\s+/).filter(Boolean).length
  const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : 0)
  const watchers = [...engine.content.watchers.keys()].filter((w) => !base.watchers.has(w))
  const fired = [...new Set((engine.state.signals?.log ?? []).map((s) => s.watcher).filter((w) => watchers.includes(w)))]
  const revealed = new Set(Object.keys(engine.state.flags ?? {}).filter((f) => f.startsWith('secret:')))
  const quests = topic ? regionQuests(engine, topic) : []
  const t = topic ? engine.content.topics.get(topic) : undefined
  const full = topic && play.setting === 'full' ? fullOf(engine.world, topic) : undefined
  return {
    world: play.world,
    setting: play.setting,
    ...(topic && t ? { region: { id: topic, name: t.name, summary: t.summary } } : {}),
    places: { count: places.length, words: avg(places.map((p) => words(p.description.day))), hooks: avg(places.map((p) => (p.description.day.match(/\[[^\]]+\]/g) ?? []).length)), exits: avg(places.map((p) => Object.keys(p.exits).length)), names: places.map((p) => p.name) },
    people: { count: people.length, withSecret: people.filter((n) => n.secrets.length).length, names: people.map((n) => n.name) },
    quests: quests.map((q) => {
      const log = engine.state.questlog?.[q.id]
      return { id: q.id, name: q.name, stages: q.stages?.length ?? 0, problems: questProblems(engine, q), started: Boolean(log), ...(log?.outcome ? { outcome: log.outcome } : {}), ...(log && !log.outcome ? { stage: log.stage } : {}) }
    }),
    secrets: {
      count: people.reduce((n, p) => n + p.secrets.length, 0),
      hinted: people.reduce((n, p) => n + p.secrets.filter((s) => hinted.has(`${p.id}:${s.id}`)).length, 0),
      found: people.reduce((n, p) => n + p.secrets.filter((s) => revealed.has(`secret:${p.id}:${s.id}`)).length, 0),
    },
    watchers: { made: watchers, fired },
    lore: [...engine.content.topics.values()].filter((x) => x.kind === 'lore' && !base.topics.has(x.id)).map((x) => x.name),
    calls,
    waitedSecs,
    days: play.days ?? 3,
    ...(topic && play.setting === 'full' ? { full: FULL_ROUNDS.map((round) => ({ round, ...(full?.rounds?.[round] ?? { kept: false, problems: [full?.done.includes(round) ? 'done, nothing kept' : 'no answer'] }) })) } : {}),
    date: new Date().toLocaleDateString('sv-SE'),
    model: calls[0]?.model ?? 'none',
  }
}

/** Where the tally of one setting is kept: docs/playtest/<stem>-<world>-<setting>.json. */
const tallyPath = (dir: string, stem: string, world: string, setting: RegionSetting) => join(dir, `${stem}-${world}-${setting}.json`)

/** Keeps the tally of one setting on disk, without the replies, so settings played in separate hours make one report. */
export function keepTally(dir: string, stem: string, tally: RegionTally): void {
  const lean = { ...tally, calls: tally.calls.map(({ reply: _, ...call }) => call) }
  writeFileSync(tallyPath(dir, stem, tally.world, tally.setting), `${JSON.stringify(lean, null, 2)}\n`)
}

/** The tallies kept for a world, in the order of the dial. */
export function keptTallies(dir: string, stem: string, world: string): RegionTally[] {
  return REGION_SETTINGS.map((setting) => tallyPath(dir, stem, world, setting))
    .filter((path) => existsSync(path))
    .map((path) => {
      const t = JSON.parse(readFileSync(path, 'utf8')) as RegionTally
      return { ...t, calls: t.calls.map((c) => ({ ...c, reply: c.reply ?? '' })) }
    })
}

const money = (usd: number | undefined) => (usd === undefined ? 'n/a' : `$${usd.toFixed(3)}`)

/**
 * The comparison report (Dutch, for Bram): per setting the region, its
 * places, people, the quest, secrets, watchers and cost, side by side, and
 * what each call kind cost.
 */
export function regionReport(tallies: RegionTally[], how: { title: string; mock: boolean }): string {
  const col = (f: (t: RegionTally) => string) => `| ${tallies.map(f).join(' | ')} |`
  const cost = (t: RegionTally) => (t.calls.some((c) => c.costUsd === undefined) ? undefined : t.calls.reduce((n, c) => n + (c.costUsd ?? 0), 0))
  const lines = [
    `# ${how.title}`,
    '',
    `${how.mock ? 'Met het mockmodel (de vorm, niet de kwaliteit).' : 'Met de modellen van de speler.'} Per stand van de vierde draaiknop een nieuw spel: naar de rand, verder het onbekende in, naar wat de ronde schetst, en daar ${tallies[0]?.days ?? 3} speldagen gespeeld volgens \`docs/PLAYTEST.md\`. Elke stand kan in een eigen uur gespeeld zijn; de tabel zegt wanneer en met welk model. De transcripten staan ernaast.`,
    '',
    `| | ${tallies.map((t) => `\`${t.setting}\``).join(' | ')} |`,
    `|---|${tallies.map(() => '---').join('|')}|`,
    `| Gespeeld ${col((t) => `${t.date ?? '?'}, ${how.mock ? 'mock' : (t.model ?? '?')}`)}`,
    `| Streek ${col((t) => t.region?.name ?? '(geen)')}`,
    `| Plekken ${col((t) => String(t.places.count))}`,
    `| Woorden per beschrijving ${col((t) => String(t.places.words))}`,
    `| Haken per beschrijving ${col((t) => String(t.places.hooks))}`,
    `| Uitgangen per plek ${col((t) => String(t.places.exits))}`,
    `| Mensen ${col((t) => String(t.people.count))}`,
    `| Mensen met een geheim ${col((t) => String(t.people.withSecret))}`,
    `| Quests ${col((t) => String(t.quests.length))}`,
    `| Quest gehaald ${col((t) => t.quests.map((q) => (q.outcome ? `ja (${q.outcome})` : q.started ? `begonnen, stadium ${q.stage}` : 'niet begonnen')).join('; ') || '-')}`,
    `| Geheimen: hint gezien, gevonden ${col((t) => `${t.secrets.hinted}, ${t.secrets.found} van ${t.secrets.count}`)}`,
    `| Wachters (afgegaan) ${col((t) => `${t.watchers.made.length} (${t.watchers.fired.length})`)}`,
    `| Onderwerpen van lore ${col((t) => String(t.lore.length))}`,
    `| Aanroepen ${col((t) => String(t.calls.length))}`,
    `| Kosten ${col((t) => money(cost(t)))}`,
    `| Wachten bij aankomst ${col((t) => `${t.waitedSecs} s`)}`,
    '',
  ]
  for (const t of tallies) {
    lines.push(`## \`${t.setting}\`: ${t.region?.name ?? 'niets geschetst'}`, '')
    if (t.region) lines.push(t.region.summary, '')
    lines.push(`Plekken: ${t.places.names.join(', ') || '-'}.`, '', `Mensen: ${t.people.names.join(', ') || '-'}.`, '')
    for (const q of t.quests) lines.push(`Quest ${q.name} (${q.stages} stadia): ${q.outcome ? `gehaald, ${q.outcome}` : q.started ? `begonnen, stadium ${q.stage}` : 'niet begonnen'}${q.problems.length ? `; wat niet klopt: ${q.problems.join('; ')}` : ''}.`, '')
    if (t.watchers.made.length) lines.push(`Wachters: ${t.watchers.made.map((w) => `${w}${t.watchers.fired.includes(w) ? ' (ging af)' : ''}`).join(', ')}.`, '')
    if (t.lore.length) lines.push(`Lore: ${t.lore.join(', ')}.`, '')
    if (t.full) lines.push(`Rondes van \`full\`: ${t.full.map((r) => `${r.round} ${r.kept ? 'bewaard' : r.problems?.length ? `niet bewaard (${r.problems.slice(0, 3).join('; ')})` : 'niets bewaard'}`).join('; ')}.`, '')
    const kinds = [...new Set(t.calls.map((c) => c.kind))]
    if (kinds.length) {
      lines.push('| Soort | Aanroepen | In | Gecachet | Uit | Kosten |', '|---|---|---|---|---|---|')
      for (const k of kinds) {
        const cs = t.calls.filter((c) => c.kind === k)
        const sum = (f: (c: RegionCall) => number) => cs.reduce((n, c) => n + f(c), 0)
        lines.push(`| \`${k}\` | ${cs.length} | ${sum((c) => c.inputTokens)} | ${sum((c) => c.cachedTokens)} | ${sum((c) => c.outputTokens)} | ${money(cs.some((c) => c.costUsd === undefined) ? undefined : sum((c) => c.costUsd ?? 0))} |`)
      }
      lines.push('')
    }
  }
  return lines.join('\n')
}

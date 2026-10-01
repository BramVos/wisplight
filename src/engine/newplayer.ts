import type { Content, Direction, Quest } from './content'
import { Engine } from './engine'
import type { LlmClient } from './dialogue/llm'
import { exitShown } from './exits'
import { allHold, plainWords, questlog } from './quests/engine'
import type { Condition, QuestAction } from './quests/schema'

// Every quest played as a new player (M10.33 AE). The playtest played the
// Quiet Reach's main line only, and typed the magic words of its deeds word
// for word, so it passed by construction; the small quests were never
// played. Here a quest is played with nothing but its Now lines: at each
// stage the player goes to the place of the deed (a shortcut for distance,
// marked), brings its person along (the same), and types the Now line as it
// stands. A stage that does not move on is where a new player would be stuck.

export interface StageRun {
  stage: string
  now?: string
  /** What was typed, and the shortcuts before it. */
  steps: string[]
  moved: boolean
  why?: string
}

/** The actions that move a stage on: those that set a flag its way on waits for. */
function movers(q: Quest, stage: NonNullable<Quest['stages']>[number]) {
  const flags = stage.next.flatMap((n) => n.when.flatMap((c) => ('flag' in c ? [c.flag] : [])))
  return (q.actions ?? []).filter((a) => a.effects.some((e) => 'set' in e && flags.includes((e as { set: string }).set)))
}

/** Plays one quest by its Now lines from a new game; one row per stage it reached. */
export async function playByNow(content: Content, id: string, llm?: LlmClient, seed = 7): Promise<StageRun[]> {
  const quest = content.quests.get(id)
  if (!quest?.stages?.length) return []
  const engine = new Engine(content, { seed, builder: true, ...(llm ? { llm } : {}) })
  engine.start()
  await engine.handle(`@quest ${id}`)
  const runs: StageRun[] = []
  for (let turn = 0; turn < quest.stages.length + 1; turn++) {
    const state = questlog(engine.world)[id]
    if (!state || state.outcome || state.ended) break
    const stage = quest.stages.find((s) => s.id === state.stage)
    if (!stage || !stage.next.length) break
    const deeds = movers(quest, stage).filter((a) => a.say.length)
    const steps: string[] = []
    // A stage that moves on by what happens (a talk, a thing brought, a day gone) has no deed to type: nothing to test.
    if (!deeds.length) break
    if (!stage.goal?.trim()) {
      runs.push({ stage: stage.id, steps, moved: false, why: 'no Now line' })
      break
    }
    // Where the deed is done, and with whom: shortcuts for distance and time, never for what to type.
    const deed = deeds[0]
    const place = deed?.at[0]
    if (place && content.locations.has(place)) steps.push(`@goto ${place}`)
    if (deed?.with) steps.push(`@bring ${deed.with}`)
    for (const step of steps) await engine.handle(step)
    const typed = stage.goal.trim().replace(/[.!]+$/, '')
    const movedOn = () => {
      const now = questlog(engine.world)[id]
      return Boolean(now && (now.stage !== stage.id || now.outcome || now.ended))
    }
    // As a new player would: told "not yet" (by daylight, the door shut), wait an hour and try again, up to a day;
    // a check failed, try again, a few times.
    let waits = 0
    let fails = 0
    while (!movedOn()) {
      steps.push(typed)
      const said = (await engine.handle(typed)).map((o) => o.text).join('\n')
      if (engine.state.talk) {
        steps.push('bye')
        await engine.handle('bye')
      }
      await engine.runModels()
      if (movedOn()) break
      const notYet = deeds.some((a) => a.not_yet && said.includes(a.not_yet))
      const failed = deeds.some((a) => a.fail_text && said.includes(a.fail_text))
      if (notYet && waits++ < 24) {
        steps.push('wait 60')
        await engine.handle('wait 60')
      } else if (!(failed && fails++ < 5)) break
    }
    const moved = movedOn()
    runs.push({ stage: stage.id, now: stage.goal, steps, moved, ...(moved ? {} : { why: 'the Now line typed as it stands does not do the deed' }) })
    if (!moved) break
  }
  return runs
}

/** Every quest of a world played by its Now lines: the rows of the stages that do not move on, by quest. */
export async function stuckQuests(content: Content, llm?: LlmClient): Promise<{ quest: string; runs: StageRun[] }[]> {
  const out: { quest: string; runs: StageRun[] }[] = []
  for (const q of content.quests.values()) {
    const runs = await playByNow(content, q.id, llm)
    out.push({ quest: q.id, runs })
  }
  return out
}

// ---------------------------------------------------------------- a real route (M10.34 B)

// The proof above takes shortcuts for distance (@goto, @bring) and starts the
// quest with @quest, and it stops at the last stage, so green did not show that
// a player gets through a story and to each of its endings (the external review
// of 30 September, V02). A route is played from a new game with nothing but
// what a player types: GO along the exits, SEARCH for a way that is hidden,
// the code once someone gave it, WAIT for a person or an hour, TALK, and the
// Now line or the deed as the quest page shows it. The engine keeps every rule:
// locks, hidden ways, schedules, doors shut at night. What the route cannot do
// that way is marked "not tested", never passed.

export type RouteStatus = 'passed' | 'not tested'

export interface RouteRun {
  quest: string
  /** The ending this run is for. */
  ending: string
  /** The quest ended in it. */
  reached: boolean
  /** How it began, then each stage on the way: passed, or not tested and why. */
  stages: { stage: string; status: RouteStatus; why?: string }[]
  /** Every line typed, in order: never a build command. */
  typed: string[]
  /** Game minutes from the new game to the end of the run. */
  minutes: number
}

/** The longest a route waits for one thing (a person, a door, the hour a deed allows): a day, by the hour. */
const WAIT_HOURS = 24
/** The most a route types: a story that takes more is not tested, not played on for ever. */
const MAX_TYPED = 800

class RouteTooLong extends Error {}

/** Someone playing a new game by typing, as a player would; a build command is refused here. */
class Stranger {
  readonly typed: string[] = []
  /** All the stranger saw, for a code someone told them. */
  heard = ''
  constructor(
    public engine: Engine,
    readonly llm?: LlmClient,
  ) {}

  /** The game as it is now, to go back to when one way fails and another is tried (as a player loads a save). */
  keep(): ReturnType<Engine['save']> {
    return this.engine.save()
  }

  /** Back to a kept game; marked in what was typed, so the transcript says so. */
  back(save: ReturnType<Engine['save']>, why: string): void {
    this.engine = Engine.fromSave(this.engine.content, save, this.llm)
    this.typed.push(`# load the save from before, ${why}`)
  }

  get world() {
    return this.engine.world
  }

  get here(): string {
    return this.engine.state.player.location
  }

  name(id: string): string {
    return this.world.content.locations.get(id)?.name ?? this.world.content.npcs.get(id)?.name ?? id
  }

  async type(line: string): Promise<string> {
    if (/^\s*@/.test(line)) throw new Error(`A route never uses a build command: ${line}`)
    if (this.typed.length >= MAX_TYPED) throw new RouteTooLong()
    this.typed.push(line)
    let said = (await this.engine.handle(line)).map((o) => o.text).join('\n')
    await this.engine.runModels()
    // Stopped on the way (a toll, a band in the reeds): pay if asked, and otherwise get away, as a player would.
    for (const answer of ['pay', 'flee', 'flee', 'flee']) {
      if (!this.engine.state.combat) break
      this.typed.push(answer)
      said += `\n${(await this.engine.handle(answer)).map((o) => o.text).join('\n')}`
    }
    this.heard += `\n${said}`
    return said
  }

  async bye(): Promise<void> {
    if (this.engine.state.talk) await this.type('bye')
  }

  /** The way along the exits from here to a place, by the content's map; none when no exit joins them. */
  path(to: string): [string, Direction, string][] | undefined {
    const from = new Map<string, [string, Direction]>()
    const queue = [this.here]
    while (queue.length && !from.has(to)) {
      const at = queue.shift()!
      for (const [dir, exit] of Object.entries(this.world.content.locations.get(at)?.exits ?? {}) as [Direction, { to: string }][]) {
        if (from.has(exit.to) || exit.to === this.here || !this.world.content.locations.has(exit.to)) continue
        from.set(exit.to, [at, dir])
        queue.push(exit.to)
      }
    }
    if (!from.has(to)) return undefined
    const steps: [string, Direction, string][] = []
    for (let at = to; at !== this.here; at = from.get(at)![0]) steps.unshift([from.get(at)![0], from.get(at)![1], at])
    return steps
  }

  /** Whether the stranger knows a word: they saw it, or were told the secret that holds it. */
  knows(word: string): boolean {
    const plain = (s: string) => s.toLowerCase().replace(/\s+/g, '')
    if (plain(this.heard).includes(plain(word))) return true
    return [...this.world.content.npcs.values()].some((n) => n.secrets.some((s) => plain(s.text).includes(plain(word)) && this.world.state.flags?.[`secret:${n.id}:${s.id}`]))
  }

  /** Asks for a word whoever gives it by right now (a secret with given_when that holds); true when it is known after. */
  async askFor(word: string): Promise<boolean> {
    const plain = (s: string) => s.toLowerCase().replace(/\s+/g, '')
    for (const n of this.world.content.npcs.values()) {
      for (const s of n.secrets) {
        if (!plain(s.text).includes(plain(word)) || !s.given_when.length || !allHold(this.world, s.given_when)) continue
        if (await this.meet(n.id)) continue
        await this.type(`talk ${this.world.npc(n.id).short}`)
        for (const about of s.about) {
          await this.type(`Tell me about the ${this.engine.topics.name(about).replace(/^the\s+/i, '')}.`)
          if (this.knows(word)) break
        }
        await this.bye()
        if (this.knows(word)) return true
      }
    }
    return false
  }

  /** One step along an exit, as a player takes it; why not, when it cannot be taken. */
  async step(from: string, dir: Direction, to: string): Promise<string | undefined> {
    const place = this.world.content.locations.get(from)!
    const exit = place.exits[dir]!
    if (!exitShown(this.world, from, dir)) {
      // A way that is hidden is searched for, plainly first, then with the words the place gives for it.
      await this.type('search')
      const entry = place.hidden.find((h) => h.exit === dir)
      for (const words of [...(entry?.words ?? []), ...(exit.words ?? [])]) {
        if (exitShown(this.world, from, dir)) break
        await this.type(`search ${words}`)
      }
      if (!exitShown(this.world, from, dir)) return `the way ${dir} from ${place.name} stays hidden: SEARCH did not find it`
    }
    for (let hour = 0; hour <= WAIT_HOURS; hour++) {
      const said = await this.type(`go ${dir}`)
      if (this.here === to) return undefined
      if (this.here !== from) return `GO ${dir.toUpperCase()} from ${place.name} came to ${this.name(this.here)}, not ${this.name(to)}`
      if (exit.lock && /locked/i.test(said)) {
        const word = exit.lock.word
        if (word && (this.knows(word) || (await this.askFor(word)))) {
          if (this.here !== from && (await this.goTo(from))) return `lost the way back to ${place.name} after asking for the code`
          await this.type(`type ${word}`)
          continue
        }
        return `${this.name(to)} is locked (${word ? 'a code' : 'a key'}), and nothing on the way gives the stranger the ${word ? 'code' : 'key'}`
      }
      // Not yet (a way that waits, a door shut for the night, someone in the way): an hour, as a player waits.
      if (hour < WAIT_HOURS) await this.type('wait 60')
      else return `GO ${dir.toUpperCase()} from ${place.name}: "${said.split('\n')[0]}"`
    }
    return `GO ${dir.toUpperCase()} from ${place.name} never let the stranger through`
  }

  /** To a place, along the exits, or by its name when no exit joins it (WALK TO, TRAVEL TO); why not, when it cannot. */
  async goTo(to: string): Promise<string | undefined> {
    let asked = false
    for (let tries = 0; tries < 8 && this.here !== to; tries++) {
      const steps = this.path(to)
      if (steps) {
        for (const [from, dir, next] of steps) {
          const why = await this.step(from, dir, next)
          if (why) return why
        }
        continue
      }
      // Across the land or by a line: the place by its name as the stranger knows it, or the area it lies in (the
      // Kattenbroek, where the widow lives, before the Black Pools are heard of).
      const before = this.here
      const area = this.world.content.areas.get(this.world.content.locations.get(to)?.area ?? '')?.name
      let said = ''
      for (const name of [this.name(to), ...(area ? [area] : [])]) {
        said = await this.type(`walk to ${name}`)
        if (this.here !== before) break
        said = await this.type(`travel to ${name}`)
        if (this.here !== before) break
      }
      // Never told where it lies: asked of the nearest person, as a player asks the way, once.
      if (this.here === before && !asked && /know where|know a place/i.test(said)) {
        asked = true
        if (await this.askWay([this.name(to), ...(area ? [area] : [])])) continue
      }
      if (this.here === before) return `the stranger cannot get from ${this.name(before)} to ${this.name(to)}: "${said.split('\n')[0]}"`
    }
    return this.here === to ? undefined : `the stranger did not reach ${this.name(to)}`
  }

  /** Asks the nearest person awake where a place lies (WHERE IS); whether the stranger walked anywhere after. */
  async askWay(names: string[]): Promise<boolean> {
    const awake = (id: string) => this.world.state.npcs[id]?.activity !== 'asleep' && !this.world.state.npcs[id]?.dead
    // By the exits from here, the first place with someone awake in it.
    const seen = new Set([this.here])
    const queue = [this.here]
    let who: string | undefined
    while (queue.length && !who) {
      const at = queue.shift()!
      who = this.world.npcsAt(at).find(awake)
      for (const exit of Object.values(this.world.content.locations.get(at)?.exits ?? {}) as { to: string }[]) {
        if (!seen.has(exit.to) && this.world.content.locations.has(exit.to)) {
          seen.add(exit.to)
          queue.push(exit.to)
        }
      }
    }
    if (!who || (who && (await this.meetHere(who)))) return false
    const before = this.here
    for (const name of names) {
      await this.type(`where is ${name}`)
      await this.bye()
      await this.type(`walk to ${name}`)
      if (this.here !== before) return true
    }
    return false
  }

  /** To someone a few doors away, by the exits; why not. */
  private async meetHere(npcId: string): Promise<string | undefined> {
    const at = this.world.state.npcs[npcId]?.location
    if (!at || at === this.here) return undefined
    const steps = this.path(at)
    if (!steps) return 'no way'
    for (const [from, dir, next] of steps) {
      const why = await this.step(from, dir, next)
      if (why) return why
    }
    return this.world.state.npcs[npcId]?.location === this.here ? undefined : 'gone'
  }

  /** To where a person is, following them while they move, waiting while they are away or asleep; why not, when never. */
  async meet(npcId: string): Promise<string | undefined> {
    // A place the stranger could not get to is not tried again every hour; the reason is kept.
    const shut = new Map<string, string>()
    for (let hour = 0; hour <= WAIT_HOURS; hour++) {
      const s = this.world.state.npcs[npcId]
      if (!s || s.dead) return `${this.name(npcId)} is dead`
      const there = this.world.content.locations.has(s.location) && this.world.present(npcId)
      if (there && s.location === this.here && s.activity !== 'asleep') return undefined
      if (there && s.location !== this.here && !shut.has(s.location)) {
        const why = await this.goTo(s.location)
        if (!why) continue
        shut.set(s.location, why)
      }
      await this.type('wait 60')
    }
    const s = this.world.state.npcs[npcId]
    const where = s && !this.world.content.locations.has(s.location) ? ' (out on the land, at no place)' : ''
    return shut.size ? `the stranger could not get to ${this.name(npcId)}: ${[...shut.values()][0]}` : `the stranger never found ${this.name(npcId)} awake and reachable in a day of looking${where}`
  }
}

/** What else sets a flag, for a reason a route gives: an encounter, a watcher, another story, or nothing. */
function setBy(content: Content, flag: string): string {
  const has = (x: unknown) => JSON.stringify(x ?? null).includes(`"${flag}"`)
  const enc = [...content.encounters.values()].find(has)
  if (enc) return `the encounter ${enc.id} sets it`
  const other = [...content.quests.values()].find((q) => has(q.actions) || has(q.stages) || has(q.outcomes))
  if (other) return `the story ${other.id} sets it`
  const watcher = [...content.watchers.values()].find(has)
  if (watcher) return `the watcher ${watcher.id} sets it`
  return has((content as { rules?: unknown }).rules) ? 'the rules set it, in a fight' : 'nothing sets it'
}

/** The deeds of a quest that set this flag (or count this count). */
function setting(q: Quest, flag: string): QuestAction[] {
  return (q.actions ?? []).filter((a) => a.effects.some((e) => ('set' in e && e.set === flag) || ('count' in e && e.count === flag)))
}

/** A story played by a stranger: begin it, do its deeds, wait for what it waits for. */
class Route {
  /** How deep the deeds that a deed needs go. */
  depth = 0
  constructor(
    readonly me: Stranger,
    readonly quest: Quest,
  ) {}

  /** Something the stranger must know first (the Water Wolf): asked of the story's people, then of whoever is near. */
  async learn(topic: string): Promise<string | undefined> {
    const { me, quest } = this
    const known = () => allHold(me.world, [{ knows: topic }], quest.id)
    const name = me.engine.topics.name(topic).replace(/^the\s+/i, '')
    const people = [...quest.givers, ...((quest as { helpers?: string[] }).helpers ?? [])].filter((n) => me.world.content.npcs.has(n))
    for (const n of people) {
      if (known()) break
      if (await me.meet(n)) continue
      await me.type(`talk ${me.world.npc(n).short}`)
      await me.type(`Tell me about the ${name}.`)
      await me.bye()
    }
    for (let i = 0; i < 4 && !known(); i++) {
      const near = me.world.npcsAt(me.here).filter((n) => me.world.state.npcs[n]?.activity !== 'asleep')
      for (const n of near) {
        if (known()) break
        await me.type(`talk ${me.world.npc(n).short}`)
        await me.type(`Tell me about the ${name}.`)
        await me.bye()
      }
      if (!known()) await me.type('wait 60')
    }
    return known() ? undefined : `the stranger must know of ${name} first, and nobody asked told them`
  }

  /** So many of a thing in hand, as a player gets it: taken where it lies, or bought where it is sold; why not, when not. */
  async fetch(item: string, qty: number): Promise<string | undefined> {
    const { me } = this
    const has = () => (me.engine.state.player.inventory[item] ?? 0) >= qty
    const name = me.world.content.items.get(item)?.name ?? item
    if (has()) return undefined
    // Given by a deed of the story (the toll letter Master Pen writes, the chest taken from the surveyor): that deed.
    const giving = (this.quest.actions ?? []).filter((a) => a.effects.some((e) => ('give' in e && e.give === item) || ('seize' in e && e.seize === item)))
    for (const a of giving) {
      if (this.depth > 3) break
      this.depth++
      const why = await this.deed(a)
      this.depth--
      if (!why && has()) return undefined
    }
    const lying = [...me.world.content.locations.values()].filter((l) => (l.items[item] ?? 0) > 0).map((l) => l.id)
    const sold = [...me.world.content.locations.values()].filter((l) => l.services.some((sv) => item in sv.sells || sv.supply.some((x) => x.item === item))).map((l) => l.id)
    for (const place of [...lying, ...sold]) {
      if (await me.goTo(place)) continue
      for (let hour = 0; hour <= WAIT_HOURS && !has(); hour++) {
        const before = me.engine.state.player.inventory[item] ?? 0
        await me.type(`${lying.includes(place) ? 'take' : 'buy'} ${name}`)
        if ((me.engine.state.player.inventory[item] ?? 0) > before) continue
        // What lay here is taken; a shop that is shut, or out of it, is waited for by the hour, as a player waits at the door.
        if (lying.includes(place)) break
        await me.type('wait 60')
      }
      if (has()) return undefined
    }
    const elsewhere = [...me.world.content.quests.values()].find((q) => q.id !== this.quest.id && JSON.stringify(q.actions ?? []).includes(`"${item}"`))
    return `it needs ${qty} ${name}, and the stranger found none to take or buy${lying.length + sold.length ? ` at ${[...lying, ...sold].map((p) => me.name(p)).join(', ')}` : ''}${giving.length ? ' (the deed that gives it did not)' : elsewhere ? ` (another story gives it: ${elsewhere.name})` : ''}`
  }

  get state() {
    return questlog(this.me.world)[this.quest.id]
  }

  /**
   * The story from how it began to an ending: this one, or whichever comes first
   * (a story played before another can begin). How it began, then each stage.
   */
  async play(ending?: string): Promise<RouteRun['stages']> {
    const { quest } = this
    const stages: RouteRun['stages'] = []
    const began = await this.begin()
    stages.push({ stage: 'begin', status: began ? 'not tested' : 'passed', ...(began ? { why: began } : {}) })
    if (began) return stages
    for (let turn = 0; turn <= (quest.stages?.length ?? 0); turn++) {
      const state = this.state
      if (!state || state.outcome || state.ended) break
      const stage = quest.stages?.find((s) => s.id === state.stage)
      if (!stage) break
      let why: string | undefined
      if (!stage.next.length) {
        // The last stage: an ending, typed as the quest page shows it (Ways it could end); the Now line names one of several.
        const targets = (quest.outcomes ?? []).filter((o) => !ending || o.id === ending)
        for (const o of targets) {
          // An ending by a death or what befalls a place comes by no deed of the stranger's.
          why = o.when.length ? await this.reach(o.when) : 'it ends by a death or by what befalls a place (on_death, on_place), not by a deed'
          if (this.state?.outcome) break
        }
      } else {
        // Before it, the first way on that a player can make, the Now line typed for its deed.
        for (const next of stage.next) {
          why = await this.reach(next.when, stage.goal)
          if (!why || this.state?.stage !== stage.id) break
        }
      }
      const now = this.state
      const moved = now?.stage !== stage.id || Boolean(now?.outcome)
      // Another ending than this run's is no pass for it.
      if (ending && now?.outcome && now.outcome !== ending) why ??= `it ended in ${now.outcome}, not ${ending}`
      stages.push({ stage: stage.id, status: moved && !why ? 'passed' : 'not tested', ...(why || !moved ? { why: why ?? 'the conditions held, and the story did not move on' } : {}) })
      if (!moved || why) break
    }
    return stages
  }

  /** What a story waits for before it can begin, made to hold as a player would; why not, when it cannot. */
  async gate(list: Condition[]): Promise<string | undefined> {
    const { me, quest } = this
    for (const c of list) {
      if (allHold(me.world, [c], quest.id)) continue
      if ('outcome' in c) {
        // Another story first (Flour for Veenhoek before a stall at the market): played to whichever ending comes.
        const [other] = String(c.outcome).split(':')
        const q = me.world.content.quests.get(other ?? '')
        if (!q || this.depth > 2) return `it waits for the end of ${q?.name ?? other}`
        const first = new Route(me, q)
        first.depth = this.depth + 1
        const run = await first.play()
        if (!allHold(me.world, [c], quest.id)) return `it waits for the end of ${q.name}, and that story's route did not end it (${run.find((x) => x.status !== 'passed')?.why ?? 'it ended otherwise'})`
        continue
      }
      if ('object' in c) return `it waits for the ${c.object.split('/').at(-1)} at ${me.name(c.object.split('/')[0] ?? '')} to be ${Object.entries(c.state).map(([k, v]) => `${v === false ? 'not ' : ''}${k}`).join(', ')}, which no deed of the stranger's does`
      if ('flag' in c && c.flag.startsWith('personal_')) {
        const npc = [...me.world.content.npcs.values()].find((n) => n.companion?.quest === quest.id)
        return `a companion's own story: it opens when ${npc ? me.name(npc.id) : 'the companion'} has travelled with the stranger to bond 3`
      }
      // Time (the second day, a season): waited for.
      if (!(await this.waitFor([c], WAIT_HOURS * 7))) return `it waits for ${JSON.stringify(c)}`
    }
    return undefined
  }

  /** How it begins, as a player meets it: the game, a person, a place, or the hour; why not, when it does not. */
  async begin(): Promise<string | undefined> {
    const { me, quest } = this
    const s = quest.starts
    if (this.state) return undefined
    const gated = await this.gate(s?.when ?? [])
    if (gated) return `it did not begin: ${gated}`
    // Begun by another story only (a flood that starts it): that story's route, not this one's.
    const from = [...me.world.content.quests.values()].find((q) => JSON.stringify([q.stages, q.outcomes, q.actions]).includes(`"start":"${quest.id}"`))
    if (from && !s?.talk.length && !s?.at.length && !s?.at_start) return `it begins from another story (${from.name}), not by itself`
    for (const npc of [...(s?.talk ?? []), ...(quest.ask ? quest.givers : [])]) {
      if (this.state) break
      if (await me.meet(npc)) continue
      await me.type(`talk ${me.world.npc(npc).short}`)
      // A story that waits in the talk begins when its subject comes up: what the stranger reads of it, asked about.
      const subjects = me.engine.topics.recognise([quest.summary, quest.stages?.[0]?.text ?? ''].join(' ')).filter((t) => !quest.givers.includes(t)).slice(0, 4)
      for (const t of ['What do you need of me?', ...subjects.map((id) => `Tell me about ${me.engine.topics.name(id)}.`)]) {
        if (this.state) break
        await me.type(t)
      }
      await me.bye()
    }
    for (const place of s?.at ?? []) {
      if (this.state) break
      const at = me.world.content.locations.has(place) ? place : [...me.world.content.locations.values()].find((l) => l.area === place)?.id
      if (at) await me.goTo(at)
    }
    return this.state ? undefined : `it did not begin: ${s?.at_start ? 'it begins with the game, and did not' : s?.talk.length || quest.ask ? `talking to ${[...(s?.talk ?? []), ...quest.givers].map((n) => me.name(n)).join(' or ')} did not begin it` : s?.at.length ? `coming to ${s.at.map((p) => me.name(p)).join(' or ')} did not begin it` : 'nothing a player does begins it'}`
  }

  /** Waits by the hour until the conditions hold, up to so many hours; whether they hold. */
  async waitFor(list: Condition[], hours: number): Promise<boolean> {
    for (let h = 0; h < hours && !allHold(this.me.world, list, this.quest.id); h++) await this.me.type('wait 60')
    return allHold(this.me.world, list, this.quest.id)
  }

  /** A deed, done as a player does it: where it is done, with whom, and typed as the quest shows it; why not, when not. */
  async deed(a: QuestAction, now?: string): Promise<string | undefined> {
    const { me } = this
    const done = () => Boolean(this.state?.done.includes(a.id))
    // What the deed needs first: the things it takes, the flags of earlier deeds, what is fresh; where it is done, last
    // (the cat is talked to at the Vissers', after the draught at Aaltje's).
    const where = (c: Condition): boolean => 'at' in c || 'here' in c || ('any' in c && c.any.every(where))
    for (const c of [...a.when.filter((x) => !where(x)), ...a.when.filter(where)]) {
      const fresh = 'not' in c && typeof c.not === 'object' && c.not !== null && 'since' in c.not
      if (allHold(me.world, [c], this.quest.id) || !('has' in c || 'flag' in c || 'knows' in c || 'any' in c || 'all' in c || 'count' in c || fresh || where(c))) continue
      if (this.depth > 3) return `it needs ${JSON.stringify(c)} first, too many deeds deep`
      this.depth++
      const why = await this.one(c)
      this.depth--
      if (why) return why
    }
    // Whoever it is done with, and where: a deed with someone at a place wants them along.
    if (a.with && a.at.length) {
      // At the place of the deed, waiting for the person as their day brings them (Sorell to the Peregrine); a person
      // who never comes is asked along.
      const place = a.at.find((p) => me.world.content.locations.has(p)) ?? [...me.world.content.locations.values()].find((l) => a.at.includes(l.area))?.id
      if (!place) return `its place (${a.at.join(', ')}) is no place the stranger can stand in`
      const here = () => me.world.state.npcs[a.with!]?.location === me.here && me.world.state.npcs[a.with!]?.activity !== 'asleep'
      const to = await me.goTo(place)
      if (to) return to
      for (let hour = 0; hour < WAIT_HOURS * 3 && !here(); hour++) await me.type('wait 60')
      if (!here()) {
        const why = await me.meet(a.with)
        if (why) return why
        await me.type(`recruit ${me.world.npc(a.with).short}`)
        await me.bye()
        const back = await me.goTo(place)
        if (back) return back
        if (!here()) return `${me.name(a.with)} never comes to ${me.name(place)} in three days, and would not come along (RECRUIT)`
      }
    } else if (a.with) {
      const why = await me.meet(a.with)
      if (why) return why
    } else if (a.at.length) {
      const place = a.at.find((p) => me.world.content.locations.has(p)) ?? [...me.world.content.locations.values()].find((l) => a.at.includes(l.area))?.id
      if (!place) return `its place (${a.at.join(', ')}) is no place the stranger can stand in`
      const why = await me.goTo(place)
      if (why) return why
    }
    // What is typed: the Now line, then the deed as the quest page shows it (You could), then its intent.
    const lines = [...new Set([now?.trim().replace(/[.!]+$/, ''), plainWords(a.say[0] ?? ''), a.intent].filter((l): l is string => Boolean(l?.trim())))]
    for (const inTalk of [false, true]) {
      if (inTalk && !a.with) break
      for (const line of lines) {
        let waits = 0
        let fails = 0
        while (!done()) {
          if (inTalk && !me.engine.state.talk) await me.type(`talk ${me.world.npc(a.with!).short}`)
          const said = await me.type(line)
          if (!inTalk) await me.bye()
          if (done()) break
          // Not yet (by daylight, a door shut): an hour and again; a check failed: again, a few times.
          if (a.not_yet && said.includes(a.not_yet) && waits++ < WAIT_HOURS) await me.type('wait 60')
          else if (!(a.fail_text && said.includes(a.fail_text) && fails++ < 5)) break
        }
        if (inTalk) await me.bye()
        if (done()) return undefined
      }
    }
    return `typing "${lines[0] ?? a.id}" ${a.with ? `with ${me.name(a.with)}` : `at ${me.name(me.here)}`} did not do the deed`
  }

  /** Makes the conditions hold as a player would: the deeds that set their flags, a person met, the time waited. */
  async reach(list: Condition[], now?: string): Promise<string | undefined> {
    for (const c of list) {
      if (allHold(this.me.world, [c], this.quest.id)) continue
      const why = await this.one(c, now)
      if (why) return why
      now = undefined
    }
    return undefined
  }

  private async one(c: Condition, now?: string): Promise<string | undefined> {
    const { me, quest } = this
    if ('flag' in c) {
      const deeds = setting(quest, c.flag)
      if (!deeds.length) return `the flag ${c.flag} is set by no deed of the story (${setBy(me.world.content, c.flag)})`
      // Each deed that sets it, in turn, until one does (the cat studied, or Aaltje asked); a way that fails is undone
      // first, as a player loads the save, so it costs the next nothing (the flour bought that left too little for rye).
      let first: string | undefined
      for (const [i, a] of deeds.entries()) {
        const save = i < deeds.length - 1 ? me.keep() : undefined
        const why = await this.deed(a, now)
        if (!why || allHold(me.world, [c], quest.id)) return undefined
        first ??= why
        if (save) me.back(save, `to try ${a.intent ?? plainWords(deeds[i + 1]!.say[0] ?? '')} instead`)
        else if (questlog(me.world)[quest.id]?.outcome) break
      }
      return first
    }
    if ('has' in c) return this.fetch(c.has, c.qty ?? 1)
    // Within so many hours of something (the cat understood for three hours after the draught): a deed that stamps it.
    if ('not' in c && typeof c.not === 'object' && c.not !== null && 'since' in c.not) {
      const stamp = (c.not as { since: string }).since
      const deeds = (quest.actions ?? []).filter((a) => a.effects.some((e) => 'stamp' in e && e.stamp === stamp))
      if (!deeds.length) return `${stamp} is stamped by no deed of the story`
      let first: string | undefined
      for (const [i, a] of deeds.entries()) {
        const save = i < deeds.length - 1 ? me.keep() : undefined
        const why = await this.deed(a)
        if (!why && allHold(me.world, [c], quest.id)) return undefined
        first ??= why ?? `${a.id} did not make it hold`
        if (save) me.back(save, `to try ${a.intent ?? plainWords(deeds[i + 1]!.say[0] ?? '')} instead`)
      }
      return first
    }
    if ('knows' in c && typeof c.knows === 'string') return this.learn(c.knows)
    if ('any' in c) {
      let first: string | undefined
      for (const alt of c.any) {
        const why = await this.reach([alt], now)
        if (!why) return undefined
        first ??= why
      }
      return first
    }
    if ('all' in c) return this.reach(c.all, now)
    if ('here' in c) return me.meet(c.here)
    if ('at' in c && typeof c.at === 'string') {
      const place = me.world.content.locations.has(c.at) ? c.at : [...me.world.content.locations.values()].find((l) => l.area === c.at)?.id
      return place ? me.goTo(place) : `${c.at} is no place to stand in`
    }
    if ('talked' in c) {
      const why = await me.meet(c.talked)
      if (why) return why
      await me.type(`talk ${me.world.npc(c.talked).short}`)
      for (const t of c.about ?? []) {
        if (allHold(me.world, [c], quest.id)) break
        await me.type(`Tell me about the ${me.engine.topics.name(t).replace(/^the\s+/i, '')}.`)
      }
      await me.bye()
      return allHold(me.world, [c], quest.id) ? undefined : `talking to ${me.name(c.talked)} about ${(c.about ?? []).join(', ')} did not count`
    }
    if ('count' in c && 'at_least' in c) {
      const deeds = setting(quest, c.count)
      if (!deeds.length) return `the count ${c.count} is counted by no deed of the story`
      // Once a day, as the deed allows it again.
      for (let day = 0; day < (c.at_least as number) + 2 && !allHold(me.world, [c], quest.id); day++) {
        const why = await this.deed(deeds[0]!, now)
        if (why && day === 0) return why
        if (this.state) this.state.done = this.state.done.filter((d) => d !== deeds[0]!.id)
        await this.waitFor([c], 24)
      }
      return allHold(me.world, [c], quest.id) ? undefined : `doing ${deeds[0]!.id} day after day did not reach ${c.at_least}`
    }
    // What time brings: a person somewhere, waited for by the hour; days and clocks, by the quarter day, two months at most.
    if ('since' in c || 'npc_at' in c) return (await this.waitFor([c], WAIT_HOURS * 8)) ? undefined : `waited a week and ${JSON.stringify(c)} did not hold`
    if ('days' in c || 'clock_full' in c) {
      for (let q = 0; q < 4 * 60 && !allHold(me.world, [c], quest.id) && !this.state?.outcome; q++) await me.type('wait 6 hours')
      return allHold(me.world, [c], quest.id) || this.state?.outcome ? undefined : `waited two months and ${JSON.stringify(c)} did not hold`
    }
    return `${Object.keys(c)[0]}: a route cannot make it happen (${JSON.stringify(c)})`
  }
}

/**
 * One story played to one of its endings from a new game, by what a player
 * types (M10.34 B): how it began, each stage, and whether the ending came.
 */
export async function playRoute(content: Content, questId: string, ending: string, llm?: LlmClient, seed = 7): Promise<RouteRun> {
  const quest = content.quests.get(questId)
  const first = new Engine(content, { seed, ...(llm ? { llm } : {}) })
  first.start()
  const start = first.world.now
  const me = new Stranger(first, llm)
  const stages: RouteRun['stages'] = []
  const run = (): RouteRun => ({ quest: questId, ending, reached: questlog(me.world)[questId]?.outcome === ending, stages, typed: me.typed, minutes: me.world.now - start })
  const target = quest?.outcomes?.find((o) => o.id === ending)
  if (!quest?.stages?.length || !target) return run()
  const route = new Route(me, quest)
  try {
    stages.push(...(await route.play(ending)))
  } catch (e) {
    if (!(e instanceof RouteTooLong)) throw e
    stages.push({ stage: questlog(me.world)[questId]?.stage ?? 'begin', status: 'not tested', why: `the route typed ${MAX_TYPED} lines and was stopped` })
  }
  return run()
}

/** Every ending of every story of a world, each played by its own route from a new game. */
export async function playRoutes(content: Content, llm?: LlmClient): Promise<RouteRun[]> {
  const out: RouteRun[] = []
  for (const q of content.quests.values()) for (const o of q.outcomes ?? []) out.push(await playRoute(content, q.id, o.id, llm))
  return out
}

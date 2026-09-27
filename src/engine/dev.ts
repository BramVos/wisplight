import { callName } from './content'
import { attitude, relation, situation } from './dialogue/relations'
import type { Engine } from './engine'
import { faithOf } from './faith'
import { npcSnapshot, type NpcSnapshot } from './playtest'
import { planOf, stepHeld } from './quests/plans'
import { householdKey, householdPurses, middlePurse, standingName, standingOf } from './standing'
import { nameOf } from './aftermath'

// Under the bonnet (M10.1; roadmap, "Onder de motorkap"): what the dev menu
// shows of the running game. It only reads: nothing here changes the state,
// and every intervention of the menu is an @-command through the engine and
// its log. Only development builds bundle the menu that asks for it.

export type DevSection = 'people' | 'background' | 'chronicler'

/** A value that steers someone, and where it comes from. */
export interface DevSlider {
  name: string
  value: string
  why: string
}

export interface DevPerson extends NpcSnapshot {
  faith?: string
  sliders: DevSlider[]
  bonds: { who: string; affinity: number; trust: number; fear: number; familiarity: number }[]
  knows: string[]
  thoughts: string[]
}

export interface DevPlan {
  id: string
  name: string
  source: string
  subjects: string[]
  started: string
  state: string
  steps: { id: string; verb: string; state: string; held?: string }[]
}

export interface DevView {
  now: string
  people?: { list: { id: string; name: string; where: string }[]; person?: DevPerson }
  background?: {
    queue: string[]
    signals: string[]
    plans: DevPlan[]
    ledgers: { id: string; name: string; purse: number; short: string[]; surplus: string[]; stock: string[] }[]
  }
  chronicler?: {
    pending: string[]
    runs: { run: string; when: string; lines: string[]; offered: string[]; names: number; lore: string[]; notes: string[]; plans: string[]; problems: string[] }[]
    lines: string[]
  }
  /** What the steering buttons may pick from. */
  choices: { plans: string[]; realms: string[]; items: string[]; signals: string[]; people: string[] }
}

const round = (n: number) => Math.round(n * 10) / 10

function person(engine: Engine, id: string): DevPerson {
  const world = engine.world
  const npc = world.npc(id)
  const purses = householdPurses(world)
  const level = standingOf(world, id, purses)
  const purse = purses.get(householdKey(world, id)) ?? 0
  // Read without leaving a trace: relation() makes an empty one when there is none, so it goes again.
  const had = world.state.relations !== undefined
  const hadOne = Boolean(world.state.relations?.[id])
  const rel = { ...relation(world.state, id) }
  const att = attitude(world, id)
  if (!hadOne) delete world.state.relations![id]
  if (!had) delete world.state.relations
  const mood = world.npcState(id).mood
  const heard = world.state.news?.heard[id] ?? {}
  const facts = world.state.news?.facts ?? []
  return {
    ...npcSnapshot(engine, id),
    ...(faithOf(world, id) ? { faith: world.content.world.faiths.find((f) => f.id === faithOf(world, id))?.name ?? faithOf(world, id) } : {}),
    sliders: [
      { name: 'standing', value: standingName(world, level), why: `household purse ${purse} against the middle of ${Math.round(middlePurse(world, purses))}${level >= 3 && purse < middlePurse(world, purses) * 1.5 ? ', one up for an office' : ''}` },
      { name: 'attitude to the player', value: `${att.band} (${att.score})`, why: `affinity ${rel.affinity} + half the trust ${round(rel.trust / 2)} + warmth ${npc.personality.warmth * 5}${mood && mood.until > world.now ? ` + mood ${mood.value} (${mood.reason})` : ''} + the situation ${situation(world, id)}` },
      { name: 'bond with the player', value: `affinity ${rel.affinity}, trust ${rel.trust}, fear ${rel.fear}`, why: 'from what the player said and did (dialogue and deeds)' },
      { name: 'familiarity with the player', value: String(rel.familiarity), why: 'grows with every talk, sinks after four weeks apart' },
    ],
    bonds: Object.entries(world.state.bonds?.[id] ?? {})
      .sort((a, b) => b[1].familiarity - a[1].familiarity || a[0].localeCompare(b[0]))
      .slice(0, 8)
      .map(([who, b]) => ({ who: nameOf(world, who), affinity: b.affinity, trust: b.trust, fear: b.fear, familiarity: b.familiarity })),
    knows: facts
      .filter((f) => heard[f.id])
      .slice(-12)
      .reverse()
      .map((f) => `${f.title} (level ${heard[f.id]!.level}, from ${heard[f.id]!.from === 'witness' ? 'seeing it' : nameOf(world, heard[f.id]!.from)})`),
    thoughts: (world.npcState(id).thoughts ?? []).filter((t) => t.until > world.now).map((t) => t.text),
  }
}

/** What the dev menu shows of a section of the running game, and of one person when asked. Reads only. */
export function devView(engine: Engine, section: DevSection, focus?: string): DevView {
  const world = engine.world
  const date = (t: number) => world.date(t).split(',').slice(0, 2).join(',')
  const view: DevView = {
    now: world.date(),
    choices: {
      plans: [...world.content.plans.keys()].sort(),
      realms: [...world.content.realms.keys()].filter((r) => r !== world.content.world.id).sort(),
      items: [...world.content.items.keys()].sort(),
      signals: [...new Set([...world.content.watchers.values()].map((w) => w.signal))].sort(),
      people: Object.keys(world.state.npcs).filter((id) => world.content.npcs.has(id)).sort(),
    },
  }
  if (section === 'people') {
    const list = Object.keys(world.state.npcs)
      .filter((id) => world.content.npcs.has(id))
      .sort((a, b) => world.npc(a).name.localeCompare(world.npc(b).name))
      .map((id) => {
        const s = world.state.npcs[id]!
        return { id, name: world.npc(id).name, where: s.dead ? 'dead' : s.absent ? 'gone' : world.content.locations.has(s.location) ? world.location(s.location).name : s.location }
      })
    view.people = { list, ...(focus && world.content.npcs.has(focus) ? { person: person(engine, focus) } : {}) }
  }
  if (section === 'background') {
    const signals = world.state.signals
    const line = (s: { kind: string; event?: string; who: string[]; place: string; watcher: string; handled?: string; cause: string[]; t: number }) =>
      `${date(s.t)}: ${s.kind}${s.event ? ` (${s.event})` : ''}${s.who.length ? ` for ${s.who.map((w) => nameOf(world, w)).join(', ')}` : ` at ${nameOf(world, s.place)}`}, watcher ${s.watcher}, ${s.handled ? `taken up by ${s.handled}` : 'waiting'}${s.cause.length ? `, from ${s.cause.length} fact${s.cause.length === 1 ? '' : 's'}` : ''}`
    view.background = {
      queue: (signals?.queue ?? []).map(line),
      signals: [...(signals?.log ?? [])].slice(-30).reverse().map(line),
      plans: (world.state.plans ?? [])
        .filter((p) => p.ended === undefined)
        .map((p) => {
          const plan = planOf(world, p.plan)
          return {
            id: p.id ?? p.plan,
            name: plan?.name ?? p.plan,
            source: p.source ?? 'content',
            subjects: (p.subjects ?? []).map((s) => nameOf(world, s)),
            started: date(p.started),
            state: plan && p.phase < plan.phases.length ? `phase ${p.phase + 1} of ${plan.phases.length}` : 'running',
            steps: (plan?.steps ?? []).map((step) => {
              const st = p.steps?.[step.id]
              const verb = Object.keys(step.do)[0] ?? ''
              const state = st?.done !== undefined ? `done ${date(st.done)}` : st?.skipped !== undefined ? `skipped ${date(st.skipped)}` : st?.due !== undefined ? (st.due > world.now ? `due ${date(st.due)}` : 'due now') : 'waiting for an earlier step'
              const held = st?.done === undefined && st?.skipped === undefined && st?.due !== undefined && st.due <= world.now ? stepHeld(world, p, step) : undefined
              return { id: step.id, verb, state, ...(held ? { held } : {}) }
            }),
          }
        }),
      ledgers: Object.entries(world.state.economy?.ledgers ?? {})
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([id, l]) => ({
          id,
          name: world.content.areas.get(id)?.name ?? id,
          purse: Math.round(l.purse),
          short: Object.entries(l.short).filter(([, d]) => d > 0).map(([i, d]) => `${i} (${d} days)`),
          surplus: Object.entries(l.surplus).filter(([, d]) => d).map(([i]) => i),
          stock: Object.entries(l.stock).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([i, n]) => `${Math.round(n)} ${i}`),
        })),
    }
  }
  if (section === 'chronicler') {
    const state = world.state.chronicle
    const title = (id: string) => world.state.news?.facts.find((f) => f.id === id)?.title ?? id
    const lineTitle = (id: string) => state?.lines.find((l) => l.id === id)?.title ?? id
    view.chronicler = {
      pending: (state?.pending ?? []).map((r) => `${r.id} (${r.reason}): ${r.lines.map(lineTitle).join('; ')}${r.signals?.length ? `, ${r.signals.length} signals` : ''}`),
      runs: [...engine.devRuns].reverse().map((r) => ({
        run: r.run,
        when: date(r.t),
        lines: r.lines.map(lineTitle),
        offered: r.offered.facts.map(title),
        names: r.offered.allowed.length,
        lore: (r.output?.lore ?? []).map((l) => l.name),
        notes: (r.output?.lines ?? []).map((l) => `${lineTitle(l.line)}: ${l.summary.join(' ')}${l.phase ? ` (${l.phase})` : ''}`),
        plans: (r.output?.plans ?? []).map((p) => p.name),
        problems: r.problems,
      })),
      lines: (state?.lines ?? [])
        .filter((l) => l.open)
        .map((l) => `${l.title}: ${l.phase ?? 'no phase yet'}, ${l.facts.length} facts${l.follows ? `, follows "${lineTitle(l.follows)}"` : ''}${l.next ? `; next: ${l.next}` : ''}`),
    }
  }
  return view
}

/** A person's name as the steering buttons show it. */
export function devName(engine: Engine, id: string): string {
  return engine.world.content.npcs.has(id) ? callName(engine.world.npc(id)) : id
}

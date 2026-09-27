import type { Content } from './content'
import { callName } from './content'
import { Engine } from './engine'
import { MINUTES_PER_DAY } from './clock'
import type { NpcState } from './state'
import { nameOf, planLines } from './aftermath'
import { planOf } from './quests/plans'
import { standingName, standingOf } from './standing'

// Playtest tools of the editor (M8, FO chapter 15, "Speeltest"): the world
// runs a week or a month without a player, and the report says what went
// wrong (someone starving, someone stuck), what the world talked about, how
// the quests stand, and how every person ends up. The NPC inspector shows one
// person: where they are, what they want and plan, what they remember, and
// their days. Pure: the same run in the desktop editor, the preview and tests.

export interface NpcSnapshot {
  id: string
  name: string
  location: string
  activity: string
  needs: Record<string, number>
  mood?: string
  goals: string[]
  plan: string[]
  memory: string[]
  /** What they did, oldest first: departures and arrivals left out. */
  days: string[]
  dead: boolean
  /** Where they live and work now, and ties that changed in play (M8.1): the layer over the content. */
  life: string[]
  /** Plans they are part of that are still running: their own intentions among them (M8.2). */
  plans: string[]
  /** What they believe or doubt of the claims they heard (M8.2). */
  beliefs: string[]
}

export interface SimReport {
  world: string
  days: number
  seed: number
  from: string
  to: string
  /** Invariants that broke: a crash, someone starving, someone stuck. */
  problems: string[]
  /** One line per day: what the shops hold, the requests, the news. */
  diary: string[]
  /** Facts of some weight, in the order they happened. */
  news: string[]
  quests: { id: string; name: string; state: string }[]
  people: NpcSnapshot[]
  /** Signals and what took them up, and the plans of the aftermath with how they ended (M8.1). */
  signals: string[]
  plans: string[]
}

/** Runs a world without the player for some days. */
export function simulate(content: Content, days: number, seed = 1): SimReport {
  const engine = new Engine(content, { seed })
  const world = engine.world
  engine.start()
  const from = world.date()
  const problems: string[] = []
  const diary: string[] = []
  const lastMove = new Map<string, { location: string; activity: string; since: number }>()
  const timeline = new Map<string, string[]>()
  let lastSeq = world.state.eventSeq
  for (let day = 1; day <= days; day++) {
    for (let hour = 0; hour < 24; hour++) {
      try {
        engine.tick(60)
      } catch (error) {
        problems.push(`Crash on day ${day}, hour ${hour}: ${(error as Error).message}`)
        day = days + 1
        break
      }
      for (const [id, npc] of Object.entries(world.state.npcs)) {
        if (npc.needs.hunger === 0 && !npc.dead && !npc.absent) problems.push(`${id} is starving (${world.date()})`)
        const seen = lastMove.get(id)
        if (!seen || seen.location !== npc.location || seen.activity !== npc.activity) lastMove.set(id, { location: npc.location, activity: npc.activity, since: world.now })
        else if (world.now - seen.since > 16 * 60 && !['asleep', 'ill in bed', 'mourning at home'].includes(npc.activity) && !npc.dead && !npc.absent) problems.push(`${id} stuck at ${npc.location} (${npc.activity}) since ${world.date(seen.since)}`)
      }
      for (const e of world.state.events.filter((e) => e.seq > lastSeq)) {
        if (!e.actor || e.kind === 'depart' || e.kind === 'arrive') continue
        const list = timeline.get(e.actor) ?? []
        list.push(`${world.date(e.t).replace(/ \d+ [A-Z]{1,3},/, ',')}: ${e.text}`)
        timeline.set(e.actor, list.slice(-60))
      }
      lastSeq = world.state.eventSeq
    }
    const shops = [...content.locations.values()].flatMap((l) => l.services.filter((s) => Object.keys(s.sells).length).map((s) => `${s.id} ${Object.entries(world.stock(l.id, s.id)).map(([item, n]) => `${n} ${item}`).join(', ') || 'empty'}`))
    const requests = world.state.requests.filter((r) => r.status === 'open').map((r) => `${callName(world.npc(r.npc))} wants ${r.qty} ${r.item ?? r.kind}`)
    const today = (world.state.news?.facts ?? []).filter((f) => f.t > world.now - MINUTES_PER_DAY && f.t <= world.now)
    diary.push(`Day ${day}, ${world.date(world.now - 1).split(',')[0]}: ${[shops.length ? `shops: ${shops.join('; ')}` : '', requests.length ? `asked for: ${requests.join('; ')}` : '', today.length ? `news: ${today.map((f) => f.title).join('; ')}` : ''].filter(Boolean).join('. ') || 'a quiet day'}.`)
  }
  const questlog = world.state.questlog ?? {}
  return {
    world: content.world.name,
    days,
    seed,
    from,
    to: world.date(),
    problems: [...new Set(problems)].slice(0, 40),
    diary,
    news: (world.state.news?.facts ?? []).filter((f) => f.belang >= 2).map((f) => `${world.date(f.t).split(',')[0]}, ${world.location(f.place).name}: ${f.title} (belang ${f.belang})`),
    quests: [...content.quests.values()].map((q) => {
      const s = questlog[q.id]
      const outcome = s?.outcome ? q.outcomes?.find((o) => o.id === s.outcome)?.name ?? s.outcome : undefined
      return { id: q.id, name: q.name, state: outcome ? `ended: ${outcome}` : s ? `running, at ${s.stage ?? 'the start'}` : 'not started' }
    }),
    people: Object.keys(world.state.npcs)
      .sort()
      .map((id) => snapshot(engine, id, timeline.get(id) ?? [])),
    signals: (world.state.signals?.log ?? []).map((s) => `${world.date(s.t).split(',')[0]}: ${s.kind}${s.event ? ` (${s.event})` : ''}${s.who.length ? ` for ${s.who.map((w) => nameOf(world, w)).join(' and ')}` : ` at ${nameOf(world, s.place)}`}, ${s.handled === 'rules' ? 'the standard aftermath' : 'nobody took it up'}`),
    plans: (world.state.plans ?? []).map((p) => {
      const plan = planOf(world, p.plan)
      const how = p.ended !== undefined ? `${p.outcome ?? 'done'} ${world.date(p.ended).split(',')[0]}` : plan && p.phase < plan.phases.length ? `phase ${p.phase + 1} of ${plan.phases.length}` : 'running'
      return `${plan?.name ?? p.plan}${p.subjects?.length ? ` for ${p.subjects.map((x) => nameOf(world, x)).join(' and ')}` : ''}: ${how}`
    }),
  }
}

function snapshot(engine: Engine, id: string, days: string[]): NpcSnapshot {
  const world = engine.world
  const npc = world.state.npcs[id] as NpcState
  const place = (to: string) => (world.content.locations.has(to) ? world.location(to).name : to)
  return {
    id,
    name: world.npc(id).name,
    location: npc.dead ? 'dead' : npc.absent ? 'not in the world' : place(npc.location),
    activity: npc.activity,
    needs: Object.fromEntries(Object.entries(npc.needs).map(([k, v]) => [k, Math.round(v)])),
    ...(npc.mood && npc.mood.until > world.now ? { mood: `${npc.mood.value > 0 ? 'glad' : 'upset'}: ${npc.mood.reason}` } : {}),
    goals: npc.goals.map((g) => `${g.type}${g.target ? ` ${g.target}` : ''}${g.item ? ` ${g.item}` : ''} (${g.source}, ${g.priority.toFixed(2)})`),
    plan: npc.plan.map((s) => `${s.kind}${'to' in s ? ` to ${place(s.to)}` : ''}${'item' in s ? ` ${s.item}` : ''}`),
    memory: (npc.memory ?? []).slice(-8).map((m) => `${world.date(m.t).split(',')[0]}: ${m.note}`),
    days,
    dead: Boolean(npc.dead),
    life: lifeOf(engine, id),
    plans: planLines(world, id),
    beliefs: beliefsOf(engine, id),
  }
}

/** Claims they heard: what they believe, doubt or reject, newest first. */
function beliefsOf(engine: Engine, id: string): string[] {
  const world = engine.world
  const heard = world.state.news?.heard[id] ?? {}
  return (world.state.news?.facts ?? [])
    .filter((f) => f.claim && heard[f.id])
    .reverse()
    .slice(0, 8)
    .map((f) => {
      const h = heard[f.id]!
      const value = h.level === 1 && f.claim!.far !== undefined ? f.claim!.far : f.claim!.value
      return `${h.stance ?? 'believes'}: ${nameOf(world, f.claim!.subject)} ${f.claim!.key} ${nameOf(world, value)}${f.truth === false ? ' (untrue)' : ''}, from ${h.from === 'witness' ? 'seeing it' : nameOf(world, h.from)}`
    })
}

/** Home, work, household and ties as they are now, where the game changed them. */
function lifeOf(engine: Engine, id: string): string[] {
  const world = engine.world
  const now = world.npc(id)
  const was = world.content.npcs.get(id)!
  const lines = [`Lives at ${world.location(now.home).name}${now.home !== was.home ? ` (moved from ${world.location(was.home).name})` : ''}.`, `${standingName(world, standingOf(world, id)).replace(/^./, (c) => c.toUpperCase())}.`]
  lines.push(now.work ? `Works at ${world.location(now.work).name}${now.work !== was.work ? ' (new)' : ''}.` : `No work${was.work ? ` (left ${world.location(was.work).name})` : ''}.`)
  if (now.household !== was.household) lines.push(now.household ? `Household ${now.household} now.` : 'No household any more.')
  for (const [other, change] of Object.entries(world.state.layer?.ties?.[id] ?? {})) lines.push(change ? `${nameOf(world, other)}: ${change.role} since ${world.date(change.t).split(',')[0]}.` : `No tie with ${nameOf(world, other)} any more.`)
  return lines
}

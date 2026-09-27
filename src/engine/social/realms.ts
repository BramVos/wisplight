import { recordFact } from '../news'
import type { World } from '../world'

// Statecraft (design: lore and world change, "Staatkunde"): per pair of realms
// a tension from 0 to 100. Allied below 20, neutral below 50, tense below 80,
// war from 80. Events shift it by fixed rules, bounded; crossing into war is
// news of belang 5. Between events it drifts a little, back towards where it began.

export type Stance = 'allied' | 'neutral' | 'tense' | 'war'

export function pairKey(a: string, b: string): string {
  return [a, b].sort().join('|')
}

export function stanceOf(tension: number): Stance {
  return tension < 20 ? 'allied' : tension < 50 ? 'neutral' : tension < 80 ? 'tense' : 'war'
}

export function tensions(world: World): Record<string, number> {
  const state = (world.state.tension ??= {})
  for (const t of world.content.tensions) state[pairKey(t.between[0], t.between[1])] ??= t.tension
  return state
}

export function tensionOf(world: World, a: string, b: string): number {
  return tensions(world)[pairKey(a, b)] ?? 35
}

/** Shifts the tension between two realms, at most ten points at a time. */
export function shiftTension(world: World, a: string, b: string, delta: number, why: string): void {
  const state = tensions(world)
  const key = pairKey(a, b)
  const before = state[key] ?? 35
  const after = Math.max(0, Math.min(100, before + Math.max(-10, Math.min(10, delta))))
  state[key] = after
  const was = stanceOf(before)
  const now = stanceOf(after)
  if (was === now) return
  const ra = world.content.realms.get(a)
  const rb = world.content.realms.get(b)
  if (!ra || !rb) return
  const war = now === 'war'
  const peace = was === 'war'
  // A war that touches the player's land has its effect plan waiting (quests/plans.ts).
  const home = world.content.world.id
  if (war && (a === home || b === home)) {
    const other = a === home ? b : a
    const plan = world.content.plans.has(`war_${other}`) ? `war_${other}` : world.content.plans.has('war') ? 'war' : undefined
    if (plan) (world.state.pendingPlans ??= []).push(plan)
  }
  recordFact(world, {
    kind: 'realm',
    about: [],
    place: world.content.world.start.location,
    belang: war ? 5 : peace ? 4 : 3,
    juice: war ? 1 : 0.7,
    title: war ? `war between ${ra.name} and ${rb.name}` : peace ? `peace between ${ra.name} and ${rb.name}` : `${ra.name} and ${rb.name}: ${now}`,
    text: {
      precise: war ? `${cap(ra.name)} and ${rb.name} are at war (${why}).` : peace ? `${cap(ra.name)} and ${rb.name} have made peace.` : `Things between ${ra.name} and ${rb.name} are ${now} now (${why}).`,
      village: war ? `There's war, they say, between ${ra.name} and ${rb.name}.` : `They say ${ra.name} and ${rb.name} are ${now === 'allied' ? 'friends now' : now === 'tense' ? 'at each other again' : 'getting on'}.`,
      far: war ? `War between ${ra.name} and ${rb.name}.` : `News from the capitals.`,
    },
  })
}

/** Once a day: a small drift, back towards where each tension began. */
export function realmsDay(world: World): void {
  const state = tensions(world)
  for (const t of world.content.tensions) {
    const key = pairKey(t.between[0], t.between[1])
    const now = state[key] ?? t.tension
    const pull = Math.sign(t.tension - now)
    const step = world.rng.int('realms', -1, 1) + pull
    // Drift alone never tips a relation over: that takes events.
    if (step && stanceOf(now + step) === stanceOf(now)) state[key] = Math.max(0, Math.min(100, now + step))
  }
}

export function realmLines(world: World): string[] {
  const lines: string[] = []
  for (const r of world.content.realms.values()) lines.push(`${cap(r.name)}: ruled by ${r.ruler}, from ${r.capital}.`)
  for (const t of world.content.tensions) {
    const [a, b] = t.between
    const value = tensionOf(world, a, b)
    lines.push(`${cap(world.content.realms.get(a)!.name)} and ${world.content.realms.get(b)!.name}: ${stanceOf(value)}. ${t.why}`)
  }
  return lines
}

/** A page for one realm: its ruler, and how it stands with the others. */
export function realmPage(world: World, id: string): string[] | undefined {
  const realm = world.content.realms.get(id)
  if (!realm) return undefined
  const lines = [`Ruled by ${realm.ruler}, from ${realm.capital}.`]
  for (const t of world.content.tensions) {
    if (!t.between.includes(id)) continue
    const other = world.content.realms.get(t.between[0] === id ? t.between[1] : t.between[0])
    if (other) lines.push(`With ${other.name}: ${stanceOf(tensionOf(world, t.between[0], t.between[1]))}. ${t.why}`)
  }
  return lines
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

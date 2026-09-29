import type { Output } from './commands'
import { callName } from './content'
import { relation } from './dialogue/relations'
import { factionsOf } from './social/factions'
import { knob } from './knobs'
import { recordFact } from './news'
import { playerCheck } from './rules/player'
import { tideState } from './tides'
import type { Tide } from './tideschema'
import type { World } from './world'

// The player weighs in on a great line (M10.22): whoever has standing (a
// faction of either side, or the trust of both) may, once the line stands at
// its threat or above, bring its two sides to one table. That is content, not
// code per line: a line names who sits at the table, how much a good outcome
// eases it, and what the chronicle says afterwards. Persuade and Insight
// decide, where the world has those skills; the trust of both sides where it
// has not. The outcome shifts the line's pressure, at most ten points either
// way, the existing rule for a shift.

/** The line whose table these two are, standing at its threat or above; undefined otherwise. */
export function tideBetween(world: World, a: string, b: string): Tide | undefined {
  return [...world.content.tides.values()].find((t) => {
    const m = t.mediation
    return m && ((m.between[0] === a && m.between[1] === b) || (m.between[0] === b && m.between[1] === a)) && tideState(world, t.id).pressure >= t.threat
  })
}

/** Whether the stranger may set the table: a member of a faction either side belongs to, or trusted by both. */
function standing(world: World, a: string, b: string): boolean {
  const theirs = new Set([...factionsOf(world, a), ...factionsOf(world, b)])
  const mine = world.state.memberships ?? []
  if (mine.some((f) => theirs.has(f))) return true
  return relation(world.state, a).trust >= 20 && relation(world.state, b).trust >= 20
}

/**
 * MEDIATE BETWEEN the two sides of a great line, with both at the table: the
 * checks, the shift of the pressure, and what the chronicle will say.
 */
export function mediateTide(world: World, tide: Tide, a: string, b: string): Output[] {
  const m = tide.mediation!
  const [na, nb] = [callName(world.npc(a)), callName(world.npc(b))]
  const here = world.npcsAt(world.state.player.location)
  if (!here.includes(a) || !here.includes(b)) return [{ kind: 'error', text: `To bring ${na} and ${nb} to one table, both have to be here: agree to meet them both, at one place and hour.` }]
  if (!standing(world, a, b)) return [{ kind: 'narration', text: `${na} and ${nb} hear you out, but neither owes you a seat at their table. It would take one of their own, or the trust of both.` }]
  const skills = world.content.rules?.skills.map((s) => s.id) ?? []
  const dc = knob(world, 'tides.mediation_dc')
  const roll = (skill: string, side: string) => (skills.includes(skill) ? playerCheck(world, skill, dc) : relation(world.state, side).trust >= 20 ? { degree: 'success' as const } : { degree: 'failure' as const })
  const checks = [roll('persuasion', a), roll('insight', b)]
  const won = checks.filter((c) => c.degree === 'success' || c.degree === 'critical success').length
  const shift = Math.max(-10, Math.min(10, won === 2 ? -m.eases : won === 1 ? -m.eases / 2 : m.eases / 2))
  const st = tideState(world, tide.id)
  st.pressure = Math.max(0, Math.round((st.pressure + shift) * 100) / 100)
  const told = won ? m.told : `the stranger tried to bring ${na} and ${nb} to one table, and it went badly`
  st.moved = [told]
  recordFact(world, { kind: 'tide_mediated', about: [a, b, 'player'], place: world.state.player.location, belang: 2, title: told, text: { precise: `${told.charAt(0).toUpperCase()}${told.slice(1)}.`, village: `${told.charAt(0).toUpperCase()}${told.slice(1)}.`, far: `Talks about ${tide.name}.` } })
  const lines = checks.map((c) => ('total' in c ? `(${c.skill.charAt(0).toUpperCase()}${c.skill.slice(1)} ${c.total} vs DC ${c.dc}: ${c.degree})` : '')).filter(Boolean)
  const said = won === 2 ? `You sit ${na} and ${nb} down at one table and let each say it all. In the end they agree on more than either came for.` : won === 1 ? `You get ${na} and ${nb} to one table. They part without a handshake, but they talked.` : `You try to bring ${na} and ${nb} together, and it goes badly: they part angrier than they came.`
  return [...lines.map((text) => ({ kind: 'system' as const, text })), { kind: 'narration', text: said }]
}

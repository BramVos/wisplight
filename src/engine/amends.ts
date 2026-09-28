import { knob } from './knobs'
import { agree, agreements, madeGood } from './agreements'
import type { Output } from './commands'
import { callName } from './content'
import { applyEffect, attitude } from './dialogue/relations'
import { playerCheck } from './rules/player'
import type { Agreement } from './state'
import type { World } from './world'

// Making amends (M10.14; the review of 28 September 2026: a missed agreement
// is not only a grudge). Whom the stranger let down can be told sorry, told
// why, or offered to have it made good: done after all, or something given
// for it. The one let down decides, by how they stand to the stranger and
// their character: a warm heart forgives sooner, a hot temper later, a lie
// found out hardly. What is made good is a signal (made_good); what follows
// is content.

const DAY = 24 * 60

export type AmendsAct = 'Apologize' | 'Explain' | 'MakeGood'

/** The last time the stranger let this person down and it is not settled: missed, judged, no amends that held. */
export function letDown(world: World, npcId: string): Agreement | undefined {
  return agreements(world)
    .filter((a) => a.by === 'player' && a.to === npcId && a.status === 'missed' && (a.judged === 'let_down' || a.judged === 'betrayed') && world.now - (a.outcome?.t ?? a.t) <= (knob(world, 'amends.fresh_days') * DAY))
    // Said sorry or explained, it can still be made good; refused, not again the same day; offered again or made good, it is settled.
    .filter((a) => !a.amends || a.amends.how === 'apologised' || a.amends.how === 'explained' || (a.amends.how === 'refused' && world.now - a.amends.t >= DAY))
    .sort((a, b) => (b.outcome?.t ?? b.t) - (a.outcome?.t ?? a.t))[0]
}

/** How hard they are to win round: the lie, the temper, the heart, and how they stand to the stranger. */
function amendsDc(world: World, npcId: string, a: Agreement): number {
  const p = world.npc(npcId).personality
  const band = attitude(world, npcId).band
  return 12 + (a.judged === 'betrayed' ? 4 : 0) + Math.max(0, p.temper) * 2 - Math.max(0, p.warmth) * 2 + (band === 'Hostile' ? 4 : band === 'Unfriendly' ? 2 : band === 'Wary' ? 1 : band === 'Warm' || band === 'Devoted' ? -2 : 0)
}

/** Their thought about the broken word goes; another takes its place. */
function rethink(world: World, npcId: string, a: Agreement, text: string, days = 7): void {
  const s = world.npcState(npcId)
  s.thoughts = [...(s.thoughts ?? []).filter((t) => t.until > world.now && !t.text.includes(a.what)), { text, t: world.now, until: world.now + days * DAY }].slice(-3)
}

/**
 * The stranger says sorry, explains, or offers to make it good, in a talk with
 * whom they let down. The engine decides; the voice words it (the decision), or
 * without a model, the line. Undefined when there is nothing to make amends for.
 */
export function amendsIn(world: World, npcId: string, act: AmendsAct): { decision: string; line: string; outputs: Output[] } | undefined {
  const a = letDown(world, npcId)
  if (!a) return undefined
  const name = callName(world.npc(npcId))
  const say = (line: string) => world.say(line, npcId)
  const check = (dc: number) => {
    const r = playerCheck(world, 'persuasion', dc)
    return { ok: r.degree === 'success' || r.degree === 'critical success', out: { kind: 'check' as const, text: `(Persuasion ${r.total} vs DC ${dc}: ${r.degree})` } }
  }
  // Said once is enough: again, they have heard it.
  if ((act === 'Apologize' && a.amends?.how === 'apologised') || (act === 'Explain' && a.amends?.how === 'explained')) {
    return { decision: 'The stranger says it again; you have heard it already. Say so, briefly.', line: say(`{name} waves a hand. "You said so already."`), outputs: [] }
  }
  if (act === 'Explain') {
    // Not the stranger's fault, and they did not know: now they do.
    if (a.outcome?.fault === 'world') {
      a.judged = 'understood'
      a.amends = { how: 'explained', t: world.now }
      applyEffect(world, npcId, 'affinity', 4)
      applyEffect(world, npcId, 'trust', 3)
      rethink(world, npcId, a, `The stranger could not help it: ${a.outcome.text}.`, 3)
      return { decision: `The stranger explains why they did not ${a.what}: ${a.outcome.text}. You did not know; now you understand it was not their fault. Say so.`, line: say(`{name} is quiet a moment. "I didn't know that. Well, then. No harm meant."`), outputs: [] }
    }
    const r = check(amendsDc(world, npcId, a) + 2)
    a.amends = { how: r.ok ? 'explained' : 'refused', t: world.now }
    if (r.ok) {
      applyEffect(world, npcId, 'affinity', 2)
      rethink(world, npcId, a, `The stranger had their reasons for not keeping their word, they say.`, 5)
      return { decision: `The stranger gives their reasons for not keeping their word (${a.what}). You accept them, grudgingly.`, line: say(`{name} sighs. "If you say so. Next time, send word."`), outputs: [r.out] }
    }
    return { decision: `The stranger makes excuses for not keeping their word (${a.what}). You do not accept them.`, line: say(`{name} shakes {their} head. "That's no reason."`), outputs: [r.out] }
  }
  if (act === 'Apologize') {
    const r = check(amendsDc(world, npcId, a))
    a.amends = { how: r.ok ? 'apologised' : 'refused', t: world.now }
    if (r.ok) {
      applyEffect(world, npcId, 'affinity', 3)
      applyEffect(world, npcId, 'trust', 2)
      rethink(world, npcId, a, `The stranger said sorry for not keeping their word to ${a.what}. It still stings.`, 5)
      return { decision: `The stranger says sorry for not keeping their word (${a.what}). You accept it, not warmly, and ask whether they will still do it.`, line: say(`{name} looks at you a long moment. "All right. Will you still do it, then?"`), outputs: [r.out] }
    }
    return { decision: `The stranger says sorry for not keeping their word (${a.what}). You do not accept it yet: sorry does not mend it.`, line: say(`{name} turns away. "Sorry doesn't mend it."`), outputs: [r.out] }
  }
  // Make it good: do it after all. Whom it was for decides, by how they stand and who they are.
  const band = attitude(world, npcId).band
  const p = world.npc(npcId).personality
  if (band === 'Hostile' || (a.judged === 'betrayed' && p.temper >= 2)) {
    a.amends = { how: 'refused', t: world.now }
    return { decision: `The stranger offers to make it good (${a.what}). You will not wait on them a second time: say no.`, line: say(`{name} gives a short laugh. "And wait for you again? No."`), outputs: [] }
  }
  const redo = agree(world, { kind: a.kind, by: 'player', to: npcId, source: 'conversation', what: a.what, due: world.now + 2 * DAY, terms: redoTerms(a), remakes: a.id } as never)
  if ('rejected' in redo) return undefined
  a.amends = { how: 'redo', t: world.now, redo: redo.id }
  rethink(world, npcId, a, `The stranger says they will still ${a.what}. We'll see.`, 3)
  return { decision: `The stranger offers to make it good: they will still ${a.what}, in two days. You agree, and say you'll believe it when you see it.`, line: say(`{name} folds {their} arms. "Two days, then. I'll believe it when I see it."`), outputs: [{ kind: 'system', text: `You have given ${name} your word again: ${a.what}, within two days.` }] }
}

/** The terms of a second go: the same, less what the engine worked out itself the first time. */
function redoTerms(a: Agreement): Record<string, unknown> {
  const { arrived: _a, delivered: _d, ...terms } = a.terms as Record<string, unknown>
  return terms
}

/**
 * Something given to whom the stranger let down (M10.14): worth at least what
 * was promised, or a sixth of a day's wage if nothing had a price, it makes it
 * good. Called by GIVE; undefined when it does not count.
 */
export function giftMakesGood(world: World, npcId: string, value: number): Output[] | undefined {
  const a = letDown(world, npcId)
  if (!a || a.amends?.how === 'redo') return undefined
  const owed = a.terms.amount ?? (a.terms.item ? world.basePrice(a.terms.item) : 8)
  if (value < owed) return undefined
  madeGood(world, a)
  return [{ kind: 'narration', text: world.say(`{name} takes it and nods slowly. "That makes it good. We'll say no more about it."`, npcId) }]
}

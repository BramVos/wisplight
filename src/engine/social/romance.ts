import type { Output } from '../commands'
import { callName } from '../content'
import { applyEffect, attitude, relation } from '../dialogue/relations'
import { recordFact } from '../news'
import type { World } from '../world'
import { companionOf } from './companions'
import { deed, shiftBond } from './deeds'
import { repute } from './factions'
import { atLeast } from './gates'
import { familyOf } from '../layer'

// Romance (FO, chapter 8; Wereldboek, "Romance"), with fixed limits: only
// adults who are open to it, each on their own terms. The system decides
// whether a step can be taken; the model only puts it into words. A no stays
// no while the conditions stay the same. Intimate moments fade to black.

export type Stage = 'interest' | 'courting' | 'together' | 'bound'

export function stageOf(world: World, npcId: string): Stage | undefined {
  return world.state.romance?.[npcId]?.stage
}

/** Whether the NPC could ever be open to the player: adult, open to them, and not a creature. */
export function openTo(world: World, npcId: string): boolean {
  const npc = world.npc(npcId)
  const r = npc.romance
  if (!r || npc.child || npc.age < 18 || r.open_to === 'nobody') return false
  const pronoun = world.state.player.character?.pronoun ?? 'they'
  if (r.open_to === 'women') return pronoun === 'she'
  if (r.open_to === 'men') return pronoun === 'he'
  return true
}

/** The sweetheart the NPC already has in the content, if any (Wouter and Geesje). */
function sweetheartOf(world: World, npcId: string): string | undefined {
  const npc = world.npc(npcId)
  const own = npc.relations.find((r) => r.role === 'sweetheart' && r.to && world.content.npcs.has(r.to))?.to
  if (own) return own
  return [...world.content.npcs.values()].find((o) => o.relations.some((r) => r.role === 'sweetheart' && r.to === npcId))?.id
}

/**
 * FLIRT <person>: the first step. Interest needs Warm (or Friendly for some),
 * familiarity 40, and an NPC open to the player. Courting follows when trust
 * reaches 40 and you shared something; a relation at affinity 75 and trust
 * 60, or bond 2 for a companion.
 */
export function flirt(world: World, npcId: string): Output[] {
  const npc = world.npc(npcId)
  const name = callName(npc)
  if (npc.child || npc.age < 18) return [{ kind: 'error', text: 'No.' }]
  if (!openTo(world, npcId)) return [{ kind: 'speech', text: world.say(`{name} gives you a look that is kind and closed at once. "No, love. Not me."`, npcId) }]
  const band = attitude(world, npcId).band
  const rel = relation(world.state, npcId)
  const from = npc.romance?.from ?? 'Warm'
  const romance = (world.state.romance ??= {})
  const current = romance[npcId]?.stage
  if (!atLeast(band, from) || rel.familiarity < 40) return [{ kind: 'speech', text: world.say(`{name} laughs, a little awkwardly. "You hardly know me."`, npcId) }]
  const out: Output[] = []
  if (!current) {
    romance[npcId] = { stage: 'interest', since: world.now }
    deed(world, npcId, 'help', { amount: 5 })
    out.push({ kind: 'speech', text: world.say(`{name} looks at you a moment longer than needed, and smiles. "Well now."`, npcId) })
    jealousy(world, npcId)
    return out
  }
  const shared = (companionOf(world, npcId)?.bond ?? 0) >= 1 || world.state.requests.some((r) => r.npc === npcId && r.status === 'done')
  if (current === 'interest' && rel.trust >= 40 && shared) {
    romance[npcId] = { stage: 'courting', since: world.now }
    recordFact(world, { kind: 'romance', about: [npcId], place: world.state.player.location, belang: 2, juice: 0.9, title: `${name} and the stranger`, text: { precise: `${name} and the stranger are courting.`, village: `${name} has been seen walking out with the stranger, they say.`, far: `Someone in ${world.words.region} is courting a stranger.` } })
    out.push({ kind: 'speech', text: world.say(`{name} takes your hand, just for a moment, and lets it go before anyone sees. Or so {they} hopes.`, npcId) })
    jealousy(world, npcId)
    return out
  }
  if (current === 'courting' && ((rel.affinity >= 75 && rel.trust >= 60) || (companionOf(world, npcId)?.bond ?? 0) >= 2)) {
    romance[npcId] = { stage: 'together', since: world.now }
    out.push({ kind: 'narration', text: world.say(`{name} does not let go of your hand this time. The rest of the evening is yours and {theirs}.`, npcId) })
    return out
  }
  out.push({ kind: 'speech', text: world.say(`{name} smiles. "Slowly. I'm not going anywhere."`, npcId) })
  return out
}

/** A rival who hears of it takes it badly (FO, chapter 8: jealousy). */
function jealousy(world: World, npcId: string): void {
  const rival = sweetheartOf(world, npcId)
  if (!rival) return
  deed(world, rival, 'insult', { amount: 4, note: `The stranger is after ${callName(world.npc(npcId))}.` })
  shiftBond(world, rival, npcId, -10, -10)
  world.notices.push(`${callName(world.npc(rival))} will not like this.`)
}

/**
 * MARRY <person>: at the Lantern's chapel, or an oath at a holy place of the
 * Old Faith. A house, family and expectations follow (M7.2): the spouse's home
 * is yours, their family warms to you, the faith that bound you thinks better
 * of you, and your spouse expects you home now and then.
 */
export function marry(world: World, npcId: string): Output[] {
  const name = callName(world.npc(npcId))
  if (stageOf(world, npcId) !== 'together') return [{ kind: 'error', text: `You and ${name} are not so far along.` }]
  const here = world.location(world.state.player.location)
  if (!here.tags.includes('holy')) return [{ kind: 'error', text: 'A wedding is held at a holy place.' }]
  world.state.romance![npcId] = { stage: 'bound', since: world.now }
  // The wedding is a signal (M8.1): the standard aftermath of the content gives the tie, the home, the in-laws and the expectations.
  recordFact(world, { kind: 'wedding', about: [npcId], place: here.id, belang: 3, juice: 1, title: `${name} married the stranger`, text: { precise: `${name} and the stranger were bound at ${here.name}.`, village: `${name} has married the stranger!`, far: `There was a wedding in ${world.words.region}.` }, claim: { subject: 'player', key: 'married', value: npcId } })
  const spouse = world.npc(npcId)
  const family = familyOf(world, npcId)
  // The faith of the holy place, and the faction that stands for it (M10.17; before, the Lantern by the place's name).
  const faction = world.content.world.faiths.find((f) => f.id === here.faith)?.faction
  if (faction) repute(world, faction, 5, 'your wedding')
  return [
    { kind: 'narration', text: `Before ${here.name} and whoever came to see it, you and ${name} are bound. Someone has brought beer.` },
    { kind: 'system', text: `${world.location(spouse.home).name} is your home now: you sleep there for nothing. ${name} will expect you home now and then.${family.length ? ` ${family.map((f) => callName(world.npc(f))).join(' and ')} think${family.length === 1 ? 's' : ''} better of you.` : ''}` },
  ]
}

/**
 * Each morning: a spouse whose partner has not slept at home for some nights
 * says so, and minds it. The expectation is a step of the aftermath of a
 * wedding (M8.1); a save from before that knows only the bond.
 */
export function homeDay(world: World): void {
  const player = world.state.player
  if (!player.home) return
  const expects = Object.entries(world.state.layer?.expects ?? {}).filter(([, e]) => e.of === 'player')
  const old = Object.entries(world.state.romance ?? {}).find(([, r]) => r.stage === 'bound')?.[0]
  const list = expects.length ? expects.map(([who, e]) => [who, e.nights] as const) : old ? [[old, 5] as const] : []
  for (const [spouse, nights] of list) {
    const s = world.state.npcs[spouse]
    if (!s || s.dead) continue
    const away = (world.now - (player.homeNight ?? world.now)) / (24 * 60)
    if (away < nights) continue
    applyEffect(world, spouse, 'affinity', -3)
    const thoughts = (s.thoughts ??= [])
    if (!thoughts.some((t) => t.until > world.now && t.text.startsWith('The one you married'))) thoughts.push({ text: `The one you married has not slept at home for ${Math.floor(away)} nights.`, t: world.now, until: world.now + 24 * 60 })
  }
}

import { economy, placeOf } from '../economy/ledger'
import { recordFact } from '../news'
import type { World } from '../world'

// The rank of a settlement (M9.1; design: signalen en nasleep, "Groei", and
// scenario 7): hamlet, village, town, city. The content gives each area its
// kind; a game may change it (verb rank), which is state of the game and goes
// with the save. The world notices through what reads the kind: how open a
// place is to strangers, a settlement's character in conditions, the order
// of places in the journal, the news. A change of rank is news of belang 4.

export const RANKS = ['hamlet', 'village', 'town', 'city'] as const
export type Rank = (typeof RANKS)[number]

/**
 * A settlement takes a new rank, paid from its purse (a charter costs money).
 * False when there is no such area, it has that rank already, or the purse
 * cannot pay.
 */
export function setRank(world: World, area: string, rank: Rank, cost = 0, by?: string): boolean {
  const a = world.content.areas.get(area)
  if (!a || a.kind === rank) return false
  if (cost > 0) {
    const ledger = world.content.settlements.has(area) ? economy(world).ledgers[area] : undefined
    if (!ledger || ledger.purse < cost) return false
    ledger.purse -= cost
  }
  const before = a.kind
  ;(world.state.ranks ??= {})[area] = rank
  world.regrow()
  const up = RANKS.indexOf(rank) > RANKS.indexOf(before as Rank)
  const granted = by ? ` by ${by}` : ''
  recordFact(world, {
    kind: 'rank',
    about: [area],
    place: placeOf(world, area),
    belang: 4,
    claim: { subject: area, key: 'rank', value: rank },
    title: `${a.name} is a ${rank} now`,
    text: {
      precise: up ? `${a.name} was made a ${rank}${granted}, with the rights that go with it.` : `${a.name} is no longer a ${before}, but a ${rank}${granted}.`,
      village: up ? `${a.name} is a ${rank} now! They'll be putting on airs.` : `${a.name} has come down in the world: a ${rank}, no more.`,
      far: `${a.name} is a ${rank} now.`,
    },
  })
  return true
}

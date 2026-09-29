import type { Output } from './commands'
import { wantLand } from './growth/landwrite'
import { formatMoney } from './items'
import { knob } from './knobs'
import { frameOf, landOfArea, type Frame } from './lands'
import { recordFact } from './news'
import { upper, type World } from './world'

// Borders (M10.23; Bram, 28 September 2026: when are you in a "French" land,
// when in a "Greek" one?). A border is content, never distance: an area with
// `border: true` (a bridge, a pass, a toll house, a harbour) where one land
// meets another, and every way from one land into another goes through one
// (the loader refuses one that does not). Crossing, the scene shows it: the
// land's own line, the money changed at its rate, and the chronicle keeps
// it. An area that blends with the land the stranger comes from takes both
// coins, and changes nothing.

/** The land the stranger is in now; undefined is the home land. */
export function landHere(world: World): string | undefined {
  return landOfArea(world.content, world.location(world.state.player.location).area)?.id
}

/** An amount told in a frame's own coins. */
function told(amount: number, frame: Frame): string {
  return formatMoney(amount * frame.rate, frame.coins)
}

/**
 * After a step (M10.23): when the stranger has come into another land, the
 * scene of the crossing, the money changed, and a line in the chronicle.
 * Nothing when they are where they were.
 */
export function crossBorder(world: World, before: string): Output[] {
  const player = world.state.player
  const here = landHere(world)
  if (here === player.land) return []
  const was = player.land
  if (here) player.land = here
  else delete player.land
  const [from, to] = [frameOf(world.content, was), frameOf(world.content, here)]
  const area = world.content.areas.get(world.location(player.location).area)
  const left = world.content.areas.get(world.location(before).area)
  const lines = [here ? `You are in ${to.name} now.` : `You are back in ${to.name}.`, ...(to.land?.crossing ? [to.land.crossing] : [])]
  // Other coins are changed at the rate here, less the changer's share; where the lands blend, both are good.
  // The home land is named by the world's id in a blend.
  const home = world.content.world.id
  const blends = (area?.blend !== undefined && area.blend === (was ?? home)) || (left?.blend !== undefined && left.blend === (here ?? home))
  if (from.coins !== to.coins && !blends && player.money > 0) {
    const had = player.money
    const cut = Math.floor(had * knob(world, 'lands.exchange_cut'))
    player.money -= cut
    lines.push(`The changer changes your ${told(had, from)} into ${told(player.money, to)}${cut ? `, and keeps ${told(cut, to)} for it` : ''}.`)
  }
  recordFact(world, {
    kind: 'crossing',
    about: ['player'],
    place: player.location,
    belang: 0,
    witnesses: [],
    title: `the stranger crossed into ${to.name}`,
    text: { precise: `${upper(to.name)}: the stranger crossed in at ${area?.name ?? player.location}.`, village: `The stranger came into ${to.name}.`, far: `A stranger came into ${to.name}.` },
  })
  // A land the designer only framed: the chronicler writes the rest, once (M10.23).
  return [{ kind: 'narration', text: lines.join(' ') }, ...(here ? wantLand(world, here) : [])]
}

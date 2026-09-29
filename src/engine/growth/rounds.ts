import type { Output } from '../commands'
import { regionSetting } from '../frames'
import type { World } from '../world'
import { districtOf, districtsOf, wantDistrict } from './districts'
import { chartedInPlay, storyOf, wantStory } from './regionstory'

// The rounds that build a new region (M10.25), by how full the game builds
// it (the dial of the frames screen): what a region still needs, in order,
// and a way to ask for each. The journey starts them at departure, so the
// region can be laid out while the stranger travels (underway.ts); arrival
// asks for what is not there yet.

export interface RegionRound {
  /** `district:<topic>:<id>`, `story:<topic>`. */
  key: string
  kind: 'district' | 'story'
  /** What is being laid out, for the line the stranger reads: "the Driewater", "the Weavers' Quarter of Stavermouth". */
  name: string
  /** Asked for, and waiting for the model. */
  pending: boolean
}

/**
 * What a region charted in play still needs, in order, by the setting of this
 * game: outline nothing (the rest comes when the stranger is there, as
 * before); story the town's first district, if it has quarters, and the story
 * round. A far place the world book names has none: passing through it costs
 * nothing (M10.21), and its story comes when the stranger takes part there.
 */
export function regionRounds(world: World, topic: string): RegionRound[] {
  if (regionSetting(world) === 'outline' || !chartedInPlay(world, topic)) return []
  const g = world.state.growth
  const name = world.content.topics.get(topic)?.name ?? topic
  const out: RegionRound[] = []
  const first = districtsOf(world.content, topic)[0]
  if (first) {
    const made = districtOf(world, topic, first.id)
    if (!made || made.by === 'stub') out.push({ key: `district:${topic}:${first.id}`, kind: 'district', name: `${first.name} of ${name}`, pending: Boolean(g?.districtPending?.includes(`${topic}:${first.id}`)) })
  }
  if (!storyOf(world, topic)) out.push({ key: `story:${topic}`, kind: 'story', name, pending: Boolean(g?.storyPending?.includes(topic)) })
  return out
}

/** Asks for one round: queued for the model, or made by the rules without one; above the threshold the question first. */
export function wantRound(world: World, round: RegionRound): Output[] {
  const [kind, topic, id] = round.key.split(':') as [string, string, string | undefined]
  if (kind === 'district' && id) return wantDistrict(world, topic, id)
  if (kind === 'story') return wantStory(world, topic)
  return []
}

/** Whether any round of a region waits for the model. */
export function roundsPending(world: World, topic: string): boolean {
  return regionRounds(world, topic).some((r) => r.pending)
}

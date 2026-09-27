import { minuteOfDay } from '../clock'
import type { World } from '../world'

// The goal Confront (FO, chapter 8, the example of Gerrit): someone with a
// grievance goes looking for the player to have it out. Whether it comes to
// blows is not theirs to decide alone: the gate in gates.ts decides.

const DAY = 24 * 60

/** Once an hour: those with a grievance set out for where the player is, if they know the place. */
export function pursue(world: World): void {
  const here = world.state.player.location
  const hour = Math.floor(minuteOfDay(world.now) / 60)
  for (const id of Object.keys(world.state.npcs).sort()) {
    const s = world.state.npcs[id]!
    const g = s.grievance
    if (!g || s.dead || s.following) continue
    if (world.now - g.t > 3 * DAY) {
      delete s.grievance
      continue
    }
    if (s.location === here || s.activity === 'asleep' || hour < 7 || hour >= 21) continue
    if (!world.content.locations.has(here) || !world.knownLocations(id).has(here)) continue
    s.goals = s.goals.filter((goal) => goal.id !== `confront_${id}`)
    s.goals.push({ id: `confront_${id}`, type: 'Visit', target: here, priority: 1, source: 'ai', created: world.now, until: world.now + 6 * 60 })
    if (s.planGoal !== `confront_${id}`) {
      s.plan = []
      s.planGoal = undefined
      s.busyUntil = Math.min(s.busyUntil, world.now)
    }
  }
}

/** NPCs at the player's side with a grievance to have out, now. */
export function confronting(world: World): string[] {
  const here = world.state.player.location
  return Object.keys(world.state.npcs)
    .sort()
    .filter((id) => {
      const s = world.state.npcs[id]!
      return s.grievance && s.location === here && !s.dead && s.activity !== 'asleep' && !s.following
    })
}

/** A grievance had out: the goal and the grudge are done, though the relation keeps its mark. */
export function settleGrievance(world: World, npcId: string): void {
  const s = world.npcState(npcId)
  delete s.grievance
  s.goals = s.goals.filter((goal) => goal.id !== `confront_${npcId}`)
  if (s.planGoal === `confront_${npcId}`) {
    s.plan = []
    s.planGoal = undefined
  }
}

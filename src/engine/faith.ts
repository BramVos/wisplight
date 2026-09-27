import type { World } from './world'

// Faith per person (M9.1; design "Wrijving in een dorp", Wereldboek chapter 5).
// A world names its faiths; the first is what most people hold. Someone's faith
// is what the content says, or follows from their patron, or is the common one.
// Newcomers bring the faith of where they came from.

/** Someone's faith, or undefined in a world that names none. */
export function faithOf(world: World, npcId: string): string | undefined {
  const faiths = world.content.world.faiths
  if (!faiths.length || !world.content.npcs.has(npcId)) return undefined
  const npc = world.npc(npcId)
  if (npc.faith) return npc.faith
  const patron = npc.patron
  return (patron && faiths.find((f) => f.patrons.includes(patron))?.id) ?? faiths[0]!.id
}

/** What most of these people hold. */
export function commonFaith(world: World, people: string[]): string | undefined {
  const count = new Map<string, number>()
  for (const id of people) {
    const f = faithOf(world, id)
    if (f) count.set(f, (count.get(f) ?? 0) + 1)
  }
  return [...count.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0]
}

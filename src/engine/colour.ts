import type { World } from './world'

// A person's colour (M10.29 I): the dot on the plan of here, on their journal
// page and by their name in the talk window, the same everywhere. A world may
// set one per person (`colour`); otherwise the engine derives it from the id,
// so it needs no work in building a world.

/** A person's colour (M10.29 I): the world's, or one the engine derives from the id, the same everywhere. */
export function personColour(world: Pick<World, 'content'>, npcId: string): string {
  const own = world.content.npcs.get(npcId)?.colour
  if (own) return own
  let hash = 0
  for (const ch of npcId) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0
  const hue = hash % 360
  return hslHex(hue, 0.55, 0.58)
}

function hslHex(h: number, s: number, l: number): string {
  const k = (n: number) => (n + h / 30) % 12
  const a = s * Math.min(l, 1 - l)
  const f = (n: number) => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))))
  return `#${[f(0), f(8), f(4)].map((x) => x.toString(16).padStart(2, '0')).join('')}`
}

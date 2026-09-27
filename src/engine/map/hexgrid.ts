// The hex grid of a region (FO, chapter 4, "De streekkaart"): flat-topped
// hexes of 250 m in columns, odd columns shifted half a hex north. Column 0,
// row 0 is the south-west corner; x runs east and y north, in km.

export type HexDirection = 'north' | 'northeast' | 'southeast' | 'south' | 'southwest' | 'northwest'

export const HEX_DIRECTIONS: HexDirection[] = ['north', 'northeast', 'southeast', 'south', 'southwest', 'northwest']

export interface Hex {
  col: number
  row: number
}

export const hexKey = (hex: Hex) => `${hex.col},${hex.row}`

export function parseHexKey(key: string): Hex | undefined {
  const match = /^(-?\d+),(-?\d+)$/.exec(key)
  return match ? { col: Number(match[1]), row: Number(match[2]) } : undefined
}

// A region of 30 by 20 km is 120 by 80 hexes of 250 m (FO, chapter 4): columns
// and rows are both one hex apart, so the hexes are a little squashed.

/** The centre of a hex in km. */
export function centre(hex: Hex, size: number): [number, number] {
  return [hex.col * size + size / 2, hex.row * size + (hex.col % 2 === 1 ? size : size / 2)]
}

/** The hex a point in km falls in. */
export function hexAt(x: number, y: number, size: number): Hex {
  const col = Math.floor(x / size)
  const shift = col % 2 === 1 ? size / 2 : 0
  const row = Math.floor((y - shift) / size)
  return { col, row }
}

// Neighbour offsets for odd-q: odd columns sit half a hex higher.
const EVEN: Record<HexDirection, [number, number]> = {
  north: [0, 1],
  northeast: [1, 0],
  southeast: [1, -1],
  south: [0, -1],
  southwest: [-1, -1],
  northwest: [-1, 0],
}
const ODD: Record<HexDirection, [number, number]> = {
  north: [0, 1],
  northeast: [1, 1],
  southeast: [1, 0],
  south: [0, -1],
  southwest: [-1, 0],
  northwest: [-1, 1],
}

export function neighbour(hex: Hex, direction: HexDirection): Hex {
  const [dc, dr] = (hex.col % 2 === 1 ? ODD : EVEN)[direction]
  return { col: hex.col + dc, row: hex.row + dr }
}

export function neighbours(hex: Hex): { direction: HexDirection; hex: Hex }[] {
  return HEX_DIRECTIONS.map((direction) => ({ direction, hex: neighbour(hex, direction) }))
}

function toCube(hex: Hex): [number, number, number] {
  // Rows grow northwards and odd columns sit higher: with rows counted southwards
  // that is the "even-q" layout, whose even columns are the lower ones.
  const x = hex.col
  const z = -hex.row - (hex.col + (hex.col & 1)) / 2
  return [x, -x - z, z]
}

function fromCube(x: number, _y: number, z: number): Hex {
  return { col: x, row: -(z + (x + (x & 1)) / 2) }
}

function roundCube(x: number, y: number, z: number): [number, number, number] {
  let rx = Math.round(x)
  let ry = Math.round(y)
  let rz = Math.round(z)
  const dx = Math.abs(rx - x)
  const dy = Math.abs(ry - y)
  const dz = Math.abs(rz - z)
  if (dx > dy && dx > dz) rx = -ry - rz
  else if (dy > dz) ry = -rx - rz
  else rz = -rx - ry
  return [rx, ry, rz]
}

/** The hexes on a straight line from a to b, each one next to the one before. */
export function line(a: Hex, b: Hex): Hex[] {
  const n = distance(a, b)
  const [ax, ay, az] = toCube(a)
  const [bx, by, bz] = toCube(b)
  const out: Hex[] = []
  for (let i = 0; i <= n; i++) {
    const t = n === 0 ? 0 : i / n
    // A nudge keeps points on an edge from rounding back and forth.
    const [x, y, z] = roundCube(ax + (bx - ax) * t + 1e-6, ay + (by - ay) * t + 2e-6, az + (bz - az) * t - 3e-6)
    out.push(fromCube(x, y, z))
  }
  return out
}

/** Steps between two hexes. */
export function distance(a: Hex, b: Hex): number {
  const [ax, ay, az] = toCube(a)
  const [bx, by, bz] = toCube(b)
  return Math.max(Math.abs(ax - bx), Math.abs(ay - by), Math.abs(az - bz))
}

/**
 * A compass direction in the eight winds of the text becomes a hex direction.
 * East and west have no hex side: they alternate north-east and south-east.
 */
export function stepToward(hex: Hex, wind: string, step: number): HexDirection | undefined {
  switch (wind) {
    case 'north':
    case 'northeast':
    case 'southeast':
    case 'south':
    case 'southwest':
    case 'northwest':
      return wind
    case 'east':
      return step % 2 === 0 ? 'northeast' : 'southeast'
    case 'west':
      return step % 2 === 0 ? 'northwest' : 'southwest'
    default:
      return undefined
  }
}

/** The eight winds, from one point to another in km (north is +y). */
export function windBetween(from: [number, number], to: [number, number]): string {
  const dx = to[0] - from[0]
  const dy = to[1] - from[1]
  if (Math.abs(dx) < 1e-6 && Math.abs(dy) < 1e-6) return 'here'
  const angle = (Math.atan2(dx, dy) * 180) / Math.PI
  const winds = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west']
  return winds[Math.round(((angle + 360) % 360) / 45) % 8]!
}

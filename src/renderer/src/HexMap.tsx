import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { createPortal } from 'react-dom'
import type { HexMapData, LandMapData } from '../../engine'
import { neighbour, neighbours } from '../../engine/map/hexgrid'
import { mapStyle, markColours, signsOf, tintsOf, type MapStyle, type MapStyleName, type Sign } from '../../engine/map/palette'
import { hasWords, t } from './i18n'

// The map in colour (M10; FO, chapter 4, "Weergave"; the proposal page
// approved on 28 September 2026), as two maps after the M10 playtest:
//
// - The minimap, in the side panel: the land around the stranger, close up,
//   with fog of war: what they see now is clear, what they saw lately lies
//   under a thin fog and what they saw long ago under a thicker one; at night
//   and in mist their own small circle is clear and the rest dark or grey. It
//   is for getting about quickly: a click on a place or on land you have
//   seen walks there.
// - The map, in the journal: everything the stranger knows, always clear, to
//   look at at leisure: the land, the places, and the secrets they know.
//
// Both zoom in and out and go full screen; the map is dragged about too.
// Both show the way you walked as a very thin line from hex to hex, and the
// places you have been with a marker of their own; pointing at a place names it.
// Every hex has one of its terrain's muted tints, from its seed; the signs
// of the world's palette their own shape (M10.20: a world names its signs,
// and danger and uncertain get a mark as well as a colour); ways are warm
// parchment, places an icon by kind and status.

const word = (key: string, fallback: string) => (hasWords(key) ? t(key) : fallback)
const MARK: Record<string, string> = { fen: '"', bog: '"', hummock: '^', ridge: ',', water: '~', channel: '≈', woods: 'T', heath: '^', fields: '.', tunnel: '∩', crown: '♣', cliff: '▲', dune: '∽' }
const SQRT3 = Math.sqrt(3)
/** The steps of the trail from a hex, as the engine sends them: 1 north, 2 north-east, 4 south-east. */
const TRAIL_STEPS = [
  [1, 'north'],
  [2, 'northeast'],
  [4, 'southeast'],
] as const

export type MapMode = 'map' | 'local'

function rgb(hex: string): [number, number, number] {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)]
}

/** Between two colours: t = 0 is the first, 1 the second. */
export function mix(a: string, b: string, t: number): string {
  const [r1, g1, b1] = rgb(a)
  const [r2, g2, b2] = rgb(b)
  const c = (x: number, y: number) => Math.round(x + (y - x) * t).toString(16).padStart(2, '0')
  return `#${c(r1, r2)}${c(g1, g2)}${c(b1, b2)}`
}

/** Where a hex lies in map units (one unit is the hex radius): flat-topped, odd columns half a hex north, north up. */
function hexPoint(col: number, row: number): [number, number] {
  return [col * 1.5, row * SQRT3 + (col % 2 === 1 ? SQRT3 / 2 : 0)]
}

/** A view on the map: the point in the middle, in map units, and the hex radius in pixels. */
interface View {
  x: number
  y: number
  r: number
}

const MIN_R = 2
const MAX_R = 40

function hexPath(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.beginPath()
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i
    ctx.lineTo(x + r * Math.cos(a), y + r * Math.sin(a))
  }
  ctx.closePath()
}

/** A sign on the land, by its shape, in the colour the style gives its id; with a mark when it means danger (!) or uncertain (?). */
export function glyph(ctx: CanvasRenderingContext2D, id: string, sign: Sign, x: number, y: number, s: MapStyle, k: number): void {
  const colour = s.glyph[id] ?? s.label
  const shape = sign.shape
  if (shape === 'pool') {
    ctx.fillStyle = colour
    ctx.beginPath()
    ctx.ellipse(x, y + 0.3 * k, 2.1 * k, 1.5 * k, 0, 0, 7)
    ctx.fill()
  } else if (shape === 'pit') {
    ctx.fillStyle = colour
    ctx.fillRect(x - 1.8 * k, y - 1.5 * k, 3.6 * k, 3 * k)
    ctx.strokeStyle = s.glyph['peat_edge'] ?? mix(colour, s.label, 0.35)
    ctx.lineWidth = 0.6
    ctx.strokeRect(x - 1.8 * k, y - 1.5 * k, 3.6 * k, 3 * k)
  } else if (shape === 'tree') {
    ctx.strokeStyle = colour
    ctx.lineWidth = 0.9
    ctx.beginPath()
    ctx.moveTo(x, y + 2.2 * k)
    ctx.lineTo(x, y - 1.2 * k)
    ctx.moveTo(x, y - k)
    ctx.quadraticCurveTo(x - 2.2 * k, y - k, x - 2.2 * k, y + 1.4 * k)
    ctx.moveTo(x, y - k)
    ctx.quadraticCurveTo(x + 2.2 * k, y - k, x + 2.2 * k, y + 1.4 * k)
    ctx.stroke()
  } else if (shape === 'ruin') {
    ctx.strokeStyle = colour
    ctx.lineWidth = 0.9
    ctx.beginPath()
    ctx.moveTo(x - 2 * k, y + 2 * k)
    ctx.lineTo(x - 2 * k, y - 1.5 * k)
    ctx.lineTo(x + 0.5 * k, y - 1.5 * k)
    ctx.moveTo(x + 2 * k, y + 2 * k)
    ctx.lineTo(x + 2 * k, y - 0.2 * k)
    ctx.stroke()
  } else if (shape === 'knoll') {
    ctx.strokeStyle = colour
    ctx.lineWidth = 0.8
    ctx.beginPath()
    ctx.moveTo(x - 1.8 * k, y + k)
    ctx.lineTo(x, y - k)
    ctx.lineTo(x + 1.8 * k, y + k)
    ctx.stroke()
  } else if (shape === 'tuft') {
    ctx.strokeStyle = colour
    ctx.lineWidth = 0.8
    ctx.beginPath()
    for (const [dx, lean] of [
      [-1.4, -0.6],
      [0, 0],
      [1.4, 0.6],
    ] as const) {
      ctx.moveTo(x + dx * k, y + 1.5 * k)
      ctx.lineTo(x + (dx + lean) * k, y - (dx === 0 ? 1.6 : 0.9) * k)
    }
    ctx.stroke()
  } else if (shape === 'rock') {
    ctx.fillStyle = colour
    ctx.beginPath()
    ctx.moveTo(x - 2 * k, y + 1.4 * k)
    ctx.lineTo(x - 1.2 * k, y - 0.8 * k)
    ctx.lineTo(x + 0.4 * k, y - 1.6 * k)
    ctx.lineTo(x + 2 * k, y - 0.2 * k)
    ctx.lineTo(x + 1.6 * k, y + 1.4 * k)
    ctx.closePath()
    ctx.fill()
  } else if (shape === 'warning') {
    ctx.strokeStyle = colour
    ctx.fillStyle = colour
    ctx.lineWidth = 0.8
    ctx.beginPath()
    ctx.moveTo(x, y - 2 * k)
    ctx.lineTo(x + 2.2 * k, y + 1.7 * k)
    ctx.lineTo(x - 2.2 * k, y + 1.7 * k)
    ctx.closePath()
    ctx.moveTo(x, y - 0.8 * k)
    ctx.lineTo(x, y + 0.5 * k)
    ctx.stroke()
    ctx.fillRect(x - 0.3 * k, y + 0.9 * k, 0.6 * k, 0.5 * k)
  } else if (shape === 'query') {
    ctx.fillStyle = colour
    ctx.font = `bold ${Math.max(6, 4.4 * k)}px sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('?', x, y)
  }
  // A meaning shows as more than a colour: a small ! or ? beside the sign, unless the shape says it already.
  const mark = sign.means === 'danger' && shape !== 'warning' ? '!' : sign.means === 'uncertain' && shape !== 'query' ? '?' : ''
  if (mark) {
    ctx.fillStyle = colour
    ctx.font = `bold ${Math.max(6, 3.2 * k)}px sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(mark, x + 2.6 * k, y - 1.8 * k)
  }
}

/** A place by kind: a town with gables, a village and a hamlet as roofs, an inn with its sign, the wild as a ring. Filled when visited. */
export function placeIcon(ctx: CanvasRenderingContext2D, kind: string, x: number, y: number, status: string, ink: string, k = 1): void {
  ctx.lineWidth = 1.2
  ctx.strokeStyle = ink
  ctx.fillStyle = ink
  ctx.beginPath()
  if (kind === 'town' || kind === 'city') {
    ctx.rect(x - 3.5 * k, y - 6 * k, 7 * k, 10 * k)
    ctx.moveTo(x - 3.5 * k, y - 6 * k)
    ctx.lineTo(x - 3.5 * k, y - 8 * k)
    ctx.lineTo(x - 1.2 * k, y - 8 * k)
    ctx.lineTo(x - 1.2 * k, y - 6 * k)
    ctx.moveTo(x + 1.2 * k, y - 6 * k)
    ctx.lineTo(x + 1.2 * k, y - 8 * k)
    ctx.lineTo(x + 3.5 * k, y - 8 * k)
    ctx.lineTo(x + 3.5 * k, y - 6 * k)
  } else if (kind === 'village') {
    ctx.moveTo(x - 5 * k, y + 4 * k)
    ctx.lineTo(x - 5 * k, y - k)
    ctx.lineTo(x, y - 6 * k)
    ctx.lineTo(x + 5 * k, y - k)
    ctx.lineTo(x + 5 * k, y + 4 * k)
    ctx.closePath()
  } else if (kind === 'hamlet') {
    ctx.moveTo(x - 3.5 * k, y + 3 * k)
    ctx.lineTo(x - 3.5 * k, y - 0.5 * k)
    ctx.lineTo(x, y - 4 * k)
    ctx.lineTo(x + 3.5 * k, y - 0.5 * k)
    ctx.lineTo(x + 3.5 * k, y + 3 * k)
    ctx.closePath()
  } else if (kind === 'inn') {
    ctx.rect(x - 4 * k, y - 3 * k, 8 * k, 7 * k)
    ctx.moveTo(x - 4 * k, y - 3 * k)
    ctx.lineTo(x, y - 7 * k)
    ctx.lineTo(x + 4 * k, y - 3 * k)
  } else {
    ctx.arc(x, y, 3.5 * k, 0, 7)
  }
  if (status === 'visited') ctx.fill()
  ctx.stroke()
}

/** A place you have been: a patch of shadow, and its sign on it in the colour for places visited. */
/** The colour of an area's mood on the map (M10.11): panic, grief, a feast, a threat. */
const MOOD_COLOURS: Record<string, string> = { panic: '#e0893a', grief: '#7f93b8', feast: '#d8c35a', threat: '#c0473f' }

function visitedMark(ctx: CanvasRenderingContext2D, kind: string, x: number, y: number, s: MapStyle, colour: string, k: number): void {
  const alpha = ctx.globalAlpha
  ctx.globalAlpha = alpha * 0.85
  ctx.fillStyle = s.label_shadow
  ctx.beginPath()
  ctx.arc(x, y - k, 8 * k, 0, 7)
  ctx.fill()
  ctx.globalAlpha = alpha
  placeIcon(ctx, kind, x, y, 'visited', colour, k)
}

function label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, s: MapStyle, max: number, size = 11): void {
  ctx.font = `600 ${size}px "Alegreya Sans", system-ui, sans-serif`
  ctx.textBaseline = 'middle'
  const width = ctx.measureText(text).width
  const lx = x + 9 + width > max - 4 ? x - 9 - width : x + 9
  ctx.lineWidth = 3
  ctx.strokeStyle = s.label_shadow
  ctx.strokeText(text, lx, y)
  ctx.fillStyle = s.label
  ctx.fillText(text, lx, y)
}

/**
 * The edge of the region as an edge, not as emptiness (M10.21): a dashed line
 * along each side of the region that is in view, and beyond it the far places
 * that way. A side outside the window is not drawn.
 */
function edgeLine(ctx: CanvasRenderingContext2D, data: HexMapData, at: (col: number, row: number) => [number, number], r: number, s: MapStyle, width: number, height: number): void {
  const edge = data.edge!
  const first = data.left
  const last = data.left + data.width - 1
  const bottom = data.top - data.height + 1
  const x0 = at(first, 0)[0] - r
  const x1 = at(last, 0)[0] + r
  const yN = at(first + 1, data.top)[1] - (r * SQRT3) / 2
  const yS = at(first, bottom)[1] + (r * SQRT3) / 2
  type Line = { from: [number, number]; to: [number, number] }
  const sides: Record<'north' | 'east' | 'south' | 'west', Line | undefined> = {
    west: first === 0 ? { from: [x0, yN], to: [x0, yS] } : undefined,
    east: last === edge.cols - 1 ? { from: [x1, yN], to: [x1, yS] } : undefined,
    north: data.top === edge.rows - 1 ? { from: [x0, yN], to: [x1, yN] } : undefined,
    south: bottom === 0 ? { from: [x0, yS], to: [x1, yS] } : undefined,
  }
  ctx.save()
  ctx.strokeStyle = s.label
  ctx.globalAlpha = 0.55
  ctx.lineWidth = 1.2
  ctx.setLineDash([5, 4])
  ctx.beginPath()
  for (const line of Object.values(sides)) {
    if (!line) continue
    ctx.moveTo(line.from[0], line.from[1])
    ctx.lineTo(line.to[0], line.to[1])
  }
  ctx.stroke()
  ctx.restore()
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
  for (const b of edge.beyond) {
    const line = sides[b.side]
    if (!line) continue
    const text = b.side === 'west' ? `\u2190 ${b.names.join(', ')}` : b.side === 'east' ? `${b.names.join(', ')} \u2192` : b.side === 'north' ? `\u2191 ${b.names.join(', ')}` : `\u2193 ${b.names.join(', ')}`
    ctx.font = '600 11px "Alegreya Sans", system-ui, sans-serif'
    ctx.textBaseline = 'middle'
    const w = ctx.measureText(text).width
    const midX = clamp((line.from[0] + line.to[0]) / 2 - w / 2, 4, width - w - 4)
    const midY = clamp((line.from[1] + line.to[1]) / 2, 10, height - 10)
    const [x, y] =
      b.side === 'west' ? [clamp(x0 - w - 6, 4, width - w - 4), midY] : b.side === 'east' ? [clamp(x1 + 6, 4, width - w - 4), midY] : b.side === 'north' ? [midX, clamp(yN - 10, 10, height - 10)] : [midX, clamp(yS + 10, 10, height - 10)]
    ctx.lineWidth = 3
    ctx.strokeStyle = s.label_shadow
    ctx.strokeText(text, x, y)
    ctx.fillStyle = s.label
    ctx.fillText(text, x, y)
  }
}

/** The dark of the night and the grey of the mist, in each style. */
function veil(style: MapStyleName, light: HexMapData['light']): string {
  if (light === 'mist') return style === 'dark' ? '#6f746c' : style === 'bw' ? '#e8e8e8' : '#f2efe6'
  return style === 'dark' ? '#04060b' : style === 'bw' ? '#5a5a5a' : '#3b4458'
}

/** The fog of war by day: the colour of land you do not see now. */
function fog(s: MapStyle, style: MapStyleName): string {
  return style === 'dark' ? mix(s.unknown, '#8a8f84', 0.18) : style === 'bw' ? '#dcdcdc' : mix(s.unknown, '#ffffff', 0.25)
}

/** What the minimap does to a hex beyond sight: fog by day, darkness at night, grey in mist (after the M10 playtest: fog of war by day too). */
function beyondSight(fill: string, memory: number, s: MapStyle, style: MapStyleName, light: HexMapData['light']): string {
  if (light === 'day') return mix(fill, fog(s, style), memory === 1 ? 0.42 : 0.66)
  const base = memory === 1 ? fill : mix(fill, s.ground, 0.3)
  return mix(base, veil(style, light), light === 'night' ? 0.64 : 0.58)
}

/** The hexes of the data in map units, for fitting a view. */
function bounds(data: HexMapData): { x0: number; y0: number; x1: number; y1: number } {
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  const take = (c: number, r: number) => {
    const [x, y] = hexPoint(c, r)
    x0 = Math.min(x0, x)
    y0 = Math.min(y0, y)
    x1 = Math.max(x1, x)
    y1 = Math.max(y1, y)
  }
  for (let i = 0; i < data.hexes.length; i += 5) take(data.hexes[i]!, data.hexes[i + 1]!)
  for (const p of data.places) take(p.c, p.r)
  for (const z of data.zones) take(z.c, z.r)
  if (data.you) take(data.you.c, data.you.r)
  if (x0 === Infinity) {
    const [x, y] = hexPoint(data.left + data.width / 2, data.top - data.height / 2)
    return { x0: x - 10, y0: y - 10, x1: x + 10, y1: y + 10 }
  }
  return { x0, y0, x1, y1 }
}

/** A view that shows all the player knows, with a margin, or the stranger's surroundings close up. */
function fit(data: HexMapData, mode: MapMode, width: number, height: number): View {
  if (mode === 'local' && data.you) {
    const [x, y] = hexPoint(data.you.c, data.you.r)
    // About fifteen hexes across in the side panel, close enough to see the land round you; full screen no bigger than a hand's width a hex.
    return { x, y, r: Math.max(6, Math.min(18, width / (15 * 1.5))) }
  }
  const b = bounds(data)
  const margin = 4
  const r = Math.max(MIN_R, Math.min(18, width / (b.x1 - b.x0 + margin * 2), height / (b.y1 - b.y0 + margin * 2)))
  return { x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2, r }
}

/** Draws the map data in a view on a canvas of this css size. */
function draw(canvas: HTMLCanvasElement, data: HexMapData, s: MapStyle, style: MapStyleName, mode: MapMode, view: View, width: number, height: number, flash: string | undefined): void {
  const dpr = Math.min(2, window.devicePixelRatio || 1)
  canvas.width = Math.round(width * dpr)
  canvas.height = Math.round(height * dpr)
  canvas.style.width = `${width}px`
  canvas.style.height = `${height}px`
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.fillStyle = s.ground
  ctx.fillRect(0, 0, width, height)
  const r = view.r
  const at = (col: number, row: number): [number, number] => {
    const [x, y] = hexPoint(col, row)
    return [width / 2 + (x - view.x) * r, height / 2 - (y - view.y) * r]
  }
  const visible = (x: number, y: number) => x > -2 * r && x < width + 2 * r && y > -2 * r && y < height + 2 * r
  const k = Math.max(0.6, r / 5)
  const local = mode === 'local'
  const lit = (key: string) => !flash || flash === key
  const signs = signsOf(data.palette)
  const sightOf = new Map<string, number>()
  for (let i = 0; i < data.hexes.length; i += 5) {
    const col = data.hexes[i]!
    const row = data.hexes[i + 1]!
    const [x, y] = at(col, row)
    if (!visible(x, y)) continue
    const key = data.keys[data.hexes[i + 2]!] ?? 'fields'
    const tint = data.hexes[i + 3]!
    const flags = data.hexes[i + 4]!
    const memory = flags & 3
    sightOf.set(`${col},${row}`, memory)
    const tints = key === 'unknown' ? [s.unknown] : tintsOf(s, key)
    let fill = tints[tint % tints.length]!
    // The minimap shows what you see and what you remember; the map shows all you know, clear.
    if (local && memory < 2) fill = beyondSight(fill, memory, s, style, data.light)
    if (!lit(key)) fill = mix(fill, s.ground, 0.72)
    hexPath(ctx, x, y, r + 0.35)
    ctx.fillStyle = fill
    ctx.fill()
    const sign = signs[((flags >> 2) & 7) - 1]
    if (sign && !flash && r >= 3) {
      if (local && memory < 2 && data.light !== 'day') continue
      ctx.globalAlpha = local && memory < 2 ? (memory === 1 ? 0.5 : 0.3) : 1
      glyph(ctx, sign[0], sign[1], x, y, s, k)
      ctx.globalAlpha = 1
    }
  }
  // The edge of the region (M10.21): a dashed line just outside its outer hexes, and what lies beyond each side.
  if (data.edge) edgeLine(ctx, data, at, r, s, width, height)
  // Ways: a short stroke to each neighbouring hex on a way.
  const onWay = new Set(data.ways.map((w) => `${w.c},${w.r}`))
  ctx.lineCap = 'round'
  for (const w of data.ways) {
    const [x, y] = at(w.c, w.r)
    if (!visible(x, y)) continue
    let colour = w.kind === 'canal' ? s.ways.canal : w.kind === 'road' ? s.ways.road : s.ways.path
    const memory = sightOf.get(`${w.c},${w.r}`) ?? 2
    if (local && memory < 2) colour = beyondSight(colour, memory, s, style, data.light)
    if (flash && !['road', 'path', 'canal', 'ridge'].includes(flash) && flash !== w.kind) colour = mix(colour, s.ground, 0.7)
    ctx.strokeStyle = colour
    ctx.lineWidth = (w.kind === 'road' ? 1.8 : w.kind === 'canal' ? 2.2 : 1.1) * Math.max(0.7, k)
    ctx.setLineDash(w.kind === 'path' || w.kind === 'ridge' ? [1.6 * k, 1.4 * k] : [])
    let alone = true
    for (const n of neighbours({ col: w.c, row: w.r })) {
      if (!onWay.has(`${n.hex.col},${n.hex.row}`)) continue
      alone = false
      const [x2, y2] = at(n.hex.col, n.hex.row)
      ctx.beginPath()
      ctx.moveTo(x, y)
      ctx.lineTo((x + x2) / 2, (y + y2) / 2)
      ctx.stroke()
    }
    if (alone) {
      ctx.beginPath()
      ctx.arc(x, y, 0.8 * k, 0, 7)
      ctx.stroke()
    }
  }
  ctx.setLineDash([])
  // Your trail (after the M10 playtest): a very thin line along the hexes you walked.
  const marks = markColours(s, style)
  ctx.strokeStyle = marks.trail
  ctx.lineWidth = Math.max(0.8, Math.min(1.5, r / 10))
  ctx.globalAlpha = flash && flash !== 'trail' ? 0.25 : 0.9
  ctx.beginPath()
  for (let i = 0; i < data.hexes.length; i += 5) {
    const steps = data.hexes[i + 4]! >> 5
    if (!steps) continue
    const hex = { col: data.hexes[i]!, row: data.hexes[i + 1]! }
    const [x, y] = at(hex.col, hex.row)
    if (!visible(x, y)) continue
    for (const [bit, direction] of TRAIL_STEPS) {
      if (!(steps & bit)) continue
      const n = neighbour(hex, direction)
      const [x2, y2] = at(n.col, n.row)
      ctx.moveTo(x, y)
      ctx.lineTo(x2, y2)
    }
  }
  ctx.stroke()
  ctx.globalAlpha = 1
  for (const st of data.stairs) {
    const [x, y] = at(st.c, st.r)
    if (!visible(x, y)) continue
    ctx.fillStyle = s.glyph['stairs'] ?? s.label
    ctx.beginPath()
    const a = 2.4 * k
    if (st.dir === 'down') {
      ctx.moveTo(x - a, y - a * 0.7)
      ctx.lineTo(x + a, y - a * 0.7)
      ctx.lineTo(x, y + a * 0.85)
    } else {
      ctx.moveTo(x - a, y + a * 0.7)
      ctx.lineTo(x + a, y + a * 0.7)
      ctx.lineTo(x, y - a * 0.85)
    }
    ctx.closePath()
    ctx.fill()
  }
  // Night and mist on the minimap: your small circle clear, and the dark or the grey closing in beyond it. By day the fog lies on each hex.
  if (local && data.light !== 'day' && data.you) {
    const [x, y] = at(data.you.c, data.you.r)
    const inner = Math.max(r * 1.2, (data.sight + 0.5) * r * SQRT3)
    const outer = inner + r * 5
    const g = ctx.createRadialGradient(x, y, inner, x, y, outer)
    const [cr, cg, cb] = rgb(veil(style, data.light))
    g.addColorStop(0, `rgba(${cr},${cg},${cb},0)`)
    g.addColorStop(1, `rgba(${cr},${cg},${cb},0.45)`)
    ctx.fillStyle = g
    ctx.fillRect(0, 0, width, height)
  }
  const size = Math.round(Math.max(10, Math.min(14, 9 + r / 3)))
  for (const z of data.zones) {
    const [x, y] = at(z.c, z.r)
    const radius = Math.max(8, z.hexes * r * SQRT3)
    if (!visible(x, y) && !visible(x + radius, y) && !visible(x - radius, y)) continue
    ctx.setLineDash([3, 3])
    ctx.strokeStyle = s.label
    ctx.globalAlpha = 0.7
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.arc(x, y, radius, 0, 7)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.globalAlpha = 1
    label(ctx, `${z.name}?`, x, y, s, width, size)
  }
  const ik = Math.max(0.8, Math.min(1.6, r / 7))
  for (const p of data.places) {
    const [x, y] = at(p.c, p.r)
    if (!visible(x, y)) continue
    const memory = sightOf.get(`${p.c},${p.r}`) ?? 2
    ctx.globalAlpha = local && memory < 2 ? (data.light === 'day' ? 0.85 : 0.65) : 1
    // The mood of its area (M10.11): a ring of colour outside the patch of a visited place.
    if (p.mood && MOOD_COLOURS[p.mood]) {
      ctx.strokeStyle = MOOD_COLOURS[p.mood]!
      ctx.lineWidth = 2 * ik
      ctx.beginPath()
      ctx.arc(x, y - ik, 11 * ik, 0, 7)
      ctx.stroke()
    }
    // Where you lodge (M10.13): a small roof above the place's sign.
    if (p.lodging) {
      ctx.fillStyle = marks.trail
      ctx.beginPath()
      ctx.moveTo(x - 5 * ik, y - 11 * ik)
      ctx.lineTo(x, y - 16 * ik)
      ctx.lineTo(x + 5 * ik, y - 11 * ik)
      ctx.closePath()
      ctx.fill()
    }
    // A place you have been stands out (after the M10 playtest): its sign in its own colour, on a patch of shadow.
    if (p.status === 'visited') visitedMark(ctx, p.kind, x, y, s, marks.visited, ik)
    else placeIcon(ctx, p.kind, x, y, p.status, s.label, ik)
    label(ctx, p.name, x, y, s, width, size)
    ctx.globalAlpha = 1
  }
  if (data.you) {
    const [x, y] = at(data.you.c, data.you.r)
    ctx.strokeStyle = s.label_shadow
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.arc(x, y, Math.max(3.5, r * 0.45), 0, 7)
    ctx.stroke()
    ctx.fillStyle = '#c8d28a'
    ctx.fill()
  }
}

/** Where a click on the minimap would take you: a place or zone by its name, else a hex you have seen. */
export interface WalkTarget {
  c: number
  r: number
  name?: string
  /** A place: visited, seen or heard of. */
  status?: string
}

/** What lies under a point of the canvas: the nearest place (or heard-of zone), else the hex, if you have seen it. */
function hitAt(data: HexMapData, view: View, width: number, height: number, px: number, py: number): WalkTarget | undefined {
  const mx = view.x + (px - width / 2) / view.r
  const my = view.y - (py - height / 2) / view.r
  const far = (c: number, r: number) => {
    const [x, y] = hexPoint(c, r)
    return Math.hypot(x - mx, y - my)
  }
  // An icon is easier to hit than its hex: a little more than a hex, or ten pixels.
  const reach = Math.max(1.2, 10 / view.r)
  const place = [...data.places].sort((a, b) => far(a.c, a.r) - far(b.c, b.r))[0]
  if (place && far(place.c, place.r) <= reach) return { c: place.c, r: place.r, name: place.name, status: place.status }
  const zone = data.zones.find((z) => far(z.c, z.r) <= Math.max(reach, z.hexes * SQRT3))
  if (zone) return { c: zone.c, r: zone.r, name: zone.name, status: 'heard' }
  let best: WalkTarget | undefined
  let nearest = 1.05
  for (let i = 0; i < data.hexes.length; i += 5) {
    const c = data.hexes[i]!
    const r = data.hexes[i + 1]!
    if (data.keys[data.hexes[i + 2]!] === 'unknown') continue
    const d = far(c, r)
    if (d < nearest) {
      nearest = d
      best = { c, r }
    }
  }
  return best
}

/**
 * A map in colour: the minimap (local) or the map; zoom with the buttons or
 * the wheel, drag the map about, and open either full screen.
 */
export function HexMap({
  data,
  style,
  mode = 'map',
  legend = true,
  height = 360,
  label: ariaLabel,
  onLevel,
  onWalk,
}: {
  data: HexMapData
  style: MapStyleName
  mode?: MapMode
  legend?: boolean
  /** Its height in the page, in pixels; full screen it takes the window. */
  height?: number
  label: string
  /** The map's other levels: a switch that opens one. */
  onLevel?: (level: string) => void
  /** The minimap: a click on a place or on land you have seen walks there. */
  onWalk?: (target: WalkTarget) => void
}) {
  const [full, setFull] = useState(false)
  const body = (fullscreen: boolean) => (
    <MapCanvas
      data={data}
      style={style}
      mode={mode}
      legend={fullscreen || legend}
      height={fullscreen ? undefined : height}
      label={ariaLabel}
      onLevel={onLevel}
      full={fullscreen}
      onFull={() => setFull(!fullscreen)}
      onWalk={
        onWalk &&
        ((target) => {
          if (fullscreen) setFull(false)
          onWalk(target)
        })
      }
    />
  )
  return (
    <>
      {body(false)}
      {full &&
        createPortal(
          <div className="hexmap-full" role="dialog" aria-modal="true" aria-label={ariaLabel}>
            {body(true)}
          </div>,
          document.body,
        )}
    </>
  )
}

function MapCanvas({
  data,
  style,
  mode,
  legend,
  height,
  label: ariaLabel,
  onLevel,
  full,
  onFull,
  onWalk,
}: {
  data: HexMapData
  style: MapStyleName
  mode: MapMode
  legend: boolean
  height?: number
  label: string
  onLevel?: (level: string) => void
  full: boolean
  onFull: () => void
  onWalk?: (target: WalkTarget) => void
}) {
  const [hover, setHover] = useState<WalkTarget>()
  const canvas = useRef<HTMLCanvasElement>(null)
  const box = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })
  const [view, setView] = useState<View>()
  const [flash, setFlash] = useState<string>()
  const drag = useRef<{ x: number; y: number; view: View } | undefined>(undefined)
  const s = useMemo(() => mapStyle(data.palette, style), [data.palette, style])

  useEffect(() => {
    const el = box.current
    if (!el) return
    const measure = () => setSize({ width: el.clientWidth, height: height ?? el.clientHeight })
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [height])

  // A fresh view when the map opens or changes level; the minimap follows the stranger and keeps its zoom.
  const fitKey = mode === 'local' ? `${data.you?.c},${data.you?.r}` : `${data.level}`
  const zoomed = useRef<number | undefined>(undefined)
  useEffect(() => {
    if (!size.width || !size.height) return
    const fresh = fit(data, mode, size.width, size.height)
    setView(mode === 'local' && zoomed.current ? { ...fresh, r: zoomed.current } : fresh)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey, size.width, size.height, mode])

  useEffect(() => {
    if (canvas.current && view && size.width > 0) draw(canvas.current, data, s, style, mode, view, size.width, size.height, flash)
  }, [data, s, style, mode, view, size, flash])

  useEffect(() => {
    if (!flash) return
    const timer = setTimeout(() => setFlash(undefined), 1400)
    return () => clearTimeout(timer)
  }, [flash])

  useEffect(() => {
    if (!full) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onFull()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [full, onFull])

  /** Zooms by a factor, keeping the point under (px, py) where it is; the minimap zooms round the stranger. */
  const zoom = useCallback(
    (factor: number, px?: number, py?: number) => {
      setView((v) => {
        if (!v) return v
        const r = Math.max(MIN_R, Math.min(MAX_R, v.r * factor))
        if (mode === 'local') zoomed.current = r
        if (mode === 'local' || px === undefined || py === undefined) return { ...v, r }
        // The map point under the cursor stays under it.
        const mx = v.x + (px - size.width / 2) / v.r
        const my = v.y - (py - size.height / 2) / v.r
        return { x: mx - (px - size.width / 2) / r, y: my + (py - size.height / 2) / r, r }
      })
    },
    [mode, size.width, size.height],
  )

  useEffect(() => {
    const el = canvas.current
    if (!el) return
    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      const rect = el.getBoundingClientRect()
      zoom(event.deltaY < 0 ? 1.15 : 1 / 1.15, event.clientX - rect.left, event.clientY - rect.top)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [zoom])

  const walkable = mode === 'local' && !!onWalk
  const under = (event: { clientX: number; clientY: number; currentTarget: HTMLCanvasElement }) => {
    if (!view) return undefined
    const rect = event.currentTarget.getBoundingClientRect()
    const hit = hitAt(data, view, size.width, size.height, event.clientX - rect.left, event.clientY - rect.top)
    return hit && data.you && hit.c === data.you.c && hit.r === data.you.r ? undefined : hit
  }
  const onDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (mode === 'local' || !view) return
    drag.current = { x: event.clientX, y: event.clientY, view }
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  const onMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    // Pointing names a place (after the M10 playtest); on the minimap it says where a click walks to.
    if (!drag.current) {
      const hit = under(event)
      const shown = walkable ? hit : hit?.name ? hit : undefined
      if (shown?.c !== hover?.c || shown?.r !== hover?.r || shown?.name !== hover?.name) setHover(shown)
    }
    const d = drag.current
    if (!d) return
    setView({ ...d.view, x: d.view.x - (event.clientX - d.x) / d.view.r, y: d.view.y + (event.clientY - d.y) / d.view.r })
  }
  const onUp = () => {
    drag.current = undefined
  }

  const reset = () => {
    zoomed.current = undefined
    setView(fit(data, mode, size.width, size.height))
  }

  return (
    <div className={`hexmap${full ? ' is-full' : ''}`}>
      <div className="hexmap-bar">
        {onLevel && data.levels.length > 1 && (
          <div className="seg" role="group" aria-label={t('app.map.levels')}>
            {data.levels.map((l) => (
              <button key={l.id} type="button" aria-pressed={data.level === l.id} onClick={() => onLevel(l.id)}>
                {l.name}
              </button>
            ))}
          </div>
        )}
        <span className="spacer" />
        <button type="button" className="map-tool" onClick={() => zoom(1 / 1.3)} title={t('app.map.zoomOut')} aria-label={t('app.map.zoomOut')}>
          −
        </button>
        <button type="button" className="map-tool" onClick={() => zoom(1.3)} title={t('app.map.zoomIn')} aria-label={t('app.map.zoomIn')}>
          +
        </button>
        <button type="button" className="map-tool" onClick={reset} title={mode === 'local' ? t('app.map.centre') : t('app.map.fit')} aria-label={mode === 'local' ? t('app.map.centre') : t('app.map.fit')}>
          ◎
        </button>
        <button type="button" className="map-tool" onClick={onFull} title={full ? t('app.map.leaveFull') : t('app.map.full')} aria-label={full ? t('app.map.leaveFull') : t('app.map.full')}>
          {full ? '✕' : '⛶'}
        </button>
      </div>
      <div className="hexmap-canvas" ref={box} style={height ? { height } : undefined}>
        <canvas
          ref={canvas}
          role="img"
          aria-label={ariaLabel}
          style={{ background: s.ground, cursor: mode === 'map' ? 'grab' : walkable && hover ? 'pointer' : 'default' }}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          onPointerLeave={() => setHover(undefined)}
          onClick={(event) => {
            if (!walkable) return
            const hit = under(event)
            if (hit) onWalk!(hit)
          }}
          onDoubleClick={(event) => {
            // On the minimap a click walks; the buttons and the wheel zoom.
            if (walkable) return
            const rect = event.currentTarget.getBoundingClientRect()
            zoom(1.6, event.clientX - rect.left, event.clientY - rect.top)
          }}
        />
        {hover && (
          <div className="hexmap-hint">
            {walkable ? t('app.map.walkTo', { name: hover.name ?? t('app.map.thisLand') }) : `${hover.name}${hover.status ? `, ${word(`app.map.status.${hover.status}`, hover.status)}` : ''}`}
          </div>
        )}
      </div>
      {legend && <Legend data={data} s={s} style={style} onFlash={setFlash} />}
    </div>
  )
}

function Legend({ data, s, style, onFlash }: { data: HexMapData; s: MapStyle; style: MapStyleName; onFlash: (key: string) => void }) {
  const icons = useRef<HTMLCanvasElement[]>([])
  const signIcons = useRef<HTMLCanvasElement[]>([])
  const kinds = [...new Map(data.places.map((p) => [`${p.kind}:${p.status}`, p])).values()]
  const marks = markColours(s, style)
  // The signs on the map in view (M10.20), in the palette's order.
  const all = signsOf(data.palette)
  const inView = new Set<number>()
  for (let i = 4; i < data.hexes.length; i += 5) inView.add((data.hexes[i]! >> 2) & 7)
  // A sign with a tint of its own (the hummock) is in the legend as a terrain already.
  const signs = all.filter(([id], i) => inView.has(i + 1) && !data.legend.some((l) => l.key === id))
  useEffect(() => {
    kinds.forEach((p, i) => {
      const c = icons.current[i]
      const ctx = c?.getContext('2d')
      if (!c || !ctx) return
      ctx.clearRect(0, 0, c.width, c.height)
      if (p.status === 'visited') visitedMark(ctx, p.kind, 9, 10, s, marks.visited, 1)
      else placeIcon(ctx, p.kind, 9, 10, p.status, s.label)
    })
    signs.forEach(([id, sign], i) => {
      const c = signIcons.current[i]
      const ctx = c?.getContext('2d')
      if (!c || !ctx) return
      ctx.clearRect(0, 0, c.width, c.height)
      glyph(ctx, id, sign, 8, 9, s, 1.6)
    })
  })
  const ways = [...new Set(data.ways.map((w) => w.kind))]
  let walked = false
  for (let i = 4; i < data.hexes.length && !walked; i += 5) walked = data.hexes[i]! >> 5 !== 0
  return (
    <div className="hexmap-legend" aria-label={t('app.map.legend')}>
      {data.legend.map((l) => {
        const tint = tintsOf(s, l.key)[0]!
        return (
          <button key={l.key} type="button" onClick={() => onFlash(l.key)} title={t('app.map.flash', { name: l.name })}>
            <i style={{ background: tint, color: s.label }}>{MARK[l.key] ?? '·'}</i>
            {l.name}
          </button>
        )
      })}
      {ways.map((w) => (
        <button key={w} type="button" onClick={() => onFlash(w)}>
          <i style={{ background: s.ground, color: w === 'canal' ? s.ways.canal : w === 'road' ? s.ways.road : s.ways.path }}>{w === 'canal' ? '=' : w === 'road' ? ':' : ','}</i>
          {data.palette.names[w] ?? word(`app.map.ways.${w}`, w)}
        </button>
      ))}
      {walked && (
        <button type="button" onClick={() => onFlash('trail')}>
          <i className="hexmap-trail" style={{ background: s.ground }}>
            <span style={{ background: marks.trail }} />
          </i>
          {t('app.map.trail')}
        </button>
      )}
      {signs.map(([id, sign], i) => (
        <span key={id} className="hexmap-place">
          <canvas
            ref={(el) => {
              if (el) signIcons.current[i] = el
            }}
            width={18}
            height={16}
            style={{ background: s.ground }}
          />
          {sign.name}
          {sign.means && `, ${word(`app.map.means.${sign.means}`, sign.means)}`}
        </span>
      ))}
      {kinds.map((p, i) => (
        <span key={`${p.kind}:${p.status}`} className="hexmap-place">
          <canvas
            ref={(el) => {
              if (el) icons.current[i] = el
            }}
            width={18}
            height={16}
            style={{ background: s.ground }}
          />
          {word(`app.map.kinds.${p.kind}`, p.kind)}, {word(`app.map.status.${p.status}`, p.status)}
        </span>
      ))}
    </div>
  )
}

/**
 * The land map (M10): the region as a box, the stranger in it, the far places
 * known, and the routes to them, in the same tokens.
 */
export function LandMap({ data, style, label: ariaLabel, onCommand }: { data: LandMapData; style: MapStyleName; label: string; onCommand?: (command: string) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const box = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  // A destination picked on the map (M10.12): its ways there, each a button that sets off.
  const spots = useRef<{ name: string; x: number; y: number }[]>([])
  const [picked, setPicked] = useState<string>()
  const chosen = data.places.find((p) => p.name === picked)
  const s = useMemo(() => mapStyle(data.palette, style), [data.palette, style])
  useEffect(() => {
    const el = box.current
    if (!el) return
    const measure = () => setWidth(el.clientWidth)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  useEffect(() => {
    const c = canvas.current
    if (!c || width <= 0) return
    const xs = [data.region.x, data.region.x + data.region.w, ...data.places.map((p) => p.x), ...(data.you ? [data.you[0]] : [])]
    const ys = [data.region.y, data.region.y + data.region.h, ...data.places.map((p) => p.y), ...(data.you ? [data.you[1]] : [])]
    const minX = Math.min(...xs) - 10
    const maxX = Math.max(...xs) + 10
    const minY = Math.min(...ys) - 10
    const maxY = Math.max(...ys) + 10
    const k = (width - 20) / (maxX - minX)
    const height = Math.round((maxY - minY) * k + 20)
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    c.width = width * dpr
    c.height = height * dpr
    c.style.width = `${width}px`
    c.style.height = `${height}px`
    const ctx = c.getContext('2d')
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    const at = (x: number, y: number): [number, number] => [10 + (x - minX) * k, 10 + (maxY - y) * k]
    ctx.fillStyle = s.ground
    ctx.fillRect(0, 0, width, height)
    // The region: a box in the colour of its fen.
    const [rx, ry] = at(data.region.x, data.region.y + data.region.h)
    ctx.fillStyle = tintsOf(s, 'fen')[0]!
    ctx.fillRect(rx, ry, data.region.w * k, data.region.h * k)
    ctx.strokeStyle = s.label
    ctx.lineWidth = 1
    ctx.strokeRect(rx, ry, data.region.w * k, data.region.h * k)
    label(ctx, data.region.name, rx + 2, ry + 10, s, width)
    ctx.setLineDash([4, 3])
    ctx.lineWidth = 1.4
    for (const r of data.routes) {
      const [x1, y1] = at(r.from[0], r.from[1])
      const [x2, y2] = at(r.to[0], r.to[1])
      ctx.strokeStyle = s.ways.road
      ctx.beginPath()
      ctx.moveTo(x1, y1)
      ctx.lineTo(x2, y2)
      ctx.stroke()
    }
    ctx.setLineDash([])
    spots.current = []
    for (const p of data.places) {
      const [x, y] = at(p.x, p.y)
      spots.current.push({ name: p.name, x, y })
      placeIcon(ctx, 'town', x, y, p.name === picked ? 'visited' : 'seen', s.label)
      // Only a name and a line so far (M10.21): what is there is not yet known.
      label(ctx, p.level === 'sketch' ? `${p.name} ?` : p.name, x, y, s, width)
    }
    if (data.you) {
      const [x, y] = at(data.you[0], data.you[1])
      ctx.fillStyle = '#c8d28a'
      ctx.strokeStyle = s.label_shadow
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.arc(x, y, 3.5, 0, 7)
      ctx.stroke()
      ctx.fill()
    }
  }, [data, s, width, picked])
  const pick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const r = event.currentTarget.getBoundingClientRect()
    const x = event.clientX - r.left
    const y = event.clientY - r.top
    const near = spots.current.map((p) => ({ p, d: Math.hypot(p.x - x, p.y - y) })).sort((a, b) => a.d - b.d)[0]
    setPicked(near && near.d < 24 ? near.p.name : undefined)
  }
  return (
    <div className="hexmap land-map" ref={box}>
      <canvas ref={canvas} role="img" aria-label={ariaLabel} onClick={pick} />
      {onCommand && data.places.some((p) => p.ways?.length) && (
        <div className="land-ways">
          <p className="muted small">{chosen ? t('app.map.land.waysTo', { name: chosen.name }) : t('app.map.land.pick')}</p>
          {!chosen && (
            <div className="land-places">
              {data.places
                .filter((p) => p.ways?.length)
                .map((p) => (
                  <button key={p.name} type="button" className="link" onClick={() => setPicked(p.name)}>
                    [{p.name}]
                  </button>
                ))}
            </div>
          )}
          {chosen?.ways?.map((way) => (
            <button key={way.command} type="button" className="link land-way" onClick={() => onCommand(way.command)}>
              [{way.label}]
            </button>
          ))}
          {chosen && !chosen.ways?.length && <p className="muted small">{t('app.map.land.noWay')}</p>}
          {chosen && Boolean(data.leaving?.length) && (
            <div className="land-leaving small">
              <p className="muted">{t('app.map.land.leaving')}</p>
              <ul>
                {data.leaving!.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

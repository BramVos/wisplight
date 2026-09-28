import { useEffect, useMemo, useRef, useState } from 'react'
import type { HexMapData, LandMapData } from '../../engine'
import { neighbours } from '../../engine/map/hexgrid'
import { mapStyle, tintsOf, type MapStyle, type MapStyleName } from '../../engine/map/palette'
import { hasWords, t } from './i18n'

const word = (key: string, fallback: string) => (hasWords(key) ? t(key) : fallback)

// The map in colour (M10; FO, chapter 4, "Weergave"; the proposal page
// approved on 28 September 2026). Every hex the player knows gets one of its
// terrain's muted tints, from its seed; features have their own sign; what is
// remembered from long ago, and at night or in mist all beyond sight, is
// vaguer. Ways are warm parchment, places an icon by kind and status. The
// legend strip under it has the same tokens; a click lights a terrain up.

const FEATURE = ['', 'pool', 'peat_pit', 'willow', 'ruin', 'hummock']
const MARK: Record<string, string> = { fen: '"', bog: '"', hummock: '^', ridge: ',', water: '~', channel: '≈', woods: 'T', heath: '^', fields: '.', tunnel: '∩', crown: '♣', cliff: '▲', dune: '∽' }

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

interface Geometry {
  r: number
  w: number
  h: number
  pad: number
  width: number
  height: number
  at(col: number, row: number): [number, number]
}

/** Flat-topped hexes in columns, odd columns half a hex north, north up: as the engine lays them. */
function geometry(data: Pick<HexMapData, 'left' | 'top' | 'width' | 'height'>, cssWidth: number): Geometry {
  const pad = 6
  const r = Math.max(2.5, (cssWidth - pad * 2) / (1.5 * (data.width - 1) + 2))
  const w = 1.5 * r
  const h = Math.sqrt(3) * r
  return {
    r,
    w,
    h,
    pad,
    width: Math.ceil(w * (data.width - 1) + 2 * r + pad * 2),
    height: Math.ceil(h * data.height + h / 2 + pad * 2),
    at: (col, row) => [pad + r + (col - data.left) * w, pad + h / 2 + (data.top - row) * h + (col % 2 === 1 ? 0 : h / 2)],
  }
}

function hexPath(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.beginPath()
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i
    ctx.lineTo(x + r * Math.cos(a), y + r * Math.sin(a))
  }
  ctx.closePath()
}

function glyph(ctx: CanvasRenderingContext2D, feature: string, x: number, y: number, s: MapStyle, scale: number): void {
  const g = s.glyph
  const k = scale
  if (feature === 'pool') {
    ctx.fillStyle = g.pool
    ctx.beginPath()
    ctx.ellipse(x, y + 0.3 * k, 2.1 * k, 1.5 * k, 0, 0, 7)
    ctx.fill()
  } else if (feature === 'peat_pit') {
    ctx.fillStyle = g.peat_pit
    ctx.fillRect(x - 1.8 * k, y - 1.5 * k, 3.6 * k, 3 * k)
    ctx.strokeStyle = g.peat_edge
    ctx.lineWidth = 0.6
    ctx.strokeRect(x - 1.8 * k, y - 1.5 * k, 3.6 * k, 3 * k)
  } else if (feature === 'willow') {
    ctx.strokeStyle = g.willow
    ctx.lineWidth = 0.9
    ctx.beginPath()
    ctx.moveTo(x, y + 2.2 * k)
    ctx.lineTo(x, y - 1.2 * k)
    ctx.moveTo(x, y - k)
    ctx.quadraticCurveTo(x - 2.2 * k, y - k, x - 2.2 * k, y + 1.4 * k)
    ctx.moveTo(x, y - k)
    ctx.quadraticCurveTo(x + 2.2 * k, y - k, x + 2.2 * k, y + 1.4 * k)
    ctx.stroke()
  } else if (feature === 'ruin') {
    ctx.strokeStyle = g.ruin
    ctx.lineWidth = 0.9
    ctx.beginPath()
    ctx.moveTo(x - 2 * k, y + 2 * k)
    ctx.lineTo(x - 2 * k, y - 1.5 * k)
    ctx.lineTo(x + 0.5 * k, y - 1.5 * k)
    ctx.moveTo(x + 2 * k, y + 2 * k)
    ctx.lineTo(x + 2 * k, y - 0.2 * k)
    ctx.stroke()
  } else if (feature === 'hummock') {
    ctx.strokeStyle = g.hummock
    ctx.lineWidth = 0.8
    ctx.beginPath()
    ctx.moveTo(x - 1.8 * k, y + k)
    ctx.lineTo(x, y - k)
    ctx.lineTo(x + 1.8 * k, y + k)
    ctx.stroke()
  }
}

/** A place by kind: a town with gables, a village and a hamlet as roofs, an inn with its sign, the wild as a ring. Filled when visited. */
export function placeIcon(ctx: CanvasRenderingContext2D, kind: string, x: number, y: number, status: string, ink: string): void {
  ctx.lineWidth = 1.2
  ctx.strokeStyle = ink
  ctx.fillStyle = ink
  ctx.beginPath()
  if (kind === 'town' || kind === 'city') {
    ctx.rect(x - 3.5, y - 6, 7, 10)
    ctx.moveTo(x - 3.5, y - 6)
    ctx.lineTo(x - 3.5, y - 8)
    ctx.lineTo(x - 1.2, y - 8)
    ctx.lineTo(x - 1.2, y - 6)
    ctx.moveTo(x + 1.2, y - 6)
    ctx.lineTo(x + 1.2, y - 8)
    ctx.lineTo(x + 3.5, y - 8)
    ctx.lineTo(x + 3.5, y - 6)
  } else if (kind === 'village') {
    ctx.moveTo(x - 5, y + 4)
    ctx.lineTo(x - 5, y - 1)
    ctx.lineTo(x, y - 6)
    ctx.lineTo(x + 5, y - 1)
    ctx.lineTo(x + 5, y + 4)
    ctx.closePath()
  } else if (kind === 'hamlet') {
    ctx.moveTo(x - 3.5, y + 3)
    ctx.lineTo(x - 3.5, y - 0.5)
    ctx.lineTo(x, y - 4)
    ctx.lineTo(x + 3.5, y - 0.5)
    ctx.lineTo(x + 3.5, y + 3)
    ctx.closePath()
  } else if (kind === 'inn') {
    ctx.rect(x - 4, y - 3, 8, 7)
    ctx.moveTo(x - 4, y - 3)
    ctx.lineTo(x, y - 7)
    ctx.lineTo(x + 4, y - 3)
  } else {
    ctx.arc(x, y, 3.5, 0, 7)
  }
  if (status === 'visited') ctx.fill()
  ctx.stroke()
}

function label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, s: MapStyle, max: number): void {
  ctx.font = '600 10px "Alegreya Sans", system-ui, sans-serif'
  ctx.textBaseline = 'middle'
  const width = ctx.measureText(text).width
  const lx = x + 8 + width > max - 4 ? x - 8 - width : x + 8
  ctx.lineWidth = 3
  ctx.strokeStyle = s.label_shadow
  ctx.strokeText(text, lx, y)
  ctx.fillStyle = s.label
  ctx.fillText(text, lx, y)
}

/** Draws the map data on a canvas of this css width. */
function draw(canvas: HTMLCanvasElement, data: HexMapData, s: MapStyle, cssWidth: number, flash: string | undefined, labels: boolean): void {
  const g = geometry(data, cssWidth)
  const dpr = Math.min(2, window.devicePixelRatio || 1)
  canvas.width = g.width * dpr
  canvas.height = g.height * dpr
  canvas.style.width = `${g.width}px`
  canvas.style.height = `${g.height}px`
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.fillStyle = s.ground
  ctx.fillRect(0, 0, g.width, g.height)
  const scale = Math.max(0.6, g.r / 5)
  const lit = (key: string) => !flash || flash === key
  for (let i = 0; i < data.hexes.length; i += 5) {
    const col = data.hexes[i]!
    const row = data.hexes[i + 1]!
    const key = data.keys[data.hexes[i + 2]!] ?? 'fields'
    const tint = data.hexes[i + 3]!
    const flags = data.hexes[i + 4]!
    const memory = flags & 3
    const [x, y] = g.at(col, row)
    const tints = key === 'unknown' ? [s.unknown] : tintsOf(s, key)
    let fill = tints[tint % tints.length]!
    // Remembered from long ago, or beyond sight at night and in mist: the vaguer tint.
    if (memory === 0) fill = mix(fill, s.ground, 0.45)
    if (!lit(key)) fill = mix(fill, s.ground, 0.72)
    hexPath(ctx, x, y, g.r + 0.35)
    ctx.fillStyle = fill
    ctx.fill()
    const feature = FEATURE[flags >> 2] ?? ''
    if (feature && !flash) {
      ctx.globalAlpha = memory === 0 ? 0.55 : 1
      glyph(ctx, feature, x, y, s, scale)
      ctx.globalAlpha = 1
    }
  }
  // Ways: a short stroke to each neighbouring hex on a way of the same kind.
  const onWay = new Map(data.ways.map((w) => [`${w.c},${w.r}`, w.kind]))
  ctx.lineCap = 'round'
  for (const w of data.ways) {
    const [x, y] = g.at(w.c, w.r)
    const colour = w.kind === 'canal' ? s.ways.canal : w.kind === 'road' ? s.ways.road : s.ways.path
    ctx.strokeStyle = flash && !['road', 'path', 'canal', 'ridge'].includes(flash) ? mix(colour, s.ground, 0.7) : colour
    ctx.lineWidth = (w.kind === 'road' ? 1.8 : w.kind === 'canal' ? 2.2 : 1.1) * Math.max(0.7, scale)
    ctx.setLineDash(w.kind === 'path' || w.kind === 'ridge' ? [1.6, 1.4] : [])
    let alone = true
    for (const n of neighbours({ col: w.c, row: w.r })) {
      if (!onWay.has(`${n.hex.col},${n.hex.row}`)) continue
      alone = false
      const [x2, y2] = g.at(n.hex.col, n.hex.row)
      ctx.beginPath()
      ctx.moveTo(x, y)
      ctx.lineTo((x + x2) / 2, (y + y2) / 2)
      ctx.stroke()
    }
    if (alone) {
      ctx.beginPath()
      ctx.arc(x, y, 0.8 * scale, 0, 7)
      ctx.stroke()
    }
  }
  ctx.setLineDash([])
  for (const st of data.stairs) {
    const [x, y] = g.at(st.c, st.r)
    ctx.fillStyle = s.glyph.stairs
    ctx.beginPath()
    const k = 2.4 * scale
    if (st.dir === 'down') {
      ctx.moveTo(x - k, y - k * 0.7)
      ctx.lineTo(x + k, y - k * 0.7)
      ctx.lineTo(x, y + k * 0.85)
    } else {
      ctx.moveTo(x - k, y + k * 0.7)
      ctx.lineTo(x + k, y + k * 0.7)
      ctx.lineTo(x, y - k * 0.85)
    }
    ctx.closePath()
    ctx.fill()
  }
  for (const z of data.zones) {
    const [x, y] = g.at(z.c, z.r)
    ctx.setLineDash([3, 3])
    ctx.strokeStyle = s.label
    ctx.globalAlpha = 0.7
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.arc(x, y, Math.max(8, z.hexes * g.h), 0, 7)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.globalAlpha = 1
    if (labels) label(ctx, `${z.name}?`, x, y, s, g.width)
  }
  for (const p of data.places) {
    const [x, y] = g.at(p.c, p.r)
    placeIcon(ctx, p.kind, x, y, p.status, s.label)
    if (labels) label(ctx, p.name, x, y, s, g.width)
  }
  if (data.you) {
    const [x, y] = g.at(data.you.c, data.you.r)
    ctx.strokeStyle = s.label_shadow
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.arc(x, y, 3.2 * Math.max(0.8, scale), 0, 7)
    ctx.stroke()
    ctx.fillStyle = '#c8d28a'
    ctx.fill()
  }
}

/**
 * The map in colour: a canvas that fits its box, and under it the legend
 * strip. A click on a terrain in the legend lights it up for a moment.
 */
export function HexMap({ data, style, labels = true, legend = true, label: ariaLabel }: { data: HexMapData; style: MapStyleName; labels?: boolean; legend?: boolean; label: string }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const box = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const [flash, setFlash] = useState<string>()
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
    if (canvas.current && width > 0) draw(canvas.current, data, s, width, flash, labels)
  }, [data, s, width, flash, labels])

  useEffect(() => {
    if (!flash) return
    const timer = setTimeout(() => setFlash(undefined), 1400)
    return () => clearTimeout(timer)
  }, [flash])

  return (
    <div className="hexmap" ref={box}>
      <canvas ref={canvas} role="img" aria-label={ariaLabel} style={{ background: s.ground }} />
      {legend && <Legend data={data} s={s} onFlash={setFlash} />}
    </div>
  )
}

function Legend({ data, s, onFlash }: { data: HexMapData; s: MapStyle; onFlash: (key: string) => void }) {
  const icons = useRef<HTMLCanvasElement[]>([])
  const kinds = [...new Map(data.places.map((p) => [`${p.kind}:${p.status}`, p])).values()]
  useEffect(() => {
    kinds.forEach((p, i) => {
      const c = icons.current[i]
      const ctx = c?.getContext('2d')
      if (!c || !ctx) return
      ctx.clearRect(0, 0, c.width, c.height)
      placeIcon(ctx, p.kind, 9, 10, p.status, s.label)
    })
  })
  const ways = [...new Set(data.ways.map((w) => w.kind))]
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
          {word(`app.map.ways.${w}`, w)}
        </button>
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
export function LandMap({ data, style, label: ariaLabel }: { data: LandMapData; style: MapStyleName; label: string }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const box = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
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
    for (const p of data.places) {
      const [x, y] = at(p.x, p.y)
      placeIcon(ctx, 'town', x, y, 'seen', s.label)
      label(ctx, p.name, x, y, s, width)
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
  }, [data, s, width])
  return (
    <div className="hexmap" ref={box}>
      <canvas ref={canvas} role="img" aria-label={ariaLabel} />
    </div>
  )
}

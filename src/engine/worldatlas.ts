import type { Content } from './content'
import { escapeHtml as esc, markdownHtml } from './markdown'
import { DEFAULT_PALETTE, TERRAIN_ORDER, terrainName, type MapPalette, type MapStyle } from './map/palette'
import { previewMapData, type HexMapData } from './map/view'

// The world book as an atlas page (M10.20; Bram, 28 September 2026): the same
// text as worldbook.ts, in the manner of the atlases in docs/ (a header with
// the name and the date, a table of contents, a sheet per chapter), with what
// the text holds drawn where it helps: the region in the world's own palette,
// the places with their pictures, a gallery of portraits, the coins and the
// calendar as cards, the palette as swatches. The plain page stays beside it.
// Markers in the Markdown (<!-- picture:x -->) say where each goes; a card or
// swatch set takes the place of the table or line that follows its marker,
// so nothing is said twice.

const SQRT3 = Math.sqrt(3)
const round = (n: number) => Math.round(n * 100) / 100

export interface AtlasOptions {
  /** The date the page was written, for the header ("28 September 2026"). */
  written?: string
  /** Another book in the same dress (M10.20): what it is called, beside the world's name ("the world book" when not given). */
  book?: string
  /** The line under the name on the cover; the world's own words when not given. */
  lede?: string
  /** The numbers on the cover: [how many, one, many]; the content's when not given. */
  stats?: [number, string, string][]
  /** Drawings of its own, by marker, before the world book's own. */
  figures?: (key: string) => string | undefined
  /** Only these people in the gallery of portraits (the people met); everyone when not given. */
  people?: string[]
}

/** Where a hex lies in map units: flat-topped, odd columns half a hex north, as the game draws it. */
function hexPoint(col: number, row: number): [number, number] {
  return [col * 1.5, row * SQRT3 + (col % 2 === 1 ? SQRT3 / 2 : 0)]
}

/** The neighbours of a hex that come after it, so a way is drawn once between two hexes. */
function nextTo(col: number, row: number): [number, number][] {
  const odd = col % 2 === 1
  return [
    [col, row + 1],
    [col + 1, odd ? row + 1 : row],
    [col + 1, odd ? row : row - 1],
  ]
}

/**
 * A map as an SVG in the world's palette (M10.20): paper by day, the dark map
 * in dark mode. The window of the data is drawn whole, so a region seen in
 * part keeps its shape, with the land not yet seen left blank. One path per
 * terrain and tint keeps the page light; the ways are lines between the hexes
 * they cross; the places carry their names.
 */
export function hexMapSvg(data: HexMapData, palette: MapPalette, label: string): string {
  if (!data.hexes.length) return ''
  const hexes: { col: number; row: number; key: string; tint: number }[] = []
  for (let i = 0; i < data.hexes.length; i += 5) hexes.push({ col: data.hexes[i]!, row: data.hexes[i + 1]!, key: data.keys[data.hexes[i + 2]!]!, tint: data.hexes[i + 3]! })
  // The window, in map units; north up, so the screen's y runs the other way.
  const top = data.top * SQRT3 + SQRT3 / 2
  const bottom = (data.top - data.height + 1) * SQRT3
  const at = (col: number, row: number): [number, number] => {
    const [x, y] = hexPoint(col, row)
    return [round(x - data.left * 1.5 + 1), round(top - y + 1)]
  }
  const tints = (style: MapStyle, key: string) => style.terrain[key] ?? DEFAULT_PALETTE[style === palette.dark ? 'dark' : 'paper'].terrain[key] ?? [style.unknown]
  const groups = new Map<string, string[]>()
  for (const h of hexes) {
    const cls = `t-${h.key}-${h.tint % tints(palette.paper, h.key).length}`
    const [x, y] = at(h.col, h.row)
    // A hex of radius 1.02, so no seam shows between neighbours.
    const d = `M${round(x + 1.02)} ${y}l-.51 .883h-1.02l-.51-.883.51-.883h1.02z`
    const list = groups.get(cls) ?? []
    list.push(d)
    groups.set(cls, list)
  }
  const scheme = (style: MapStyle) =>
    [...groups.keys()]
      .map((cls) => {
        const [, key, tint] = /^t-(.+)-(\d+)$/.exec(cls)!
        const list = tints(style, key!)
        return `.region .${cls}{fill:${list[Number(tint) % list.length]}}`
      })
      .join('') +
    `.region .way-road{stroke:${style.ways.road}}.region .way-path,.region .way-ridge{stroke:${style.ways.path}}.region .way-canal{stroke:${style.ways.canal}}.region text{fill:${style.label};stroke:${style.label_shadow}}.region .blank{fill:${style.unknown}}`
  const style = `${scheme(palette.paper)}@media (prefers-color-scheme: dark){${scheme(palette.dark)}}`
  const ways = new Map(data.ways.map((w) => [`${w.c},${w.r}`, w.kind]))
  const lines: string[] = []
  for (const w of data.ways) {
    for (const [c, r] of nextTo(w.c, w.r)) {
      if (ways.get(`${c},${r}`) !== w.kind) continue
      const [x1, y1] = at(w.c, w.r)
      const [x2, y2] = at(c, r)
      lines.push(`<line class="way-${w.kind}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`)
    }
  }
  const width = round((data.width - 1) * 1.5 + 2)
  const height = round(top - bottom + 2)
  // A name near the right edge reads to the left of its place, so it stays on the map.
  const places = data.places.map((p) => {
    const [x, y] = at(p.c, p.r)
    const left = x > width * 0.8
    return `<circle cx="${x}" cy="${y}" r=".7"/><text x="${round(left ? x - 1.2 : x + 1.2)}" y="${round(y + 0.8)}"${left ? ' text-anchor="end"' : ''}>${esc(p.name)}</text>`
  })
  const legend = data.legend.map((l) => `<span><i class="sw" style="--c:${tints(palette.paper, l.key)[0]};--d:${tints(palette.dark, l.key)[0]}"></i>${esc(l.name)}</span>`).join('')
  return `<figure class="region"><style>${style}</style><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(label)}" style="max-width:${Math.round(width * 12)}px"><rect class="blank" width="${width}" height="${height}"/>${[...groups].map(([cls, ds]) => `<path class="${cls}" d="${ds.join('')}"/>`).join('')}<g class="ways">${lines.join('')}</g><g class="places">${places.join('')}</g></svg><figcaption class="legend">${legend}</figcaption></figure>`
}

/** The whole region, as the designer drew it. */
function regionSvg(content: Content, palette: MapPalette): string {
  return hexMapSvg(previewMapData(content, palette, true), palette, `The region of ${content.world.name}`)
}

/** The coins as cards: the short mark big, the name, and what it is worth in the smallest coin. */
function coinCards(content: Content): string {
  const units = content.world.money?.units
  if (!units?.length) return ''
  const smallest = [...units].sort((a, b) => a.value - b.value)[0]!
  return `<div class="cards coins">${units
    .map((u) => `<div class="card"><b class="mark">${esc(u.short)}</b><span class="name">${esc(u.name)}</span><span class="worth">${u === smallest ? 'the smallest coin' : `${u.value} ${esc(smallest.plural ?? `${smallest.name}s`)}`}</span></div>`)
    .join('')}</div><!--replaces-->`
}

/** The calendar as cards: the months with their days, the week, and how years are counted. */
function calendarCards(content: Content): string {
  const cal = content.world.calendar
  if (!cal) return ''
  const days = (i: number) => (i < 12 ? 30 : 5)
  return `<div class="cards months">${cal.months.map((m, i) => `<div class="card"><span class="num">${i + 1}</span><span class="name">${esc(m)}</span><span class="worth">${days(i)} days</span></div>`).join('')}</div><p class="week">${cal.weekdays.map((d) => `<span class="chip">${esc(d)}</span>`).join('')}${cal.era ? `<span class="era">Years are counted ${esc(cal.era)}</span>` : ''}</p><!--replaces-->`
}

/** The palette as swatches: every terrain with its tints, on paper and in the dark. */
function paletteSwatches(palette: MapPalette): string {
  const keys = [...TERRAIN_ORDER.filter((k) => palette.paper.terrain[k]), ...Object.keys(palette.paper.terrain).filter((k) => !TERRAIN_ORDER.includes(k))]
  return `<div class="swatches">${keys
    .map((k) => `<div class="swatch"><div class="tints">${palette.paper.terrain[k]!.map((c) => `<i style="background:${c}"></i>`).join('')}</div><div class="tints dark">${(palette.dark.terrain[k] ?? []).map((c) => `<i style="background:${c}"></i>`).join('')}</div><span>${esc(terrainName(palette, k))} <small>${esc(k)}</small></span></div>`)
    .join('')}</div><!--replaces-->`
}

/** The world book as an atlas page (M10.20): the same Markdown as the plain page, dressed as the atlases. */
export function worldAtlasHtml(content: Content, markdown: string, pictures: (id: string) => string | undefined = () => undefined, options: AtlasOptions = {}): string {
  const w = content.world
  const palette = w.map?.palette ?? DEFAULT_PALETTE
  const parts = markdown.split(/^## (\d+)\. (.+)$/m)
  const intro = parts[0]!.replace(/^# .*\n/, '').trim()
  const chapters: { n: string; title: string; body: string }[] = []
  for (let i = 1; i < parts.length; i += 3) chapters.push({ n: parts[i]!, title: parts[i + 1]!, body: parts[i + 2] ?? '' })
  const book = options.book ?? 'the world book'
  const figure = (key: string): string | undefined => {
    const own = options.figures?.(key)
    if (own !== undefined) return own || undefined
    if (key === 'map') return regionSvg(content, palette) || undefined
    if (key === 'coins') return coinCards(content) || undefined
    if (key === 'calendar') return calendarCards(content) || undefined
    if (key === 'palette') return w.map?.palette ? paletteSwatches(palette) : undefined
    if (key === 'portraits') {
      const shown = [...content.npcs.values()]
        .filter((n) => !options.people || options.people.includes(n.id))
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((n) => ({ n, src: pictures(n.id) }))
        .filter((p) => p.src)
      return shown.length ? `<div class="gallery">${shown.map((p) => `<figure><img src="${p.src}" alt="" loading="lazy"><figcaption>${esc(p.n.name)}<small>${esc(p.n.short)}</small></figcaption></figure>`).join('')}</div>` : undefined
    }
    const src = pictures(key)
    return src ? `<figure class="plate"><img src="${src}" alt="" loading="lazy"></figure>` : undefined
  }
  const slug = (title: string) => title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  const sheets = chapters.map((c) => {
    const body = markdownHtml(c.body, figure).replace(/<!--replaces-->\n<(table|p|ul)>[\s\S]*?<\/\1>/g, '')
    return `<section class="sheet ch-${slug(c.title)}" id="${slug(c.title)}"><header class="sheet-head"><div class="folio">Chapter<strong>${esc(c.n)}</strong></div><h2>${esc(c.title)}</h2><div class="ref">${esc(w.name)}<br>${esc(book)}</div></header><div class="sheet-body">${body}</div></section>`
  })
  const count = (n: number, one: string, many: string) => (n ? `<div><b>${n}</b>${n === 1 ? one : many}</div>` : '')
  const numbers: [number, string, string][] = options.stats ?? [
    [content.areas.size, 'area', 'areas'],
    [content.locations.size, 'place', 'places'],
    [content.npcs.size, 'person', 'people'],
    [content.factions.size, 'power', 'powers'],
    [content.quests.size, 'quest', 'quests'],
  ]
  const stats = numbers.map(([n, one, many]) => count(n, one, many)).join('')
  const lede = options.lede ?? (w.words ? `The land is ${w.words.land}; play begins in ${w.words.region}; the stranger comes from ${w.words.from}.` : '')
  const toc = chapters.map((c) => `<a href="#${slug(c.title)}"><b>${esc(c.n)}</b>${esc(c.title)}</a>`).join('')
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(`${w.name}: ${book}`)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IM+Fell+English:ital@0;1&family=IM+Fell+English+SC&family=Alegreya+Sans:ital,wght@0,400;0,500;0,700;1,400&family=IBM+Plex+Mono:wght@400;500&display=swap">
<style>${ATLAS_CSS}</style></head><body>
<div class="bar"><div class="bar-in"><span class="bar-name">${esc(w.name)}</span><nav>${chapters.map((c) => `<a href="#${slug(c.title)}"><b>${esc(c.n)}</b>${esc(c.title)}</a>`).join('')}</nav></div></div>
<main class="wrap">
<section class="sheet cover"><header class="sheet-head"><div class="folio">${esc(book.charAt(0).toUpperCase() + book.slice(1))}</div><h1>${esc(w.name)}</h1><div class="ref">${options.written ? `Written ${esc(options.written)}` : ''}</div></header>
<div class="cover-body"><div class="cover-text">${lede ? `<p class="lede">${esc(lede)}</p>` : ''}<div class="note">${markdownHtml(intro)}</div></div><div class="stats">${stats}</div></div>
<nav class="toc">${toc}</nav></section>
${sheets.join('\n')}
</main></body></html>
`
}

const ATLAS_CSS = `
:root{--paper:#E9ECE3;--sheet:#F4F5EF;--ink:#18231F;--ink-2:#4A5A52;--ink-3:#7C8A82;--rule:#C5CCC0;--rule-strong:#18231F;--wisp:#C99A12;--wisp-soft:#F6E7B0;--shadow:0 1px 0 rgba(24,35,31,.06),0 10px 30px -18px rgba(24,35,31,.35);
--f-display:"IM Fell English","Iowan Old Style",Georgia,serif;--f-sc:"IM Fell English SC","IM Fell English",Georgia,serif;--f-body:"Alegreya Sans","Gill Sans","Segoe UI",system-ui,sans-serif;--f-mono:"IBM Plex Mono",ui-monospace,Menlo,Consolas,monospace}
@media (prefers-color-scheme:dark){:root{color-scheme:dark;--paper:#0C1311;--sheet:#121B18;--ink:#DCE3DA;--ink-2:#A7B4AB;--ink-3:#74847A;--rule:#2A3833;--rule-strong:#DCE3DA;--wisp:#F0C94A;--wisp-soft:#3A3217;--shadow:0 1px 0 rgba(0,0,0,.3),0 14px 30px -18px rgba(0,0,0,.8)}}
*{box-sizing:border-box}
body{background:var(--paper);color:var(--ink);font-family:var(--f-body);font-size:16px;line-height:1.5;margin:0}
a{color:inherit}
.wrap{max-width:1180px;margin:0 auto;padding:0 clamp(16px,3vw,40px) 64px}
.bar{position:sticky;top:0;z-index:10;background:color-mix(in srgb,var(--paper) 92%,transparent);backdrop-filter:blur(6px);border-bottom:1px solid var(--rule)}
.bar-in{max-width:1180px;margin:0 auto;padding:8px clamp(16px,3vw,40px);display:flex;gap:14px;align-items:center}
.bar-name{font-family:var(--f-sc);font-size:18px;white-space:nowrap}
.bar nav{display:flex;gap:4px;overflow-x:auto;scrollbar-width:thin}
.bar nav a,.toc a{font-size:12.5px;text-decoration:none;white-space:nowrap;padding:3px 8px;border-radius:3px;color:var(--ink-2);border:1px solid transparent}
.bar nav a b,.toc a b{font-family:var(--f-mono);font-weight:500;color:var(--ink-3);margin-right:5px;font-size:11px}
.bar nav a:hover,.toc a:hover{border-color:var(--rule);color:var(--ink)}
.sheet{background:var(--sheet);margin-top:36px;box-shadow:var(--shadow);border:1px solid var(--rule);scroll-margin-top:56px}
.sheet-head{display:grid;grid-template-columns:auto 1fr auto;gap:8px 28px;align-items:end;padding:22px 28px 16px;border-bottom:2px solid var(--rule-strong)}
.folio{font-family:var(--f-mono);font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--ink-3);line-height:1.3}
.folio strong{display:block;font-family:var(--f-display);font-size:44px;letter-spacing:0;color:var(--wisp);font-weight:400;line-height:.9;margin-top:2px}
.sheet-head h1,.sheet-head h2{font-family:var(--f-display);font-weight:400;margin:0;line-height:1.02}
.sheet-head h1{font-size:clamp(40px,6vw,72px)}.sheet-head h2{font-size:clamp(26px,3vw,40px)}
.ref{font-family:var(--f-mono);font-size:11px;color:var(--ink-3);text-align:right;line-height:1.5;text-transform:uppercase;letter-spacing:.1em}
.sheet-body{padding:8px 28px 28px;max-width:none}
.sheet-body>p,.sheet-body>ul{max-width:74ch}
h3{font-family:var(--f-mono);font-size:11.5px;font-weight:500;letter-spacing:.14em;text-transform:uppercase;color:var(--ink-3);margin:28px 0 10px;clear:both}
h4{font-family:var(--f-display);font-weight:400;font-size:20px;margin:18px 0 6px}
p{margin:0 0 12px}
table{border-collapse:collapse;width:100%;margin:8px 0 18px;font-size:14px}
th{font-family:var(--f-mono);font-size:10.5px;font-weight:500;letter-spacing:.1em;text-transform:uppercase;color:var(--ink-3);text-align:left;border-bottom:1.5px solid var(--rule-strong);padding:6px 10px 6px 0}
td{border-bottom:1px solid var(--rule);padding:6px 10px 6px 0;vertical-align:top}
pre{white-space:pre-wrap;background:var(--paper);border:1px solid var(--rule);padding:12px 14px;font-family:var(--f-body);font-size:15px;max-width:80ch}
pre.map{white-space:pre;overflow-x:auto;font-family:var(--f-mono);font-size:13px;line-height:1.2;width:max-content;max-width:100%}
code{font-family:var(--f-mono);font-size:.88em}
.cover-body{display:grid;grid-template-columns:1fr auto;gap:24px;padding:20px 28px}
.cover-text{max-width:70ch;color:var(--ink-2)}.note{font-size:13px;color:var(--ink-3)}.lede{font-family:var(--f-display);font-size:21px;color:var(--ink)}
.stats{display:grid;grid-template-columns:repeat(auto-fill,minmax(88px,1fr));gap:10px;align-content:start;min-width:200px}
.stats div{border-top:2px solid var(--rule-strong);padding-top:4px;font-size:12.5px;color:var(--ink-3)}
.stats b{display:block;font-family:var(--f-display);font-size:32px;font-weight:400;color:var(--ink);line-height:1}
.toc{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:2px 12px;padding:14px 28px 22px;border-top:1px solid var(--rule)}
.toc a{font-size:14px}
.region{margin:12px 0 18px}.region svg{width:100%;height:auto;display:block;border:1px solid var(--rule);background:var(--paper)}
.region path{stroke:none}.region .ways line{stroke-width:.32;stroke-linecap:round}.region .places circle{fill:var(--wisp);stroke:var(--ink);stroke-width:.15}
.region text{font-family:var(--f-sc);font-size:2.4px;stroke-width:.3px;paint-order:stroke}
.legend{display:flex;flex-wrap:wrap;gap:6px 16px;margin-top:8px;font-size:13px;color:var(--ink-2)}
.legend .sw,.swatch i{display:inline-block;width:14px;height:14px;border:1px solid var(--rule);vertical-align:-2px;margin-right:6px;background:var(--c)}
@media (prefers-color-scheme:dark){.legend .sw{background:var(--d)}}
.plate{float:right;width:min(42%,440px);margin:0 0 14px 22px}.plate img{width:100%;display:block;border:1px solid var(--rule)}
.gallery{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:16px;margin:12px 0 20px}
.gallery figure{margin:0}.gallery img{width:100%;aspect-ratio:3/4;object-fit:cover;display:block;border:1px solid var(--rule)}
.gallery figcaption{font-size:13.5px;margin-top:5px;line-height:1.25}.gallery small{display:block;color:var(--ink-3);font-size:12px}
.unknowns{display:grid;grid-template-columns:repeat(auto-fill,minmax(96px,1fr));gap:12px;margin:8px 0 14px;max-width:760px}
figure.unknown{margin:0}figure.unknown .q{display:grid;place-items:center;aspect-ratio:3/4;border:1px dashed var(--rule);background:var(--paper);font-family:var(--f-display);font-size:44px;color:var(--ink-3)}
.unknowns figure.unknown .q{aspect-ratio:4/3;font-size:34px}figure.unknown figcaption{font-size:13px;margin-top:5px;color:var(--ink-3)}
.cards{display:grid;gap:10px;margin:8px 0 18px}
.coins{grid-template-columns:repeat(auto-fill,minmax(150px,1fr))}.months{grid-template-columns:repeat(auto-fill,minmax(136px,1fr))}
.card{border:1px solid var(--rule);background:var(--paper);padding:10px 12px;display:flex;flex-direction:column;gap:2px}
.card .mark{font-family:var(--f-display);font-weight:400;font-size:30px;line-height:1;color:var(--wisp)}
.card .num{font-family:var(--f-mono);font-size:11px;color:var(--ink-3)}
.card .name{font-family:var(--f-display);font-size:18px;line-height:1.1;overflow-wrap:anywhere}
.card .worth{font-size:12.5px;color:var(--ink-3)}
.week{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
.chip{border:1px solid var(--rule);border-radius:999px;padding:2px 10px;font-size:13.5px}.era{font-size:13.5px;color:var(--ink-3);margin-left:8px}
.swatches{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:12px;margin:8px 0 18px}
.swatch .tints{display:flex}.swatch .tints i{flex:1;height:26px;margin:0;border:0;border-radius:0;width:auto}.swatch .tints.dark i{height:12px}
.swatch span{display:block;font-size:13.5px;margin-top:4px}.swatch small{font-family:var(--f-mono);color:var(--ink-3);font-size:11px}
@media (max-width:720px){.sheet-head{grid-template-columns:1fr;padding:18px 16px 12px}.ref{text-align:left}.sheet-body,.cover-body,.toc{padding-left:16px;padding-right:16px}.cover-body{grid-template-columns:1fr}.plate{float:none;width:100%;margin:0 0 12px}table{display:block;overflow-x:auto}}
@media print{.bar{display:none}.sheet{box-shadow:none;break-before:page}body{background:#fff}}
`

import type { Content } from './content'
import { formatMoney } from './items'
import { verbName } from './quests/verbs'
import { SURFACE } from './map/palette'
import { htmlPage, markdownHtml } from './markdown'
import { designLog } from './designlog'
import { WORLD_STEPS } from './worldguide'

// The world book (M10.18; Bram, 28 September 2026): everything a world is,
// written out of its content, so that every world has a book that is never
// behind. The chapters follow the Nethermarch's world book, so both read the
// same (the world, the land, history, powers, faith, towns, the starting
// region, places, people, lore, bestiary, coins and calendar, quests, names
// and speech), and then what the content contract has besides (trades,
// transport, what happens when, the rules, the look of the world, and how
// the world was made). A kind the world does not have gives no chapter. In
// the language of the content: English.

export interface WorldBookInput {
  /** The world's folder, for the line that says how to write the book again. */
  folder?: string
  /** The world's design log (DESIGN.md, M10.18), for the chapter on how the world was made. */
  design?: string
  /** The world's own part of the chronicler's instruction (CHRONICLER.md). */
  chronicler?: string
}

type Section = { title: string; body: string[] }

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const cell = (s: unknown) => String(s ?? '').replace(/\|/g, '/').replace(/\s*\n\s*/g, ' ').trim()
const table = (head: string[], rows: unknown[][]): string[] => (rows.length ? [`| ${head.join(' | ')} |`, `| ${head.map(() => '---').join(' | ')} |`, ...rows.map((r) => `| ${r.map(cell).join(' | ')} |`), ''] : [])
const block = (text: string, kind = 'text'): string[] => ['```' + kind, text.trim(), '```', '']
const list = (items: string[]): string[] => (items.length ? [...items.map((i) => `- ${i}`), ''] : [])
const para = (text: string | undefined): string[] => (text && text.trim() ? [text.trim().replace(/\s*\n\s*/g, ' '), ''] : [])

/** Whom or where a step means, in words: "$a" is A, { home_of: $a } is the home of A. */
function sel(value: unknown, name: (id: string) => string = (id) => id): string {
  if (Array.isArray(value)) return value.map((v) => sel(v, name)).join(', ')
  if (value && typeof value === 'object') {
    const [key, inner] = Object.entries(value as Record<string, unknown>)[0] ?? ['', '']
    return `the ${key.replace(/_of$/, '').replace(/_/g, ' ')} of ${sel(inner, name)}`
  }
  const words: Record<string, string> = { $a: 'A', $b: 'B', $area: 'the area', $place: 'the place', $subject: 'whom it is about', $value: 'the other', $who: 'each of them', $at: 'the place', $mover: 'the one who moves', $stayer: 'the one who stays' }
  return words[String(value)] ?? name(String(value ?? '').replace(/^\$/, ''))
}

/** A step of an aftermath in plain words: "a feast at loc_x", "the area takes a mood of panic for 3 days". */
function stepWords(step: { id: string; do: Record<string, unknown> }, named: (id: string) => string): string {
  const sel1 = (value: unknown) => sel(value, named)
  const v = step.do
  const name = verbName(v as never)
  const first = sel1(v[name])
  if (name === 'tell') return `word goes round: "${(v['tell'] as { title?: string }).title ?? ''}"`
  if (name === 'mood') return `${first} takes a mood of ${v['kind']} for ${v['days']} days`
  if (name === 'feast') return `a ${v['kind'] === 'burial' ? 'burial' : 'feast'} at ${first}`
  if (name === 'thought') return `${first} thinks: "${v['text']}"`
  if (name === 'mark') return `a mark at ${first}: "${v['text']}"`
  if (name === 'prices') return `prices at ${first} times ${v['factor']} for ${v['days']} days`
  if (name === 'news' || name === 'area_news') return `news in ${sel1(v['area'])}: "${v['news']}"`
  if (name === 'regard') return `${first} think ${Number(v['affinity']) >= 0 ? 'better' : 'worse'} of ${sel1(v['to'])}`
  return `${name.replace(/_/g, ' ')}${first ? ` ${first}` : ''}`
}

/** The world book of a world, in Markdown (M10.18). */
export function worldBook(content: Content, input: WorldBookInput = {}): string {
  const w = content.world
  const chapters: Section[] = []
  const add = (title: string, body: string[]) => {
    if (body.some((l) => l.trim())) chapters.push({ title, body })
  }
  const place = (id: string) => content.locations.get(id)?.name ?? content.areas.get(id)?.name ?? id
  const person = (id: string) => content.npcs.get(id)?.name ?? id
  const item = (id: string) => content.items.get(id)?.name ?? id
  const coins = w.money?.units

  // 1. The world: its frame, its names, how the story opens, and what the chronicler keeps to.
  add('The world', [
    ...(w.words ? para(`The land is ${w.words.land}; play begins in ${w.words.region}; the stranger comes from ${w.words.from}.`) : []),
    ...(w.frame ? ['### The frame every model call gets', '', ...block(w.frame)] : []),
    ...(w.intro ? ['### The opening', '', ...block(w.intro)] : []),
    // Its own headings a level down, under this chapter.
    ...(input.chronicler?.trim() ? ['### What the chronicler keeps to', '', input.chronicler.trim().replace(/^#+ .*\n+/, '').replace(/^(#+) /gm, '###$1 '), ''] : []),
  ])

  // 2. The map of the land: the regions as the designer drew them.
  const regions = [...content.regions.values()]
  add('The map of the land', [
    // Where the atlas page draws the region in the world's palette (M10.20); the plain page and a Markdown reader skip it.
    ...(regions.length ? ['<!-- picture:map -->', ''] : []),
    ...regions.flatMap((r) => [`### ${r.name}`, '', ...para(`${r.size[0]} by ${r.size[1]} km, in hexes of ${r.hex * 1000} m; the open land between the places is ${place(r.area)}.`), ...block(r.zones, 'map'), ...table(['Mark', 'Land'], Object.entries(r.legend))]),
    ...((w.map?.levels ?? []).filter((l) => l.id !== SURFACE).length ? para(`Levels: ${(w.map!.levels ?? []).map((l) => l.name).join(', ')}.`) : []),
  ])

  // 3. History: the lore people tell.
  const lore = [...content.topics.values()].filter((t) => t.kind === 'lore').sort((a, b) => a.name.localeCompare(b.name))
  add('History and lore', table(['Topic', 'What people know'], lore.map((t) => [t.name, t.summary])))

  // 4. Powers: the factions, their seats, what they want, and how they stand to each other.
  const factions = [...content.factions.values()]
  add('Powers', [
    ...table(
      ['Faction', 'Seat', 'Wants', 'Stands', 'Joining'],
      factions.map((f) => [cap(f.name), f.seat, f.wants, f.stance ?? '', typeof f.join === 'string' ? f.join : [f.join.patrons ? `sworn to ${f.join.patrons.join(' or ')}` : '', f.join.at ? `at ${f.join.at.map(place).join(' or ')}` : '', f.join.fee && coins ? `for ${formatMoney(f.join.fee, coins)}` : ''].filter(Boolean).join(', ')]),
    ),
    ...(factions.some((f) => f.allies.length || f.rivals.length) ? ['### Relations', '', ...table(['Faction', 'Friends', 'Enemies'], factions.filter((f) => f.allies.length || f.rivals.length).map((f) => [cap(f.name), f.allies.map((a) => content.factions.get(a)?.name ?? a).join(', '), f.rivals.map((a) => content.factions.get(a)?.name ?? a).join(', ')]))] : []),
  ])

  // 5. Faith: the faiths, their patrons and blessings, and their holy places.
  const patrons = content.rules?.patrons ?? []
  const holy = [...content.locations.values()].filter((l) => l.tags.includes('holy'))
  add('Faith', [
    ...table(['Faith', 'Patrons', 'Faction'], w.faiths.map((f) => [f.name, f.patrons.map((p) => patrons.find((x) => x.id === p)?.name ?? p).join(', '), f.faction ? (content.factions.get(f.faction)?.name ?? f.faction) : ''])),
    ...(patrons.length ? ['### Patrons and blessings', '', ...table(['Patron', 'What they are', 'Blessings'], patrons.map((p) => [p.name, p.text, p.blessings.map((b) => b.name).join(', ')]))] : []),
    ...(holy.length ? ['### Holy places', '', ...list(holy.map((l) => `${l.name}${l.faith ? ` (${w.faiths.find((f) => f.id === l.faith)?.name ?? l.faith})` : ''}`))] : []),
  ])

  // 6. Towns and what they live on.
  const settlements = [...content.settlements.values()]
  add('Towns and villages', table(['Settlement', 'Kind', 'People', 'The ground', 'Workshops'], settlements.map((s) => [content.areas.get(s.id)?.name ?? s.id, content.areas.get(s.id)?.kind ?? '', s.people, s.resources.join(', '), s.workshops.map((x) => x.id).join(', ')])))

  // 7. The starting region: its areas, the routes between them, the seasons and the weather.
  const areas = [...content.areas.values()].sort((a, b) => a.name.localeCompare(b.name))
  add('The starting region', [
    ...table(['Area', 'Kind', 'What it is', 'Sound'], areas.map((a) => [a.name, a.kind, a.summary, a.sound ? (typeof a.sound === 'string' ? a.sound : a.sound.kind) : ''])),
    ...(content.routes.size ? ['### Routes', '', ...table(['From', 'To', 'Carries'], [...content.routes.values()].map((r) => [place(r.from), place(r.to), Object.keys(r.carries ?? {}).map(item).join(', ')]))] : []),
    ...(w.weather ? ['### Seasons and weather', '', ...table(['Season', 'Chances'], Object.entries(w.weather.chances).map(([season, odds]) => [season, Object.entries(odds).map(([k, v]) => `${k} ${Math.round(Number(v) * 100)}%`).join(', ')]))] : []),
  ])

  // 8. Places, area by area: what you see, the ways out, what stands there.
  const places: string[] = []
  for (const a of areas) {
    const here = [...content.locations.values()].filter((l) => l.area === a.id).sort((x, y) => x.name.localeCompare(y.name))
    if (!here.length) continue
    // Where its picture goes in the HTML (M10.18); a Markdown reader skips the comment.
    places.push(`### ${a.name}`, '', `<!-- picture:area_${a.id} -->`, '')
    for (const l of here) {
      places.push(`**${l.name}**${l.tags.length ? ` (${l.tags.join(', ')})` : ''}`, '', l.description.day.trim().replace(/\s*\n\s*/g, ' '), '')
      const exits = Object.entries(l.exits).map(([dir, e]) => `${dir} to ${place(e.to)}`)
      const things = l.objects.map((o) => o.name ?? content.objectTypes.get(o.type)?.name ?? o.type)
      if (exits.length || things.length) places.push([exits.length ? `Ways: ${exits.join('; ')}.` : '', things.length ? `Here: ${things.join(', ')}.` : ''].filter(Boolean).join(' '), '')
    }
  }
  add('Places', places)

  // 9. The people: who they are, what they want, how they are, and who they are to each other.
  const npcs = [...content.npcs.values()].sort((a, b) => a.name.localeCompare(b.name))
  add('People', [
    ...table(['Name', 'Who', 'Age', 'Trade', 'Home'], npcs.map((n) => [n.name, n.short, n.age, content.professions.get(n.profession)?.name ?? n.profession, place(n.home)])),
    ...(npcs.length ? ['<!-- picture:portraits -->', ''] : []),
    ...(npcs.length ? ['### What they want', '', ...table(['Name', 'Values', 'Quirks'], npcs.map((n) => [n.name, Object.entries(n.values).map(([k, v]) => `${k} ${v}`).join(', '), n.quirks.join(', ')]))] : []),
    ...(npcs.some((n) => n.relations.length) ? ['### Ties', '', ...list(npcs.filter((n) => n.relations.length).map((n) => `${n.name}: ${n.relations.map((r) => `${r.role ?? ''} ${r.to ? person(r.to) : (r.name ?? '')}`.trim()).join(', ')}`))] : []),
    ...(npcs.some((n) => n.romance) ? ['### Romance', '', ...list(npcs.filter((n) => n.romance).map((n) => `${n.name}: open to ${n.romance!.open_to}${n.romance!.note ? `. ${n.romance!.note}` : ''}`))] : []),
  ])

  // 10. Secrets and stories.
  const stories = [...content.topics.values()].filter((t) => t.story)
  const secrets = npcs.flatMap((n) => n.secrets.map((s) => [n.name, s.text]))
  add('Secrets and stories', [
    ...stories.flatMap((t) => [`### ${t.name}`, '', ...block(t.story!)]),
    ...(secrets.length ? ['### Secrets', '', ...table(['Whose', 'Secret'], secrets)] : []),
  ])

  // 11. Bestiary.
  const creatures = [...content.creatures.values()]
  add('Bestiary', [
    ...table(['Creature', 'Kind', 'Level', 'Faction'], creatures.map((c) => [c.name, c.kind, c.level, c.faction ? (content.factions.get(c.faction)?.name ?? c.faction) : ''])),
    ...(content.encounters.size ? ['### Encounters', '', ...table(['Encounter', 'Where', 'Who'], [...content.encounters.values()].map((e) => [e.name, e.places.map(place).join(', '), e.foes.map((f) => `${f.count} ${content.creatures.get(f.creature)?.name ?? f.creature}`).join(', ')]))] : []),
  ])

  // 12. Coins, prices, measures and the calendar.
  const cal = w.calendar
  add('Coins, measures and calendar', [
    // The atlas page shows the coins and the calendar as cards in place of the table and the line after the marker (M10.20).
    ...(coins ? ['### Coins', '', '<!-- picture:coins -->', '', ...table(['Coin', 'Short', 'Worth'], coins.map((u) => [u.name, u.short, u.value]))] : []),
    ...(content.items.size && coins ? ['### Prices', '', ...table(['Thing', 'Worth'], [...content.items.values()].filter((i) => i.value > 0).sort((a, b) => a.name.localeCompare(b.name)).map((i) => [i.name, formatMoney(i.value, coins)]))] : []),
    ...(content.voice?.measures.length ? ['### Measures', '', ...para(content.voice.measures.join(', ') + '.')] : []),
    ...(cal ? ['### Calendar', '', '<!-- picture:calendar -->', '', ...para(`Months: ${cal.months.join(', ')}. The week: ${cal.weekdays.join(', ')}${cal.era ? `. Years are counted ${cal.era}` : ''}.`)] : []),
    ...(w.bells.length ? ['### Bells', '', ...list(w.bells.map((b) => `${cap(b.name)} at ${place(b.at)}, at ${b.hours.join(', ')} o'clock`))] : []),
    ...(w.law
      ? [
          '### The law',
          '',
          ...para(`The law ${w.law.where} is kept by the ${w.law.officer}${w.law.npc ? ` (${person(w.law.npc)})` : ''}.`),
          // A death or a beating no fine buys off (M10.20): held and heard.
          ...para(
            (() => {
              const heard = [w.law.fines?.murder === 'hearing' ? 'a death' : '', w.law.fines?.assault === 'hearing' ? 'a beating' : ''].filter(Boolean)
              return heard.length ? `No fine buys off ${heard.join(' or ')}: the stranger is held ${w.law.hearing?.hours ?? 24} hours and heard.${w.law.hearing?.heard ? ` ${w.law.hearing.heard}` : ''}` : undefined
            })(),
          ),
        ]
      : []),
  ])

  // 13. Quests.
  const quests = [...content.quests.values()]
  add('Quests', table(['Quest', 'What it is about', 'Given by', 'Ways it ends'], quests.map((q) => [q.name, q.summary ?? '', (q.givers ?? []).map(person).join(', '), (q.outcomes ?? []).map((o) => o.name).join('; ')])))

  // 14. Names and speech: the voice kit.
  const v = content.voice
  add('Names and speech', [
    ...(v ? [...(v.sayings.length ? ['### Sayings', '', ...list(v.sayings)] : []), ...(Object.values(v.address).some((a) => a.length) ? ['### How people address a stranger', '', ...list(Object.entries(v.address).filter(([, a]) => a.length).map(([k, a]) => `${k}: ${a.join(', ')}`))] : []), ...(v.not_here.length ? ['### Words that are not of this world', '', ...para(v.not_here.map((n) => n.word).join(', ') + '.')] : [])] : []),
  ])

  // From the contract, besides the Nethermarch's chapters: trades, transport, what happens when, the rules, the look.
  add('Trades and crafts', [
    ...table(['Trade', 'Works'], [...content.professions.values()].map((p) => [p.name, p.schedule.filter((s) => s.activity === 'work').map((s) => `${s.from}-${s.to}`).join(', ')])),
    ...(content.crafts.size ? ['### Crafts', '', ...table(['Craft', 'Maker', 'Techniques', 'A failure leaves'], [...content.crafts.values()].map((c) => [c.name, c.maker, c.techniques.map((t) => t.name).join(', '), c.failure ? `${c.failure.outcome}${c.failure.item ? ` (${item(c.failure.item)})` : ''}` : 'nothing']))] : []),
  ])
  add('Transport', table(['Line', 'Kind', 'Stops', 'Days', 'Fare'], [...content.passages.values()].map((p) => [p.name, p.kind, p.stops.map(place).join(', '), p.days.join(', ') || 'every day', coins ? formatMoney(p.fare, coins) : p.fare])))
  const whens = [...content.aftermath.values()].map((a) => {
    const watcher = [...content.watchers.values()].find((x) => x.signal === a.signal)
    const event = a.event ? (content.locations.get(a.event)?.name ?? content.areas.get(a.event)?.name ?? content.objectTypes.get(a.event)?.name ?? a.event.replace(/_/g, ' ')) : undefined
    const why = event ? `${a.signal.replace(/_/g, ' ')} (${event})` : a.signal.replace(/_/g, ' ')
    const named = (id: string) => content.locations.get(id)?.name ?? content.areas.get(id)?.name ?? content.npcs.get(id)?.name ?? content.objectTypes.get(id)?.name ?? id
    return `When ${why}${watcher ? '' : ' (a signal of the game itself)'}: ${a.steps.map((s) => stepWords(s as never, named)).join('; ')}.`
  })
  add('What happens when', list(whens))
  const rules = content.rules
  add('The rules in short', rules ? [
    ...para(`Ancestries: ${rules.ancestries.map((a) => a.name).join(', ')}. Classes: ${rules.classes.map((c) => c.name).join(', ')}. Backgrounds: ${rules.backgrounds.map((b) => b.id.replace(/_/g, ' ')).join(', ')}.`),
    ...para(`Conditions: ${rules.conditions.map((c) => c.name).join(', ')}.`),
    ...(rules.death ? para(`Death: ${rules.death.wake}${rules.death.price ? ` After the third time, a price: ${rules.death.price.where}` : ''}`) : []),
  ] : [])
  const improvised = [...content.locations.values()].filter((l) => l.improvise).map((l) => `${l.name} (${l.improvise!.domain})`).concat([...content.objectTypes.values()].filter((t) => t.improvise).map((t) => `the ${t.name} (${t.improvise!.domain})`))
  add('The look and sound of the world', [
    ...(w.pictures?.style ? para(`Pictures: ${w.pictures.style}`) : []),
    ...(w.map?.palette ? ['<!-- picture:palette -->', '', ...para(`The map calls its land ${Object.entries(w.map.palette.names).map(([k, n]) => `${n} (${k})`).join(', ')}.`)] : []),
    ...(improvised.length ? para(`Where an act the rules do not know may be improvised: ${improvised.join(', ')}.`) : []),
  ])
  // The design log (M10.18): which steps of the guide were taken and which left to the neutral default (M10.20),
  // then its notes and decisions; the answers still being written stay out.
  add('How this world was made', input.design?.trim() ? designChapter(input.design) : [])

  const lines = [`# ${w.name}: the world book`, '', `Written out of the content of ${w.name} (npm run worldbook ${input.folder ?? w.id}); the editor writes it again on every save. Do not edit it by hand.`, '']
  chapters.forEach((c, i) => lines.push(`## ${i + 1}. ${c.title}`, '', ...c.body))
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n'
}

/**
 * How the world was made, out of its design log (M10.18; laid out in M10.20
 * after the first real build, The Quiet Reach): the steps taken, the
 * designer's notes, and per decision what the designer wrote, as a quotation
 * with its own tables, what the chronicler said and asked back, and what it
 * changed. A log in no known shape is given as it is.
 */
function designChapter(designText: string): string[] {
  const log = designLog(designText)
  if (!log.notes.length && !log.decisions.length) {
    const raw = designText.trim().replace(/^#\s.*\n+/, '').replace(/^## Answers\n[\s\S]*?(?=^## |(?![\s\S]))/m, '').replace(/^(#+) /gm, '##$1 ').trim()
    return raw ? [raw, ''] : []
  }
  const out = [...stepsTaken(designText)]
  if (log.notes.length) out.push('### Notes', '', ...log.notes.map((n) => `- ${n}`), '')
  if (log.decisions.length) out.push('### Decisions', '')
  for (const d of log.decisions) {
    out.push(`#### ${d.step}: ${d.decision}, ${d.at}`, '')
    if (d.asked.trim()) out.push('What the designer wrote:', '', ...quote(d.asked), '')
    if (d.say.trim()) out.push('What the chronicler said:', '', ...quote(d.say), '')
    if (d.questions.length) out.push('What it asked back:', '', ...d.questions.map((q) => `- ${q.replace(/\s*\n\s*/g, ' ')}`), '')
    if (d.changed.length) out.push(`Changed: ${d.changed.join('; ')}.`, '')
    if (d.reason.trim()) out.push(`Why: ${d.reason.trim()}`, '')
  }
  return out
}

/**
 * Someone's text as a Markdown quotation: a line to a paragraph, rows of a
 * table kept together, and nothing in it that could open a chapter or a
 * code block of the book.
 */
function quote(text: string): string[] {
  const out: string[] = []
  let table = false
  for (const raw of text.replace(/\r/g, '').split('\n')) {
    const line = raw.trim()
    if (!line) continue
    const row = line.startsWith('|')
    if (out.length && !(row && table)) out.push('>')
    out.push(`> ${row ? line : line.replace(/^#+\s*(.+)$/, '**$1**').replace(/^```/, "'''")}`)
    table = row
  }
  return out
}

/**
 * The steps of the guide in a world's design log (M10.20): a step the
 * designer skipped, or never took up, is simply empty, and the world has the
 * neutral default the guide names for it. The last decision on a step counts;
 * asking again with a new answer ("changed") decides nothing.
 */
function stepsTaken(designText: string): string[] {
  const log = designLog(designText)
  // A world not built by the steps (only notes, or the writing aid) has nothing to say here.
  if (!log.decisions.some((d) => WORLD_STEPS.some((s) => s.title === d.step))) return []
  const left = WORLD_STEPS.flatMap((step) => {
    const last = [...log.decisions].reverse().find((d) => d.step === step.title && d.decision !== 'changed')
    return last?.decision === 'accepted' ? [] : [`- **${step.title}** (${last?.decision === 'skipped' ? 'skipped' : last?.decision === 'rejected' ? 'proposal turned down' : 'not taken up'}): ${step.skipped}`]
  })
  return ['### The steps of the guide', '', ...(left.length ? ['Every step not listed here was taken. These were left empty, and the world has the neutral default:', '', ...left] : ['Every step of the guide was taken.']), '']
}

/** Markers only the atlas page draws (M10.20). */
export const ATLAS_ONLY = ['map', 'coins', 'calendar', 'palette']

/**
 * The world book as a page of HTML (M10.18), with the pictures there are: an
 * area's at its places, the portraits after the people. pictures gives a
 * picture by the id pictures go by (area_<id>, an NPC's id), or nothing.
 */
export function worldBookHtml(content: Content, markdown: string, pictures: (id: string) => string | undefined = () => undefined): string {
  const body = markdownHtml(markdown, (key) => {
    // The map, the cards and the swatches are the atlas page's (M10.20): the plain page has the text.
    if (ATLAS_ONLY.includes(key)) return undefined
    if (key !== 'portraits') {
      const src = pictures(key)
      return src ? `<figure><img src="${src}" alt=""></figure>` : undefined
    }
    const shown = [...content.npcs.values()].map((n) => ({ name: n.name, src: pictures(n.id) })).filter((p) => p.src)
    return shown.length ? `<figure class="portraits">${shown.map((p) => `<div><img src="${p.src}" alt=""><br>${p.name}</div>`).join('')}</figure>` : undefined
  })
  return htmlPage(`${content.world.name}: the world book`, body)
}

import type { Content, Quest } from '../content'
import { behindCodes } from '../exits'

// Every quest played as a new player (M10.33 AE; Bram, 30 September 2026:
// "Compare the cargo manifests at the Arrival Lock: there is no manifest
// there. Is every quest really tested?"). The check of whether a quest can be
// done looked at places, flags and endings, not at whether the thing a deed
// names is there, or whether the Now line is what the player types. These two
// checks do, for written quests and for what a model writes.

type Refs = Pick<Content, 'quests' | 'locations' | 'npcs' | 'objectTypes' | 'items'> & { world?: Pick<Content['world'], 'start'> }

const PREPOSITIONS = new Set(['to', 'at', 'in', 'on', 'with', 'about', 'for', 'from', 'of', 'into', 'onto', 'by', 'over', 'through', 'under', 'behind', 'past', 'across', 'along', 'round', 'around'])
/** Words that are never a thing to find at a place: "put the matter right", "let it slide". */
const NO_THING = new Set(['place', 'room', 'area', 'right', 'wrong', 'slide', 'straight', 'away', 'matter', 'matters', 'truth', 'word', 'words', 'news', 'story', 'way', 'work', 'business', 'problem', 'question', 'thing', 'things', 'everything', 'anything', 'something', 'nothing', 'deal', 'peace', 'case', 'help', 'time'])
// Words around a thing that are no part of it: "search the place AGAIN" (M10.33 AA found it).
const SMALL = new Set(['again', 'too', 'first', 'now', 'then', 'together', 'once', 'more', 'properly', 'carefully', 'quietly', 'the', 'a', 'an', 'to', 'at', 'in', 'on', 'with', 'about', 'for', 'from', 'of', 'into', 'onto', 'by', 'and', 'or', 'her', 'his', 'their', 'its', 'my', 'your', 'them', 'him', 'it', 'up', 'out', 'down', 'over', 'through', 'back'])

/** A word without its plural, to compare "manifests" with "manifest". */
const stem = (word: string) => word.toLowerCase().replace(/(?:es|s)$/, '')

/** The words people and places answer to, which a deed may name without naming a thing. */
function nameWords(c: Refs): Set<string> {
  const words = new Set<string>()
  for (const n of c.npcs.values()) for (const w of [n.name, n.short, ...(n.aliases ?? [])].join(' ').toLowerCase().split(/[^a-z']+/)) if (w) words.add(stem(w))
  for (const l of c.locations.values()) for (const w of [l.name, ...l.aliases].join(' ').toLowerCase().split(/[^a-z']+/)) if (w) words.add(stem(w))
  return words
}

/** Every word a thing at a place answers to: its details, objects, what lies there and who is there. */
function thingWords(c: Refs, place: string): Set<string> {
  const l = c.locations.get(place)
  if (!l) return new Set()
  const people = [...c.npcs.values()].filter((n) => n.home === place || n.work === place).flatMap((n) => [n.name, n.short])
  const objects = l.objects.flatMap((o) => {
    const type = c.objectTypes.get(o.type)
    return [o.name ?? '', type?.name ?? '', ...(type?.aliases ?? []), ...(type?.details.flatMap((d) => d.words) ?? [])]
  })
  const items = Object.keys(l.items).flatMap((id) => [c.items.get(id)?.name ?? id, ...(c.items.get(id)?.aliases ?? [])])
  const all = [...l.details.flatMap((d) => d.words), ...objects, ...items, ...people, ...l.hidden.flatMap((h) => h.words ?? [])]
  return new Set(all.join(' ').toLowerCase().split(/[^a-z']+/).filter(Boolean).map(stem))
}

/** The actions that move a stage on: those that set a flag its way on waits for. */
function movers(q: Quest, stage: NonNullable<Quest['stages']>[number]) {
  const flags = stage.next.flatMap((n) => n.when.flatMap((c) => ('flag' in c ? [c.flag] : [])))
  return (q.actions ?? []).filter((a) => a.effects.some((e) => 'set' in e && flags.includes((e as { set: string }).set)))
}

/**
 * A deed behind a door with a code (M10.34 B: the crates carried back to the
 * hangar, whose code Tessa gave only for the other story): the code is given
 * by right at a stage of this story, or told in it.
 */
export function codeProblems(c: Refs, q: Quest): string[] {
  const out: string[] = []
  const own = new Set((q.actions ?? []).flatMap((a) => a.effects.flatMap((e) => ('set' in e ? [String((e as { set: string }).set)] : []))))
  const plain = (t: string) => t.toLowerCase().replace(/\s+/g, '')
  const toldHere = plain(JSON.stringify([q.ask ?? '', (q.stages ?? []).map((s) => [s.text, s.asks ?? '']), (q.actions ?? []).map((a) => a.text)]))
  for (const a of q.actions ?? []) {
    for (const p of a.at.filter((id) => c.locations.has(id))) {
      for (const word of behindCodes(c, p)) {
        if (toldHere.includes(plain(word))) continue
        const holders = [...c.npcs.values()].flatMap((n) => n.secrets.filter((s) => plain(s.text).includes(plain(word))).map((s) => ({ n, s })))
        const ours = holders.some(({ s }) => {
          const when = JSON.stringify(s.given_when)
          return when.includes(`"${q.id}`) || [...own].some((f) => when.includes(`"${f}"`))
        })
        if (holders.length && !ours) out.push(`quest ${q.id}, deed ${a.id}: it is done at ${c.locations.get(p)!.name}, behind a code (${word}), and ${holders.map(({ n }) => n.name).join(' or ')} gives the code by right only in another story: add a stage of this one to the secret's given_when`)
      }
    }
  }
  return out
}

/**
 * Deeds whose words name a thing that is not at their place (a detail, an
 * object, a thing lying there or a person), and Now lines that are not what
 * the player types for the deed that moves their stage.
 */
export function playableWarnings(c: Refs): string[] {
  const out: string[] = []
  const names = nameWords(c)
  for (const q of c.quests.values()) {
    // What an earlier deed of the story handled where it lay (the recordings copied at the station) goes along with the
    // stranger: a later deed may be done to it elsewhere.
    const handled = new Set<string>()
    for (const a of q.actions ?? []) {
      // A deed with someone is a word with them; a deed on the world names a thing of its place.
      if (a.with || !a.intent || !a.at.length) continue
      // The thing a deed is done to: the head of the first group of words after the verb, "compare the cargo
      // MANIFESTS at the lock"; a word of what the deed gives, or of a person or place, is no thing to find there.
      const [, ...rest] = a.intent.toLowerCase().split(/[^a-z']+/).filter(Boolean)
      const from = rest.findIndex((w) => !SMALL.has(w))
      const group: string[] = []
      for (const w of rest.slice(Math.max(0, from))) {
        if (PREPOSITIONS.has(w) && group.length) break
        if (!SMALL.has(w)) group.push(w)
      }
      while (group.length && NO_THING.has(group.at(-1)!)) group.pop()
      const head = group.at(-1)
      const given = new Set(a.effects.flatMap((e) => ('give' in e ? [String((e as { give: string }).give)] : [])).flatMap((id) => [id, c.items.get(id)?.name ?? '', ...(c.items.get(id)?.aliases ?? [])]).join(' ').toLowerCase().split(/[^a-z']+/).filter(Boolean).map(stem))
      if (!head || names.has(stem(head)) || given.has(stem(head))) continue
      const there = a.at.flatMap((p) => [...thingWords(c, p)])
      if (there.includes(stem(head))) group.forEach((w) => handled.add(stem(w)))
      else if (!handled.has(stem(head))) out.push(`quest ${q.id}, deed ${a.id}: "${a.intent}" is done to ${group.join(' ')}, and there is no ${head} at ${a.at.map((p) => c.locations.get(p)?.name ?? p).join(' or ')} (no detail, object, thing or person by that word)`)
    }
    out.push(...codeProblems(c, q))
    for (const s of q.stages ?? []) {
      const moving = movers(q, s).filter((a) => a.say.length)
      if (!moving.length) continue
      if (!s.goal?.trim()) {
        out.push(`quest ${q.id}, stage ${s.id}: no Now line (goal), so a new player does not know to type "${moving[0]!.intent ?? moving[0]!.say[0]}"`)
        continue
      }
      const typed = s.goal.toLowerCase().trim().replace(/[.!]+$/, '')
      // As the game reads it (questAction): the place of the deed after it is the place where you stand.
      const fits = moving.some((a) => {
        const places = a.at.flatMap((id) => {
          const l = c.locations.get(id)
          return l ? [l.name, ...l.aliases].map((n) => n.toLowerCase().replace(/^the\s+/, '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) : []
        })
        const bare = places.length ? typed.replace(new RegExp(`\\s+(?:at|in|on|aboard|inside|by|up at|down at)\\s+(?:the\\s+)?(?:${places.join('|')})$`), '') : typed
        return a.say.some((p) => {
          try {
            return new RegExp(`^(?:${p})$`, 'i').test(bare)
          } catch {
            return false
          }
        })
      })
      if (!fits) out.push(`quest ${q.id}, stage ${s.id}: the Now line "${s.goal}" is not what the player types for its deed ("${moving[0]!.intent ?? moving[0]!.say[0]}"): write it as the command, with the place after it if you like`)
      // The place a Now line names is where its deed is done.
      const named = [...c.locations.values()].find((l) => [l.name, ...l.aliases].some((n) => new RegExp(`\\s(?:at|in|on|aboard|inside|by)\\s+(?:the\\s+)?${n.toLowerCase().replace(/^the\s+/, '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`).test(typed)))
      if (named && !moving.some((a) => a.at.includes(named.id))) out.push(`quest ${q.id}, stage ${s.id}: the Now line sends the stranger to ${named.name}, but its deed is done at ${moving[0]!.at.map((p) => c.locations.get(p)?.name ?? p).join(' or ')}`)
    }
  }
  return out
}

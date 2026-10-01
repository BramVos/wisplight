import { stringify } from 'yaml'
import { callName, loadContent, lockedIds, QuestSchema, type Content, type ContentFile, type Location, type Npc } from './content'
import { cachedSystem, type LlmRequest } from './dialogue/llm'
import { worldFrame } from './dialogue/prompt'
import { voiceSummary } from './dialogue/voice'
import { recheckDraft, type Draft, type DraftChange } from './editor'
import { worldPrefix } from './edit'
import { storyReply, storySchema } from './growth/regionstory'
import { DEED_RULE, endingProblems, placeThings, questFromSketch, readSketch, SKETCH_KINDS, type QuestSketch } from './quests/sketch'
import { codeProblems } from './quests/playable'
import { solvableProblems } from './quests/solvable'
import { hasPlayed, type PlayedGame } from './played'
import { worldText } from './safety'
import { worldFixedPart } from './worldfixed'
import { behindCodes, codeNote, SECRET_PLACES_RULE, secretNote } from './exits'

// The step Stories of the world build (M10.30; the form set out with Bram on
// 29 September 2026, after the Nethermarch: a main line from the stranger's
// task, two or three small lines per settlement, and a personal line for the
// people who matter most). The Quiet Reach had no quest at all, so every voice
// made the plot up as it talked and nothing could be solved. The chronicler
// takes the stories from the world itself: the frame, the task, what people
// want, hide and are bound by, the places. Of the designer the step asks only
// the hidden truth, what they do not want, and whether they write a line
// themselves; the truth goes into CHRONICLER.md. The story round of a region
// (region_story, M10.25) is the motor, a call for each settlement, one for the
// land between and one for the main line, so no new kind of call comes in:
// each writes quest sketches (quests/sketch.ts) and the engine builds them.
// How much follows the region dial of M10.25: outline one small line a place,
// story the main line besides, full the personal lines too.

/** How full the stories are: the three settings of the region dial (M10.25). */
export type StoryFullness = 'outline' | 'story' | 'full'

/** One call of the step: a settlement, the land between the settlements, or the main line over the whole world. */
export interface StoryScope {
  id: string
  name: string
  kind: 'place' | 'land' | 'main'
  areas: string[]
}

/** Kinds of area that are a settlement: a scope of their own. */
const SETTLED = new Set(['village', 'town', 'city', 'hamlet', 'inn'])

/** The calls of the step for a world, at this fullness: a settlement each, the land between, and the main line. */
export function storyScopes(content: Content, fullness: StoryFullness): StoryScope[] {
  const areas = [...content.areas.values()].filter((a) => [...content.locations.values()].some((l) => l.area === a.id))
  const lived = (id: string) => [...content.npcs.values()].some((n) => !n.absent && content.locations.get(n.home)?.area === id)
  const scopes: StoryScope[] = areas.filter((a) => SETTLED.has(a.kind) && lived(a.id)).map((a) => ({ id: a.id, name: a.name, kind: 'place' as const, areas: [a.id] }))
  const between = areas.filter((a) => !SETTLED.has(a.kind)).map((a) => a.id)
  if (between.length && between.some(lived)) scopes.push({ id: 'between', name: `the land between the settlements of ${content.world.name}`, kind: 'land', areas: between })
  if (fullness !== 'outline') scopes.push({ id: 'main', name: content.world.name, kind: 'main', areas: areas.map((a) => a.id) })
  return scopes
}

/** The people and places a scope shows, in the order the prompt keys them; the main line sees the best known. */
function scopeCast(content: Content, scope: StoryScope): { people: Npc[]; places: Location[] } {
  const inScope = (l: string) => scope.areas.includes(content.locations.get(l)?.area ?? '')
  const people = [...content.npcs.values()].filter((n) => !n.absent && inScope(n.home))
  const places = [...content.locations.values()].filter((l) => scope.areas.includes(l.area))
  if (scope.kind !== 'main') return { people, places }
  const byFame = [...people].sort((a, b) => b.fame - a.fame || a.id.localeCompare(b.id)).slice(0, 30)
  return { people: byFame, places: places.slice(0, 40) }
}

/** The keys of a scope's people and places: p1, p2 ... and l1, l2 ..., both ways. */
function keysOf(cast: { people: Npc[]; places: Location[] }): { person: Map<string, string>; place: Map<string, string>; id: Map<string, string> } {
  const person = new Map(cast.people.map((n, i) => [n.id, `p${i + 1}`]))
  const place = new Map(cast.places.map((l, i) => [l.id, `l${i + 1}`]))
  const id = new Map<string, string>([...[...person].map(([a, b]) => [b, a] as [string, string]), ...[...place].map(([a, b]) => [b, a] as [string, string])])
  return { person, place, id }
}

/** The rules of the step: the same for every call, so they are cached with the fixed part of the world build. */
export const STORY_STEP_RULES = [
  'THE STEP STORIES OF THE WORLD BUILD. You write the storylines of this world, as quests that lie ready until the stranger meets them: by talking to someone, by coming somewhere, or from the start. Take them from the world itself: the frame, the stranger\'s task, what the people want, hide and are bound by, the places and their things. The designer has given only the hidden truth, what they do not want, and perhaps a line of their own: keep to it, and never let a line say the hidden truth before its stage.',
  `A LINE (put every line in QUESTS, leave QUEST null): a name, a kind (${SKETCH_KINDS.join(', ')}), a summary (one sentence), the giver (by key: the one who asks, or whose matter it is), what they say when asking (one or two sentences in their voice), the stages, and an outcome (a name, and one or two sentences of what came of it). Each stage has its journal line (text), what the stranger can do now (goal: the command the player types for its deed, its say, with the place after it if you like: "Ask Tessa about the coupling", "Copy the recordings in the Listening Room"), what the giver wants of the stranger then (asks: one or two sentences in the giver's voice, without quotation marks; they open a talk with it), the one deed that completes it (say: the command the player types, three to six plain words, a verb first; at: the key of a place; with: the key of a person who must be there, or empty; skill: one of SKILLS where the deed asks for it, or empty; done: one or two sentences of what the deed brings), and knows: for each person of the line, one sentence with their name of what they know at this stage and may say ("Tessa knows the coupling was never synced; she does not know who took the pages"). What a person does not know, they do not say.`,
  'A DEED MAY BE A WORD (word): a code or a password the stranger says to the person (with) in a talk, or says or types at the place (at), in place of a command (say stays empty). Give the word first where the stranger can learn it without a roll: a deed\'s done, or what someone knows at the stage that needs it (they give it then). A lock that takes a code (see PLACES) opens with its own code. An ending may go by a word too (way word).',
  // Secret and shut places (M10.32): marked in PLACES.
  SECRET_PLACES_RULE,
  DEED_RULE,
  'ENDINGS (every line): at least three ways it may end, each a deed (say, at, with, skill as a stage has) with a name and what came of it (text, told as people tell it afterwards: the stranger as "the stranger", never "you"): at least two solutions by different ways (way: talk, give for giving or paying, deed for doing something with the world, word for a code or a password), three for the main line; and at least one where it goes wrong (solution false, way fail) or the lapse. A line of one stage (a small request) needs only two: a solution, and one where it goes wrong or runs out; a second solution only by another way. Two solutions are two only by different ways, never two versions of one talk. The endings are the deeds of the last stage: only the last stage may leave its own say, at and done empty; every stage before it has its deed.',
  'SIZES: small (one person and one place, one or two stages), middle (two or three people, two places or a thing, two stages), large (the main line: three to five stages, across the settlements, with more people). Choose the size by what the matter is.',
  'THE MAIN LINE (kind main, begins start): from the stranger\'s task, three to five stages across the world; its truths: what the story keeps hidden, each with the words a reply would give it away by (plain phrases, three letters or more: "cut the recordings") and the stage from which it may be said (a number; leave the last stage for the whole truth); and lapses: what the world does if the stranger does nothing (after how many game days, and the line that says what came of it: the recordings are wiped, the supply ship leaves without them).',
  'HOW A LINE BEGINS: talk (when its giver is spoken to, the default), place (when the stranger comes to the place of its first deed: a discovery), or start (the main line).',
  'SMALL LINES: different kinds in one place (a request, a mystery, a bargain, a discovery, something social, a trial, a conflict), each the matter of one of the people there. A PERSONAL LINE is a line of kind personal about one of the people who matter most there: what they want or fear, from their secret or their bonds.',
  'No death of someone the designer named, no war where they said none, no fight, no money out of nothing; believable, and it can be done with what is there. WATCHERS: none. LORE: null. SECRETS: none. WHY: one sentence of what the lines grow from.',
  'Use only keys given. JSON only.',
].join('\n')

/** A lock at a place that takes a word (M10.31 C): its code, for a deed that types it. */
function codeHere(place: Location): string {
  const words = [...Object.values(place.exits).map((e) => e.lock?.word), ...place.objects.map((o) => o.lock?.word)].filter((w): w is string => Boolean(w))
  return words.length ? ` (a lock here takes the code ${words.join(', ')})` : ''
}

/** What a scope asks for, at a fullness: one small line, two or three, the main line, and the personal lines. */
function asked(scope: StoryScope, fullness: StoryFullness): string {
  if (scope.kind === 'main') return 'WRITE: the main line only (kind main, begins start), three to five stages, from the stranger\'s task and the hidden truth; with truths.'
  const small = fullness === 'outline' ? 'one small line' : 'two or three small lines of different kinds'
  const personal = fullness === 'full' ? ', and one personal line for each of the one or two people here who matter most' : ''
  return `WRITE: ${small}${personal}; no main line.`
}

/** The call of the step for one scope: the world build's fixed part first (cached), the rules, then the scope. */
export function storiesRequest(files: ContentFile[], scope: StoryScope, fullness: StoryFullness, said: string, played?: PlayedGame): LlmRequest {
  const content = loadContent(files)
  const instruction = files.filter((f) => /(^|\/)CHRONICLER\.md$/.test(f.path)).map((f) => f.text).join('\n\n')
  const cast = scopeCast(content, scope)
  const key = keysOf(cast)
  const name = (id: string) => (content.npcs.has(id) ? callName(content.npcs.get(id)!) : (content.topics.get(id)?.name ?? id))
  const reasons = (content.rules?.backgrounds ?? []).map((b) => b.reason).filter((r): r is string => Boolean(r)).slice(0, 2)
  const skills = (content.rules?.skills ?? []).map((s) => s.id)
  const person = (n: Npc) => {
    const bonds = n.relations.filter((r) => r.to && key.person.has(r.to)).map((r) => `${r.role} of ${key.person.get(r.to!)}`)
    return [
      `  ${key.person.get(n.id)} ${n.name}, ${content.professions.get(n.profession)?.name ?? n.profession}, at ${key.place.get(n.home) ?? name(n.home)}.`,
      n.public_facts[0] ?? '',
      n.secrets[0] ? `Hides: ${n.secrets[0].text}` : '',
      bonds.length ? `Bound: ${bonds.join(', ')}.` : '',
    ]
      .filter(Boolean)
      .join(' ')
  }
  // What every call of the step shares after the world build's fixed part: the rules, the world, the task and the
  // designer's words, marked so the second call of the step reads it from the cache.
  const step = [
    STORY_STEP_RULES,
    '',
    worldText([worldFrame(content), voiceSummary(content)].filter(Boolean).join('\n\n')),
    '',
    `THE STRANGER'S TASK: ${[content.world.intro ?? '', ...reasons].filter(Boolean).join(' ') || 'none given'}`,
    `THE DESIGNER SAYS (the hidden truth, what they do not want, a line of their own): ${said.trim() || 'nothing: you choose'}`,
    `STORIES THERE ARE ALREADY: ${[...content.quests.values()].map((q) => q.name).join('; ') || 'none'}`,
  ].join('\n')
  return {
    role: 'chronicler',
    ...cachedSystem(worldFixedPart(content, instruction), step, '', 'both'),
    prompt: [
      `${scope.kind === 'main' ? 'THE WHOLE WORLD' : scope.kind === 'land' ? 'THE LAND BETWEEN' : 'THE SETTLEMENT'}: ${scope.name}. ${scope.areas.map((a) => content.areas.get(a)?.summary ?? '').filter(Boolean).join(' ')}`,
      'PLACES:',
      ...cast.places.map((l) => `  ${key.place.get(l.id)} ${l.name}: ${l.summary ?? l.description.day.split(/(?<=[.!?])\s/)[0]}${codeHere(l)}${codeNote(content, l.id)}${placeThings(content, l)}${secretNote(content, l.id)}`),
      'PEOPLE:',
      ...cast.people.map(person),
      `SKILLS: ${skills.length ? skills.join(', ') : 'none'}`,
      ...(scope.kind === 'main' && hasPlayed(played) ? ['', ...playedLines(content, played, key)] : []),
      '',
      asked(scope, fullness),
    ].join('\n'),
    schemaName: 'region_story',
    schema: storySchema(),
    maxTokens: scope.kind === 'main' ? 5000 : fullness === 'full' ? 6000 : fullness === 'story' ? 4000 : 2500,
    effort: 'medium',
    // The world's prefix: the gateway counts the call as the editor's (M10.26), not the game's.
    meta: { stories: scope.kind, fullness, prefix: worldPrefix(files) || 'world', name: scope.name, ...(scope.kind === 'main' && hasPlayed(played) ? { played: playedWords(played, key) } : {}), people: cast.people.map((n) => ({ key: key.person.get(n.id), name: n.name, secret: n.secrets.length > 0 })), places: cast.places.map((l) => key.place.get(l.id)), codes: cast.places.filter((l) => behindCodes(content, l.id).length).map((l) => key.place.get(l.id)), skills, aftermath: [] },
  }
}

/**
 * What a game of the world has lived, for the main line (M10.30, stories with
 * hindsight): the talks by the people's keys, the deeds by the places', and
 * how to mark a stage the stranger has lived already. In the changing part:
 * only a step with a game reads it.
 */
function playedLines(content: Content, played: PlayedGame, key: ReturnType<typeof keysOf>): string[] {
  const who = (npc: string) => key.person.get(npc) ?? content.npcs.get(npc)?.name ?? npc
  const quests = played.quests.map((id) => content.quests.get(id)?.name).filter(Boolean)
  return [
    `WHAT HAS BEEN PLAYED: a game of this world is under way (${played.about}). Begin the main line where the stranger already is: what they learnt and did stays learnt and done, and no deed asks for it again. For each stage the stranger has already lived in these talks, lived: the key of the person it was talked through with, and two to four words that came up in that talk, as they stand in the lines below. A stage not lived has no lived; the last stage never has it.`,
    ...played.talks.flatMap((t) => [`TALKS WITH ${who(t.npc)} ${content.npcs.get(t.npc)?.name ?? ''}:`, ...t.lines.map((l) => `  ${l.you ? 'stranger' : who(t.npc)}: ${l.text}`)]),
    ...(played.deeds.length ? [`DEEDS: ${played.deeds.map((d) => `at ${key.place.get(d.at) ?? content.locations.get(d.at)?.name ?? d.at}: ${d.act}`).join('; ')}`] : []),
    ...(quests.length ? [`QUESTS ON THE GO OR DONE: ${quests.join('; ')}`] : []),
  ]
}

/** For the mock (and the log): per person with a key, a few longer words the stranger said to them. */
function playedWords(played: PlayedGame, key: ReturnType<typeof keysOf>): { key: string; words: string[] }[] {
  return played.talks.flatMap((t) => {
    const k = key.person.get(t.npc)
    const words = [...new Set(t.lines.filter((l) => l.you).flatMap((l) => l.text.toLowerCase().match(/[a-z]{6,}/g) ?? []))].slice(0, 3)
    return k && words.length ? [{ key: k, words }] : []
  })
}

/**
 * What the check says of each scope's lines (M10.30 (6)): too few ways to end
 * (the design asks three, two of them solutions by different ways, one where
 * it goes wrong), or no way on or to the end as the world stands. A scope
 * with problems goes back to the model once, with these lines.
 */
export function storyChecks(files: ContentFile[], parts: { scope: StoryScope; text: string }[]): { scope: StoryScope; problems: string[] }[] {
  const content = loadContent(files)
  const skills = new Set((content.rules?.skills ?? []).map((s) => s.id))
  return parts.flatMap(({ scope, text }) => {
    const reply = storyReply(text)
    if (!reply) return [{ scope, problems: ['The answer could not be read as the agreed JSON.'] }]
    const cast = scopeCast(content, scope)
    const key = keysOf(cast)
    const own = (k: string | undefined) => (k ? key.id.get(k.trim()) : undefined)
    const problems = [reply.quest, ...(reply.quests ?? [])].map(readSketch).filter((s): s is QuestSketch => Boolean(s)).flatMap((sketch) => {
      const quest = questFromSketch({ content }, sketch, 'story_check', {
        person: (k) => (own(k) && content.npcs.has(own(k)!) ? own(k) : undefined),
        place: (k) => (own(k) && content.locations.has(own(k)!) ? own(k) : undefined),
        places: cast.places,
        skills,
        dc: 12,
        minStages: sketch.kind === 'main' ? 2 : 1,
        mostStages: sketch.kind === 'main' ? 5 : 3,
      })
      if (!quest) return [`${sketch.name}: too little of it fits (a stage without a journal line, a deed, or a place of the keys given)`]
      const parsed = QuestSchema.safeParse(quest)
      // A deed behind a code nobody gives in this line (M10.34 B): the code told in a stage before it, or the deed elsewhere.
      const coded = parsed.success ? codeProblems(content, parsed.data).map((p) => `${p.replace(/^quest story_check, deed \S+: /, `${sketch.name}: a deed `).replace(/: add a stage of this one to the secret's given_when$/, '')}: tell the code in a stage before it (its done), or put the deed somewhere open`) : []
      return [...endingProblems(sketch), ...(parsed.success ? solvableProblems({ ...content, quests: new Map(content.quests).set('story_check', parsed.data) }, parsed.data).map((p) => p.replace('quest story_check', sketch.name)) : []), ...coded]
    })
    return problems.length ? [{ scope, problems }] : []
  })
}

/** The same call again for a scope the check sent back: the answer before, and what the check says of it. */
export function storiesFixRequest(files: ContentFile[], scope: StoryScope, fullness: StoryFullness, said: string, before: string, problems: string[], played?: PlayedGame): LlmRequest {
  const request = storiesRequest(files, scope, fullness, said, played)
  return {
    ...request,
    prompt: [request.prompt, '', 'YOUR ANSWER BEFORE:', before.trim(), '', 'WHAT THE CHECK SAYS OF IT:', ...problems.map((p) => `- ${p}`), '', 'Write all the lines of this scope again, whole, so that every check holds. JSON only.'].join('\n'),
  }
}

/** An id for a new line: never one the world has or ever had. */
function freeId(content: Content, name: string, taken: Set<string>): string {
  const locked = lockedIds(content)
  const stem = `story_${name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40) || 'line'}`
  let id = stem
  for (let n = 2; taken.has(id) || locked.has(id) || content.quests.has(id); n++) id = `${stem}_${n}`
  taken.add(id)
  return id
}

/**
 * The hidden truth, as a section of the world's CHRONICLER.md: what the
 * designer said, and the truths the main line keeps (which the chronicler
 * chose where the designer left it to them, Bram, 30 September 2026). From
 * then on it is a fixed truth of the world, for every later call.
 */
function withTruth(files: ContentFile[], said: string, truths: string[]): { path: string; text: string }[] {
  if (!said.trim() && !truths.length) return []
  const own = files.find((f) => f.path === `${worldPrefix(files)}CHRONICLER.md`)?.text ?? ''
  const section = [
    '## The hidden truth of the stories',
    '',
    ...(said.trim() ? [`The designer: ${said.trim()}`, ''] : []),
    ...(truths.length ? ['What the main line keeps hidden until its stage (a fixed truth of this world):', ...truths.map((t) => `- ${t}`), ''] : []),
  ].join('\n')
  if (own.includes(section)) return []
  return [{ path: 'CHRONICLER.md', text: `${own.trimEnd()}${own.trim() ? '\n\n' : ''}${section}` }]
}

/**
 * The step's replies read into one proposal: each line built by the engine
 * from its sketch (quests/sketch.ts), what did not fit left out and named,
 * the designer's truth in CHRONICLER.md, and the whole checked like any step.
 */
export function readStories(files: ContentFile[], said: string, parts: { scope: StoryScope; text: string }[]): Draft {
  const content = loadContent(files)
  const taken = new Set<string>()
  const changes: DraftChange[] = []
  const made: string[] = []
  const left: string[] = []
  const problems: string[] = []
  const truths: string[] = []
  const skills = new Set((content.rules?.skills ?? []).map((s) => s.id))
  for (const { scope, text } of parts) {
    const reply = storyReply(text)
    if (!reply) {
      problems.push(`The stories for ${scope.name} could not be read.`)
      continue
    }
    const cast = scopeCast(content, scope)
    const key = keysOf(cast)
    const person = (k: string | undefined) => (k ? key.id.get(k.trim()) : undefined)
    const sketches = [reply.quest, ...(reply.quests ?? [])].map(readSketch).filter((s): s is QuestSketch => Boolean(s))
    for (const sketch of sketches) {
      const main = sketch.kind === 'main'
      const id = freeId(content, sketch.name, taken)
      const quest = questFromSketch({ content }, sketch, id, {
        person: (k) => (person(k) && content.npcs.has(person(k)!) ? person(k) : undefined),
        place: (k) => (person(k) && content.locations.has(person(k)!) ? person(k) : undefined),
        places: cast.places,
        skills,
        dc: 12,
        minStages: main ? 2 : 1,
        mostStages: main ? 5 : 3,
      })
      if (!quest) {
        left.push(sketch.name)
        continue
      }
      changes.push({ kind: 'quest', id, yaml: stringify(quest) })
      truths.push(...((quest['truths'] as { text: string }[] | undefined) ?? []).map((t) => t.text))
      made.push(`${quest['name'] as string} (${scope.name})`)
    }
  }
  const say = [`${made.length} storylines: ${made.join('; ') || 'none'}.`, ...(left.length ? [`Left out, too little of them fit: ${left.join('; ')}.`] : [])].join(' ')
  const draft = recheckDraft(files, { say, questions: [], changes, files: withTruth(files, said, truths) })
  return problems.length ? { ...draft, problems: [...problems, ...draft.problems] } : draft
}

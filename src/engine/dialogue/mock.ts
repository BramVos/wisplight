import type { ChronicleMeta } from '../../chronicler/prompt'
import { askedFor, proposal, type Offer } from './offers'
import { stringify } from 'yaml'
import { LlmError, sentText, type LlmClient, type LlmRequest, type LlmResponse } from './llm'

// A stand-in model for tests and the browser preview. It answers from the
// knowledge packet in request.meta and can misbehave on purpose, so tests can
// prove that the guardrails catch it.

export type MockMode = 'good' | 'leak' | 'long' | 'invalid' | 'throw' | 'anachronism' | 'topics' | 'invent' | 'far' | 'twofar' | 'lookup' | 'quest' | 'plan' | 'promise'

export interface MockMeta {
  npcName: string
  act: string
  wordLimit: number
  known: { topic: string; facts: string[]; story?: string; toldBy?: string; tale?: boolean }[]
  unknown: { topic: string; name: string }[]
  referral?: { npc: string; name: string; call: string }
  check?: string
  secret?: string
  questActions?: { key: string; intent: string }[]
  playerText?: string
  /** The offers of this turn (M10.3): the mock picks by the same rules as the game without a model. */
  offers?: Offer[]
  /** What the rules would have the NPC do after the talk (M10.3); the mock chooses the same. */
  after?: { kind: 'tell' | 'visit'; target: string }
  /** A claim may be read from the stranger's words (M10.3, left over): who it may be about. */
  claimable?: string[]
  /** Someone new may be named (M10.9): the bonds and places the game offers. */
  sketch?: { bonds: string[]; places: string[] }
}

const COMMON = new Set(['about', 'what', 'with', 'that', 'this', 'from', 'your', 'have', 'there', 'they', 'them', 'will', 'would', 'could', 'know', 'want', 'wants'])

/** The mock recognises a quest action when the player's words share its main words. */
function recognised(meta: MockMeta): string | undefined {
  const words = (text: string) => new Set(text.toLowerCase().split(/[^a-z']+/).filter((w) => w.length >= 3 && !COMMON.has(w)))
  const said = words(meta.playerText ?? '')
  return meta.questActions?.find((a) => {
    const wanted = [...words(a.intent)]
    const shared = wanted.filter((w) => said.has(w) || said.has(`${w}s`) || said.has(w.replace(/s$/, ''))).length
    return wanted.length > 0 && shared >= Math.min(2, wanted.length)
  })?.key
}

/** The offer the player's words ask for, or else one the rules would propose: as the game does without a model. */
function offerChoice(meta: MockMeta): { action: string; propose: string } {
  const asked = askedFor(meta.offers!, meta.playerText ?? '')
  const proposed = asked ? undefined : proposal(meta.offers!, meta.act)
  return { action: asked?.key ?? 'none', propose: proposed?.key ?? 'none' }
}

export class MockLlm implements LlmClient {
  calls: LlmRequest[] = []
  /** For tests: more for the chronicler to write, given the overview and the line marked PLAN, if any. */
  chronicle?: (meta: ChronicleMeta, planned: string | undefined) => Record<string, unknown>
  /** For tests: what the second look at big lore finds that no fact says (M9.2); without it, nothing. */
  judge?: (story: string, facts: string[]) => string[]
  /** For tests: the questions a brain asks before it chooses (M9.3), and what it heard back. */
  ask?: (npc: string, keys: Record<string, string>) => string[]
  heard?: (answers: string) => void
  /** For tests: the intention a brain chooses when a signal lets it (M8.2), with its open bindings; without it, none and custom decides. */
  intend?: (npc: string, offered: string[], keys: Record<string, string>) => { choice: string; fill?: { name: string; key: string }[] } | undefined
  /** For tests: the claim the voice reads in the stranger's words when one may be read (M10.3, left over). */
  claim?: { subject: string; key: string; value: string }
  /** For tests: someone new the voice names (M10.9), whether or not the game offered it; the place, when not given, is the first offered. */
  someone?: { name: string; bond?: string; place?: string; what?: string; pronoun?: string }

  constructor(
    public mode: MockMode = 'good',
    private readonly leakName = 'the Weeping Stone',
  ) {}

  async complete(request: LlmRequest): Promise<LlmResponse> {
    this.calls.push(request)
    if (this.mode === 'throw') throw new LlmError('timeout', 'mock timeout')
    const text =
      request.schemaName === 'builder_draft'
        ? this.draft(request.meta ?? {})
        : request.schemaName === 'world_step'
        ? this.worldStep(request.meta ?? {})
        : request.schemaName === 'world_enhance'
        ? this.enhance(request.meta ?? {})
        : request.schemaName === 'world_polish'
        ? JSON.stringify({ say: 'Without a model nothing is polished.', places: [] })
        : request.schemaName === 'palette_draft'
        ? this.palette(request.meta ?? {})
        : request.schemaName === 'map_paint'
        ? this.mapPaint(request.meta ?? {})
        : request.schemaName === 'voice_draft'
        ? this.voiceKit(request.meta ?? {})
        : request.schemaName === 'journey'
        ? JSON.stringify({ text: String(request.meta?.['journey'] ?? '') })
        : request.schemaName === 'improvise'
        ? this.improvise(request.meta ?? {})
        : request.schemaName === 'party_reply'
        ? this.party(request.meta as unknown as { party: { id: string; name: string; knows: string[] }[] })
        : request.role === 'voice'
        ? this.voice(request.meta as unknown as MockMeta)
        : request.role === 'chronicler'
          ? request.schemaName === 'outline'
            ? this.outline(String(request.meta?.['name'] ?? 'the place'))
            : request.schemaName === 'far_place'
            ? this.farPlace(String(request.meta?.['name'] ?? 'the place'), (request.meta?.['named'] as { key: string; name: string; pronoun: string }[] | undefined) ?? [])
            : request.schemaName === 'tides'
            ? this.tides((request.meta?.['allowed'] as Record<string, string[]> | undefined) ?? {})
            : request.schemaName === 'weave'
            ? this.weave((request.meta?.['fresh'] as string[] | undefined) ?? [], (request.meta?.['known'] as string[] | undefined) ?? [], (request.meta?.['lines'] as string[] | undefined) ?? [])
            : request.schemaName === 'district'
            ? this.district(String(request.meta?.['town'] ?? 'the town'), String(request.meta?.['name'] ?? 'the district'), (request.meta?.['factions'] as string[] | undefined) ?? [])
            : request.schemaName === 'expansion'
            ? this.expansion(String(request.meta?.['wind'] ?? 'south'), Number(request.meta?.['count'] ?? 1))
            : request.schemaName === 'land'
            ? this.land(String(request.meta?.['name'] ?? 'the land'), (request.meta?.['faiths'] as string[] | undefined) ?? [])
            : request.schemaName === 'region_story'
            ? this.regionStory(request.meta ?? {})
            : request.schemaName === 'night_quest'
            ? this.nightQuest(request.meta ?? {})
            : request.schemaName === 'legends'
            ? this.legends((request.meta?.['legends'] as string[] | undefined) ?? [])
            : this.chronicler(request.meta as unknown as ChronicleMeta, request.prompt)
          : this.other(request)
    return { text, provider: 'mock', model: 'mock-1', usage: { inputTokens: Math.round(sentText(request).length / 4), outputTokens: Math.round(text.length / 4), cachedTokens: 0 }, latencyMs: 1 }
  }

  /**
   * The story of a new region (M10.25): a quest of two stages with the first
   * two people, a watcher on the first standard signal, lore, and a secret for
   * the third person; and one watcher on a signal the world does not have,
   * which must be dropped. 'invalid' answers in prose.
   */
  nightQuest(meta: Record<string, unknown>): string {
    if (this.mode === 'invalid') return 'A quest, surely.'
    const people = (meta['people'] as { key: string; name: string }[] | undefined) ?? []
    const places = (meta['places'] as string[] | undefined) ?? []
    const asker = people.find((p) => p.key === meta['asker']) ?? people[0]
    const other = people.find((p) => p !== asker)
    if (!asker || !places.length) return JSON.stringify({ make: false, why: 'Nothing to make of it.' })
    const first = asker.name.split(' ')[0]!
    return JSON.stringify({
      make: true,
      why: `${first} asked, and meant it.`,
      quest: {
        name: `What ${first} Asked`,
        kind: 'request',
        summary: `${first} wants the stranger to look into a matter that worries them.`,
        giver: asker.key,
        ask: 'You said you would help. Go and look, and tell me what you find.',
        stages: [
          { text: `${first} asked you to look into it.`, goal: 'Look round where it happened.', asks: 'Look round where it happened, if you would.', say: 'look round the place', at: places[0]!, with: '', skill: '', done: 'You find signs that someone has been here before you.', knows: [{ who: asker.key, line: `${first} knows what they asked, and no more.` }] },
          { text: 'There were signs; someone else knows more.', goal: `Tell ${first} what you found.`, asks: 'Come back and tell me what you found.', say: `tell ${first.toLowerCase()} what you found`, at: places[1] ?? places[0]!, with: asker.key, skill: '', done: `${first} listens, and nods slowly.`, knows: other ? [{ who: other.key, line: `${other.name.split(' ')[0]} saw someone there, late.` }] : [] },
        ],
        outcome: { name: 'Looked into', text: `${first} knows now, and is easier for it.` },
        // Three ways it may end (M10.30): told, set right, or let go.
        endings: [
          { name: 'Told', text: `${first} knows now, and is easier for it.`, solution: true, way: 'talk', say: `tell ${first.toLowerCase()} what you found`, at: places[1] ?? places[0]!, with: asker.key, skill: '' },
          { name: 'Set right', text: 'The stranger put right what they found, and nobody need hear of it.', solution: true, way: 'deed', say: 'put the place right', at: places[0]!, with: '', skill: '' },
          { name: 'Let go', text: `The stranger let it lie, and ${first} stops asking.`, solution: false, way: 'fail', say: 'let the matter lie', at: places[1] ?? places[0]!, with: '', skill: '' },
        ],
        truths: other ? [{ text: `${other.name.split(' ')[0]} was there that night.`, words: [`${other.name.split(' ')[0]!.toLowerCase()} was there`], from: 2 }] : [],
      },
    })
  }

  regionStory(meta: Record<string, unknown>): string {
    if (this.mode === 'invalid') return 'A fine story for the place.'
    const people = (meta['people'] as { key: string; name: string; secret?: boolean }[] | undefined) ?? []
    const places = (meta['places'] as string[] | undefined) ?? []
    const signals = (meta['aftermath'] as string[] | undefined) ?? []
    const skills = (meta['skills'] as string[] | undefined) ?? []
    const name = String(meta['name'] ?? 'the place')
    const [a, b] = people
    const c = people.slice(2).find((p) => !p.secret) ?? people.slice(1).find((p) => !p.secret)
    const [here, there] = [places[0] ?? '', places[1] ?? places[0] ?? '']
    // The step Stories of the world build (M10.30): lines in `quests`, with goals, who knows what, and for the main line a truth.
    // As a model that keeps the rules: no deed behind a code nobody gives it (M10.34 B), while open places remain.
    const codes = new Set((meta['codes'] as string[] | undefined) ?? [])
    const open = places.filter((p) => !codes.has(p))
    if (meta['stories']) return this.storyStep(String(meta['stories']), String(meta['fullness'] ?? 'story'), people, open.length ? open : places, name, (meta['played'] as { key: string; words: string[] }[] | undefined)?.[0])
    return JSON.stringify({
      why: `${name} lives by what comes in on its road, and not all of it is honest.`,
      quest: a
        ? {
            name: 'The Missing Tally',
            kind: 'mystery',
            summary: `${a.name} has lost the tally of what the carters owe.`,
            giver: a.key,
            ask: 'The tally stick is gone, and without it every carter swears he owes nothing. Would you look for it?',
            stages: [
              { text: `${a.name.split(' ')[0]} lost the tally; it was last seen by the door.`, say: 'search the doorway', at: here, with: '', skill: skills.includes('perception') ? 'perception' : '', done: 'Under the step you find notches cut in a bit of willow: half a tally, snapped clean.' },
              { text: 'Half the tally is found; someone kept the other half.', say: `ask ${(b ?? a).name.split(' ')[0]!.toLowerCase()} about the tally`, at: there, with: (b ?? a).key, skill: '', done: 'With a sigh the other half comes out of an apron pocket. "I only meant to keep it safe."' },
            ],
            outcome: { name: 'The tally made whole', text: 'The two halves fit, and the carters pay what they owe.' },
            // Three ways to end (M10.30): two solutions by different ways, and one where it goes wrong.
            endings: [
              { name: 'The tally made whole', text: 'The two halves fit, and the carters pay what they owe.', solution: true, way: 'talk', say: `ask ${(b ?? a).name.split(' ')[0]!.toLowerCase()} for the other half`, at: there, with: (b ?? a).key, skill: '' },
              { name: 'A new tally', text: 'The stranger cut a new tally from what the carters own to, and they pay by it, grumbling.', solution: true, way: 'deed', say: 'cut a new tally', at: here, with: '', skill: '' },
              { name: 'Every carter swears', text: 'Without a tally nobody owes anything, and the debts are lost.', solution: false, way: 'fail', say: 'give up on the tally', at: here, with: '', skill: '' },
            ],
          }
        : null,
      watchers: [
        ...(signals[0] && a ? [{ signal: signals[0], on: 'done', who: [a.key], why: 'A debt settled is talked about.' }] : []),
        { signal: 'no_such_signal', on: 'taken', who: [a?.key ?? 'p1'], why: 'Made up.' },
      ],
      lore: { name: `The Road into ${name}`, summary: `Every cart that comes into ${name} pays at the post.`, details: 'The post is older than anyone living. The toll was once a single copper.', story: 'My grandmother said the post was put there by a carter who paid with his last coin, and cursed the road.', teller: a?.key ?? '' },
      secrets: c ? [{ who: c.key, text: `${c.name.split(' ')[0]} once took a cart's toll and kept it.`, hint: 'Their eyes go to the toll post whenever it is mentioned.' }] : [],
    })
  }

  /** The lines of the step Stories (M10.30) for one scope: the main line, or small and personal lines of one place. */
  private storyStep(scope: string, fullness: string, people: { key: string; name: string }[], places: string[], name: string, played?: { key: string; words: string[] }): string {
    const [a, b, c] = [people[0], people[1] ?? people[0], people[2] ?? people[1] ?? people[0]]
    const at = (i: number) => places[i % Math.max(1, places.length)] ?? ''
    const first = (p?: { name: string }) => (p?.name ?? 'someone').split(' ')[0]!
    const stage = (text: string, say: string, place: string, who: { key: string; name: string } | undefined, done: string, goal: string, knows: { key: string; name: string }[]) => ({
      text,
      goal,
      // What the giver wants then, in their voice (M10.33 E).
      asks: `${goal.replace(/[.!]$/, '')}, if you would. I have nobody else to ask.`,
      say,
      at: place,
      with: who?.key ?? '',
      skill: '',
      done,
      knows: knows.map((k) => ({ who: k.key, line: `${first(k)} knows only what ${first(k)} saw, and says no more.` })),
    })
    // Three ways to end (M10.30): talking it through, doing something with the world, and letting it go wrong; the main line a third solution.
    const endings = (giver: { key: string; name: string }, main: boolean) => [
      { name: 'Talked through', text: `${first(giver)} hears the stranger out, and it is settled with words.`, solution: true, way: 'talk', say: `talk ${first(giver).toLowerCase()} round`, at: at(0), with: giver.key, skill: '' },
      { name: 'Put right', text: 'The stranger put it right with their own hands.', solution: true, way: 'deed', say: 'search the place', at: at(1), with: '', skill: '' },
      ...(main ? [{ name: 'Paid off', text: 'A payment closes the matter, if not the questions.', solution: true, way: 'give', say: 'pay the debt', at: at(0), with: giver.key, skill: '' }] : []),
      { name: 'Let slide', text: 'Nobody sees to it, and it goes wrong.', solution: false, way: 'fail', say: 'give up the matter', at: at(0), with: '', skill: '' },
    ]
    const line = (kind: string, giver: { key: string; name: string }, title: string, stages: (ReturnType<typeof stage> & { lived?: unknown; word?: string; gives?: string })[], extra: Record<string, unknown> = {}) => ({
      name: title,
      kind,
      summary: `${first(giver)} has a matter in ${name}.`,
      giver: giver.key,
      ask: 'Would you see to it? I cannot do it myself.',
      stages,
      outcome: { name: `${title} settled`, text: 'It comes right in the end, and people say so.' },
      endings: endings(giver, kind === 'main'),
      ...extra,
    })
    const quests = !a
      ? []
      : scope === 'main'
        ? [
            line('main', a, 'The Long Silence', [
              // With a game under way (M10.30), the first stage is lived already: the stranger talked it through.
              { ...stage('Something went quiet that should not have.', `ask ${first(a).toLowerCase()} about the silence`, at(0), a, 'You learn when it began, and the code of the record room: 4471.', `Ask ${first(a)} about the silence.`, [a]), gives: 'a note of the code', ...(played ? { lived: { who: played.key, words: played.words } } : {}) },
              // A code as the deed (M10.31 C): typed at the place, given in the deed before.
              { ...stage('Someone kept a record of it.', '', at(1), undefined, 'The lock gives. A ledger, with a page cut out.', 'Type the code of the record room.', [a, b!]), word: '4471' },
              stage('The cut page says who.', `ask ${first(b).toLowerCase()} about the page`, at(2), b, 'The page is found, and with it the name.', `Ask ${first(b)} about the missing page.`, [b!]),
            ], { begins: 'start', lapses: { days: 30, text: 'The silence settles, and nobody asks about it any more.' }, truths: [{ text: `${first(b)} cut the page from the ledger.`, words: ['cut the page', 'took the page'], from: 3 }] }),
          ]
        : [
            line('request', a, `${first(a)}'s Errand`, [stage(`${first(a)} needs something fetched.`, 'fetch the parcel', at(1), undefined, 'The parcel is in your hands.', 'Fetch the parcel.', [a])]),
            ...(fullness !== 'outline'
              ? [line('mystery', b!, 'The Moved Crate', [stage('A crate was moved in the night.', 'search the place', at(0), undefined, 'Marks lead to the door.', 'Search the place.', [b!]), stage('The marks lead out.', `ask ${first(a).toLowerCase()} about the crate`, at(0), a, 'It was only moved for the damp.', `Ask ${first(a)} about the crate.`, [a, b!])])]
              : []),
            ...(fullness === 'full' ? [line('personal', c!, `What ${first(c)} Keeps`, [stage(`${first(c)} keeps something to themselves.`, `talk to ${first(c).toLowerCase()} about home`, at(0), c, `${first(c)} tells you, a little.`, `Talk to ${first(c)} about home.`, [c!])])] : []),
          ]
    return JSON.stringify({ why: `The lines of ${name} grow from what its people want and keep.`, quest: null, quests, watchers: [], lore: null, secrets: [] })
  }

  /**
   * A step of a region built in play (M10.25): a back lane off its first
   * place, a trade, someone who lives there, a thing they sell, and a custom.
   */
  private regionStep(step: string, area: string, facts: { name?: string; start?: string; ids?: Record<string, string[]> }): string {
    const reply = (say: string, changes: { kind: string; id: string; yaml: string; merge?: boolean }[]) => JSON.stringify({ say, questions: [], changes, world: '', rules: '', files: [] })
    const first = facts.start ?? ''
    const lane = `loc_${area}_back_lane`
    const trade = `${area}_netmender`
    switch (step) {
      case 'places':
        return reply('A back lane off the first place.', [{ kind: 'location', id: lane, yaml: stringify({ id: lane, name: 'The Back Lane', area, tags: ['public'], description: { day: 'You walk a narrow lane between leaning sheds, where nets hang drying on poles. It smells of tar and old fish. A dog watches you from a doorway. The way back is west.' }, exits: { west: { to: first, minutes: 3 } } }) }])
      case 'professions':
        return reply('Net-menders.', [{ kind: 'profession', id: trade, yaml: stringify({ id: trade, name: 'net-mender', schedule: [{ from: '07:00', to: '08:00', activity: 'eat' }, { from: '08:00', to: '18:00', activity: 'work' }, { from: '18:00', to: '22:00', activity: 'home' }, { from: '22:00', to: '07:00', activity: 'sleep' }] }) }])
      case 'people':
        return reply('A net-mender in the back lane.', [{ kind: 'npc', id: `npc_wobbe_${area}`, yaml: stringify({ id: `npc_wobbe_${area}`, name: 'Wobbe Tjalma', short: 'Wobbe the net-mender', pronoun: 'he', age: 50, profession: (facts.ids?.['profession'] ?? []).includes(trade) ? trade : (facts.ids?.['profession']?.[0] ?? trade), home: facts.ids?.['location']?.includes(lane) ? lane : first, appearance: 'A stooped man with a netting needle behind his ear.', personality: { warmth: 1, courage: 0, honesty: 1, temper: 0, curiosity: 1, diligence: 2 }, public_facts: ['Wobbe mends every net in the place.'] }) }])
      case 'economy':
        return reply('Mended nets for sale.', [{ kind: 'item', id: `${area}_mended_net`, yaml: stringify({ id: `${area}_mended_net`, name: 'mended net', description: 'A fishing net, patched with new twine.', value: 12, tags: ['tool'] }) }])
      default:
        return reply('Nothing more to add here.', [])
    }
  }

  /** The month's judgement of the great lines (M10.22): the furthest each may go, and one made-up line that must be dropped. */
  tides(allowed: Record<string, string[]>): string {
    return JSON.stringify({ lines: [...Object.entries(allowed).map(([id, may]) => ({ id, judged: may.at(-1) ?? 'nothing', why: 'The signs have been gathering all month.' })), { id: 'made_up', judged: 'event', why: 'Because.' }] })
  }

  /**
   * What lies beyond the edge (M10.21): a region of salt flats, and in think
   * mode a land of its own as the second choice. In 'invalid' mode a name
   * that is taken and quarters too few, which must be refused.
   */
  expansion(wind: string, count: number): string {
    if (this.mode === 'invalid') return JSON.stringify({ outlines: [{ id: 'x', name: 'Veenhoek', kind: 'region', summary: 'A place.', details: 'A place.', days: 9, districts: [{ id: 'a', name: 'A', line: 'A.' }], why: 'Because.' }] })
    const saltings = {
      id: 'grey_saltings',
      name: 'the Grey Saltings',
      kind: 'region',
      summary: `Salt flats ${wind} of the edge, where a few families boil sea water for salt.`,
      details: 'The flats are cut by creeks that fill twice a day. The salt boilers live in huts on stilts and trade with whoever comes.',
      story: 'They say the first boiler found the flats by following a white heron that never landed.',
      days: 2,
      districts: [
        { id: 'boiling_huts', name: 'the boiling huts', line: 'Huts on stilts round the salt pans, where the fires never quite go out.' },
        { id: 'creek_landing', name: 'the creek landing', line: 'A landing of black posts where the salt barges tie up at high water.' },
      ],
      why: 'The world book says the salt comes into the land from beyond its edge.',
    }
    const amber = {
      id: 'amber_coast',
      name: 'the Amber Coast',
      kind: 'land',
      summary: `A coast of dunes ${wind} of the edge, with its own lords and its own coin.`,
      details: 'Its people gather amber on the beaches after storms and sell it by weight. They are proud, and slow to trust a stranger.',
      days: 4,
      districts: [
        { id: 'dune_gate', name: 'the dune gate', line: 'A gate in a wall of turf across the only road into the dunes.' },
        { id: 'amber_market', name: 'the amber market', line: 'Stalls under sailcloth where amber is weighed on brass scales.' },
      ],
      land: { frame: 'LAND: The Amber Coast, a land of dunes and amber gatherers under its own lords.\nREGION: The dune gate and the amber market behind it.\nPEOPLE speak plainly and weigh every word as they weigh amber.', crossing: 'At the dune gate a guard weighs your purse in his hand before he lets you through.' },
      why: 'The tales from afar speak of amber from beyond the edge.',
    }
    return JSON.stringify({ outlines: count > 1 ? [saltings, amber] : [saltings] })
  }

  /**
   * A land the designer only framed (M10.23): how its people speak, their
   * names, coins at a rate and who keeps the law; an oath by a faith the land
   * does not hold, which must be dropped. Names that are too few in 'invalid'
   * mode, which must be dropped too.
   */
  land(name: string, faiths: string[] = []): string {
    return JSON.stringify({
      crossing: `The people of ${name} bow a little when they greet you, and nobody here takes your old coin without weighing it first.`,
      names: this.mode === 'invalid' ? { she: ['Aiko'], he: ['Kenji'], family: ['Mori'] } : { she: ['Aiko', 'Hana', 'Yuki', 'Emi', 'Sora', 'Rin'], he: ['Kenji', 'Taro', 'Haru', 'Daichi', 'Ren', 'Sho'], family: ['Mori', 'Ishida', 'Kaneda', 'Ota', 'Sakai', 'Noda'] },
      money: { units: [{ short: 'ryo', name: 'ryo', value: 100 }, { short: 'mon', name: 'mon', value: 1 }], rate: 3 },
      law: { where: `in ${name}`, officer: 'magistrate' },
      voice: {
        oaths: { ...Object.fromEntries(faiths.map((f) => [f, ['by the old shrines', 'shrines keep us']])), made_up_faith: ['by nothing'] },
        sayings: ['The nail that stands up is hammered down.', 'Fall seven times, stand up eight.', 'Even monkeys fall from trees.'],
        address: { stranger: ['traveller'], known: ['neighbour'], friend: ['old friend'], high: ['honoured one'] },
        time: ['at the hour of the ox', 'by the temple drum', 'at the turning of the tide'],
        distance: ['a day on the post road', 'a pipe\'s walk'],
        measures: ['a sack of rice', 'a bolt of silk'],
        not_here: [{ word: 'guilder', instead: 'ryo' }, { word: 'potato', instead: 'radish' }],
      },
    })
  }

  /** A weave round (M10.22): the first new person is kin of the first known, hides one thing, and has word for them. */
  weave(fresh: string[], known: string[], lines: string[] = []): string {
    const [a, b] = [fresh[0], known[0]]
    if (!a || !b) return JSON.stringify({ bonds: [], secrets: [], thread: null, echo: null })
    return JSON.stringify({
      bonds: [{ a, b, role: 'kin', why: 'They are cousins on the mother\'s side, and have not seen each other since they were children.' }, { a: 'nobody', b, role: 'friend', why: 'Made up.' }],
      secrets: [{ who: a, text: 'Owes more than a year of rent and has told nobody.', hint: 'Always has an errand when the landlord comes by.' }],
      thread: { from: a, to: b, name: 'Word for a cousin', ask: 'If you go home that way, tell my cousin I am well, and that I still have the knife.', why: 'The two families fell out over an inheritance, and this is the first word in years.' },
      echo: lines[0] ? { who: fresh[1] ?? a, line: lines[0], text: 'Word of it has come this far, and here someone knows the stranger by it.' } : null,
    })
  }

  /** A district of a far town (M10.21): two places and two people, in the words a chronicler might use; invalid words in 'invalid' mode. */
  district(town: string, name: string, factions: string[] = []): string {
    if (this.mode === 'invalid') return JSON.stringify({ places: [{ key: 'x', name: 'X', description: 'Too short.' }], people: [{ key: 'y', name: 'nobody', pronoun: 'it', looks: '', speech: '', fact: '', trade: 'none', at: 'x' }] })
    return JSON.stringify({
      places: [
        { key: 'chandlery', name: 'The Chandlery', description: `You step into a chandler's shop in ${name} of ${town}, hung with rope, lanterns and tarred canvas. It smells of pitch and lamp oil. A boy sweeps shavings towards the door. The street is back the way you came.` },
        { key: 'yard', name: 'The Cooper\'s Yard', near: 'chandlery', description: 'You stand in a yard stacked with barrels, some new and pale, some black with age. Somewhere a mallet knocks hoops onto a cask, steady as a clock. Rain has left puddles between the staves. The chandlery is back through the gate.' },
      ],
      people: [
        { key: 'hester', name: 'Hester Vlieland', pronoun: 'she', looks: 'A square woman with a pencil behind her ear and tar on her cuffs.', speech: 'short, counts aloud', fact: 'Hester keeps the chandlery and knows every ship that owes her money.', trade: 'merchant', at: 'chandlery' },
        { key: 'joris', name: 'Joris Kuipers', pronoun: 'he', looks: 'A broad man in a leather apron, with sawdust in his beard.', speech: 'slow, friendly', fact: 'Joris makes the best casks in the quarter, and says so.', trade: 'merchant', at: 'yard', secret: { text: 'Joris waters the ale he sells by the cask.', hint: 'His casks are always a little lighter than they look.' } },
      ],
      seats: [...(factions[0] ? [{ faction: factions[0], at: 'chandlery', wants: 'A say in who supplies the ships, and a share of what they pay.' }] : []), { faction: 'made_up_league', at: 'yard', wants: 'Everything.' }],
    })
  }

  /** A voice kit proposal (M10.10): the kit as it stands, or a small one for each faith of the world. */
  voiceKit(meta: Record<string, unknown>): string {
    const now = typeof meta['voice'] === 'string' ? meta['voice'] : ''
    if (now) return JSON.stringify({ say: 'The kit as it stands reads well; I would keep it.', yaml: now })
    const faiths = (meta['faiths'] as string[] | undefined) ?? []
    const oaths = faiths.map((f) => `  ${f}: ["by the old ways", "saints preserve us"]`).join('\n')
    const yaml = [`oaths:${faiths.length ? `\n${oaths}` : ' {}'}`, 'sayings:', '  - A dry foot is a lucky foot.', 'address:', '  stranger: [stranger]', '  known: [neighbour]', '  friend: [friend]', '  high: [mistress/master/honoured guest]', 'time: [by the bell, at first light]', 'not_here:', '  - { word: potatoes, instead: turnips }', '  - { word: tobacco }'].join('\n')
    return JSON.stringify({ say: 'A plain kit to start from: few sayings, and a guard for what is not here.', yaml })
  }

  /** A palette proposal (M10): the palette now, every colour a shade warmer, so the test sees a change. */
  palette(meta: Record<string, unknown>): string {
    const warm = (hex: string) => {
      const n = parseInt(hex.slice(1), 16)
      const c = (v: number, d: number) => Math.max(0, Math.min(255, v + d)).toString(16).padStart(2, '0')
      return `#${c(n >> 16, 8)}${c((n >> 8) & 255, 3)}${c(n & 255, -6)}`
    }
    const shift = (value: unknown): unknown => (typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? warm(value) : Array.isArray(value) ? value.map(shift) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([k, v]) => [k, k === 'names' ? v : shift(v)])) : value)
    return JSON.stringify({ say: 'A palette a shade warmer than the one you have, the same muted tones.', palette: shift(meta['palette']) })
  }

  /**
   * A proposal in the world builder (M8): asked for a hamlet with the place in
   * view, a new hamlet with three people and a small story, joined to that
   * place; anything else gets a question back, as the working instruction asks.
   */
  /** Enhance with AI (after M10.17): the designer's words kept, a marked suggestion for each other question of the step, and the first question back. */
  private enhance(meta: Record<string, unknown>): string {
    if (this.mode === 'invalid') return 'A much better answer.'
    const said = String(meta['ask'] ?? '').trim()
    const asks = (meta['asks'] as string[] | undefined) ?? []
    const brief = [said, ...asks.slice(1).map((q) => `- ${q} (suggestion: keep it simple and close to what is already there)`)].join('\n')
    return JSON.stringify({ brief, open: asks.length ? [asks[0]!] : [] })
  }

  /**
   * An improvisation (M10.16): a short narration, and the first effect the content allows, standing before the rest
   * (an offering is felt before it is seen).
   */
  private improvise(meta: Record<string, unknown>): string {
    if (this.mode === 'invalid') return 'Something happens, surely.'
    const may = (meta['may'] as Record<string, unknown>[] | undefined) ?? []
    const standing = may.find((m) => 'standing' in m) as { standing: string } | undefined
    const first = may[0]
    const effect = standing
      ? { kind: 'standing', id: standing.standing, delta: 2, title: '' }
      : first && 'fact' in first
        ? { kind: 'fact', id: '', delta: 0, title: 'the stranger at an old place' }
        : { kind: 'nothing', id: '', delta: 0, title: '' }
    return JSON.stringify({ narration: `You ${String(meta['verb'] ?? 'do it')} and wait. For a moment nothing stirs. Then the air seems to settle, as if something had been noticed.`, effect, spent: meta['domain'] === 'offering' })
  }

  /**
   * One step of building a world (M10.17; all twelve since M10.20), from the
   * designer's words: tables (rows with | or tabs) and lists are read as
   * records, the world keeps the name it has, and each step proposes a small
   * piece that loads, so the whole building of a world plays without a model.
   */
  /**
   * The map as a table (M10.26): water along the west edge, then shallows,
   * and open ground; the rows and width asked, a line per path and per edge.
   */
  private mapPaint(meta: Record<string, unknown>): string {
    const rows = Number(meta['rows'] ?? 1)
    const cols = Number(meta['cols'] ?? 1)
    const row = (i: number) => [...Array(cols).keys()].map((c) => (c < Math.max(1, Math.floor(cols / 6)) ? '~' : c < Math.max(2, Math.floor(cols / 4)) || i < 0 ? '*' : '.')).join('')
    return JSON.stringify({
      say: 'Open water along the west, a band of shallows, and open ground where the places stand.',
      lands: [
        { key: 'open_sea', name: 'open sea', char: '~', like: 'water', dark: '#23495e', paper: '#9fb8c4', text: 'Grey water heaves around you, and the cold of it climbs your legs.' },
        { key: 'shallows', name: 'shallows', char: '*', like: 'fen', dark: '#477c83', paper: '#b8cfd0', text: 'The shallows suck at your boots, and the water hisses between the stones.' },
        { key: 'open_ground', name: 'open ground', char: '.', like: 'heath', dark: '#46545c', paper: '#d6d9d2', text: 'Firm, open ground runs on ahead, and the wind has nothing to stop it.' },
      ],
      drawing: [...Array(rows).keys()].map(row),
      paths: ((meta['paths'] as string[] | undefined) ?? []).map((name) => ({ name, text: 'The way is trodden hard, and you can hear your own steps on it.' })),
      beyond: ['north', 'east', 'south', 'west'].map((side) => ({ side, text: `Nobody here has told you what lies ${side} of here.` })),
    })
  }

  private worldStep(meta: Record<string, unknown>): string {
    if (this.mode === 'invalid') return 'Here is a lovely world for you.'
    // Putting a proposal right (M10.20) takes a model: the mock corrects nothing, so the proposal stays as it was.
    if (Array.isArray(meta['fix'])) return JSON.stringify({ say: 'Without a model nothing is put right.', questions: [], changes: [], world: '', files: [] })
    const said = String(meta['ask'] ?? '').trim()
    const facts = (meta['world'] as { name?: string; start?: string; startRaw?: Record<string, unknown>; ids?: Record<string, string[]> } | undefined) ?? {}
    const name = facts.name?.trim() || 'this world'
    const start = facts.start ?? ''
    const ids = facts.ids ?? {}
    const rows = rowsOf(said)
    const reply = (say: string, part: { changes?: { kind: string; id: string; yaml: string }[]; world?: string; files?: { path: string; text: string }[] }, questions: string[] = []) =>
      JSON.stringify({ say, questions, changes: part.changes ?? [], world: part.world ?? '', files: part.files ?? [] })
    const firstLine = (said.split('\n').find((l) => l.trim()) ?? '').replace(/^[#\-*\s]+/, '').trim()
    // A land's build (M10.23): the same steps, with the land's name and its own places in the facts.
    const land = typeof meta['land'] === 'string' ? meta['land'] : undefined
    // A region built in play (M10.25): one small thing of each step, in the region, joined to its first place.
    const region = typeof meta['region'] === 'string' ? meta['region'] : undefined
    if (region) return this.regionStep(String(meta['step']), region, facts)
    switch (meta['step']) {
      case 'frame':
        if (land)
          return reply(`A frame for ${name} from your words; the rest it takes from the world.`, {
            world: stringify({ words: { land: name, region: name, from: 'the lands beyond' }, frame: `LAND: ${name}. ${firstLine || name}.\nPEOPLE speak plain English.\n`, crossing: `You cross into ${name}, and the talk around you changes.` }),
          })
        return reply(`A frame for ${name} from your words.`, {
          world: stringify({ words: { land: name, region: name, from: 'far away' }, frame: `WORLD: ${firstLine || name}.\nREGION: ${name}, where the story begins.\nPEOPLE speak plain English.\n` }),
          files: [{ path: 'CHRONICLER.md', text: `## This world: ${name}\n\n- Keep to the frame: ${firstLine || name}.\n- Never invent a name the designer did not agree.\n` }],
        })
      case 'lands':
        // One land unless the designer names another (M10.23): the mock makes none, and the world stays whole.
        return reply(`${name} stays one land: the world is its home land, and the reach between lands is worked out from its ways.`, {})
      case 'calendar': {
        const era = /\bera\b\s*[:=]?\s*([A-Za-z]{1,6})\b/i.exec(said)?.[1] ?? 'AL'
        const named = rows.map((r) => r[0]!).filter((c) => /^[A-Z][A-Za-z' -]{1,24}$/.test(c) && !HEADER.test(c))
        const months = named.length >= 13 ? named.slice(0, 13) : ['One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Last Days']
        const listed = /(?:weekdays|days of the week|week)\s*[:=]\s*([^\n]+)/i.exec(said)?.[1]?.split(/,\s*|\s+and\s+/).map((d) => d.trim()).filter(Boolean)
        const weekdays = listed && listed.length > 1 ? listed : /\bten[- ]day|\b10[- ]day/i.test(said) ? ['Unday', 'Duoday', 'Triday', 'Quartday', 'Quintday', 'Sextday', 'Septday', 'Octday', 'Nonday', 'Decday'] : ['Firstday', 'Secondday', 'Thirdday', 'Fourthday', 'Fifthday', 'Sixthday', 'Restday']
        return reply(`${weekdays.length} days a week and ${named.length >= 13 ? 'your' : 'numbered'} months.`, { world: stringify({ calendar: { era, months, weekdays } }) })
      }
      case 'money': {
        if (/credit|chit/i.test(said)) return reply('Credits and chits.', { world: `money:\n  units:\n    - { short: cr, name: credit, value: 20 }\n    - { short: ch, name: chit, value: 1 }\n${land ? '  rate: 1\n' : ''}` })
        const coins = rows.map((r) => ({ name: r[0]!.toLowerCase(), value: Number(r.slice(1).join(' ').match(/\d+/)?.[0] ?? NaN) })).filter((c) => /^[a-z' -]{2,20}$/.test(c.name) && !HEADER.test(c.name) && c.value > 0)
        if (!coins.length) return reply('One plain coin, until you name others.', { world: `money:\n  units:\n    - { short: c, name: coin, value: 1 }\n${land ? '  rate: 1\n' : ''}` })
        const smallest = Math.min(...coins.map((c) => c.value))
        const used = new Set<string>()
        const units = coins
          .sort((a, b) => b.value - a.value)
          .map((c) => {
            let short = c.name.replace(/[^a-z]/g, '').slice(0, 2) || 'c'
            while (used.has(short)) short = `${short}${used.size}`
            used.add(short)
            return { short, name: c.name, value: Math.max(1, Math.round(c.value / smallest)) }
          })
        // A land's coins change at the border at a whole rate (M10.23).
        const rate = Number(/\brate\b\D{0,12}(\d+)/i.exec(said)?.[1] ?? 2) || 2
        return reply(`${units.length} coins, the ${units.at(-1)!.name} the smallest.`, { world: stringify({ money: land ? { units, rate } : { units } }) })
      }
      case 'faiths': {
        if (/no faith|nobody prays|no gods?|none/i.test(said) || !rows.length) return reply('No faith: nobody prays here.', { world: 'faiths: []\n' })
        const faiths = rows.filter((r) => !HEADER.test(r[0]!)).slice(0, 4).map((r) => ({ id: slug(r[0]!), name: r[0]!, patrons: [] }))
        return reply(`${faiths.length} faiths.`, { world: stringify({ faiths }) })
      }
      case 'places': {
        const area = ids['area']?.[0] ?? 'first_area'
        const names = rows.map((r) => r[0]!).filter((n) => !HEADER.test(n) && n.length <= 40).slice(0, 8)
        if (!names.length || !start) return reply('Tell me the places first.', {}, ['Which places can the stranger stand in?'])
        const idsOf = names.map((n) => `loc_${slug(n)}`)
        const changes = names.map((n, i) => {
          const exits: Record<string, { to: string; minutes: number }> = { west: { to: i === 0 ? start : idsOf[i - 1]!, minutes: 5 } }
          if (i + 1 < names.length) exits['east'] = { to: idsOf[i + 1]!, minutes: 5 }
          const summary = rows[i]?.[1] ?? ''
          return { kind: 'location', id: idsOf[i]!, yaml: stringify({ id: idsOf[i], name: n, area, tags: ['public'], ...(summary ? { summary } : {}), description: { day: `You stand in ${n}. The air smells of dust and old smoke. It is quiet here. The way on runs east, and the way back runs west.\n` }, exits }) }
        })
        // The start gets its way on to the first of them, so every exit has a way back.
        if (facts.startRaw) {
          const exits = { ...((facts.startRaw['exits'] as Record<string, unknown> | undefined) ?? {}), east: { to: idsOf[0]!, minutes: 5 } }
          changes.push({ kind: 'location', id: start, yaml: stringify({ ...facts.startRaw, exits }) })
        }
        return reply(`${names.length} places in a row, joined to the start.`, { changes })
      }
      case 'professions': {
        const names = rows.map((r) => r[0]!).filter((n) => !HEADER.test(n) && n.length <= 30).slice(0, 8)
        if (!names.length) return reply('Tell me the trades first.', {}, ['What do people here do all day?'])
        const schedule = [{ from: '07:00', to: '08:00', activity: 'eat' }, { from: '08:00', to: '18:00', activity: 'work' }, { from: '18:00', to: '22:00', activity: 'home' }, { from: '22:00', to: '07:00', activity: 'sleep' }]
        return reply(`${names.length} trades.`, { changes: names.map((n) => ({ kind: 'profession', id: slug(n), yaml: stringify({ id: slug(n), name: n.toLowerCase(), schedule }) })) })
      }
      case 'people': {
        // A name is words with capitals ("Ada Wren", "Mirte"), not "Nobody yet".
        const people = rows.filter((r) => !HEADER.test(r[0]!) && /^[A-Z][a-z'-]+(?: [A-Z][a-z'-]+){0,3}$/.test(r[0]!) && !/^(Nobody|None|No one|Nothing)$/.test(r[0]!)).slice(0, 6)
        const trades = ids['profession'] ?? []
        const places = ids['location'] ?? []
        if (!people.length || !trades.length || !start) return reply('Tell me the people first.', {}, ['Who does the stranger meet first?'])
        const changes = people.map((r) => {
          const id = `npc_${slug(r[0]!)}`
          const rest = r.slice(1).join(' ').toLowerCase()
          const profession = trades.find((t) => rest.includes(t.replace(/_/g, ' '))) ?? trades[0]!
          const home = places.find((p) => rest.includes(p.replace(/^loc_/, '').replace(/_/g, ' '))) ?? start
          const pronoun = /\bshe\b|\bher\b|woman/.test(rest) ? 'she' : /\bhe\b|\bhis\b|\bman\b/.test(rest) ? 'he' : 'they'
          return { kind: 'npc', id, yaml: stringify({ id, name: r[0], short: `${r[0]!.split(' ')[0]} the ${profession.replace(/_/g, ' ')}`, pronoun, age: 40, profession, home, appearance: `Someone of ${name}, as plain as the day.`, personality: { warmth: 1, courage: 0, honesty: 1, temper: 0, curiosity: 1, diligence: 1 }, public_facts: [`${r[0]} lives in ${name}.`] }) }
        })
        return reply(`${changes.length} people.`, { changes })
      }
      case 'economy': {
        const goods = rows.filter((r) => !HEADER.test(r[0]!) && r[0]!.length <= 30).slice(0, 8)
        if (!goods.length) return reply('Tell me the goods first.', {}, ['What do people eat and use?'])
        const changes = goods.map((r) => {
          const id = slug(r[0]!)
          const value = Number(r.slice(1).join(' ').match(/\d+/)?.[0] ?? 2) || 2
          const food = /bread|stew|fish|soup|ration|meal|ale|beer|food|cake|cheese/i.test(r[0]!)
          return { kind: 'item', id, yaml: stringify({ id, name: r[0]!.toLowerCase(), description: `${r[0]}, as they have it in ${name}.`, value, ...(food ? { tags: ['food'], food: 20 } : {}) }) }
        })
        return reply(`${changes.length} goods.`, { changes })
      }
      case 'passages': {
        const places = (ids['location'] ?? []).filter((p) => p !== start)
        if (!start || !places.length) return reply('There is nowhere to go yet.', {}, ['Which places does it join?'])
        const kind = /\b(?:a|the)\s+([a-z]+(?: [a-z]+)?)/i.exec(firstLine)?.[1]?.toLowerCase() ?? 'cart'
        const other = places.at(-1)!
        const passage = { id: slug(kind), name: `the ${kind}`, kind, aliases: [kind], stops: [start, other], hours: '06-22', fare: 2, legs: { [`${start}>${other}`]: 30 }, water: false, crew: 'driver', text: 'You pay {fare} and ride. After {duration} you are at {place}.' }
        return reply(`The ${kind}, from the start to the far end.`, { changes: [{ kind: 'passage', id: passage.id, yaml: stringify(passage) }] })
      }
      case 'watcher':
        return reply('A friend is a signal here: warm for three days, and something shared.', {
          changes: [
            { kind: 'watcher', id: 'befriended', yaml: 'id: befriended\nsignal: befriended\nprobe: { befriended: 3 }\n' },
            { kind: 'aftermath', id: 'befriended', yaml: 'id: befriended\nsignal: befriended\nabout: first\ntopic: friendship\nexpires: 1\nsteps:\n  - id: tie\n    do: { set_tie: [$a, player], role: friend, bond: 2 }\n' },
          ],
        })
      case 'voice':
        return reply('A plain voice kit to start from.', { files: [{ path: 'data/voice.yaml', text: 'voice:\n  oaths: {}\n  sayings: []\n' }] })
      case 'palette':
        return reply('A picture style from your words.', { world: stringify({ pictures: { style: firstLine || `A small illustration of ${name}.` } }) })
      default:
        return reply('Tell me a little more first.', {}, ['What should this step hold?'])
    }
  }

  private draft(meta: Record<string, unknown>): string {
    if (this.mode === 'invalid') return 'Here is a lovely hamlet for you.'
    const ask = String(meta['ask'] ?? '')
    const focus = meta['focusRaw'] as Record<string, unknown> | undefined
    if (!/hamlet|gehucht/i.test(ask) || !focus) {
      return JSON.stringify({ say: 'I can write that, but a choice is yours first.', questions: [`Where should it go? Open the place it should join, and ask again.`], changes: [] })
    }
    const exits = { ...((focus['exits'] as Record<string, unknown> | undefined) ?? {}) }
    const opposite: Record<string, string> = { north: 'south', south: 'north', east: 'west', west: 'east', northeast: 'southwest', southwest: 'northeast', northwest: 'southeast', southeast: 'northwest' }
    const way = Object.keys(opposite).find((d) => !exits[d] && !exits[opposite[d]!]) ?? 'northwest'
    exits[way] = { to: 'loc_nettlecombe_green', minutes: 20 }
    const person = (id: string, name: string, short: string, pronoun: string, age: number, home: string, fact: string) =>
      `id: ${id}\nname: ${name}\nshort: ${short}\npronoun: ${pronoun}\nage: ${age}\nprofession: hamlet_folk\nhome: ${home}\nappearance: ${fact}\npersonality: { warmth: 1, courage: 0, honesty: 2, temper: 0, curiosity: 1, diligence: 1 }\npublic_facts:\n  - ${name} lives in Nettlecombe.\nknows_areas: [nettlecombe]\n`
    const changes = [
      { kind: 'area', id: 'nettlecombe', yaml: 'id: nettlecombe\nname: Nettlecombe\nkind: hamlet\nsummary: Three cottages round a well that has gone dry.\n' },
      { kind: 'profession', id: 'hamlet_folk', yaml: 'id: hamlet_folk\nname: cottager\nschedule:\n  - { from: "07:00", to: "08:00", activity: eat }\n  - { from: "08:00", to: "18:00", activity: work }\n  - { from: "18:00", to: "19:00", activity: eat }\n  - { from: "19:00", to: "22:00", activity: home }\n  - { from: "22:00", to: "07:00", activity: sleep }\n' },
      { kind: 'location', id: 'loc_nettlecombe_green', yaml: `id: loc_nettlecombe_green\nname: Nettlecombe, the Green\narea: nettlecombe\ntags: [public, social]\ndescription:\n  day: |\n    Three cottages lean together round a well with a broken windlass. The grass smells of nettles and dust. A cottage door stands open to the north, and the way back runs ${opposite[way]}.\nexits:\n  ${opposite[way]}: { to: ${String(focus['id'])}, minutes: 20 }\n  north: { to: loc_nettlecombe_cottage }\n` },
      { kind: 'location', id: 'loc_nettlecombe_cottage', yaml: 'id: loc_nettlecombe_cottage\nname: The Cottage by the Well\narea: nettlecombe\ntags: [private]\ndescription:\n  day: |\n    A low room with a cold hearth and three stools. It smells of damp stone. The door out to the green is south.\nexits:\n  south: { to: loc_nettlecombe_green }\n' },
      { kind: 'location', id: String(focus['id']), yaml: stringifyExits(focus, exits) },
      { kind: 'npc', id: 'npc_hob', yaml: person('npc_hob', 'Hob Tanner', 'Hob the cottager', 'he', 48, 'loc_nettlecombe_cottage', 'A stooped man with a bucket that never has water in it.') },
      { kind: 'npc', id: 'npc_nell', yaml: person('npc_nell', 'Nell Tanner', 'Nell the cottager', 'she', 45, 'loc_nettlecombe_cottage', 'A brisk woman with dust on her skirts.') },
      { kind: 'npc', id: 'npc_wat', yaml: person('npc_wat', 'Wat Tanner', 'Wat, the cottagers\' boy', 'he', 12, 'loc_nettlecombe_cottage', 'A boy with scraped knees and a stick.') },
      {
        kind: 'quest',
        id: 'the_dry_well',
        yaml: 'id: the_dry_well\nname: The Dry Well\nkind: request\nsummary: The well of Nettlecombe has gone dry.\ngivers: [npc_hob]\nstarts: { talk: [npc_hob] }\nask: "The well\'s gone dry. Three families, no water. Can you help?"\nstages:\n  - id: dry\n    text: The well of Nettlecombe has gone dry, and Hob asks for help.\nactions:\n  - id: clear_well\n    say: [\'clear (?:the )?well\']\n    at: [loc_nettlecombe_green]\n    text: You haul up stones and dead leaves until the water comes back.\n    effects: [{ set: well_cleared }]\n  - id: ask_nell\n    say: [\'ask nell about (?:the )?spring\']\n    with: npc_nell\n    text: Nell shows you the old spring behind the cottage.\n    effects: [{ set: spring_found }]\n  - id: carry_water\n    say: [\'carry water for (?:the )?tanners\']\n    at: [loc_nettlecombe_green]\n    minutes: 120\n    text: You carry water all morning until the butts are full.\n    effects: [{ set: water_carried }]\noutcomes:\n  - { id: cleared, name: The well cleared, text: "The well of Nettlecombe runs again.", when: [{ flag: well_cleared }] }\n  - { id: spring, name: The old spring, text: "The Tanners draw water from the old spring now.", when: [{ flag: spring_found }] }\n  - { id: carried, name: Water carried, text: "The butts are full, and that will do until the rain.", when: [{ flag: water_carried }] }\n',
      },
    ]
    return JSON.stringify({ say: 'A small hamlet of three cottagers and a dry well, joined to the place in view. The well can be cleared, the old spring found, or water carried.', questions: [], changes })
  }

  /** The group talk: one line each, from what each companion knows. */
  private party(meta: { party: { id: string; name: string; knows: string[] }[] }): string {
    if (this.mode === 'invalid') return 'They all talk at once.'
    return JSON.stringify({ lines: meta.party.map((p) => ({ speaker: p.id, text: p.knows[0]?.split(/(?<=[.!?])\s/)[0] ?? "Can't say I know much about that." })) })
  }

  private voice(meta: MockMeta): string {
    if (this.mode === 'invalid') return 'Mirte says hello, but not in JSON.'
    const name = meta.npcName.split(' ')[0]
    let speech: string
    const known = meta.known[0]
    if (meta.secret) speech = meta.secret
    else if (meta.check && /failure/.test(meta.check)) speech = "I don't think so."
    // In its own words, never recited (M10.28): the opening of the story, and a word of its own.
    else if (meta.act === 'AskStory' && known?.story && !known.toldBy && !known.tale) speech = `${known.story.split(/\s+/).slice(0, 9).join(' ').replace(/[,;:.]$/, '')}, they say. That is how my gran told it.`
    else if (known) speech = known.facts.slice(0, 2).join(' ')
    else if (meta.unknown.length) speech = `Can't say I know.${meta.referral ? ` Ask ${meta.referral.call}.` : ''}`
    else if (meta.act === 'Greet') speech = 'Evening to you.'
    else speech = 'Mm. That so?'

    if (this.mode === 'leak') speech = `My cousin swears ${this.leakName} wept for it. ${speech}`
    if (this.mode === 'long') speech = Array.from({ length: 12 }, () => speech).join(' ')
    // A word with nothing in this world to stand for it (M10.10: "okay" the guard now puts right as "aye").
    if (this.mode === 'anachronism') speech = `I'd look it up on my phone. ${speech}`
    if (this.mode === 'invent') speech = `${speech} Father Oswin would know more.`
    // A promise the game did not offer (M10.3): the guard must keep it out of the text.
    if (this.mode === 'promise') speech = `Come on, I'll take you there myself. ${speech}`
    if (this.mode === 'far') speech = `Salt comes dear from the Amber Coast these days. ${speech}`
    if (this.mode === 'twofar') speech = `Salt comes from the Amber Coast and tin from Kessmoor. ${speech}`
    const someone = this.someone ? { name: this.someone.name, pronoun: this.someone.pronoun ?? 'he', bond: this.someone.bond ?? meta.sketch?.bonds[0] ?? 'cousin', place: this.someone.place ?? meta.sketch?.places[0] ?? 'nowhere', what: this.someone.what ?? 'a carter' } : undefined
    if (someone) speech = `My ${someone.bond} ${someone.name} is ${someone.what} in ${someone.place}. ${speech}`
    const words = speech.split(/\s+/)
    if (this.mode === 'good' && words.length > meta.wordLimit) speech = words.slice(0, meta.wordLimit).join(' ').replace(/[,;:]?$/, '.')

    const topics = this.mode === 'topics' ? ['not_a_topic', ...(known ? [known.topic] : [])] : [...(known ? [known.topic] : []), ...(meta.referral && !known ? [meta.referral.npc] : [])]
    return JSON.stringify({
      act: meta.act,
      reply: `${name} looks up. "${speech}"`,
      names: this.mode === 'far' ? [{ text: 'Amber Coast', new_kind: 'land' }] : this.mode === 'twofar' ? [{ text: 'Amber Coast', new_kind: 'land' }, { text: 'Kessmoor', new_kind: 'city' }] : [],
      mentioned_topics: topics,
      effects: this.mode === 'good' && known ? [{ type: 'affinity', delta: 1, reason: 'a friendly question' }] : [],
      memory_note: known ? `The stranger asked me about ${known.topic}.` : 'The stranger talked to me.',
      ends_conversation: false,
      keep_talking: 'no',
      ...(meta.questActions?.length ? { quest_action: this.mode === 'good' ? (recognised(meta) ?? 'none') : 'none' } : {}),
      ...(meta.offers?.length ? (this.mode === 'promise' ? { action: 'none', propose: 'none' } : offerChoice(meta)) : {}),
      ...(meta.after && this.mode === 'good' ? { after: meta.after } : {}),
      // A claim the test has the mock read, if one may be read this turn.
      ...(this.claim && meta.claimable?.includes(this.claim.subject) ? { claim: this.claim } : {}),
      ...(someone ? { person: someone } : meta.sketch ? { person: { name: '', pronoun: 'they', bond: 'none', place: 'none', what: '' } } : {}),
    })
  }

  /** A chronicler that writes plainly from the overview; 'invent' makes up a priest, 'lookup' asks first, 'quest' makes a request. */
  private chronicler(meta: ChronicleMeta, prompt: string): string {
    const empty = { lookup: [] as string[], lore: [] as unknown[], lines: [] as unknown[], quests: [] as unknown[], thoughts: [] as unknown[], news: [] as unknown[] }
    if (this.mode === 'invalid') return 'The chronicle, in prose.'
    const people = meta.cards.filter((c) => c.kind === 'person')
    if (this.mode === 'lookup' && meta.lookupsLeft > 0 && !prompt.includes('LOOKED UP') && people[0]) return JSON.stringify({ ...empty, lookup: [people[0].key] })
    const name = (key: string) => meta.cards.find((c) => c.key === key)?.name ?? key
    const reply = { ...empty }
    for (const line of meta.lines) {
      if (line.belang >= 3) {
        reply.lore.push({
          line: line.key,
          name: `The Tale of ${line.title.replace(/^the /i, '')}`,
          summary: line.text,
          details: line.text,
          story: `${line.text}${this.mode === 'invent' ? ' Father Oswin saw it too.' : ' Nobody who saw it has slept well since.'}`,
          far: 'Something bad happened out in the fen, they say.',
          teller: line.witnesses[0] ?? '',
          links: [],
          // What it says, on the event it rests on (M9.2).
          claims: [{ event: line.event, subject: line.who[0] ?? line.place, key: 'present', value: 'yes' }],
        })
      }
      reply.lines.push({ line: line.key, summary: [line.text], roles: line.who[0] ? [{ role: 'subject', who: line.who[0] }] : [], hooks: ['What comes of it now?'], next: 'People will talk.', close: false })
      const others = people.filter((p) => !line.who.includes(p.key))
      if (this.mode === 'quest' && others.length >= 2) {
        reply.quests.push({ request: '', line: line.key, template: 'visit', giver: others[0]!.key, item: '', target: others[1]!.key, name: `Word to ${others[1]!.name}`, ask: `Would you look in on ${others[1]!.name} for me?`, stakes: 'Someone should.' })
      }
      const debtor = people.find((p) => /PRIVATE: .* is (her|his|their) creditor/.test(p.text))
      if (debtor && line.who[0]) reply.thoughts.push({ who: debtor.key, text: `You still owe ${name(line.who[0])} money, and now there is nobody to pay it to.` })
    }
    const area = meta.cards.find((c) => c.kind === 'area')
    if (area && meta.lines[0]) reply.news.push({ area: area.key, text: meta.lines[0].text })
    // The player's words (M10.24): the mock keeps them in mind, and says so.
    if (meta.wishes?.length) Object.assign(reply, { heard: meta.wishes.map((w) => ({ note: w.id, did: `Kept in mind this round: ${w.text.replace(/[.!?]+$/, '')}.` })) })
    if (this.chronicle) {
      const planned = meta.lines.find((l) => new RegExp(`${l.key} ".*" ?.*PLAN`).test(prompt))?.key
      return JSON.stringify({ ...reply, ...this.chronicle(meta, planned) })
    }
    // 'plan': a small shift between two realms, and consequences for a storyline marked PLAN (M7.2).
    if (this.mode === 'plan') {
      const realms = meta.cards.filter((c) => c.kind === 'realm')
      const planned = meta.lines.find((l) => new RegExp(`${l.key} ".*" ?.*PLAN`).test(prompt))
      const place = meta.cards.find((c) => c.kind === 'place')
      return JSON.stringify({
        ...reply,
        tensions: realms.length >= 2 ? [{ between: [realms[0]!.key, realms[1]!.key], delta: 9, why: 'what happened in the fen' }] : [],
        plans: planned && place && area ? [{ line: planned.key, name: 'After the burning', phases: [{ after: 0, effects: [{ place: place.key, state: 'damaged' }, { news: 'Nobody goes near the place now.', area: area.key }] }, { after: 48, effects: [{ place: place.key, state: 'normal' }, { market: 'i99', factor: 3 }] }] }] : [],
      })
    }
    return JSON.stringify(reply)
  }

  /** Old lore retold as legend (M9.1); 'invent' lets a living name slip into the first. */
  private legends(ids: string[]): string {
    return JSON.stringify({
      legends: ids.map((id, i) => ({
        id,
        name: 'the stranger and the drowned bell',
        summary: `${this.mode === 'invent' && i === 0 ? 'Mirte' : 'A stranger'} came to the fen long ago, and the water was never the same after.`,
        details: 'Some say the stranger made a bargain with the water. Others say the stranger only listened.',
        story: 'My grandmother saw the stranger once, by the quay. Thin, she said, and quiet. The next spring the dykes held. Nobody thanked them. That is how it is here.',
        far: 'A tale from the fen about a stranger and the water.',
      })),
    })
  }

  /** A far place made playable (M9.1): words for its three places and two people; 'invalid' writes one sentence too few. */
  private farPlace(name: string, named: { key: string; name: string; pronoun: string }[] = []): string {
    const short = this.mode === 'invalid'
    return JSON.stringify({
      places: [
        { key: 'gate', name: 'the Lantern Gate', description: short ? `You are at the gate.` : `You pass under the Lantern Gate of ${name}, where the road from the fen ends in cobbles. The stones ring under the cart wheels, and the gatekeeper's dog barks at every stranger. A lamp burns over the arch even by day. The market lies within, and the road home runs back the way you came.` },
        { key: 'market', name: 'the Salt Market', description: `You stand in the Salt Market, where the Cog League's merchants weigh everything twice. It smells of brine and lamp oil. Nobody looks up when you pass. The Carters' Rest is at the corner, and the gate is back out.` },
        { key: 'inn', name: "the Carters' Rest", description: `You step into the Carters' Rest, low and smoky, full of men from the Oostweg. The beer is sour and the fire is good. Someone is singing badly about a drowned bell. The market is back out.` },
      ],
      people: [
        { key: 'merchant', name: 'Wendel Hoorn', pronoun: 'he', looks: 'A thin man in a good coat, with a scale on a chain at his belt.', speech: 'Short, and always about the price.', fact: 'Wendel Hoorn buys rye from the Nethermarch and sells it dearer to the League.' },
        { key: 'innkeeper', name: 'Aleid Kramer', pronoun: 'she', looks: 'A broad woman with flour on her sleeves and keys at her hip.', speech: 'Loud and kind.', fact: 'Aleid Kramer knows every carter on the Oostweg by name.' },
        // People named in talks who live here (M10.9): the same first name, a family name of the place.
        ...named.map((n) => ({ key: n.key, name: `${n.name} Brinkman`, pronoun: n.pronoun === 'she' ? 'she' : 'he', looks: 'Someone with the look of a long road about them.', speech: 'Slow, and glad of news from home.', fact: `${n.name} Brinkman keeps a stall by the Salt Market.` })),
      ],
    })
  }

  /** A far place, worked out plainly; 'invent' reuses a name that is already taken. */
  private outline(name: string): string {
    return JSON.stringify({
      summary: `${name} is a busy place of brick and water, two days from the fen. The Count's banner hangs over its gate.`,
      areas: [{ name: 'the Harbour Quarter', text: 'Quays, warehouses and the fish market.' }],
      places: [
        { name: this.mode === 'invent' ? 'Veenhoek' : 'the Lantern Gate', kind: 'gate', text: 'The east gate, where the barge from the Holleveen comes in.' },
        { name: 'the Salt Hall', kind: 'guild hall', text: 'Where the salt merchants meet and quarrel.' },
      ],
      routes: [{ to: 'the Holleveen', text: 'By barge along the Graafse Vaart, two days.' }],
      people: [{ role: 'the harbour master', text: 'Takes a coin from every barge, and another if you argue.' }],
      dangers: ['Cutpurses in the fish market.'],
      lore: [{ name: 'the drowned bell', text: 'A bell under the harbour that rings before a storm.' }],
    })
  }

  private other(request: LlmRequest): string {
    const properties = (request.schema['properties'] ?? {}) as Record<string, unknown>
    // The second look at big lore (M9.2): what the story says that the facts do not.
    if (request.schemaName === 'lore_check') {
      const meta = request.meta as { story: string; facts: string[] }
      return JSON.stringify({ invented: this.judge ? this.judge(meta.story, meta.facts) : this.mode === 'invent' && /Father Oswin/.test(meta.story) ? ['Father Oswin saw it'] : [] })
    }
    // One line in a chat the player overhears (M9.1).
    if (request.schemaName === 'chat_line') return this.mode === 'invalid' ? 'Hmm.' : JSON.stringify({ line: `Is that so? Well, I never heard the like of it.` })
    // The read score (M10.28): every answer mostly fine, the last one weakest.
    if (request.schemaName === 'read_score') {
      if (this.mode === 'invalid') return 'They read well.'
      const count = (request.meta as { count: number }).count
      return JSON.stringify({ answers: Array.from({ length: count }, (_, i) => ({ n: i + 1, person: 2, natural: 2, answers: 2, onward: i === count - 1 ? 0 : 1, invented: i === 0 ? 1 : 0, hints: i === 1 ? 1 : 0 })), weakest: [{ n: count, why: 'It stops the talk dead.' }] })
    }
    // The spark of a quiet night (M10.27): something stays on the first person's mind, from the first storyline.
    if (request.schemaName === 'spark') {
      if (this.mode === 'invalid') return 'Something happens.'
      const meta = request.meta as { lines: string[]; people: string[] }
      return JSON.stringify({ line: meta.lines[0] ?? 'none', verb: 'thought', who: meta.people[0] ?? 'none', target: 'none', detail: 'You keep thinking about what happened, and you would like to talk it over with someone.' })
    }
    if (!('goals' in properties)) return '{}'
    const meta = request.meta as { places?: string[]; people?: string[]; npc?: string; lookups?: boolean } | undefined
    // Questions first, when a test wants them (M9.3).
    if (meta?.lookups && this.ask) {
      const questions = this.ask(String(meta.npc ?? ''), request.meta?.['keys'] as Record<string, string>)
      if (questions.length) return JSON.stringify({ goals: [], lookup: questions })
    }
    if (this.heard && /LOOKED UP:/.test(request.prompt)) this.heard(request.prompt.slice(request.prompt.indexOf('LOOKED UP:')))
    if (this.mode === 'invalid') return 'I think she should bake.'
    // 'invent' breaks every rule the validator knows: a goal not in the list, a place nobody knows, a gate.
    if (this.mode === 'invent')
      return JSON.stringify({
        goals: [
          { type: 'Steal', target: 'npc_lubbert', priority: 0.9, why: 'He is rich.' },
          { type: 'Visit', target: 'loc_the_moon', priority: 2, why: 'Why not.' },
        ],
        mood: 'wild',
        note: 'Made up.',
      })
    const place = meta?.places?.find((p) => !p.includes('house') && !p.includes('home')) ?? meta?.places?.[0]
    const goals = place ? [{ type: 'Visit', target: place, priority: 0.8, why: 'To see how things stand.' }] : []
    const m = (request.meta ?? {}) as { npc?: string; intentions?: string[]; keys?: Record<string, string> }
    const intention = 'intention' in properties ? { intention: { fill: [], ...(this.intend?.(m.npc ?? '', m.intentions ?? [], m.keys ?? {}) ?? { choice: 'none' }) } } : {}
    return JSON.stringify({ goals: [...goals, { type: 'Work', target: 'none', priority: 0.5, why: 'There is work to do.' }], mood: 'calm', note: 'A plain day.', ...intention })
  }
}

/** A place as YAML with new exits, for the mock's proposals. */
function stringifyExits(place: Record<string, unknown>, exits: Record<string, unknown>): string {
  return stringify({ ...place, exits })
}

/** A header cell of a pasted table, or a word that names a column rather than a thing. */
const HEADER = /^(month|months|name|names|coin|coins|value|place|places|person|people|item|items|good|goods|trade|trades|day|days|faith|faiths|price|prices|who|what|where)$/i

/** What the designer wrote, as records (M10.20): a table row as its cells, a list item or a line as one cell. */
function rowsOf(said: string): string[][] {
  return said
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !/^\|?\s*:?-{2,}/.test(l) && !/^#/.test(l))
    .map((l) =>
      l.includes('|')
        ? l.replace(/^\||\|$/g, '').split('|').map((c) => c.trim()).filter(Boolean)
        : l.includes('\t')
          ? l.split('\t').map((c) => c.trim()).filter(Boolean)
          : [l.replace(/^(?:[-*\u2022]|\d+[.)])\s+/, '').replace(/[.:]$/, '').trim()],
    )
    .filter((r) => r.length && r[0])
}

function slug(text: string): string {
  return text.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 30) || 'x'
}

// The chronicler as world builder (M10.17; Bram, 28 September 2026): how the
// editor's writing aid makes a new world with the designer, step by step. The
// general part of its instruction, and per step what to ask the designer, what
// it fills, what the engine does when the step is skipped, and what to check
// before proposing. What each kind can hold is in the content contract
// (docs/CONTENT.md, from src/engine/contract.ts); this is the way through it.
// The lessons learnt come from building the second test world, Deepwell
// (tests/worlds/other), a science-fiction world that shares nothing with the
// Nethermarch but the engine.

export interface WorldStep {
  id: 'frame' | 'voice' | 'lands' | 'calendar' | 'money' | 'faiths' | 'palette' | 'places' | 'people' | 'professions' | 'passages' | 'economy' | 'watcher'
  /** A short English label for the editor tab. */
  title: string
  /** What to ask the designer, in order; at most three. */
  ask: string[]
  /** What the step writes: a kind of the contract, and for world.yaml the top-level keys. */
  fills: { kind: string; keys?: string[] }[]
  optional: boolean
  /** What the engine does when the step is skipped: the neutral default. */
  skipped: string
  /** What the chronicler checks before proposing. */
  checks: string[]
  /** The instruction to the model for this step. */
  prompt: string
}

/** The general part of the system prompt when the chronicler builds a new world with the designer. */
/**
 * The place rules of CLAUDE.md, word for word for the chronicler (M10.20; the
 * first real build, The Quiet Reach, averaged 88 words a place where the
 * Nethermarch has 56, named no topic in [brackets], listed every way out and
 * opened each place with its own name), with two places of the Nethermarch
 * for the measure. The Places step and the polish round both carry them.
 */
export const PLACE_RULES = [
  'HOW A PLACE READS (every description, day and night):',
  '- Three to five sentences, at most 70 words. Second person, present tense.',
  '- One sense that is not sight: a smell, a sound, cold or damp, the feel of a floor.',
  '- One hint at a way out, woven into a sentence ("The sluice is back to the east."). Never a list of every exit: the game shows the exits itself.',
  '- Topics in [brackets]: a person, place, faith or story the stranger can ask about, where the place brings it up, as [Chapel] or [Harbour Record]; at most two a place.',
  '- One image that could only be in this world, in its own things and words.',
  '- Do not open with the place\'s own name (the title above says it), and no two places open alike.',
  'Two places of another world, for the measure only (never borrow their names or things):',
  '"Great grey stones lie in a row on the heath, a capstone balanced on them like a table for giants. Three burial mounds rise beyond, furred with heather. The wind carries the smell of sheep and sand. The road to [Hunnenloo] runs away north-east; Waagdam lies to the south-west." (49 words)',
  '"West of the sluice the tow path runs on along the water towards [Graafhaven], two days away. Here a flat ferry boat is tied to a landing of black planks, and a rope runs from a post across the water to the far bank. The rope drips and creaks when the wind leans on it. The sluice is back to the east." (62 words)',
].join('\n')

export const WORLD_GUIDE = `YOU ARE BUILDING A NEW WORLD WITH THE DESIGNER, one step at a time. The designer decides; you ask, propose and check.

HOW YOU WORK
- Do one step at a time, in the order the builder gives. Read what the world already has before you propose anything.
- Ask before you invent. Every name, genre, tone, faith, coin and calendar belongs to the designer. Ask at most three questions at a time, each with a short proposal the designer can accept with a yes ("Months: thirteen names of your own, or numbered months?"). When the designer says "you choose", choose once, say what you chose, and keep to it.
- Propose in full and small: the world.yaml keys this step sets in \`world\`, every entity in \`changes\` as full YAML (one mapping with its id), and only CHRONICLER.md, data/voice.yaml or data/journey.yaml, whole, in \`files\`. The builder shows a diff, checks it and saves only what the designer accepts.
- What the designer leaves out stays out. The engine gives every missing file or field a neutral default (see "skipped" per step). Never fill a gap with a value from another world: no Nethermarch names, coins, saints, law or barges in a world that is not the Nethermarch.
- The designer may paste tables (rows with | or tabs) and lists. Read each row as a record and each column as a field: a table of months is the calendar, a table of coins or prices is the money and the prices, a list of names is the people or the places. Keep their names and numbers as they wrote them.
- Keep to the frame once it is agreed. A science-fiction world has no magic, a world without faith has no prayers or oaths by a god, a world without a map is walked by its exits.

THE RULES OF THE CONTENT
- Ids are lowercase with underscores, with the usual prefixes (loc_ for places, npc_ for people), and never change once saved. Names and descriptions may change freely.
- A place description has three to five sentences, in the second person and the present tense, with one sense that is not sight and a hint at a way out. Topics people can talk about go in [brackets], and every bracketed topic must exist (or be added in the same proposal).
- Everything a description brings in with "a" or "an" (a pump, a poster, a timetable) gets a detail with its own look, and a take line where someone might try. Where a verb fits (drink, climb, read, open), give it a line. If a phrase only sounds like a thing ("a long walk"), write it differently.
- English with British spelling. PEGI 18 with hard limits: nothing sexual involving minors, no hate against real groups, romance non-explicit.
- Write YAML that parses: put a text in double quotes when it holds ": " or starts with a quote, a bracket or a dash.

LESSONS FROM BUILDING A WORLD FROM SCRATCH
- One broken YAML file makes every reference to its entities fail elsewhere ("unknown location ..."). Fix the first error first; most of the rest go with it.
- Top-level keys are exact: \`aftermath:\` (not aftermaths), \`object_types:\`, \`passages:\`, \`settlements:\`.
- A workshop must stand in the area of its settlement. Work done elsewhere (a mine, a quarry) needs a ledger of its own for that area, even with no one living there.
- Every good that is used (by a settlement, a workshop or an object) must be made somewhere or brought by a route. A village, town, hamlet or inn needs a ledger, or its counters keep a fixed supply.
- Places reached only by a line of transport also get a way on foot (a service tunnel, a coast path), so the world stays reachable on the days the line does not run.
- Without a region map, a line of transport needs its minutes for every pair of stops that follow each other (legs), and its days use the world's own weekday names.
- The law needs an officer who is a person of the world and an office that is a place. Add them in the same proposal, or leave the law out.
- Schedules: the first block that matches the time wins, so put meals before the working block they fall in, and cover all twenty-four hours.
- Prices, fares and the player's money are in the smallest coin.
- Test before you are done: the builder's Check has no errors, "Worth a look" and "Named, but no detail" are empty or accepted, and a short play reaches every place, buys a meal and, if there is one, takes the line of transport.`

export const WORLD_STEPS: readonly WorldStep[] = [
  {
    id: 'frame',
    title: 'Frame',
    ask: [
      'What kind of world is it, in a sentence or two: its genre and tone, and what does not exist in it (magic, faster-than-light travel, guns)?',
      'Where does the story begin, and why is the stranger there?',
      'What are the names: the world, the wider land, the region where play happens, and where the stranger comes from?',
    ],
    fills: [{ kind: 'world', keys: ['name', 'frame', 'words', 'intro'] }],
    optional: false,
    skipped: 'A world always has a frame; left as the builder made it, every model call gets only the world\'s name and writes a generic world.',
    checks: [
      'The frame has a WORLD, a REGION and a PEOPLE part, and says what money, faith and technology there are.',
      'words.land, words.region and words.from are set and fit the frame; words.sleep, if given, has one sentence each for a rented room, a bed at home and sleeping rough.',
      'CHRONICLER.md names what must be kept (names, tone) and what must not be invented.',
      'Nothing breaks the hard limits.',
    ],
    prompt:
      'STEP: THE FRAME. Agree the kind of world, the start of the story and the names with the designer. Then propose in `world`: name, frame (the fixed block every model call gets: WORLD with the setting, the era, money, faith and what does not exist; REGION with where play happens and why the stranger is there; PEOPLE with how they speak and count time), words (land, region, from, and sleep with a sentence each for room, home and rough, how a night\'s sleep reads here; left out, a blanket, your own bed and "The cold gets into your bones.") and intro (two or three short paragraphs in the second person, ending with "Type LOOK to look around. Type HELP if you are lost."). Propose CHRONICLER.md in `files`: "## This world: <name>" and a short list of what the chronicler must keep to and must not invent.',
  },
  {
    id: 'voice',
    title: 'Voice',
    ask: [
      'How do people speak: their oaths, a saying or two, how they call a stranger?',
      'How do they tell time and measure distance?',
      'What words must never come up, because the thing does not exist here?',
    ],
    fills: [{ kind: 'voice' }],
    optional: true,
    skipped: 'Only the fixed core is kept out (a model speaking of models); nothing else counts as out of place, so in a science-fiction world a computer is fine.',
    checks: [
      'Oaths are keyed by a faith that exists; before the faith step there is none, so a group\'s own exclamations go on the group and the faith step adds the faiths\' oaths.',
      'What does not exist fits the frame (no magic in science fiction, no guns in a world without them).',
      'Sayings are rare and short.',
    ],
    prompt:
      'STEP: THE VOICE. Agree how people speak with the designer. Propose data/voice.yaml in `files`, in the shape the builder shows for voice, with the oaths (keyed by faith id only), sayings, groups (by the areas people live in or their professions, each with its own sayings and oaths: what technicians or coast folk exclaim goes on their group), forms of address, time and measures, and the words that do not exist here. This step comes right after the frame (M10.20), so every place and person after it is written in this voice: faiths, places and professions do not exist yet, so oaths keyed by faith wait for the faith step, and a group names its areas and professions once the places and professions steps have made them (until then a group has only its name, sayings and oaths).',
  },
  {
    id: 'lands',
    title: 'Lands',
    ask: [
      'Is it all one land, or are there other lands with a frame of their own: another tongue, other coins, another law?',
      'Which areas or regions belong to each, and where are the borders: a bridge, a pass, a toll house, a harbour?',
      'How well do the lands know each other: not at all, by rumour, by trade, or close with daily traffic?',
    ],
    fills: [{ kind: 'land' }, { kind: 'areas', keys: ['land', 'border', 'blend'] }, { kind: 'world', keys: ['reach'] }],
    optional: true,
    skipped: 'One land: the world is its home land and every area is of it. Between lands the reach is worked out from the content: close where a way on foot crosses, trade along a line of transport or a route, and none elsewhere.',
    checks: [
      'Only lands the designer or the world book names: what they do not assign stays the home land, and no land is guessed.',
      'Every new land is a whole file lands/<id>/land.yaml under the key land:, with id (its folder), name and frame; what it leaves out it takes from the world, the calendar always.',
      'A border is an area with border: true, where the crossing can be shown; an area of another land has land: <id>, and one that shades into its neighbour has blend: <land>.',
      'reach names lands of this world, the home land by the world id, with none, rumour, trade or close.',
    ],
    prompt:
      'STEP: LANDS. Agree with the designer which lands there are besides the home land (the world itself), which areas belong to each, where the borders are and how well the lands know each other. Propose each new land in `files` as lands/<id>/land.yaml, whole, under the key land: (id, name, frame, and only what differs from the world: words, names, faiths, money with units and rate, law, standing, sketch, palette, and language only if its people speak a tongue the stranger does not know), and its voice kit as lands/<id>/voice.yaml if its people speak otherwise. Give areas their land, border or blend as changes of kind area with merge: true. Put reach in `world`: a list of { between: [land, land], reach: none | rumour | trade | close, why }. A land nobody names is not made: without this step the world is one land.',
  },
  {
    id: 'calendar',
    title: 'Calendar and weather',
    ask: [
      'How do people count years: what is the era called, and which year is it when the story starts?',
      'The year has a fixed shape for now: twelve months of thirty days and five loose days at the end, so only the names of the thirteen and the season of each month are yours. Names of your own or numbered? And how many days has a week, and what are they called?',
      'Is there weather where the story plays? If so, which seasons and what kind of weather in each; if not (a dome, a ship), it stays out on purpose.',
    ],
    fills: [{ kind: 'world', keys: ['calendar', 'start', 'weather', 'bells'] }],
    optional: true,
    skipped: 'The standard calendar, with the start as the builder made it, and no weather at all: no sky, no wind, nothing about it in the clock.',
    checks: [
      'There are exactly thirteen month names, all different.',
      'Weekday names are all different; a week may have any number of days; start_weekday, if given, is one of them.',
      'start.month is 1 to 13 and start.day fits the month (1 to 30, or 1 to 5 in the thirteenth).',
      'Market days, passage days and opening days elsewhere use these weekday names.',
      'With weather: seasons names a season for each of the thirteen months, every season has its chances, and lines (if any) say the sky in the world\'s own words.',
      'A bell (or a siren, a horn, a call to prayer) hangs at a place that exists, rings at hours from 0 to 23, is heard in areas that exist, and has a line with {hour} ("six", "noon", "midnight"); left out, there are no bells.',
    ],
    prompt:
      'STEP: THE CALENDAR AND THE WEATHER. Agree the era, the year, the months, the week and the weather with the designer. Propose in `world`: calendar (era, months as thirteen names, weekdays as the list of names, and start_weekday: the weekday of the first morning; left out, the story starts on the first day of the week), start (year, month, day, hour, minute of the first morning) and, only if there is weather, weather. The weather has exact fields and values: seasons (thirteen season names, one per month); chances (per season, weights for the seven kinds of weather the engine knows, and only those: clear, overcast, rain, fog, storm, frost, snow); stay (a chance from 0 to 1 that the weather holds from one change to the next, 0.5 as a rule); prevailing (one of north, north-east, east, south-east, south, south-west, west, north-west); readers (profession ids of those who read the sky, or none yet); lines (per kind of weather, one sentence or a day and a night sentence, in the world\'s own words). A kind of weather the designer names that the engine lacks goes under the nearest one: cloudy under overcast, drizzle under rain, hail and sleet under snow, gales under storm. Nothing else goes in weather. The shape of the year is fixed for now (Bram, 29 September 2026): twelve months of thirty days and five loose days as the thirteenth. Only the names of the months and the season of each are the designer\'s; say so plainly when they ask for another shape, so nobody counts on one. Leave weather out for a world under a dome or on a ship: it then has none. If time is rung out (a church bell, a harbour bell, a shift siren), propose bells in `world`: id, name, at (the place), hours, heard (the areas that hear it; default the area of at), far (areas that hear it faintly), line with {hour}, and far_line.',
  },
  {
    id: 'money',
    title: 'Money',
    ask: [
      'What do people pay with, from the smallest to the largest, and how many of the smaller make one of the larger?',
      'What does a meal cost, a night\'s lodging, and a day\'s wage?',
      'What does the stranger carry at the start: money and a few things?',
    ],
    fills: [{ kind: 'world', keys: ['money', 'player'] }, { kind: 'items' }],
    optional: true,
    skipped: 'One neutral coin (c), and prices are plain numbers.',
    checks: [
      'The smallest unit has value 1, and every other value is how many of the smallest it is worth.',
      'Short names are all different; aliases (other words for a coin, as people say them) belong to one coin only.',
      'The player\'s money is enough for a few days of food and not much more, in the smallest unit.',
      'Everything the stranger carries at the start is in the player\'s inventory, and each is an item: one that exists, or one this step proposes.',
    ],
    prompt:
      'STEP: MONEY. Agree the coins and a few prices with the designer. Propose in `world`: money.units (short, name, value, from largest to smallest, the smallest with value 1, and aliases: other words the player may use for it) and player (money in the smallest unit, inventory by item id). What the stranger carries at the start (a knife, a coat, a terminal) goes in the inventory, and each thing that does not exist yet is proposed here as an item in `changes` (id, name, description, value in the smallest unit, tags), not left for the economy step (M10.20: the starting kit of The Quiet Reach waited for a step that never came). Keep the other prices the designer gave for the economy step.',
  },
  {
    id: 'faiths',
    title: 'Faiths',
    ask: [
      'Is there faith in this world? If so, which, and whom do they call on?',
      'If there is none: what do people swear by instead (the ship, the sea, their mothers)?',
      'When the stranger dies and wakes again, what do they see, who guides them back, and what rite (or price) do the living keep?',
    ],
    fills: [{ kind: 'voice' },
      { kind: 'world', keys: ['faiths'] },
      { kind: 'rules', keys: ['death', 'patrons'] },
    ],
    optional: true,
    skipped: 'No faith: nobody prays, and the voice swears by nothing holy; death is told in plain words, with no guide, no rite and no price.',
    checks: [
      'Every faith has an id, a name and its patrons, and the frame mentions it; its faction, if it has one, exists (or is added in the people step), and every patron is in the rules with what swearing to them means (sworn).',
      'A holy place names its faith (faith on the location), so that a wedding there raises that faith\'s faction.',
      'With no faith, faiths is an empty list and the frame says what people swear by.',
      'No real religion is mocked or used.',
      'Death fits the frame: a guide and a patron only where there is faith; {guide} and {lost} stand in the texts that need them; a price names a place and an item that exist.',
    ],
    prompt:
      'STEP: FAITHS. Agree with the designer whether there is faith. Propose in `world`: faiths (id, name, patrons, and faction if the faith is also a group with a standing), or an empty list when there is none. Propose the patrons in `changes` as kind patron (id, name, text: who they are to the faithful, and sworn: the deed companions judge when the stranger swears to that patron; a world without characters may have them all the same, and the faith names its patrons), and give holy places their faith. Say in `say` what people swear by, for the voice step. If the designer wants death to have its own words, propose death in `rules` (vision with {guide}, guide, patron, wake, mark with {lost}, rite_where, rite_done, rite_nothing, and a price only if the designer asks for one); otherwise leave it out and death reads plain. If data/voice.yaml exists (the voice step comes before this one), add each faith\'s oaths to it under voice.oaths, keyed by the faith\'s id, and send data/voice.yaml whole in `files`.',
  },
  {
    id: 'places',
    title: 'Places',
    ask: [
      'Which areas are there (a village, a town, an inn, a stretch of wild land), and what kind is each?',
      'Which places can the stranger stand in (five to ten to begin with), and which is the first?',
      'How do they connect, and how many minutes is it between them?',
    ],
    fills: [{ kind: 'voice' },
      { kind: 'areas' },
      { kind: 'locations' },
      { kind: 'world', keys: ['start'] },
    ],
    optional: false,
    skipped: 'A world needs at least one area and one place, the start; the builder\'s first place stays.',
    checks: [
      'Every description keeps the place rules below: three to five sentences and at most 70 words, second person, present tense, a sense that is not sight, a hint at one way out and not a list, topics in [brackets], one image of this world only, not opening with its own name, and no two places opening alike.',
      'Every thing a description brings in with "a" or "an" has a detail.',
      'The start location exists, and every place can be reached from it by exits.',
      'Places reached only by a line of transport also have a way on foot.',
      'An area that is barred (a mist, a gate, a curse) says when (conditions that can stop holding: the night, a storm, a weekday, a flag), whom it bars if not everyone (carrying: only someone with a thing of this tag, as the surveyor with his chains), and what turns the stranger back.',
      'Every [bracketed] topic exists or is added.',
      'A place or an area may have a sound: a kind (wind, reeds, rain, sea, surf, hearth, crowd, workshop, water, birds, hum, quiet), or a kind with a level from 0 to 1 and another kind at night; a place\'s own sound wins over its area\'s, and the weather adds its own. Left out: silence. The app makes the sound itself, so no sound files are needed.',
      'Where the stranger may try what the rules know no way for (an offering at a shrine, a word to a spirit, a curse, a bit of lore or craft), the place, its area or the object gets improvise: a domain (offering, curse, spirit, lore or craft), what the act may do (may: an item, an object\'s state, a condition from the rules, a standing with a faction, or a fact), a fallback line for without a model, and takes only if it may spend what the stranger offers. Left out: the fixed answer ("You think better of it").',
    ],
    prompt:
      'STEP: PLACES. Agree the areas and the places with the designer. Propose areas and locations in `changes` (an area that turns the stranger back while something holds gets barred: when, carrying if it bars only someone who carries a thing of that tag, and the text; each location with its area, tags, aliases, summary, description with day and, where it differs, night, exits with minutes, and details), and start.location in `world`. The builder adds the way back for every exit. Give areas, and places that sound different from their area (an inn, a workshop, a shore), a sound. Give improvise to the places, areas and objects where the unexpected belongs (a shrine, a haunted pool, a spirit\'s hill), with the smallest may that fits. If data/voice.yaml has a group of speakers by where they live, give it the areas it now can (send data/voice.yaml whole in `files`).',
  },
  {
    id: 'professions',
    title: 'Professions',
    ask: [
      'What do people here do all day: which trades and duties are there?',
      'When do they work, eat and sleep (a working day, shifts, a night watch)?',
    ],
    fills: [{ kind: 'voice' }, { kind: 'professions' }],
    optional: true,
    skipped: 'People keep to their homes.',
    checks: [
      'Each schedule covers all twenty-four hours.',
      'Meals come before the working block they fall in: the first block that matches wins.',
      'Activities are sleep, work, eat, socialize, pray, free or home; pray only where there is faith.',
    ],
    prompt:
      'STEP: PROFESSIONS. Agree the trades and their hours with the designer. Propose professions in `changes`: id, name and a schedule of blocks (from, to, activity), and teaches where a trade can be learnt. If data/voice.yaml has a group of speakers by what they do, give it the professions it now can (send data/voice.yaml whole in `files`).',
  },
  {
    id: 'people',
    title: 'People',
    ask: [
      'Who does the stranger meet first (three to six people): what do they do, where do they live and work, and which peoples are they (and who distrusts whom)?',
      'Who keeps the law, where, and what do the worst and the least offences cost? Are there groups the stranger could join (a guild, an order, a crew), and on what terms?',
      'What do people here talk about: a story everyone knows, a worry, a rumour?',
    ],
    fills: [
      { kind: 'npcs' },
      { kind: 'topics' },
      { kind: 'factions' },
      { kind: 'rules', keys: ['ancestries'] },
      { kind: 'world', keys: ['law', 'names', 'standing'] },
    ],
    optional: false,
    skipped: 'An empty world: nobody to talk to, and a law without an officer.',
    checks: [
      'Every home and work place exists, and every profession exists.',
      'Names fit the frame and the names list; nobody from another world.',
      'The law\'s officer is one of these people and the office is a place; fines are in the smallest coin (left out: twenty and five times the largest coin for murder and assault, and for theft three times the value, at least twice the second coin).',
      'A faction someone can join says how: never, hired, by reputation, or terms (patrons, places, a tag, a fee, a reputation, and what is said); standing.offices lists offices only if the world has them.',
      'Public facts are things a neighbour would know; examples are in the person\'s own speech.',
      'Relations point to people who exist, or are people outside the game with a role.',
      'A person\'s patron is a patron in this world\'s rules; an ancestry\'s distrusted_by names quirks people have, and its aliases are words players use.',
    ],
    prompt:
      'STEP: PEOPLE. Agree the first people, the law and what is talked about with the designer. Propose npcs in `changes` (name, short, pronoun, age, profession, home, work, appearance, personality, values, speech, aliases, public_facts, examples, money, knows_areas, relations) and topics (lore with a summary, details and, where someone tells it, a story in their voice). Propose law (where, officer, npc, office, and fines for murder, assault and the least offence if the designer names them; law.fines.murder and law.fines.assault may be the word hearing instead of a sum, when the designer says no fine buys it off, and then law.hearing: hours held (1 to 336) and two sentences in the world\'s own words, held (being taken in) and heard (the hearing and what follows)), standing.offices (only if there are offices to hold) and names (she, he, family: ten names each for people the game makes later) in `world`, and factions in `changes` with how to join them (join), if it matters where they stand (stance), and where else they sit (seats: a place or an area, with what they want there). Where the world has peoples of its own, propose the ancestries in `changes` as kind ancestry (with aliases, and distrusted_by: the quirks that cool towards them). Where a name starts with a title (Dr, Prof, Sir, Capt) or people use a byname, ask what they are called and set call (Dr Ilyan Sorell, call Ilyan); left out, the game uses the first word of the name that is no title. People near the stranger (M10.27: the knob people.model_km, 1.5 km), in their area, in an open storyline or named in a plan ask the model what they want; the rest choose by the rules. A world where villages lie close together may set it smaller; left out, 1.5 km holds.',
  },
  {
    id: 'economy',
    title: 'Economy',
    ask: [
      'What do people eat and use, and who sells it where?',
      'What is made here, by whom and from what? Is anything gathered from the land?',
      'Is there a craft the stranger can learn, at which bench or hearth, and what does a spoilt piece leave behind?',
    ],
    fills: [
      { kind: 'items' },
      { kind: 'object_types' },
      { kind: 'locations' },
      { kind: 'settlements' },
      { kind: 'resources' },
      { kind: 'crafts' },
    ],
    optional: true,
    skipped: 'Fixed prices, and shops stocked as written; nothing is made or used up.',
    checks: [
      'There is food, and someone sells it.',
      'Every good that is used is made somewhere or brought by a route.',
      'Every workshop stands in the area of its settlement; work elsewhere has a ledger of its own.',
      'Every village, town, hamlet or inn has a ledger.',
      'Prices are in the smallest coin; a craft\'s object names the craft and the technique.',
      'A lamp, torch or anything else that lights the way at night has the tag light.',
      'A failure at a craft or a bench says what it leaves (poor: a poorer item; damaged: the object needs mending; leftover: a share of the material back; lost) and what a master would say (why); left out, the material is lost. Damaged needs repair on the object type (what mending takes; the owner mends it at dawn and minds who did it).',
      'A poorer item names the good thing it is a poorer version of (quality poor, of); a thing the stranger can make and give away may say how someone uses it (used, with {name} and {their}).',
    ],
    prompt:
      'STEP: THE ECONOMY. Agree what is eaten, sold and made with the designer. Propose items, object_types (with affordances), the services on locations (sells, buys, lodging, supply), settlements (people, use, keep, workshops), resources and crafts in `changes`, as one proposal that closes: what is used is made or brought. Crafts and bench affordances may say what a failure leaves (failure: outcome poor, damaged, leftover or lost, with item and qty for poor, share for leftover, why and critical); object types that can be damaged get repair; items may have quality poor with of, and used for how someone uses what the stranger made them.',
  },
  {
    id: 'passages',
    title: 'Transport',
    ask: [
      'Do people travel by anything but their feet (a barge, a coach, a ferry, a tram, a spaceship)? What is it called, where does it stop, when, and what does it cost?',
      'Can the stranger hire something from someone (a punt, a horse, a skimmer): from whom, for how much, and for how long?',
      'Is there anywhere far away to go, and what may happen on a long walk (weather, people met, a lost way)?',
    ],
    fills: [
      { kind: 'passages' },
      { kind: 'npcs' },
      { kind: 'topics' },
      { kind: 'journey' },
    ],
    optional: true,
    skipped: 'No lines and nothing for hire: the stranger walks, a walk is told in one line, and nothing happens on the way.',
    checks: [
      'Every stop is a place or a far topic that exists.',
      'Days use the world\'s weekday names; empty means every day.',
      'Without a region map, legs give the minutes for every pair of stops that follow each other.',
      'The fare is in the smallest coin; closed, off and where say it in the world\'s words.',
      'A thing for hire belongs to a person who is there to hand it over (where says where they are found); its price is in the smallest coin; crosses names water only if it floats.',
      'On the way, what may happen fits the land and the frame.',
      'A far town with districts names each with an id of its own and a line; the first is where the stranger comes in.',
    ],
    prompt:
      'STEP: TRANSPORT. Agree the lines of transport with the designer. Propose passages in `changes`: id, name, kind (any word: barge, coach, tram, shuttle), aliases, stops, days, hours or departs, fare, legs, water, crew, text with {fare}, {duration} and {place}, closed, where and a few sights on the way. What someone hires out goes on that person in `changes` as hires (id, name, aliases, price, hours, crosses, where, line, free_for_friends); HIRE <name> works with the owner present. A far place is a topic with kind place; a far town may name its districts (id, name, line; the first where the stranger comes in), each made playable only when the stranger does something there or goes there. Journey sentences per terrain, weather and night, and on_the_way (what may happen on a long walk), go in journey: data/journey.yaml whole in `files`, starting with journey:.',
  },
  {
    id: 'watcher',
    title: 'Signals and dangers',
    ask: [
      'Which changes matter to people here: a death, a theft, a shortage, someone leaving?',
      'What does custom do when it happens (a wake, a search, a collection, a warning), and when things go well (a repair, a danger past, a promise made good: a feast, better prices, a song)?',
      'Are there creatures or dangers the stranger may fight, and which group minds when one is beaten, paid off, bound for the law or let go?',
    ],
    fills: [
      { kind: 'watchers' },
      { kind: 'aftermath' },
      { kind: 'creatures' },
      { kind: 'encounters' },
      { kind: 'rules', keys: ['conditions'] },
      { kind: 'tides' },
      { kind: 'plans' },
    ],
    optional: true,
    skipped: 'Changes pass without a signal and people react only in talk; there are no creatures to fight, and a fight touches no faction. Without great lines nothing great happens by itself: no war, flood or famine comes unless a storyline brings it.',
    checks: [
      'Every watcher\'s signal has an aftermath with the same signal.',
      'Aftermath steps use the verbs the engine knows.',
      'The file keys are watchers: and aftermath:.',
      'A creature with a faction says how that faction takes it when the creature is won, paid, bound or freed (reputation); an encounter that tempts a disloyal companion says so (tempts).',
      'Good news is a signal too: a watcher on a fact of kind repaired:<object type>, on a claim that a danger is past (state normal, kind danger), or on a quest fact with a kind of its own; its aftermath may use feast, prices (a place or area, a factor from 0.5 to 1.5, days), mood, thought, mark (a seat kept for the stranger) and tell with grows (a song or story that grows a step with each teller).',
      'The engine sends made_good (a broken word made good) and pupil_learnt (someone learnt a craft from the stranger; {value} is the craft); they count only when the world gives them an aftermath.',
      'Where the land has bogs, the rules may have the condition wet (wet and cold, until an hour under a roof), set when the stranger struggles out of one.',
      'An improvised act sends the signal improvised, with the thing\'s id as event (an object type, a place or an area); an aftermath with signal improvised and that event is how a spirit answers.',
      'A great line names areas and a plan that exist, drivers that can push it (a season of this world, a realm, a settlement, a flag), and a threshold above its threat; its plan plays the event with effects the engine knows.',
      'A region that comes into the game while it is played (a far place, a region charted at the edge) gets its customs from this standard aftermath (M10.25): give some aftermath steps that work anywhere, by $a and $place and no named place or person, so a new region can use them; one that names a place of this world stays there.',
      'Where the stranger can weigh in on a great line, its drivers name their deeds (a fact by player: a crime against someone, a reconciliation), and a line between two sides may name mediation: the two people who can sit at one table, how much it eases (at most 10) and told, what the chronicle says afterwards.',
    ],
    prompt:
      'STEP: SIGNALS. Agree with the designer which changes are signals and what custom follows. Propose watchers and aftermath in `changes`: a watcher with its signal and what sets it off, and an aftermath with the same signal and its steps. If there are creatures, propose them and their encounters too: a creature\'s faction and reputation (for won, paid, bound, freed or killed: which faction, by how much, why; left out, beating one costs 5 with its faction, paying gains 2, binding costs 10 and letting go gains 3), and tempts on an encounter that may turn a disloyal companion. Good news gets its custom as well: a repair, a danger past, a promise made good (made_good) or a craft passed on (pupil_learnt) may bring a feast, better prices for a while, a mood, a seat kept for the stranger, or a song that grows with each teller. Where the land has bogs, the rules may have the condition wet (in `changes` as kind condition). Where the places step gave something improvise, an aftermath on the signal improvised with that thing\'s id as event lets it answer (the stone grows warm, the kabouters leave something). If the world has a great danger that may come with or without the stranger (a war, a flood, a famine, a plague, a storm), propose it as a great line (kind tide): areas, drivers (a season, a tension between realms, a settlement short of something, a flag, facts of a kind; a negative weight calms it), a threat and a threshold, what a threat says (line, news, prices, days), breaks (the fact when it comes) and a plan (kind plan, with phases of effects: place states, news, mood, market, flee, and steps with verbs such as crowd for people who shelter elsewhere, or found_faction for a movement that forms from it, at most one a season) that plays it. And the pulse (M10.24): two or three watchers with probe pulse (visitor, tiding, request, letter, gesture or place), each with an aftermath that plays near the stranger ($a someone near them, $place where they are): someone who seeks them out, weather or news talked of, an errand. They fire only when the stranger has had nothing new near them for days and the chronicler brought nothing; left out, a quiet stretch without a model stays quiet. A quiet night (no news) also climbs a ladder of chances of one small unexpected thing from the open storylines (M10.27: the knob story.quiet_ladder, 1 in 8, 1 in 4, 1 in 2 and then always; a slow, lonely world may climb it more slowly); without a model these watchers are what it brings.',
  },
  {
    id: 'palette',
    title: 'Palette',
    ask: [
      'Is there a map of the land, and what colours should it have (the ground, water, the wild)?',
      'What signs lie on the land (a pool, a shaft, a wreck, a cairn), and which of them mean danger, or something nobody is sure of?',
      'In what style should pictures of people and places be drawn, and do you want them made in the editor? One costs about what the editor shows for the image model chosen under Settings > AI, per place and per portrait.',
    ],
    fills: [{ kind: 'world', keys: ['map', 'pictures'] }, { kind: 'regions' }],
    optional: true,
    skipped: 'The standard palette with the Nethermarch\'s signs on the land (pools, peat pits, willows, old walls, hummocks), and pictures in a plain illustration style. Without pictures.wanted the editor makes no pictures after the steps (the Contract tab still can, on request); in a game the player\'s own switch decides. A world without a region map plays by its exits, without a map; the Palette tab lays out a first one from the places.',
    checks: [
      'Every colour is #rrggbb.',
      'The names of the terrains read well in the game\'s texts ("In the salt marsh", "On the heath"): they name the hexes of the map.',
      'The colours for a visited place and for the trail stand out against the ground.',
      'Every sign has an id of this world\'s own, a colour in both styles, and a land it lies on; danger and uncertain are a meaning (`means`), not only a colour.',
      'The picture style fits the frame and names no living artist.',
      'pictures.wanted is true only when the designer said yes to pictures at the price the editor shows; left out, none are made after the steps.',
      'A painted region keeps its places, size and origin; its drawing keeps its rows and columns (one character is `zone` km, without it half a km by one) and only characters of its legend; every own land has a `like` and a line; every edge of the map says what lies beyond it, and its `toward` names only topics that exist.',
    ],
    prompt:
      'STEP: THE PALETTE. Agree the colours and the picture style with the designer. Propose in `world`: map with its palette (names for each terrain, used in the map\'s hex names and texts, and for the ways road, path and canal when this world calls them otherwise; signs: this world\'s own signs on the land, each with a name, a shape, the land it lies on and its share, the line walking past, and means danger or uncertain where colour alone would not say it; dark and paper styles: ground, unknown, label, label_shadow, terrain tints, ways, a glyph colour for every sign and for stairs, visited, trail) and pictures.style, with pictures.wanted: true when the designer wants pictures of the places and the people (the editor then makes the new ones after the steps, with the image model and at the price it shows; left out, it makes none). Name the signs by what they are in this world, never by the Nethermarch\'s pool, peat_pit, willow, ruin or hummock unless they are those. Without signs the world keeps the Nethermarch\'s. The palette lives in world.yaml, not in a file of its own. When the world has a region map (the Palette tab lays out a first one from the places, their exits and minutes, all in one land), paint it as a change of kind region with merge: true: zones, the drawing with this world\'s lands where the designer\'s words put them (the sea, the shallows, the scrub); lands, each own terrain with like (woods, fields, fen, water or heath: how it walks) and text (the line the stranger reads there); and paths with a text each; and beyond: for each edge the line the stranger reads on reaching it (what lies that way and how far, from the designer\'s words) and toward, the far places that way by topic. Keep its places, size and origin; a place is moved by its area\'s pos, not in the drawing. Without a region, propose none, and say that the Palette tab makes one from the places. After this last step the editor offers the map as a step of its own (M10.25): it lays the region out from the places and has it painted as a table (M10.26), in one proposal; this step keeps to the palette, its signs and the picture style.',
  },
]

/**
 * What one world step may cost, and what it is shown (M10.20; the build of
 * The Quiet Reach cost 10.09 dollars on Opus 5.5, every step with the whole
 * world.yaml, room for 48,000 tokens and the model thinking at its default).
 * A table takes little thought and may go to the lighter model the player
 * chose for the brain; a story gets more. The measurement is in
 * docs/worldbuild/cost-measure.md.
 */
export interface StepCall {
  /** The most it writes for a short chapter; a longer chapter gets more (stepMaxTokens). */
  maxTokens: number
  effort: 'low' | 'medium'
  /** A table: the model the player chose for the brain writes it (tier light). */
  light: boolean
  /** The keys of world.yaml it is shown besides the ones it fills and the frame. */
  world: string[]
  /** The kinds in the list of what exists that it is shown besides its own; undefined for all. */
  sees?: string[]
}

export const STEP_CALLS: Record<WorldStep['id'], StepCall> = {
  frame: { maxTokens: 4000, effort: 'medium', light: false, world: [], sees: [] },
  lands: { maxTokens: 8000, effort: 'medium', light: false, world: ['words'], sees: ['areas', 'regions', 'passages', 'routes'] },
  voice: { maxTokens: 8000, effort: 'low', light: true, world: ['faiths', 'names'], sees: ['areas', 'professions', 'npcs'] },
  calendar: { maxTokens: 8000, effort: 'low', light: true, world: [], sees: [] },
  money: { maxTokens: 8000, effort: 'low', light: true, world: [], sees: ['items'] },
  faiths: { maxTokens: 8000, effort: 'medium', light: false, world: ['calendar', 'names'], sees: ['areas', 'professions', 'rules.patrons'] },
  places: { maxTokens: 16000, effort: 'medium', light: false, world: ['names'], sees: ['areas', 'locations', 'regions', 'settlements', 'topics'] },
  professions: { maxTokens: 8000, effort: 'low', light: false, world: ['money'], sees: ['items', 'locations', 'areas'] },
  people: { maxTokens: 16000, effort: 'medium', light: false, world: ['faiths', 'money'] },
  economy: { maxTokens: 8000, effort: 'low', light: false, world: ['money', 'calendar'] },
  passages: { maxTokens: 8000, effort: 'low', light: true, world: ['money', 'calendar', 'names'] },
  watcher: { maxTokens: 8000, effort: 'medium', light: false, world: ['weather', 'calendar', 'law'] },
  palette: { maxTokens: 8000, effort: 'low', light: false, world: ['names'], sees: ['areas', 'locations', 'regions'] },
}

/**
 * The most a step may write (M10.20): its own measure, and more for a long
 * chapter, since the answer grows with what the designer wrote (six tokens
 * of YAML for each token of the chapter, as the build of The Quiet Reach
 * wrote), never more than 48,000.
 */
export function stepMaxTokens(stepId: WorldStep['id'], said: string): number {
  return Math.min(48000, STEP_CALLS[stepId].maxTokens + 6 * Math.ceil(said.length / 4))
}

// ---------------------------------------------------------------- a land's own build (M10.23)

/**
 * The world build of M10.17 for one land (M10.23; Bram, 28 September 2026:
 * the same steps, scoped to the land, with the world book as the source).
 * The calendar and the clock are always the world's, and the lands are laid
 * out from the world, so those two steps are not a land's; the rest are.
 */
export const LAND_STEPS: readonly WorldStep[] = WORLD_STEPS.filter((s) => s.id !== 'lands' && s.id !== 'calendar')

/** The keys of world.yaml a land has in its land.yaml under its own name (a land's map levels are the world's; only its palette is its own). */
const LAND_KEYS: Record<string, string> = { name: 'name', frame: 'frame', words: 'words', money: 'money', faiths: 'faiths', law: 'law', names: 'names', standing: 'standing', map: 'palette', pictures: 'pictures' }

/** What a step of a land's build fills: world keys become the land's, and what only the world has stays out. */
export function landFills(step: WorldStep): WorldStep['fills'] {
  return step.fills.flatMap((fill): WorldStep['fills'] => {
    if (fill.kind === 'world') {
      const keys = [...(fill.keys ?? []).map((k) => LAND_KEYS[k]).filter((k): k is string => Boolean(k)), ...(step.id === 'frame' ? ['crossing', 'language'] : [])]
      return keys.length ? [{ kind: 'land', keys }] : []
    }
    // Death is the world's; its patrons, peoples and conditions are one list for all its lands.
    if (fill.kind === 'rules') {
      const keys = (fill.keys ?? []).filter((k) => k !== 'death')
      return keys.length ? [{ kind: 'rules', keys }] : []
    }
    // The journey sentences are the world's.
    return fill.kind === 'journey' ? [] : [fill]
  })
}

/** Per step, what is different when it is a land's. */
export const LAND_NOTES: Partial<Record<WorldStep['id'], string>> = {
  frame:
    'FOR THIS LAND: in `world` its name, its frame (WORLD as in the world\'s frame, then LAND: this land, REGION: where the stranger comes in, and PEOPLE: how they speak and count time), words (land, region, from: what they call where the stranger comes from, sleep), crossing (one or two sentences: what the stranger notices crossing in) and language only if its people speak a tongue the stranger does not know (name, learn: exchanges to learn it, speakers: people from elsewhere who speak it). No intro: the story begins in the world. If the land has something the chronicler must keep to, add a section "## <the land\'s name>" to CHRONICLER.md and send it whole, the rest as it was.',
  voice: 'FOR THIS LAND: its voice kit is lands/<id>/voice.yaml, whole, under voice:, and only if its people speak otherwise than the world\'s; left out, they speak as the world does.',
  money:
    'FOR THIS LAND: in `world` money with units (its own coins, largest first, the smallest with value 1) and rate: how many of its smallest coin one of the world\'s smallest buys, a whole number. Prices stay in the world\'s smallest coin and are told in the land\'s. No player: the stranger arrives with what they carry.',
  faiths: 'FOR THIS LAND: in `world` the faiths its people keep (a faith it shares with the world keeps the world\'s id); left out, the world\'s. The patrons are the world\'s list and are added there as changes. Death is the world\'s.',
  places: 'FOR THIS LAND: its areas and places; a new area is this land\'s by its folder. The start stays the world\'s. A border place (a landing, a pass, a toll house) is where the crossing is told; an area of the border gets border: true.',
  people: 'FOR THIS LAND: in `world` its law (the officer a person of this land, the office a place in it; left out, the world\'s kind of law without its officer), names and standing.',
  passages: 'FOR THIS LAND: lines within the land and the way over its border. The journey sentences are the world\'s.',
  palette: 'FOR THIS LAND: in `world` palette (its colours and signs; the levels of the map are the world\'s) and pictures.style; a region of this land as a change of kind region.',
}

/** The general part for a land's build, after the world guide: what it is and what stays the world's. */
export function landGuide(name: string, id: string): string {
  return [
    `YOU ARE BUILDING A LAND OF THIS WORLD: ${name} (${id}), with the designer, one step at a time, in the same way as a world. The world book and the world as it stands are the source: keep what they say of this land, and fill in only what they leave open.`,
    `In this build \`world\` holds the keys of lands/${id}/land.yaml to set, never world.yaml: the world's frame is the background, and what the land leaves out it takes from the world. The calendar, the clock, the start, the rules and the journey sentences are the world's. What is new here (areas, places, people, professions, passages, items) is written into the land's folder; things of the world it shares (a profession, a faith, a faction) are used by their ids and not made again.`,
  ].join('\n')
}

// ---------------------------------------------------------------- a region built in full, in play (M10.25)

/**
 * The world build in small over a region that grew in play (M10.25; Bram,
 * 29 September 2026: for whoever does not mind the cost, a new region built
 * as a designer would, while the stranger travels). The steps of the world
 * build that fill a region, in their order; the world guide, the contract and
 * the steps' own text are the same, and the region's outline and the frame
 * stand for the designer's answer.
 */
export const REGION_STEPS: readonly WorldStep['id'][] = ['places', 'professions', 'people', 'economy', 'watcher']

/** What a step fills over a region: the kinds of things, never the world's keys, its rules, its voice or its journey sentences. */
export function regionFills(step: WorldStep): WorldStep['fills'] {
  return step.fills.filter((f) => !['world', 'rules', 'voice', 'journey', 'land'].includes(f.kind))
}

/** The general part for a region's build in play, after the world guide: what it is and what stays the world's. */
export function regionGuide(name: string, area: string): string {
  return [
    `IN PLAY: YOU ARE BUILDING ONE REGION OF THIS WORLD: ${name} (area ${area}), which came into the game while it was played. There is no designer to ask: THE DESIGNER SAYS below is the region's outline and the frame. Choose within them and the world book, and say in say what you chose; ask no questions.`,
    `Build only this region: its places have area ${area} (or a new area of it), its people live and work there, and what else you make (trades, goods, a settlement, watchers and their aftermath, creatures) belongs to it. What the world already has, use by its id and leave as it is: world and rules stay empty, no files, no new faction.`,
  ].join('\n')
}

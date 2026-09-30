# The content contract

Everything a world can have, per kind, generated from the schemas in `src/engine` by `npm run content:contract` (M10.17). Do not edit by hand: a test fails when this file no longer matches the schemas.

A world is a folder `content/<world>/` of YAML files. Each file holds one or more of the kinds below as top-level keys; the file names are a habit, not a rule. Whatever a world leaves out takes a neutral default, never the values of another world. Ids are keys and never change once committed (`ids.lock`).

## How a world grows during play

Nothing in a world makes itself. During play it grows only at three moments, never because the stranger merely walks near:

1. The stranger comes to what was only a sketch: a far place the world book names (on foot, from the edge of the map or by its road), a person named in a talk (M10.9), met where they live, or a land the designer only framed (M10.23), whose voice, names, coins and law the chronicler then writes once.
2. A line of transport (M10.12) takes them to a place beyond the map.
3. At night the chronicler needs one place or person for a storyline, within its budget.

A far place grows in layers, each only when needed: the sketch, a name and a line from the world book, costs nothing; arriving makes it playable from templates, without a model; the outline, one small call, comes when the stranger talks to someone there or stays the night; a second visit costs nothing. Beyond the last land the world book names, nothing is made by walking near: the edge of the map says what lies beyond (a region's `beyond`), and past the far places the known world ends. Only when the stranger chooses to go on into the unknown there, with a model connected, does one round chart one new region or land that way, from what the world book suggests and within the frame (M10.21); by the play mode it is charted at once, chosen from two, or proposed.

## world (world.yaml)

The frame of the world: its name and start, the frame every model call gets, the calendar, coins, law, faiths, towns, weather, map and palette with the signs on its land, and the words its texts use for the land and the region.

When a world has none: A world has exactly one. What it leaves out takes the neutral default: "the land", "the region", a law without an officer, no faith, the standard calendar, coins and palette, and the Nethermarch's signs on the land.

One block with:

| field | what it holds | kind | required | default |
| --- | --- | --- | --- | --- |
| id | The world's id: the name of its folder under content/, never changed once committed. | text | yes |  |
| name | The world's name as the player sees it: "The Quiet Reach". | text | yes |  |
| intro | What the stranger reads when a new game starts, before the first place: who they are and why they are here. | text | no |  |
| start | Where and when a new game starts: a location, and the year, month, day, hour and minute of the world's calendar. | a map: location, year, month, day, hour, minute | yes |  |
| player | What the stranger has at the start: money in the smallest coin, and things by item id and count. | a map: money, inventory | yes |  |
| knowledge | How likely people are to know a topic, by its fame and how far away it is (FO, chapter 5); left out, the standard chances. | a map: chance, bands_km, max_level, modifiers | no | {"chance":[[0.1,0,0,0,0],[0.9,0.4,0.0... |
| frame | The fixed block every model call gets about this world (FO, chapter 10); without it, a plain one that names no world (M10.17). | text | no |  |
| pictures | How pictures of places and people look in this world (after the M7 playtest): one style for all of them. wanted (M10.26): the editor makes the pictures of what is new after the steps; left out, it makes none unless asked. In a game the player's own switch decides, since the player pays. | a map: style, wanted | no |  |
| map | The map of this world (M10): its palette, and its levels from below to above. | a map: palette, levels | no |  |
| words | The names the game's own texts use (M8): the land, the region you play in, where the stranger comes from. | a map: land, region, from, sleep | no |  |
| calendar | Names for the calendar (M8): thirteen months (the last one five days), seven weekdays, and the era after the year. | a map: era, months, weekdays, start_weekday | no |  |
| weather | The weather of this world (M10.8): the season of each month, the chances of each weather per season, how likely the sky stays as it is for another part of the day, where the wind mostly comes from, and who reads the sky. | a map: seasons, chances, stay, prevailing, lines, readers | no |  |
| money | The coins (M8), largest first; prices in the content are in the smallest. | a map: units | no |  |
| law | Who keeps the law (M8): wanted "in" where, the officer's title, and the NPC and place to pay fines. | a map: where, officer, npc, office, lord, fines, hearing | no |  |
| towns | Towns with rights of their own (M8.2): their own fines, officer and place to pay, and maybe no trade with someone wanted. | list of a map: id, area, where, officer, offices, trade_ban, cleared | no | [] |
| standing | The five standings in this world's words, lowest first, and the trades that are an office (M8.2). | a map: names, offices | no |  |
| plans | Plans that run from the first day (M8.3): the opponents who do not wait for the player. | list of text | no | [] |
| names | Names for people who come during a game (M8.5). | a map: she, he, family | no |  |
| sketch | Sketch figures (M10.9): the bonds a speaker may name someone new by, as what that someone is to them ("cousin": kin, "old master": teacher), and the domains a talk must be in for it (family, trade, the speaker's past). | a map: bonds, domains | no |  |
| newcomers_per_season | At most so many newcomers a season (M8.5). | number | no | 6 |
| faiths | The faiths (M9.1); with the faction that stands for each, whose standing a wedding at its holy place raises (M10.17). | list of a map: id, name, patrons, oaths, faction | no | [] |
| bells | Bells that ring on the hour (M10.15): heard plainly in some areas and far off in others, and a line in the text. | list of a map: id, name, at, hours, heard, far, line, far_line | no | [] |
| knobs | The knobs of this world (M10.20): rules of play set otherwise than the default, by the knob's id (src/engine/knobs.ts, docs/KNOBS.md): one number, or for a table the rows that differ. | a map of names to one of: number \| a map of names to number | no |  |
| reach | How well two lands know each other (M10.23): none, rumour, trade or close, per pair (the home land is the world's id). A pair without an entry has trade where a line of transport or a route joins them, and none otherwise. | list of a map: between, reach, why | no | [] |

`knobs`: rules of play set otherwise than the default, by the id of a knob (docs/KNOBS.md): `talk.max_turns: 30`; for a table only the rows that differ.

`map.palette.signs`: the signs on this world's land by an id of its own (`mine_shaft`, never the Nethermarch's `peat_pit`), at most seven; each needs a colour under `glyph` in the dark and the paper style. `means: danger` or `uncertain` adds a mark and a word, not only a colour. Left out, the world has the Nethermarch's pool, peat_pit, willow, ruin and hummock.

`map.palette.names` also names the ways in the legend: `road`, `path` and `canal` (a tow path in the Nethermarch; `canal: tidal channel` elsewhere).

## areas (data/areas.yaml)

The villages, towns, inns and stretches of wild land places belong to; who lives in an area knows it.

When a world has none: Nothing can be placed: at least one area is needed.

A list; each has:

| field | what it holds | kind | required | default |
| --- | --- | --- | --- | --- |
| id | The area's id: a key, never changed once committed, and never shown to the player. | text | yes |  |
| name | The area's name as the player sees it: a village, a town, a stretch of fen. | text | yes |  |
| kind | What kind of place it is: village, town, city, hamlet, inn, route or wilderness. | one of village, town, city, hamlet, inn, route, wilderness | yes |  |
| aliases | Other words the player may use for it. | list of text | no | [] |
| summary | What it is in a sentence, as people speak of it and the journal shows it. | text | yes |  |
| fame | How well known it is, from 0 to 5: the higher, the farther away people know of it. | number | no | 1 |
| pos | Position on the map of the land, in km (Wereldboek, chapter 2). | 2 values | no |  |
| topic | Known in conversation through this lore topic instead of by its own name (the Kattenbroek). | text | no |  |
| market_days | Weekdays of the world's calendar with a market here (M10.6): "it's Woensdag, market day in Waagdam". | list of text | no | [] |
| sound | What you hear in the area's places that have no sound of their own (M10.15). | one of: one of wind, reeds, rain, sea, surf, hearth, crowd, workshop, ... \| a map: kind, level, night | no |  |
| improvise | Improvisation for everything in the area that has none of its own (M10.16), with a smaller may. | a map: domain, may, fallback, takes | no |  |
| barred | Places of the area barred while conditions hold (M10.17; before, the widow's mist over the Kattenbroek in code): only for a stranger carrying something with this tag, or for anyone; with what they see. | list of a map: when, carrying, text | no | [] |
| land | The land it belongs to (M10.23); without one the world's home land, and an area in lands/<land>/ belongs to that land. | text | no |  |
| border | A border (M10.23): a bridge, a pass, a toll house, a harbour, where one land meets another. The stranger crosses into a land only at a border, where the scene shows it and the chronicle keeps it. | yes or no | no | false |
| blend | A land it shades into (M10.23; the home land by the world's id): people here have sayings from both kits, and both coins are good. | text | no |  |

## locations (areas/<area>/locations.yaml)

The places the stranger can stand in: their descriptions, exits, objects, services and things to look at.

When a world has none: Nothing to stand in: at least one location is needed, the start.

A list; each has:

| field | what it holds | kind | required | default |
| --- | --- | --- | --- | --- |
| id | The location's id, starting with loc_: a key, never changed once committed, and never shown to the player. | text | yes |  |
| name | Its name as the player sees it at the top of the description. | text | yes |  |
| area | The area it belongs to. | text | yes |  |
| tags | What kind of place it is, for rules and conditions: private (a home), public, route, landmark, edge. | list of text | no | [] |
| aliases | Other words the player may use for it. | list of text | no | [] |
| summary | What it is in a few words, for the journal and the map; left out, the first sentence of the description. | text | no |  |
| faith | The faith a holy place belongs to (M10.17): a wedding here raises the standing of that faith's faction. | text | no |  |
| sound | What you hear here (M10.15): wind in the reeds, the sea, the hearth; over its area's. | one of: one of wind, reeds, rain, sea, surf, hearth, crowd, workshop, ... \| a map: kind, level, night | no |  |
| improvise | An act the rules do not know, done here, may be improvised (M10.16): what it can mean and what may happen. | a map: domain, may, fallback, takes | no |  |
| description | What the stranger sees: three to five sentences, second person, present tense, one sense other than sight, a hint at an exit; by day, and at night when it reads otherwise. | a map: day, night | yes |  |
| variants | Other descriptions once a flag is set (the doorstep without the cat, once Fenna is home), or while conditions hold (M10.6: the mill turning again once De Zwaan is mended). The last that fits is shown. | list of a map: flag, when, day, night | no | [] |
| exits | The ways out, per direction: the location it leads to, the minutes on foot, and a lock if there is one. | a map of names to a map: to, minutes, lock, when, not_yet | no | {} |
| objects | The objects that stand here, each of an object type, with their own state and owner. | list of a map: id, type, name, description, owner, household, staff, provider, hours, days, ... | no | [] |
| services | What can be bought, sold, hired or rented here, from whom, and when. | list of a map: id, sells, buys, lodging, provider, staff, premises, hours, days, supply, ... | no | [] |
| items | Things lying here at the start, by item id and count. | a map of names to number | no | {} |
| pos | Where on the map of the land it lies, in km, when not at its area's position (a tow path, a weir). | 2 values | no |  |
| forage | Grounds of the zone that can be gathered from here (M10.5): the fen's herbs, the shore's kelp. | list of text | no | [] |
| hidden | What lies hidden here (M10.5): SEARCH finds it. | list of a map: id, dc, text, item, qty, topic, when, words, verbs | no | [] |
| details | Things the description names that you can look at and handle (after the M10 playtest): the hollow, the bowl of milk. | list of a map: words, look, take, verbs | no | [] |
| arrival | A place worth a moment (M10.11): two or three sentences for the first time you reach it, in mist, at night or in a storm if it reads otherwise then, and how it looks when it comes into view from afar (a landmark). | a map: text, mist, night, storm, far | no |  |

`arrival`: two or three sentences for the first time the stranger reaches it (with `night`, `mist` or `storm` where it reads otherwise then, and `far` for how a landmark looks from afar): on the start place, and on every gate or landmark. Left out, a place gets no card.

Doing things with the world (M10.30): a verb of a detail may be a deed instead of a line: `when` (conditions, such as `{ has: saw }`), `not_yet`, `check`, `effects` (as in a quest: `set` a flag, `take` or `give` a thing, a fact), `text`, `once` and `done`. An exit may have `when` and `not_yet`: the way opens when they hold (the roof once `tree_down` is set), and people keep to the other ways. Something `hidden` may have `when` (`{ knows: <topic> }`), `words` and `verbs`: then only someone who knows of it finds it, with SEARCH <words> or one of its verbs, never by a roll. A `lock` opens with `key`, `word` (a code the stranger types or says; `word_text` for what happens) or both.

## professions (data/professions.yaml)

What people do all day: the hours of work, home and sleep that move them about.

When a world has none: People keep to their homes.

A list; each has:

| field | what it holds | kind | required | default |
| --- | --- | --- | --- | --- |
| id | The trade's id: a key, never changed once committed, and never shown to the player. | text | yes |  |
| name | The trade's name as the player sees it: "baker", "chief engineer". | text | yes |  |
| schedule | The working day of someone in this trade: blocks of hours with where they are and what they do. | list of a map: from, to, activity, at, days | yes |  |
| daily_goals | What someone in this trade sets out to do each day, besides the schedule. | list of a map: type, item, service, object, qty, days | no | [] |
| teaches | The skill this trade can teach someone, for a price or a favour (M10.3, the offer teach). | text | no |  |

## npcs (areas/<area>/npcs.yaml)

The people: who they are, where they live and work, what they know, who they are to each other, and how they speak.

When a world has none: An empty world: nobody to talk to.

A list; each has:

| field | what it holds | kind | required | default |
| --- | --- | --- | --- | --- |
| id | The person's id, starting with npc_: a key, never changed once committed, and never shown to the player. | text | yes |  |
| name | Their full name as the player sees it. | text | yes |  |
| call | The name people use for them in running text (M10.29), where it is not the first word of the name: "Ilyan" for Dr Ilyan Sorell. | text | no |  |
| short | Who they are in a few words, as running text names them after a first meeting: "the chief engineer". | text | yes |  |
| pronoun | she, he or they. | one of she, he, they | yes |  |
| age | Their age in years. | number | yes |  |
| profession | Their trade: a profession of the world, which sets their working day. | text | yes |  |
| hidden | The profession is hidden (M10.8): the stranger sees the cover and the public short name until they know for sure (a secret of theirs found out), Tamsin the hedge-witch as "an old woman who keeps goats". | yes or no | no | false |
| cover | With a hidden profession: the trade they seem to have. | text | no |  |
| short_public | With a hidden profession: who they seem to be, in a few words, until the stranger knows better. | text | no |  |
| home | The location where they live and sleep. | text | yes |  |
| work | The location where they work, when it is not their home. | text | no |  |
| household | A key shared by everyone of one household (hh_kroes); left out, a household of their own. | text | no |  |
| fame | How well known they are, from 0 to 5: the higher, the farther away people know of them. | number | no | 0 |
| appearance | What the stranger sees of them, in a sentence or two. | text | yes |  |
| personality | Their character on six axes from -3 to 3: warmth, courage, honesty, temper, curiosity and diligence. | a map: warmth, courage, honesty, temper, curiosity, diligence | yes |  |
| values | What matters to them, from -3 to 3, by name: law, wealth, tradition, family. | a map of names to number | no | {} |
| quirks | Traits the rules know, each of which changes what they do: greedy, spirit. | list of text | no | [] |
| speech | How they talk, for the voice: short words, long silences, a saying they keep coming back to. | text | no |  |
| voice | Their group in the world's voice kit (M10.10), when not by where they live or what they do. | text | no |  |
| colour | Their colour, as #rrggbb (M10.29 I): the dot on the plan of here, on their journal page and by their name in the talk window; without it, one the engine derives from their id. | text | no |  |
| aliases | Other words the player may use for them. | list of text | no | [] |
| public_facts | What anyone may know about them, one sentence each. | list of text | no | [] |
| examples | Lines they might say, in their own voice: the voice follows their tone. | list of text | no | [] |
| money | What they have at the start, in the smallest coin. | number | no | 0 |
| inventory | What they carry at the start, by item id and count. | a map of names to number | no | {} |
| knows_areas | Areas they know well besides their own: people and places there they can tell of. | list of text | no | [] |
| child | A child: other rules for fights, work and what they may do. | yes or no | no | false |
| patron | A patron of the world's rules (M10.17: any world's, no longer the Nethermarch's five). | text | no |  |
| fighter | Class and level in a fight (FO, chapter 12); others fight as ordinary folk. | a map: class, level | no |  |
| companion | Can travel with the player (FO, chapter 13): daily wage in duiten, what they think of deeds, and the talk at the fire. | a map: wage, approves, disapproves, limits, campfire, slow, quest | no |  |
| portrait | A portrait of their own, or the plain figure of someone generic (after the M7 playtest). | one of unique, generic | no | "unique" |
| absent | Not in the world at the start: under a curse, found or freed by a quest. | yes or no | no | false |
| faith | Their faith, one of the world's (M9.1); without it, from their patron, or what most people hold. | text | no |  |
| creature | Fights with the numbers of a creature from the bestiary (the Haakman, Black Mathijs). | text | no |  |
| romance | Open to romance (FO, chapter 8; Wereldboek, "Romance"): with whom, from which attitude. | a map: open_to, from, note | no |  |
| hires | What this person hires out (M10.17, before M7.2's punt of Wouter in code): a punt, a horse, a skiff, a sled. HIRE <name> with the owner there; for the hours given it lets the stranger cross what it crosses. A friend pays nothing. | list of a map: id, name, aliases, price, hours, crosses, where, line, free_for_friends | no | [] |
| relations | Who they are bound to and how: kin, friends, rivals, masters, with how close they are. | list of a map: to, name, pronoun, role, bond, status, private, owes, note | no | [] |
| secrets | What they keep to themselves: the secret, a hint at it, what they say when it comes out, how hard it is to get out of them, and what it teaches. | list of a map: id, text, hint, admission, dc, teaches, about | no | [] |

`secrets`: `about` and `teaches` take ids: a topic, a person (an NPC id), a place (a location id) or an area (`area_<id>`).

`call`: what people call them in running text when it is not the first word of the name: after a title (Dr Ilyan Sorell, `call: Ilyan`) or a byname (`call: Old Tamsin`); left out, the first word of the name that is no title.

## items (data/items.yaml)

Things that can be carried, eaten, worn, bought and sold.

When a world has none: No things.

A list; each has:

| field | what it holds | kind | required | default |
| --- | --- | --- | --- | --- |
| id | The item's id: a key, never changed once committed, and never shown to the player. | text | yes |  |
| name | Its name as the player sees it: "a loaf of bread" reads "loaf of bread". | text | yes |  |
| plural | Its name for more than one, when adding an s is wrong: "loaves of bread". | text | no |  |
| description | What the stranger sees when they look at it, in a sentence or two. | text | yes |  |
| aliases | Other words the player may use for it. | list of text | no | [] |
| tags | What kind of thing it is, for rules and conditions: food, tool, light (a lamp or torch that lights the way at night). | list of text | no | [] |
| value | What it is worth, in the smallest coin: shops buy and sell from it. | number | yes |  |
| used | How someone uses it when the stranger made it and gave it to them (M10.14): "{name} cuts bread with the knife you made." | text | no |  |
| verbs | What using, reading or opening it says when the stranger carries it (M10.29), as a detail's verbs: { use: "...", read: "..." }. | a map of names to text | no |  |
| quality | A poorer make of another thing (M10.14): what a failed recipe leaves, of use for something else and worth less. | one of poor | no |  |
| of | For a poorer make (quality poor): the item it is a poorer version of. | text | no |  |
| food | How much a meal of it fills, from 0 to 100; left out, it cannot be eaten. | number | no |  |
| weapon | A weapon (FO, chapter 12): its damage die, and what a critical hit does. | a map: damage, kind, light, two_hands, crit, range, iron | no |  |
| armour | Armour or a shield: the defence it gives, and how much Grace still counts in it. | a map: kind, defence, cap | no |  |
| remedy | A remedy: what using it heals or cures (FO, chapter 11, "Aandoeningen"). | a map: heal, cures | no |  |

## object_types (data/objects.yaml)

Kinds of objects in places, with what can be done with them (use, open, repair, work at).

When a world has none: Objects cannot be used.

A list; each has:

| field | what it holds | kind | required | default |
| --- | --- | --- | --- | --- |
| id | The object type's id: a key, never changed once committed, and never shown to the player. | text | yes |  |
| name | Its name as the player sees it: "electronics bench", "oven". | text | yes |  |
| description | What the stranger sees when they look at it. | text | yes |  |
| aliases | Other words the player may use for it. | list of text | no | [] |
| affordances | What can be done with it (USE <object> <affordance>): work, lessons, repairs, recipes of a craft, each with its time, check and outcome. | list of a map: id, verb, label, actors, access, consumes, produces, duration, fee, satisfies, ... | no | [] |
| details | Things that belong to it (M10.4): the apple on the old stone. LOOK tells of it, TAKE answers with its own line. | list of a map: words, look, take, verbs | no | [] |
| inscription | Words carved or written on it (M10.5): READ it. | a map: text, dc, look, topic | no |  |
| repair | How it is mended once damaged: what mending takes and how long, what state it is in afterwards, and the words for it. | a map: consumes, duration, sets, narrate_end | no |  |
| improvise | An act the rules do not know, done to it, may be improvised (M10.16). | a map: domain, may, fallback, takes | no |  |

## topics (data/topics.yaml)

What people can talk about: lore, far places, people outside the game; with who knows it how well.

When a world has none: People only talk of each other and the places around them.

A list; each has:

| field | what it holds | kind | required | default |
| --- | --- | --- | --- | --- |
| id | The topic's id: a key, never changed once committed, and never shown to the player. | text | yes |  |
| name | Its name as the player sees it in the journal and in [brackets] in talk. | text | yes |  |
| kind | What it is: lore (a story or custom), fact, a place, or a person the game only tells about. | one of lore, fact, place, person | yes |  |
| aliases | Other words the player may use for it. | list of text | no | [] |
| summary | What it is in a sentence: what someone who knows a little says. | text | yes |  |
| details | What someone who knows it well says besides the summary. | text | no |  |
| story | The whole story, as someone who knows it best tells it. | text | no |  |
| teller | Whose telling the story is, when it is told in the first person. | text | no |  |
| origin | Where it comes from: an area or a location; people near it know it better. | text | no |  |
| pos | Where the topic belongs on the map, when it is not an area of the content. | 2 values | no |  |
| standing_talk | What everyone talks about when asked what's new (M8.2: content, not a list in the code). | yes or no | no | false |
| everywhere | Known the same everywhere, like a custom of the whole countryside. | yes or no | no | false |
| common | What everyone in this world knows (M10.29 P: Mara is "a Nacrean woman", and the stranger could not know what that is): its peoples, its money, its calendar, its law, its faiths, its great places. In the stranger's journal from the start, under What you know of the world, and every person knows it. | yes or no | no | false |
| audience | Extra chance for some listeners: profession ids, quirks or "child". | a map of names to number | no | {} |
| fame | How well known it is, from 0 to 5: the higher, the farther away people know of it. | number | no | 2 |
| known_by | People who know it well at the start, whatever the distance. | list of text | no | [] |
| land | The land a far place lies in (M10.23): what grows there in play is of that land. | text | no |  |
| districts | A far town that grows by district (M10.21): the world book names its quarters. The first is where the stranger comes in; each is made playable only when they do something there (the first) or go there (the rest). | list of a map: id, name, line | no | [] |

`common: true`: what everyone in this world knows (M10.29): its peoples, money, calendar, law, faiths and great places. In the stranger's journal from the start under What you know of the world, known to every person, and what RECALL answers from; left out, a topic is known as its fame and origin say.

`districts` (a far town, kind place): its quarters as the world book names them, each with an id, a name and a line; the first is where the stranger comes in. The game makes the first playable when the stranger does something there (buys, asks, rents a bed), and each other when they go into it by its street; without a model from templates and the line.

## news (data/news.yaml)

Rumours going round at the start.

When a world has none: No rumours at the start.

A list; each has:

| field | what it holds | kind | required | default |
| --- | --- | --- | --- | --- |
| id | The rumour's id: a key, never changed once committed, and never shown to the player. | text | yes |  |
| title | What it is about in a few words, for the journal. | text | yes |  |
| about | The people it is about. | list of text | no | [] |
| place | Where it happened: a location. | text | yes |  |
| belang | How much it matters, from 0 to 5: the higher, the faster and farther it goes round. | number | yes |  |
| truth | Whether it is true; a false rumour is told as if it were. | yes or no | no | true |
| known_by | Who knows it at the start, and from whom: an NPC id or "witness". | a map of names to text | no | {} |
| text | How it is told: precise (by someone who was there), village (as it goes round) and far (as it reaches other places). | a map: precise, village, far | yes |  |

## patterns (data/patterns.yaml)

Small stories the world may start by itself: a lost thing, a quarrel.

When a world has none: No small stories start by themselves.

A list; each has:

| field | what it holds | kind | required | default |
| --- | --- | --- | --- | --- |
| id | The pattern's id: a key, never changed once committed, and never shown to the player. | text | yes |  |
| kind | What kind of story it plays: lost_thing, quarrel, theft, sickness or feast. | one of lost_thing, quarrel, theft, sickness, feast | yes |  |
| belang | How much it matters when it happens, from 0 to 5: the higher, the faster and farther the news goes. | number | yes |  |
| weight | How often the pacing engine picks it, against the other patterns. | number | no | 1 |
| items | lost_thing: what can go missing. theft: what can be stolen. | list of text | no | [] |
| reasons | quarrel: what people fall out about. | list of text | no | [] |
| date | feast: the day it falls on. | a map: month, day | no |  |
| place | Where it happens (feast: where people gather); left out, where the people it is about are. | text | no |  |
| text | Texts with {owner}, {thing}, {place}, {a}, {b}, {reason}, {victim}, {goods}, {name}. | a map: title, precise, village, far | yes |  |
| scene | A line the player sees when it happens in front of them. | text | no |  |

## quests (data/quests.yaml)

Written quests with their ways and endings.

When a world has none: No written quests; requests still come up from what happens.

A list; each has:

| field | what it holds | kind | required | default |
| --- | --- | --- | --- | --- |
| id | The quest's id: a key, never changed once committed, and never shown to the player. | text | yes |  |
| name | Its name as the player sees it in the journal. | text | yes |  |
| kind | What kind of quest it is: main, request, mystery, bargain, threat, discovery, conflict, social, trial or personal. | one of main, request, mystery, bargain, threat, discovery, conflict, social, ... | yes |  |
| summary | What it is about in a sentence, for the journal. | text | yes |  |
| givers | NPC ids. People who are not in the content yet stay out until they are. | list of text | no | [] |
| helpers | People who help the stranger in it; their death changes the quest. | list of text | no | [] |
| opponents | People who stand against the stranger in it; their death changes the quest. | list of text | no | [] |
| starts | How it begins: talking to one of these, a place, or conditions. | a map: talk, at, when, at_start | no | {"talk":[],"at":[],"when":[],"at_star... |
| ask | What the giver says when it begins. | text | no |  |
| stages | The stages in order: what the journal says at each, and when it is reached. | list of a map: id, text, goal, knows, on_enter, next | no | [] |
| actions | What the stranger can do in it besides talking (give, show, use), and what that does. | list of a map: id, say, intent, at, with, when, not_yet, check, effects, fail, ... | no | [] |
| outcomes | The ways it can end: when, what the journal says, and what follows. | list of a map: id, name, text, solution, when, effects | no | [] |
| truths | What the story keeps hidden (M10.30): the guard refuses a reply or an improvisation that names one before its stage, so people do not each tell their own plot. | list of a map: text, words, from, when | no | [] |
| on_death | A death of someone with a part: to an outcome or a stage (design: quests react to the world). | a map of names to text | no | {} |
| on_place | A place destroyed or flooded: to an outcome or a stage. | a map of names to text | no | {} |
| timer | A clock that runs by itself while the quest is on: the widow's patience. | a map: clock, every_hours, unless | no |  |
| lapses | Without the player (M10.6): so many days after it began (or after the game began, when the player never took it up), and only while the player is far from its people and places, the world settles it itself: the effects, and the quest is over (lapsed). Near, it waits for the player. | a map: after_days, when_far, text, effects | no |  |

A stage may have `goal`, what the stranger can do now in one line for the journal and QUESTS ("Recover the recordings from the Listening Room"), and `knows`, per person with a part (npc id) what they know of the story at this stage and may say, a sentence with their name ("Tessa knows the coupling was never synced; she does not know who took the pages."). That goes to their voice as all they know of it, and to an improvisation at a place of the story; a person without a line talks as before.

A condition `talked`: the stranger talked with someone (npc id), and with `about`, about one of these words from either side, in the talks the game keeps: `{ talked: npc_niko_serrin, about: [signal, station] }`. A stage the stranger lived in a game from before the story was written passes by it (with `effects` setting the flag its deed would set); the step Stories writes it when it is shown that game, and loading a save from before a quest that begins with the game begins it where the stranger stands.

A quest may have `truths`: what the story keeps hidden (`text`), how a reply would name it (`words`, patterns as in an action's say) and when people may say it (`from` a stage, or `when` conditions hold; without either, once it has ended). Before that the guard refuses a reply or an improvisation that names it, unless the game gave it to the speaker: their knows line, or a secret they told. Keep a truth out of the ask and out of the journal lines before its stage.

## regions (regions/<region>/region.yaml)

The map of the land: terrain, ways, landmarks and where places lie on it, with the region's own lands (black basalt, open sea), each walking like one of the engine's.

When a world has none: No map: the world is walked by its exits. The editor lays out a first one from the places, their exits and minutes (Palette tab).

A list; each has:

| field | what it holds | kind | required | default |
| --- | --- | --- | --- | --- |
| id | The region's id: a key, never changed once committed, and never shown to the player. | text | yes |  |
| name | The region's name as the player sees it on the map. | text | yes |  |
| land | The land it lies in (M10.23), when not the world's home land: its palette colours the map. | text | no |  |
| area | The area that stands for the open land between the places. | text | yes |  |
| origin | Where the south-west corner lies on the map of the land, in km. | 2 values | yes |  |
| size | How large the map is, in km, east to west and north to south. | 2 values | yes |  |
| hex | How wide a hex of the map is, in km. | number | yes |  |
| seed | The seed that draws the hexes from the zones: the same seed, the same map. | number | yes |  |
| legend | A character of the drawing to what lies there: one of the engine's lands (woods, fields, fen, water, heath), a way (road, canal, path), or a terrain of this region's own under `lands`. | a map of names to text | yes |  |
| lands | The region's own terrains (M10.20; found building The Quiet Reach: black basalt and tidal shallows are no fen): each walks like one of the engine's lands (its minutes, its sight, what swallows a leg), is coloured and named by its own key in the palette, and has the line the stranger reads there. | a map of names to a map: like, text | no | {} |
| zones | One character per zone, rows from north to south. | text | yes |  |
| zone | The size of one character of the drawing in km, east to west and north to south (M10.20: a small island is drawn a hex a character); without it half a km by one. | 2 values | no |  |
| rules | Rules of the map: hidden paths known only through a topic, how far one sees from an area, channels between waters. | list of one of: a map \| a map \| a map | no | [] |
| landmarks | What can be seen from afar: an area, the line the stranger reads, and from how many km. | list of a map: area, text, range | no | [] |
| beyond | What lies beyond each edge of the map (M10.21): the line the stranger reads on walking up to it, from the world book, and the far places that way, which they may go on to (on foot in days, or by a line). An edge without one says that nobody has told them yet; beyond the last land the world book names, nothing is made. | list of a map: side, text, toward | no | [] |
| paths | Roads, tow paths and fen paths as lines through the zones: areas or points in km from the south-west corner. | list of a map: kind, name, via, level, topic, text | no | [] |

`zones`: one character is `zone` km east to west and north to south (without it half a km by one), the top row the north edge; every character is in `legend`.

`lands`: the region's own terrains by the key of their palette tints, each with `like` (woods, fields, fen, water or heath: its minutes, its sight, what swallows a leg) and `text` (the line the stranger reads there).

`paths[].text`: the line walking along it; without one, the Nethermarch's line for a road, tow path or path.

`beyond`: per edge (north, east, south or west) the line the stranger reads on reaching it, from the world book, and `toward`: the far places that way (topics), which they may go on to on foot or by a line. An edge without one says that nobody has told them; beyond the last land the world names, nothing is made.

## rules (rules/rules.yaml)

The rules of play: skills, ancestries, backgrounds, classes and talents, conditions and patrons.

When a world has none: No character to make and no fights: the stranger talks, trades and walks.

One block with:

| field | what it holds | kind | required | default |
| --- | --- | --- | --- | --- |
| xp_per_level | Experience needed for each level: level n is reached at (n - 1) times this. | number | no | 1000 |
| skills | The skills of a character, each with its attribute. | list of a map: id, name, attribute | no | [] |
| ancestries | Where a character can come from, with what it gives. | list of a map: id, name, text, attributes, hp, special, aptitude, immune, aliases, distrusted_by | no | [] |
| backgrounds | What a character did before, with what it gives. | list of a map: id, name, skills, talent, knows, topics, reason, contact, heard | no | [] |
| general_talents | Talents any character may take. | list of a map: id, name, text, effects | no | [] |
| conditions | Conditions a character can suffer (hurt, sick, cursed) and what they do. | list of a map: id, name, text, max | no | [] |
| classes | The classes of a character, with what each gives by level. | list of a map: id, name, text, key, hp, trained, armour, proficiency, gear, core, ... | no | [] |
| patrons | The patrons a character may follow, and what each gives. | list of a map: id, name, text, values, forbids, blessings, sworn | no | [] |
| ready_made | The ready-made traveller for a game started without making a character (M9.1: per world). | a map: name, ancestry, background, class, boosts, skills, talent | no |  |
| suggest | For a suggested character: the ancestry for each key attribute (M9.1: per world); without it, the one that gives the key most. | a map of names to text | no |  |
| death | What death is like in this world (M10.17; the Way of the Grey Rider in the Nethermarch): the vision, the waking, the mark and how a rite lifts it, and the price after the third time. Without it, plain words and no price. | a map: vision, guide, patron, wake, mark, rite_where, rite_done, rite_nothing, price | no |  |

`backgrounds`: who the stranger may have come as (two to five): `reason` (two sentences in the second person, with this world's names), `contact` (whom they were told to ask for), `heard` (a topic in the journal from the start), `topics`, and `knows`: people who know them from before, each an NPC id or `{ who, how }` with how, as the stranger would say it ("your shipmate on the Harrow crossing"). `skills` (two) and `talent` only where the world has classes; a world without them leaves both out, and the stranger comes as the first background until they choose another with BACKGROUND. Left out altogether, the stranger has no reason to be here and knows nobody.

## voice (data/voice.yaml)

How people speak: oaths per faith, rare sayings, how they call a stranger, time and measures, and what does not exist here.

When a world has none: The fixed list of modern words is kept out, and nothing else.

One block with:

| field | what it holds | kind | required | default |
| --- | --- | --- | --- | --- |
| oaths | Exclamations and oaths per faith (the faith ids of world.yaml): the only ones people here swear by. | a map of names to list of text | no | {} |
| sayings | Sayings and proverbs of the whole region. | list of text | no | [] |
| groups | Groups who speak their own way: by where they live or what they do, or an NPC's own `voice`. | list of a map: id, name, sayings, oaths, areas, professions | no | [] |
| default_group | The group of everyone else. | text | no |  |
| address | How people call the listener: a stranger, someone they know, a friend, someone of standing. | a map: stranger, known, friend, high | no | {"stranger":[],"known":[],"friend":[]... |
| time | How people here tell the time: "at the third bell". Money comes from world.yaml. | list of text | no | [] |
| distance | How people here tell distance: "an hour's walk", "two locks on". | list of text | no | [] |
| measures | The measures people here use for weight, length and volume. | list of text | no | [] |
| verb_words | The world's own words for a verb of the game (M10.30): { pick: [hack, bypass] }. The stranger may type them, and the game names the verb by the first. | a map of names to list of text | no | {} |
| not_here | What does not exist here, and what people say instead. A word with a capital (a month, a weekday) is only that word with its capital; one without an alternative makes the game ask the reply again. | list of a map: word, instead | no | [] |

`verb_words`: the world's own words for a verb of the game, `{ pick: [hack, bypass] }`: the stranger may type them, and the game names the verb by the first (M10.30).

## land (lands/<land>/land.yaml)

Another land of the same world with a frame of its own: the frame every model call gets there, its voice kit, faiths, coins at a rate, law, names, standing and palette; its areas, people and factions in its folder. Whoever is in it plays under its frame.

When a world has none: One land: the world is its home land, and every area is of it.

One block with:

| field | what it holds | kind | required | default |
| --- | --- | --- | --- | --- |
| id | The land's id: the name of its folder under lands/, never changed once committed. | text | yes |  |
| name | The land's name as the player sees it. | text | yes |  |
| realm | The realm of the world's realms that rules it, when one does. | text | no |  |
| frame | The fixed block every model call gets while the stranger is in this land, in place of the world's. | text | yes |  |
| language | A tongue of its own (M10.23, optional): whoever does not know it gets greetings, gestures, names and numbers from its people and no more, until they learn it (so many exchanges, fewer with Lore) or bring someone who speaks it; `speakers` are people from elsewhere who do. | a map: name, learn, speakers | no |  |
| crossing | What the stranger notices crossing into it, told at the border: another way of address, other money on the table. | text | no |  |
| words | Its own words for the game's texts; without them its name, and the stranger comes from the world's land. | a map: land, region, from, sleep | no |  |
| names | Names for people who come to this land during a game; without them, the world's. | a map: she, he, family | no |  |
| faiths | The faiths of this land; without them, the world's. | list of a map: id, name, patrons, oaths, faction | no |  |
| money | Its own coins, largest first, and the rate: how many of its smallest coin one of the world's smallest buys (a whole number, so every sum comes out even). Prices stay in the world's smallest coin; the land tells them in its own, and the coins are changed at the border. | a map: units, rate | no |  |
| law | Who keeps the law in this land: where one is wanted, the officer's title, and where fines are paid; without it, the world's. | a map: where, officer, npc, office, lord, fines, hearing | no |  |
| standing | The five standings in this land's words, lowest first, and the trades that are an office; without them, the world's. | a map: names, offices | no |  |
| sketch | The bonds a speaker in this land may name someone new by, and the domains a talk must be in for it; without them, the world's. | a map: bonds, domains | no |  |
| pictures | How pictures of this land look (a style for the picture model); without it, the world's. | a map: style | no |  |
| palette | The colours and signs of its map; its levels are the world's. | a map: names, signs, dark, paper | no |  |

A land lives in its own folder, `lands/<land>/`: its `land.yaml` (under `land:`, with the id of its folder), a `voice.yaml` of its own if its people speak otherwise, and its areas, places, people, factions, trades and beasts in files beside them, which play like the world's. An area in the folder belongs to the land; elsewhere `land:` on the area says so, and without it an area is of the home land (the world itself). A region (`land:`) is coloured by its land's palette, and a far place (a topic of kind place, `land:`) makes what grows there of that land.

What a land leaves out it takes from the world: the calendar and the clock always, and prices, which are in the world's smallest coin everywhere. `money.rate` is how many of the land's smallest coin one of the world's smallest buys (a whole number); the land tells prices in its own coins, and they are changed at the border. A land without `law` has the world's kind of officer, without the world's officer or office.

A land with only its frame (no voice kit and no names) plays on the world's voice, names, coins and law; with a model connected, the chronicler writes them once, from the frame, when the stranger first comes in, and what the designer writes later wins.

`language` (optional): a tongue of its own, with `name`, `learn` (how many exchanges until the stranger can follow it; Lore shortens it) and `speakers` (people from elsewhere who speak it and interpret when they go along). Without it everyone speaks the stranger's tongue. Until they learn it, its people give the stranger greetings, gestures, names and numbers, by the rules, without a model.

The stranger crosses into a land only at a border: an area with `border: true` (a bridge, a pass, a toll house, a harbour), where `crossing` is told. An area with `blend: <land>` shades into that land (the home land by the world's id): sayings of both kits, and both coins good.

## journey (data/journey.yaml)

Sentences for a journey of more than a few steps: per terrain, weather and the night, and what may happen on the way.

When a world has none: A walk is told in one line.

One block with:

| field | what it holds | kind | required | default |
| --- | --- | --- | --- | --- |
| terrain | Per kind of land (fen, fields, heath, woods, water) and way (canal, road, path, ridge). | a map of names to list of text | no | {} |
| weather | Per weather (clear, overcast, rain, fog, storm, frost, snow). | a map of names to list of text | no | {} |
| night | Sentences for a journey at night, whatever the land or weather. | list of text | no | [] |
| on_the_way | What may happen on a journey over known ground (FO, chapter 4, "Snelreizen"). | list of a map: text, where, night, minutes | no | [] |

## passages (data/passages.yaml)

Lines of transport (a barge, a coach, a ferry, a spaceship): stops, days and departures, fares and legs.

When a world has none: No lines: the stranger walks.

A list; each has:

| field | what it holds | kind | required | default |
| --- | --- | --- | --- | --- |
| id | The line's id: a key, never changed once committed, and never shown to the player. | text | yes |  |
| name | As the game says it: "the barge on the Graafse Vaart". | text | yes |  |
| kind | What it is, in the word the player uses: barge, coach, ferry; a spaceship or a Ford T in another world (M10.17). | text | yes |  |
| aliases | Other words the player may use for it: trekschuit, the boat. | list of text | no | [] |
| stops | Its stops in order along the way: locations of the world, or the topics of far places. | list of text | yes |  |
| days | The days it runs, in the world's weekdays; none: every day. | list of text | no | [] |
| hours | Hours it takes passengers, "07-17": it goes when you board. | text | no |  |
| departs | Or set departures, "08:00": who is late waits for the next. | list of text | no | [] |
| fare | What a ride costs, in the smallest coin. | number | yes |  |
| far_fare | What a ride to a far place costs on top of the fare, in the smallest coin. | number | no | 0 |
| speed | How fast it goes in the region, km an hour. | number | no | 6 |
| stop_minutes | The minutes lost at locks and stops on each ride. | number | no | 0 |
| legs | Minutes of a leg the map cannot measure, "a>b": to a far place, or in a world without a map. | a map of names to number | no | {} |
| water | Over water: a blessing of fair wind makes it quicker. | yes or no | no | false |
| crew | Who takes the money: the bargeman, the coachman, the skipper. | text | no |  |
| text | A ride in the region, in words: {fare}, {duration} and {place} filled in. | text | yes |  |
| closed | When it does not go now, in words (its days and hours). | text | no |  |
| off | When it does not run at all while its conditions fail (the Lamp out), in words. | text | no |  |
| where | Where it stops, in words, for someone who asks. | text | no |  |
| when | Only while these hold (the Lamp lit, the road open). | list of one of: a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map | no | [] |
| sights | What you may see on a journey of days. | list of text | no | [] |

`legs`: minutes between two of its stops that the map cannot measure, keyed `<stop>><stop>` with a `>` between the ids (`loc_quay>kestrel_landing: 90`).

## returning (data/belonging.yaml)

The words for what changed at a place since the stranger was last there.

When a world has none: Nothing is said when the stranger comes back.

One block with:

| field | what it holds | kind | required | default |
| --- | --- | --- | --- | --- |
| object | An object in another state: by "key:value" or the value alone, else the default. | a map of names to text | no | {} |
| place | The place in another state (flooded, damaged, normal, ...), else the default. | a map of names to text | no | {} |
| came | Someone who lives or works here now and did not before. | text | no |  |
| gone | Someone who lived or worked here does not any more. | text | no |  |
| dead | Someone who lived or worked here died. | text | no |  |
| agreement | Something agreed that plays here. | text | no |  |

## gestures (data/belonging.yaml)

Small practical things people do after something shared with the stranger.

When a world has none: No gestures.

A list; each has:

| field | what it holds | kind | required | default |
| --- | --- | --- | --- | --- |
| id | The gesture's id: a key, never changed once committed, and never shown to the player. | text | yes |  |
| who | The person who makes it. | text | yes |  |
| at | When: the NPC sees the stranger arrive, the stranger trades with them, or the stranger leaves. | one of arrive, shop, leave | yes |  |
| shared | What the two share for it: an agreement kept, a memory of the stranger, a fact they heard of the stranger, or the stranger lodging here. | one of: a map: kept \| a map: memory \| a map: fact \| a map: lodger, away | yes |  |
| do | What they do: a line ({name}, {what} of the agreement or memory filled in), a thing put ready (given, no bargain), a warning, or a question how something went. | one of: a map: line \| a map: give, qty, line \| a map: warn \| a map: ask | yes |  |

## lodgings (data/belonging.yaml)

A room the stranger can rent by the week, with a chest and people who expect them.

When a world has none: No room of their own; an inn still lets a bed for the night.

A list; each has:

| field | what it holds | kind | required | default |
| --- | --- | --- | --- | --- |
| id | The lodging's id: a key, never changed once committed, and never shown to the player. | text | yes |  |
| name | As the journal says it: "your room at the Drowned Goose". | text | yes |  |
| at | The room itself. | text | yes |  |
| keeper | Who lets the room. | text | yes |  |
| rent | The rent for a week, in the smallest coin; without it, five nights at the price the inn asks. | number | no |  |
| chest | A chest in the room that is the stranger's to use. | yes or no | no | true |

## factions (data/factions.yaml)

Groups with a seat and a stance, whose reputation the stranger earns.

When a world has none: No factions.

A list; each has:

| field | what it holds | kind | required | default |
| --- | --- | --- | --- | --- |
| id | The faction's id: a key, never changed once committed, and never shown to the player. | text | yes |  |
| name | Its name as the player sees it. | text | yes |  |
| seat | Where it sits: a location or an area. | text | yes |  |
| wants | What it wants, in a sentence. | text | yes |  |
| seats | Where else they sit (M10.22): a place (a location or an area) with what they want there. A new town brings no new factions: a district gets a seat of one the world has (the guild's hall in Graafhaven). | list of a map: at, wants | no | [] |
| stance | Where they stand on what divides the land: "for the drainage". | text | no |  |
| members | The people who belong to it. | list of text | no | [] |
| allies | The factions it stands with. | list of text | no | [] |
| rivals | The factions it stands against. | list of text | no | [] |
| join | How the player can join: never, hired (they hire, they do not enlist), by reputation, or on terms (M10.17, before that the Lantern, the Old Faith and the town rights at the Waag were in code): sworn to one of some patrons or to none of others, at some places or a place with a tag, for a fee, from a reputation; with what is said when the stranger falls short. | one of: one of never, hired, reputation \| a map: patrons, not_patrons, at, tag, fee, reputation, says | no | "never" |
| law | The law this faction keeps: the home land's (count), a town's from world.yaml, or another land's by its id (M10.23). | text | no |  |

`seats`: where else a faction sits, each a place (a location or an area) with what it wants there. A town that grows in play brings no new factions: a district may get a seat of one the world has; a new faction comes only from a storyline or a great line.

## realms (data/factions.yaml)

The lands and powers beyond the region, and how they stand to each other.

When a world has none: No realms and no politics.

A list; each has:

| field | what it holds | kind | required | default |
| --- | --- | --- | --- | --- |
| id | The realm's id: a key, never changed once committed, and never shown to the player. | text | yes |  |
| name | Its name as the player sees it. | text | yes |  |
| ruler | Who rules it, in words: "Count Aelbrecht". | text | yes |  |
| capital | Where it is ruled from, in words. | text | yes |  |

## tensions (data/factions.yaml)

How two realms stand at the start.

When a world has none: All at peace.

A list; each has:

| field | what it holds | kind | required | default |
| --- | --- | --- | --- | --- |
| between | The two realms or factions it is between. | 2 values | yes |  |
| tension | How high it runs, from 0 (at peace) to 100 (at war). | number | yes |  |
| why | What it is about, in a sentence. | text | yes |  |

## plans (data/plans.yaml)

Consequences and schemes in steps: a flood, a muster, an opponent who does not wait.

When a world has none: Nothing unfolds but what the rules make.

A list; each has:

| field | what it holds | kind | required | default |
| --- | --- | --- | --- | --- |
| id | The plan's id: a key, never changed once committed, and never shown to the player. | text | yes |  |
| name | What the plan is, in a few words. | text | yes |  |
| groups | The groups by area: everyone who lives there, alive and not travelling with the player. | a map of names to a map: areas, npcs, except | no | {} |
| phases | Phases in order: after so many days, what happens (effects on people, places and the world). | list of a map: after, effects | no | [] |
| max_effects | At most this many effects in each phase (design: a plan has a maximum). | number | no | 30 |
| steps | Steps in order: what people do, and when, with the news each step makes. | list of a map: id, at, after, wait, each, when, otherwise, chance, every, unguarded, ... | no | [] |
| expires | Days after which what is left of the plan lapses. | number | no |  |
| topic | What it is about: one plan per person per topic. | text | no |  |

## watchers (data/watchers.yaml)

What change is a signal: a death, a theft, a shortage, a threat.

When a world has none: Changes pass without a signal.

A list; each has:

| field | what it holds | kind | required | default |
| --- | --- | --- | --- | --- |
| id | The watcher's id: a key, never changed once committed, and never shown to the player. | text | yes |  |
| signal | The signal it gives: the aftermath and intentions of this signal follow. | text | yes |  |
| event | A name for what happened, for an aftermath that answers only this event of the signal. | text | no |  |
| fact | A new fact with a claim of this key, and of this value or kind if given. Its people: $subject, $value, $about. | a map: key, value, not, kind | no |  |
| belief | Someone comes to believe a claim of this key (and value or kind): $a who believes it, $b who told them (M8.2). | a map: key, value, kind | no |  |
| when | Conditions that come true: a signal each time they do. | list of one of: a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map | no |  |
| probe | A state the system works out: a house nobody has lived in for so many days ($place), a household that rose so many standings ($a and the rest of it). | one of: a map: house_empty \| a map: standing_rise \| a map: grudge \| a map: strangers_stay \| a map: friction \| a map: shortage \| a map: surplus \| a map: price_doubled \| a map: missing_trade \| a map: befriended \| a map: pulse | no |  |
| who | Who it is about; for a fact, by default the subject and the value of its claim. | list of text | no |  |
| place | Where it happens, when the conditions do not say. | text | no |  |
| belang | How much it matters, from 0 to 5; left out, that of the fact. | number | no |  |

`probe: { pulse: <kind> }` (visitor, tiding, request, letter, gesture or place): never by itself. When the stranger has had nothing new near them for days (the knob story.hooks_per_week) and the chronicler brought nothing, the rule sets off one of these where the stranger is, never two of a kind in a row; its aftermath plays it with $a someone near them and $place where they are.

## tides (data/tides.yaml)

The great lines: great dangers (a war, a flood, a famine, a storm) that grow day by day from what drives them and are judged on the first of each month: nothing, a threat, or the event, a plan the engine plays.

When a world has none: Nothing great happens by itself: no war, flood or famine comes unless a storyline brings it.

A list; each has:

| field | what it holds | kind | required | default |
| --- | --- | --- | --- | --- |
| id | The great line's id: a key, never changed once committed, and never shown to the player. | text | yes |  |
| name | Its name as the player sees it in the journal: "the war in the south". | text | yes |  |
| kind | What it is, in a word the chronicler and the journal use: war, flood, famine, plague, uprising, storm. | text | yes |  |
| areas | The areas it strikes: its threat and its news are there. | list of text | yes |  |
| drivers | What pushes it each day it holds (a fact, a shortage, a flag), with a weight; a negative weight calms it. | list of one of: a map \| a map \| a map \| a map \| a map | yes |  |
| threat | From this pressure it may threaten. | number | yes |  |
| threshold | From this pressure it may break. | number | yes |  |
| threatens | What a threat does: a mood of threat in its areas with this line, news, and prices up a little. | a map: line, news, prices, days | yes |  |
| plan | The plan of the content that plays the event, run by the engine. | text | yes |  |
| breaks | What is said when it breaks: the fact of belang 5. | a map: title, precise, village, far | yes |  |
| cooldown | Days after an event before it may break again (without: the knob tides.cooldown_days). | number | no |  |
| mediation | Who the stranger may bring to one table once the line stands at its threat (M10.22): the two people of its two sides, how much a good outcome eases it (at most ten, the rule for a shift), and what the chronicle says afterwards. | a map: between, eases, told | no |  |

`drivers`: each pushes the line every day it holds, by its weight (negative calms): `season` (a season of this world), `tension` with `at_least` (two realms), `short` (a settlement short of an item or anything), `flag`, or `fact` (the facts of the day of a kind, a belang, about someone, or by the stranger). The pressure loses a little every day. From `threat` it may threaten, from `threshold` break; the event is `plan`, a plan of the content, with `breaks` as its fact of belang 5; at most one event a season, then `cooldown` days.

`mediation` (optional, M10.22): `between` two people of the two sides, `eases` (at most 10) and `told` (what the chronicle says): once the line stands at its threat, the stranger with standing (a faction of either side, or the trust of both) may bring the two to one table with MEDIATE BETWEEN; Persuade and Insight decide where the world has those skills, and the outcome shifts the pressure. What the stranger's deeds push (drivers `by: player`, their crimes too) moves a line at most ten a day.

## aftermath (data/aftermath.yaml)

What follows a signal by custom, in steps of verbs.

When a world has none: Signals have no custom aftermath.

A list; each has:

| field | what it holds | kind | required | default |
| --- | --- | --- | --- | --- |
| id | The aftermath's id: a key, never changed once committed, and never shown to the player. | text | yes |  |
| signal | The signal it follows. | text | yes |  |
| event | Only for this event of the signal; left out, for every event. | text | no |  |
| when | Only when these hold, with the bindings of the signal. | list of one of: a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map | no | [] |
| topic | One plan per person per topic: a second signal about the same does not start a second plan. | text | yes |  |
| expires | Days after which what is left of it lapses. | number | no | 30 |
| groups | The groups it moves, by area: everyone who lives there, alive and not travelling with the stranger. | a map of names to a map: areas, npcs, except | no | {} |
| steps | What follows, step by step: what people do, and when, with the news each step makes. | list of a map: id, at, after, wait, each, when, otherwise, chance, every, unguarded, ... | yes |  |
| brain | The brain of $a may plan this for themselves and their household instead (M8.2); this is what happens without it. | yes or no | no | false |
| about | Whom it is about, for one plan per person and topic: all people of the signal, or only the first ($a; the second only told them). | one of all, first | no | "all" |

## intentions (data/intentions.yaml)

What a person may choose to do about a signal, with a model.

When a world has none: People follow custom.

A list; each has:

| field | what it holds | kind | required | default |
| --- | --- | --- | --- | --- |
| id | The intention's id: a key, never changed once committed, and never shown to the player. | text | yes |  |
| signal | The signal it answers. | text | yes |  |
| event | Only for this event of the signal; left out, for every event. | text | no |  |
| when | Who may choose it: conditions with $a the one who chooses. | list of one of: a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map | no | [] |
| topic | What it is about: one plan per person per topic. | text | yes |  |
| expires | Days after which what is left of it lapses. | number | no | 14 |
| groups | The groups it moves, by area: everyone who lives there, alive and not travelling with the stranger. | a map of names to a map: areas, npcs, except | no | {} |
| about | Whom it is about: all people of the signal, or only the first ($a). | one of all, first | no | "first" |
| choice | What the brain chooses from: a name, one line, and the bindings it fills in (a person, a place, a house). | a map: name, line, open | yes |  |
| steps | What follows once it is chosen, step by step. | list of a map: id, at, after, wait, each, when, otherwise, chance, every, unguarded, ... | yes |  |

## verbs (data/verbs.yaml)

How each verb is told as news in this world.

When a world has none: The standard words.

A list; each has:

| field | what it holds | kind | required | default |
| --- | --- | --- | --- | --- |
| id | The verb whose news this is: set_tie, move_home, set_work, feast and the rest. | one of set_tie, end_tie, move_home, join_household, leave_household, set_work, quit_work, hire, ... | yes |  |
| belang | How much the news matters, from 0 to 5. | number | yes |  |
| title | The news in a few words, for the journal. | text | yes |  |
| precise | How someone who was there tells it. | text | yes |  |
| village | How it goes round the village. | text | yes |  |
| far | How it reaches other places. | text | yes |  |

## creatures (rules/bestiary.yaml)

Creatures with their numbers for a fight.

When a world has none: No creatures.

A list; each has:

| field | what it holds | kind | required | default |
| --- | --- | --- | --- | --- |
| id | The creature's id: a key, never changed once committed, and never shown to the player. | text | yes |  |
| name | Its name as the player sees it. | text | yes |  |
| plural | Its name for more than one, when adding an s is wrong. | text | no |  |
| kind | What it is: beast, human, spirit, undead or fey. | one of beast, human, spirit, undead, fey | yes |  |
| level | Its level, from -1 to 20: how hard it is to beat. | number | yes |  |
| hp | Its hit points. | number | yes |  |
| defence | Its defence: what an attack must reach to hit it. | number | yes |  |
| saves | Saves; missing ones are level + 3. | a map of names to number | no | {} |
| perception | Its perception, for who acts first; left out, its level plus 4. | number | no |  |
| attacks | Its attacks: bonus, damage and what a hit does. | list of a map: name, bonus, damage, kind, crit, effect | no | [] |
| abilities | What else it can do in a fight, each with a name and a difficulty to resist. | list of a map: actions, uses, target, range, do, id, name, dc | no | [] |
| morale | How it holds up: courage from -2 to 3, fleeing below a share of its hit points, giving up. | a map: courage, flees_below, surrenders, never | no | {"courage":0,"surrenders":false,"neve... |
| immune | Damage and conditions that do nothing to it. | list of text | no | [] |
| weak | Things that hurt it more: iron, fire, light. | a map of names to number | no | {} |
| faction | The faction it belongs to (M10.17, before the Goat-Riders by name in code): beating it costs standing with that faction, paying it gains a little, binding one for the law costs, letting one go gains; and the fact of a fight is about that faction's topic, when there is one. | text | no |  |
| reputation | Further reputation per outcome of a fight with it: "you stood up to the Goat-Riders" with the village. | a map of names to list of a map | no | {} |
| lore | What the stories say (Recall): a Lore DC, and the weakness it tells. | a map: dc, text, topic | no |  |
| text | What the stranger sees of it, in a sentence or two. | text | yes |  |
| says | Words for the fight: how it attacks, how it flees, how it gives up. | a map: hit, flee, surrender, down | no | {} |

## encounters (rules/bestiary.yaml)

Fights that may happen at places and times.

When a world has none: No fights happen.

A list; each has:

| field | what it holds | kind | required | default |
| --- | --- | --- | --- | --- |
| id | The encounter's id: a key, never changed once committed, and never shown to the player. | text | yes |  |
| name | What it is, in a few words. | text | yes |  |
| places | Where it can happen: locations, or area ids for the hexes of a region. | list of text | yes |  |
| chance | The chance each time the player comes there. | number | no | 0.25 |
| again_after | Days before it can happen again. | number | no | 3 |
| hours | Only between these hours: from, to. | 2 values | no |  |
| foes | Who it is: creatures, how many, how near, and when more join. | list of a map: creature, count, range, joins | yes |  |
| opening | What the stranger reads when it starts. | text | yes |  |
| demand | A demand before blows: pay and it ends. | a map: amount, text, paid | no |  |
| surrender | What happens if the player gives up. | a map: take, text | yes |  |
| flee_dc | How hard it is to get away. | number | no | 15 |
| news | The fact the village hears afterwards; {outcome} is filled in. | a map: title, belang | no |  |
| when_flag | Only while this flag is set (the fen without its keeper). | text | no |  |
| unless_flag | Never while this flag is set (the trick unmasked). | text | no |  |
| win_flag | A flag set when the player wins (for quests). | text | no |  |
| load | With a load on the way (M9.1): how likely then, and what share of the load they take from whoever gives in. | a map: chance, take | no |  |
| tempts | Once met, a disloyal companion may hear an offer from this side (M10.17, before the Goat-Riders' toll by name). | yes or no | no | false |

## settlements (data/economy.yaml)

The ledger of each settlement: people, what they use and keep, workshops.

When a world has none: Fixed prices, and shops stocked as written.

A list; each has:

| field | what it holds | kind | required | default |
| --- | --- | --- | --- | --- |
| id | The area it is. | text | yes |  |
| tags | What kind of place it is, for conditions: trade_town, peat_village, priory. | list of text | no | [] |
| people | Nameless grown people. | number | yes |  |
| use | What the nameless use in a day, all together. | a map of names to number | no | {} |
| keep | What it aims to hold in store (and has at the start); twice that is a surplus, and only above it goes out on a route. | a map of names to number | no | {} |
| stock | What it has at the start where that is not what it keeps: after the storm, no flour. | a map of names to number | no | {} |
| resources | The ground around it. | list of text | no | [] |
| workshops | Its workshops: where, the trade, and what they make from what, each day. | list of a map: id, name, at, makes, uses, from, requires, workers, named | no | [] |
| openness | How much more (or less) open to strangers than its kind and its living make it. | number | no | 0 |
| income | What comes in from outside in a day, in the smallest coin: travellers, rents, the market. | number | no | 0 |

## resources (data/economy.yaml)

The ground and what it gives.

When a world has none: Nothing is gathered from the land.

A list; each has:

| field | what it holds | kind | required | default |
| --- | --- | --- | --- | --- |
| id | The ground's id: a key, never changed once committed, and never shown to the player. | text | yes |  |
| name | Its name as the player sees it: "the peat cuttings". | text | yes |  |
| gives | The goods this ground gives. | list of text | yes |  |
| months | The months it gives in (1 to 13); every month when left out. | list of number | no |  |
| amount | All there is, in units of what it gives; without it, it never runs out. | number | no |  |
| gather | What the stranger can gather of it by hand (M10.5): Survival against the dc, where a place names this ground. | a map: item, dc, qty, minutes, text | no |  |

## routes (data/economy.yaml)

Trade routes that carry goods between settlements and from beyond.

When a world has none: No goods come in.

A list; each has:

| field | what it holds | kind | required | default |
| --- | --- | --- | --- | --- |
| id | The route's id: a key, never changed once committed, and never shown to the player. | text | yes |  |
| name | Its name as the player sees it. | text | yes |  |
| from | A settlement or a region beyond the map. | text | yes |  |
| to | A settlement. | text | yes |  |
| carries | What comes on a trip; from a settlement only what it has above what it keeps. | a map of names to number | yes |  |
| returns | What goes back on the same trip, from what the other side has above what it keeps. | a map of names to number | no | {} |
| by | Who carries the goods: a wagon, a barge, a pedlar. | text | yes |  |
| every | Every so many days. | number | no | 1 |
| via | A way it runs over: if that way is closed, so is the route. | 2 values | no |  |
| closed | Closed from the start. | yes or no | no | false |
| toll | A toll gate on the way: whoever carries a load of this route past it pays (M9.1). | a map: at, amount, by | no |  |

## outlands (data/economy.yaml)

Regions beyond the map that trade and can be travelled to.

When a world has none: Nothing beyond the map trades.

A list; each has:

| field | what it holds | kind | required | default |
| --- | --- | --- | --- | --- |
| id | The region's id: a key, never changed once committed, and never shown to the player. | text | yes |  |
| name | Its name as the player sees it. | text | yes |  |
| topic | The topic people talk about it by. | text | no |  |
| realm | The realm it belongs to, when one of the world's. | text | no |  |
| sends | The goods it sends. | list of text | yes |  |
| asks | The goods it takes in return. | list of text | no | [] |
| prices | Its prices against ours: 1.2 is a fifth dearer. | number | no | 1 |
| by | Who carries the goods: a wagon, a barge, a pedlar. | text | yes |  |
| every | Every so many days. | number | yes |  |
| faith | What most people there hold, when it is not what most here hold (M9.1). | text | no |  |

## newcomers (data/growth.yaml)

Households that may come to live in the world.

When a world has none: Nobody moves in.

A list; each has:

| field | what it holds | kind | required | default |
| --- | --- | --- | --- | --- |
| id | The household's id: a key, never changed once committed, and never shown to the player. | text | yes |  |
| trade | The workshop they take up, by its id in a settlement. | text | yes |  |
| from | Where they come from: a region beyond the map, or an area. | text | yes |  |
| people | Who comes: the head first, each with a name, pronoun, age and what they do. | list of a map: role, age, profession, pronoun, looks | yes |  |
| facts | What anyone may know about the head: {name}, {from}, {area}, {their} are filled in. | list of text | no | [] |
| speech | How the head talks, for the voice. | text | no |  |

## projects (data/growth.yaml)

What settlements may build.

When a world has none: Nothing is built.

A list; each has:

| field | what it holds | kind | required | default |
| --- | --- | --- | --- | --- |
| id | The project's id: a key, never changed once committed, and never shown to the player. | text | yes |  |
| name | What is built, in words. | text | yes |  |
| settlement | The settlement that builds it. | text | yes |  |
| after | A project that must be finished first. | text | no |  |
| needs | All the materials, taken from the store a workday at a time. | a map of names to number | no | {} |
| days | Workdays; a rest day does not count. | number | yes |  |
| cost | The money it costs, from the purse of the settlement and what others put in. | number | no | 0 |
| place | A new place when it is finished, written as a location. | a map of names to unknown | no |  |
| link | The way into the new place from a place that is there. | a map: from, direction, minutes | no |  |
| workshops | Workshops the settlement has once it is finished. | list of a map: id, name, at, makes, uses, from, requires, workers, named | no | [] |
| sets | Flags set when it is finished: descriptions that change with it. | list of text | no | [] |
| crowd | Nameless workers at the site while it is built (M9.1). | a map: name, one, count, at, from, profession, looks | no |  |

`link.minutes`: the minutes on foot from the place it links from, as far as it really lies (a yard next door two or three, a works down the road ten); left out, three.

## crafts (data/crafts.yaml)

Crafts with their techniques, to learn and practise.

When a world has none: No crafts to learn.

A list; each has:

| field | what it holds | kind | required | default |
| --- | --- | --- | --- | --- |
| id | The craft's id: a key, never changed once committed, and never shown to the player. | text | yes |  |
| name | Its name as the player sees it: "Baking", "Field Electronics". | text | yes |  |
| maker | What someone of the craft is called, in words: a baker, a smith, a field technician. Never an id: the stranger reads "You are a journeyman baker now". | text | yes |  |
| skill | The skill it leans on at the start. | text | yes |  |
| professions | The trades that have it: they teach it. | list of text | no | [] |
| techniques | What can be learnt of it, each with an id and a name; a recipe names the technique it practises. | list of a map: id, name | no | [] |
| masterwork | What a masterwork of this craft is, in words, for the sheet and the chronicler. | text | no |  |
| practice | Practice for journeyman, expert and master: first balance values. | 3 values | no | [10,30,100] |
| per_day | At most this much practice a day: the rest is only work. | number | no | 5 |
| failure | What a failed attempt leaves, for every recipe of the craft that says nothing of its own (M10.14). | a map: outcome, item, qty, share, why, critical | no |  |
| cooldown_text | What is said when a recipe is tried again too soon after failing (M10.29, the knob crafts.fail_cooldown): "the iron has overheated". | text | no |  |

## props (data/props.yaml)

Templates of objects the chronicler may place in a home: a chest, a letter.

When a world has none: The chronicler places nothing.

A list; each has:

| field | what it holds | kind | required | default |
| --- | --- | --- | --- | --- |
| id | The template's id: a key, never changed once committed, and never shown to the player. | text | yes |  |
| type | The object type it is. | text | yes |  |
| name | Its name, with {owner}: "{owner}'s chest". | text | yes |  |
| where | Tags of the owner's home it fits: a chest stands in a house (private), not on the green. | list of text | yes |  |
| lock | The lock it may have: the qualities and materials to choose from; left out, no lock. | a map: quality, material | no |  |
| items | What it may hold, besides money: the owner's own things of this kind. | list of text | no | [] |
| max_items | At most this many things in it, besides money. | number | no | 2 |
| money | At most this share of the owner's purse goes in it. | number | no | 0 |
| check_hour | The owner's fixed moment to look in it, the hour: then a loss is found. | number | no | 21 |
| hints | Hints in the owner's words: {owner}, {their}, {things}, {place}. The first is where it is and what is in it. | list of a map: precise, village, far | yes |  |

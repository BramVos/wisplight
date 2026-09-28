# The content contract

Everything a world can have, per kind, generated from the schemas in `src/engine` by `npm run content:contract` (M10.17). Do not edit by hand: a test fails when this file no longer matches the schemas.

A world is a folder `content/<world>/` of YAML files. Each file holds one or more of the kinds below as top-level keys; the file names are a habit, not a rule. Whatever a world leaves out takes a neutral default, never the values of another world. Ids are keys and never change once committed (`ids.lock`).

## How a world grows during play

Nothing in a world makes itself. During play it grows only at three moments, never because the stranger merely walks near:

1. The stranger comes to what was only a sketch: a far place the world book names (on foot, from the edge of the map or by its road), or a person named in a talk (M10.9), met where they live.
2. A line of transport (M10.12) takes them to a place beyond the map.
3. At night the chronicler needs one place or person for a storyline, within its budget.

A far place grows in layers, each only when needed: the sketch, a name and a line from the world book, costs nothing; arriving makes it playable from templates, without a model; the outline, one small call, comes when the stranger talks to someone there or stays the night; a second visit costs nothing. Beyond the last land the world book names, nothing is made: the edge of the map says what lies beyond (a region's `beyond`), and past the far places the known world ends.

## world (world.yaml)

The frame of the world: its name and start, the frame every model call gets, the calendar, coins, law, faiths, towns, weather, map and palette with the signs on its land, and the words its texts use for the land and the region.

When a world has none: A world has exactly one. What it leaves out takes the neutral default: "the land", "the region", a law without an officer, no faith, the standard calendar, coins and palette, and the Nethermarch's signs on the land.

One block with:

| field | what | required | default |
| --- | --- | --- | --- |
| id | text | yes |  |
| name | text | yes |  |
| intro | text | no |  |
| start | a map: location, year, month, day, hour, minute | yes |  |
| player | a map: money, inventory | yes |  |
| knowledge | a map: chance, bands_km, max_level, modifiers | no | {"chance":[[0.1,0,0,0,0],[0.9,0.4,0.0... |
| frame | text | no |  |
| pictures | a map: style | no |  |
| map | a map: palette, levels | no |  |
| words | a map: land, region, from, sleep | no |  |
| calendar | a map: era, months, weekdays, start_weekday | no |  |
| weather | a map: seasons, chances, stay, prevailing, lines, readers | no |  |
| money | a map: units | no |  |
| law | a map: where, officer, npc, office, lord, fines, hearing | no |  |
| towns | list of a map: id, area, where, officer, offices, trade_ban, cleared | no | [] |
| standing | a map: names, offices | no |  |
| plans | list of text | no | [] |
| names | a map: she, he, family | no |  |
| sketch | a map: bonds, domains | no |  |
| newcomers_per_season | number | no | 6 |
| faiths | list of a map: id, name, patrons, oaths, faction | no | [] |
| bells | list of a map: id, name, at, hours, heard, far, line, far_line | no | [] |
| knobs | a map of names to one of: number \| a map of names to number | no |  |

`knobs`: rules of play set otherwise than the default, by the id of a knob (docs/KNOBS.md): `talk.max_turns: 30`; for a table only the rows that differ.

`map.palette.signs`: the signs on this world's land by an id of its own (`mine_shaft`, never the Nethermarch's `peat_pit`), at most seven; each needs a colour under `glyph` in the dark and the paper style. `means: danger` or `uncertain` adds a mark and a word, not only a colour. Left out, the world has the Nethermarch's pool, peat_pit, willow, ruin and hummock.

`map.palette.names` also names the ways in the legend: `road`, `path` and `canal` (a tow path in the Nethermarch; `canal: tidal channel` elsewhere).

## areas (data/areas.yaml)

The villages, towns, inns and stretches of wild land places belong to; who lives in an area knows it.

When a world has none: Nothing can be placed: at least one area is needed.

A list; each has:

| field | what | required | default |
| --- | --- | --- | --- |
| id | text | yes |  |
| name | text | yes |  |
| kind | one of village, town, city, hamlet, inn, route, wilderness | yes |  |
| aliases | list of text | no | [] |
| summary | text | yes |  |
| fame | number | no | 1 |
| pos | 2 values | no |  |
| topic | text | no |  |
| market_days | list of text | no | [] |
| sound | one of: one of wind, reeds, rain, sea, surf, hearth, crowd, workshop, ... \| a map: kind, level, night | no |  |
| improvise | a map: domain, may, fallback, takes | no |  |
| barred | list of a map: when, carrying, text | no | [] |

## locations (areas/<area>/locations.yaml)

The places the stranger can stand in: their descriptions, exits, objects, services and things to look at.

When a world has none: Nothing to stand in: at least one location is needed, the start.

A list; each has:

| field | what | required | default |
| --- | --- | --- | --- |
| id | text | yes |  |
| name | text | yes |  |
| area | text | yes |  |
| tags | list of text | no | [] |
| aliases | list of text | no | [] |
| summary | text | no |  |
| faith | text | no |  |
| sound | one of: one of wind, reeds, rain, sea, surf, hearth, crowd, workshop, ... \| a map: kind, level, night | no |  |
| improvise | a map: domain, may, fallback, takes | no |  |
| description | a map: day, night | yes |  |
| variants | list of a map: flag, when, day, night | no | [] |
| exits | a map of names to a map: to, minutes, lock | no | {} |
| objects | list of a map: id, type, name, description, owner, household, staff, provider, hours, days, ... | no | [] |
| services | list of a map: id, sells, buys, lodging, provider, staff, premises, hours, days, supply, ... | no | [] |
| items | a map of names to number | no | {} |
| pos | 2 values | no |  |
| forage | list of text | no | [] |
| hidden | list of a map: id, dc, text, item, qty, topic | no | [] |
| details | list of a map: words, look, take, verbs | no | [] |
| arrival | a map: text, mist, night, storm, far | no |  |

## professions (data/professions.yaml)

What people do all day: the hours of work, home and sleep that move them about.

When a world has none: People keep to their homes.

A list; each has:

| field | what | required | default |
| --- | --- | --- | --- |
| id | text | yes |  |
| name | text | yes |  |
| schedule | list of a map: from, to, activity, at, days | yes |  |
| daily_goals | list of a map: type, item, service, object, qty, days | no | [] |
| teaches | text | no |  |

## npcs (areas/<area>/npcs.yaml)

The people: who they are, where they live and work, what they know, who they are to each other, and how they speak.

When a world has none: An empty world: nobody to talk to.

A list; each has:

| field | what | required | default |
| --- | --- | --- | --- |
| id | text | yes |  |
| name | text | yes |  |
| short | text | yes |  |
| pronoun | one of she, he, they | yes |  |
| age | number | yes |  |
| profession | text | yes |  |
| hidden | yes or no | no | false |
| cover | text | no |  |
| short_public | text | no |  |
| home | text | yes |  |
| work | text | no |  |
| household | text | no |  |
| fame | number | no | 0 |
| appearance | text | yes |  |
| personality | a map: warmth, courage, honesty, temper, curiosity, diligence | yes |  |
| values | a map of names to number | no | {} |
| quirks | list of text | no | [] |
| speech | text | no |  |
| voice | text | no |  |
| aliases | list of text | no | [] |
| public_facts | list of text | no | [] |
| examples | list of text | no | [] |
| money | number | no | 0 |
| inventory | a map of names to number | no | {} |
| knows_areas | list of text | no | [] |
| child | yes or no | no | false |
| patron | text | no |  |
| fighter | a map: class, level | no |  |
| companion | a map: wage, approves, disapproves, limits, campfire, slow, quest | no |  |
| portrait | one of unique, generic | no | "unique" |
| absent | yes or no | no | false |
| faith | text | no |  |
| creature | text | no |  |
| romance | a map: open_to, from, note | no |  |
| hires | list of a map: id, name, aliases, price, hours, crosses, where, line, free_for_friends | no | [] |
| relations | list of a map: to, name, pronoun, role, bond, status, private, owes, note | no | [] |
| secrets | list of a map: id, text, hint, admission, dc, teaches, about | no | [] |

`secrets`: `about` and `teaches` take ids: a topic, a person (an NPC id), a place (a location id) or an area (`area_<id>`).

## items (data/items.yaml)

Things that can be carried, eaten, worn, bought and sold.

When a world has none: No things.

A list; each has:

| field | what | required | default |
| --- | --- | --- | --- |
| id | text | yes |  |
| name | text | yes |  |
| plural | text | no |  |
| description | text | yes |  |
| aliases | list of text | no | [] |
| tags | list of text | no | [] |
| value | number | yes |  |
| used | text | no |  |
| quality | one of poor | no |  |
| of | text | no |  |
| food | number | no |  |
| weapon | a map: damage, kind, light, two_hands, crit, range, iron | no |  |
| armour | a map: kind, defence, cap | no |  |
| remedy | a map: heal, cures | no |  |

## object_types (data/objects.yaml)

Kinds of objects in places, with what can be done with them (use, open, repair, work at).

When a world has none: Objects cannot be used.

A list; each has:

| field | what | required | default |
| --- | --- | --- | --- |
| id | text | yes |  |
| name | text | yes |  |
| description | text | yes |  |
| aliases | list of text | no | [] |
| affordances | list of a map: id, verb, label, actors, access, consumes, produces, duration, fee, satisfies, ... | no | [] |
| details | list of a map: words, look, take, verbs | no | [] |
| inscription | a map: text, dc, look, topic | no |  |
| repair | a map: consumes, duration, sets, narrate_end | no |  |
| improvise | a map: domain, may, fallback, takes | no |  |

## topics (data/topics.yaml)

What people can talk about: lore, far places, people outside the game; with who knows it how well.

When a world has none: People only talk of each other and the places around them.

A list; each has:

| field | what | required | default |
| --- | --- | --- | --- |
| id | text | yes |  |
| name | text | yes |  |
| kind | one of lore, fact, place, person | yes |  |
| aliases | list of text | no | [] |
| summary | text | yes |  |
| details | text | no |  |
| story | text | no |  |
| teller | text | no |  |
| origin | text | no |  |
| pos | 2 values | no |  |
| standing_talk | yes or no | no | false |
| everywhere | yes or no | no | false |
| audience | a map of names to number | no | {} |
| fame | number | no | 2 |
| known_by | list of text | no | [] |
| districts | list of a map: id, name, line | no | [] |

`districts` (a far town, kind place): its quarters as the world book names them, each with an id, a name and a line; the first is where the stranger comes in. The game makes the first playable when the stranger does something there (buys, asks, rents a bed), and each other when they go into it by its street; without a model from templates and the line.

## news (data/news.yaml)

Rumours going round at the start.

When a world has none: No rumours at the start.

A list; each has:

| field | what | required | default |
| --- | --- | --- | --- |
| id | text | yes |  |
| title | text | yes |  |
| about | list of text | no | [] |
| place | text | yes |  |
| belang | number | yes |  |
| truth | yes or no | no | true |
| known_by | a map of names to text | no | {} |
| text | a map: precise, village, far | yes |  |

## patterns (data/patterns.yaml)

Small stories the world may start by itself: a lost thing, a quarrel.

When a world has none: No small stories start by themselves.

A list; each has:

| field | what | required | default |
| --- | --- | --- | --- |
| id | text | yes |  |
| kind | one of lost_thing, quarrel, theft, sickness, feast | yes |  |
| belang | number | yes |  |
| weight | number | no | 1 |
| items | list of text | no | [] |
| reasons | list of text | no | [] |
| date | a map: month, day | no |  |
| place | text | no |  |
| text | a map: title, precise, village, far | yes |  |
| scene | text | no |  |

## quests (data/quests.yaml)

Written quests with their ways and endings.

When a world has none: No written quests; requests still come up from what happens.

A list; each has:

| field | what | required | default |
| --- | --- | --- | --- |
| id | text | yes |  |
| name | text | yes |  |
| kind | one of main, request, mystery, bargain, threat, discovery, conflict, social, ... | yes |  |
| summary | text | yes |  |
| givers | list of text | no | [] |
| helpers | list of text | no | [] |
| opponents | list of text | no | [] |
| starts | a map: talk, at, when, at_start | no | {"talk":[],"at":[],"when":[],"at_star... |
| ask | text | no |  |
| stages | list of a map: id, text, on_enter, next | no | [] |
| actions | list of a map: id, say, intent, at, with, when, not_yet, check, effects, fail, ... | no | [] |
| outcomes | list of a map: id, name, text, solution, when, effects | no | [] |
| on_death | a map of names to text | no | {} |
| on_place | a map of names to text | no | {} |
| timer | a map: clock, every_hours, unless | no |  |
| lapses | a map: after_days, when_far, text, effects | no |  |

## regions (regions/<region>/region.yaml)

The map of the land: terrain, ways, landmarks and where places lie on it, with the region's own lands (black basalt, open sea), each walking like one of the engine's.

When a world has none: No map: the world is walked by its exits. The editor lays out a first one from the places, their exits and minutes (Palette tab).

A list; each has:

| field | what | required | default |
| --- | --- | --- | --- |
| id | text | yes |  |
| name | text | yes |  |
| area | text | yes |  |
| origin | 2 values | yes |  |
| size | 2 values | yes |  |
| hex | number | yes |  |
| seed | number | yes |  |
| legend | a map of names to text | yes |  |
| lands | a map of names to a map: like, text | no | {} |
| zones | text | yes |  |
| zone | 2 values | no |  |
| rules | list of one of: a map \| a map \| a map | no | [] |
| landmarks | list of a map: area, text, range | no | [] |
| beyond | list of a map: side, text, toward | no | [] |
| paths | list of a map: kind, name, via, level, topic, text | no | [] |

`zones`: one character is `zone` km east to west and north to south (without it half a km by one), the top row the north edge; every character is in `legend`.

`lands`: the region's own terrains by the key of their palette tints, each with `like` (woods, fields, fen, water or heath: its minutes, its sight, what swallows a leg) and `text` (the line the stranger reads there).

`paths[].text`: the line walking along it; without one, the Nethermarch's line for a road, tow path or path.

`beyond`: per edge (north, east, south or west) the line the stranger reads on reaching it, from the world book, and `toward`: the far places that way (topics), which they may go on to on foot or by a line. An edge without one says that nobody has told them; beyond the last land the world names, nothing is made.

## rules (rules/rules.yaml)

The rules of play: skills, ancestries, backgrounds, classes and talents, conditions and patrons.

When a world has none: No character to make and no fights: the stranger talks, trades and walks.

One block with:

| field | what | required | default |
| --- | --- | --- | --- |
| xp_per_level | number | no | 1000 |
| skills | list of a map: id, name, attribute | no | [] |
| ancestries | list of a map: id, name, text, attributes, hp, special, aptitude, immune, aliases, distrusted_by | no | [] |
| backgrounds | list of a map: id, name, skills, talent, knows, topics, reason, contact, heard | no | [] |
| general_talents | list of a map: id, name, text, effects | no | [] |
| conditions | list of a map: id, name, text, max | no | [] |
| classes | list of a map: id, name, text, key, hp, trained, armour, proficiency, gear, core, ... | no | [] |
| patrons | list of a map: id, name, text, values, forbids, blessings, sworn | no | [] |
| ready_made | a map: name, ancestry, background, class, boosts, skills, talent | no |  |
| suggest | a map of names to text | no |  |
| death | a map: vision, guide, patron, wake, mark, rite_where, rite_done, rite_nothing, price | no |  |

## voice (data/voice.yaml)

How people speak: oaths per faith, rare sayings, how they call a stranger, time and measures, and what does not exist here.

When a world has none: The fixed list of modern words is kept out, and nothing else.

One block with:

| field | what | required | default |
| --- | --- | --- | --- |
| oaths | a map of names to list of text | no | {} |
| sayings | list of text | no | [] |
| groups | list of a map: id, name, sayings, oaths, areas, professions | no | [] |
| default_group | text | no |  |
| address | a map: stranger, known, friend, high | no | {"stranger":[],"known":[],"friend":[]... |
| time | list of text | no | [] |
| distance | list of text | no | [] |
| measures | list of text | no | [] |
| not_here | list of a map: word, instead | no | [] |

## journey (data/journey.yaml)

Sentences for a journey of more than a few steps: per terrain, weather and the night, and what may happen on the way.

When a world has none: A walk is told in one line.

One block with:

| field | what | required | default |
| --- | --- | --- | --- |
| terrain | a map of names to list of text | no | {} |
| weather | a map of names to list of text | no | {} |
| night | list of text | no | [] |
| on_the_way | list of a map: text, where, night, minutes | no | [] |

## passages (data/passages.yaml)

Lines of transport (a barge, a coach, a ferry, a spaceship): stops, days and departures, fares and legs.

When a world has none: No lines: the stranger walks.

A list; each has:

| field | what | required | default |
| --- | --- | --- | --- |
| id | text | yes |  |
| name | text | yes |  |
| kind | text | yes |  |
| aliases | list of text | no | [] |
| stops | list of text | yes |  |
| days | list of text | no | [] |
| hours | text | no |  |
| departs | list of text | no | [] |
| fare | number | yes |  |
| far_fare | number | no | 0 |
| speed | number | no | 6 |
| stop_minutes | number | no | 0 |
| legs | a map of names to number | no | {} |
| water | yes or no | no | false |
| crew | text | no |  |
| text | text | yes |  |
| closed | text | no |  |
| off | text | no |  |
| where | text | no |  |
| when | list of one of: a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map | no | [] |
| sights | list of text | no | [] |

`legs`: minutes between two of its stops that the map cannot measure, keyed `<stop>><stop>` with a `>` between the ids (`loc_quay>kestrel_landing: 90`).

## returning (data/belonging.yaml)

The words for what changed at a place since the stranger was last there.

When a world has none: Nothing is said when the stranger comes back.

One block with:

| field | what | required | default |
| --- | --- | --- | --- |
| object | a map of names to text | no | {} |
| place | a map of names to text | no | {} |
| came | text | no |  |
| gone | text | no |  |
| dead | text | no |  |
| agreement | text | no |  |

## gestures (data/belonging.yaml)

Small practical things people do after something shared with the stranger.

When a world has none: No gestures.

A list; each has:

| field | what | required | default |
| --- | --- | --- | --- |
| id | text | yes |  |
| who | text | yes |  |
| at | one of arrive, shop, leave | yes |  |
| shared | one of: a map: kept \| a map: memory \| a map: fact \| a map: lodger, away | yes |  |
| do | one of: a map: line \| a map: give, qty, line \| a map: warn \| a map: ask | yes |  |

## lodgings (data/belonging.yaml)

A room the stranger can rent by the week, with a chest and people who expect them.

When a world has none: No room of their own; an inn still lets a bed for the night.

A list; each has:

| field | what | required | default |
| --- | --- | --- | --- |
| id | text | yes |  |
| name | text | yes |  |
| at | text | yes |  |
| keeper | text | yes |  |
| rent | number | no |  |
| chest | yes or no | no | true |

## factions (data/factions.yaml)

Groups with a seat and a stance, whose reputation the stranger earns.

When a world has none: No factions.

A list; each has:

| field | what | required | default |
| --- | --- | --- | --- |
| id | text | yes |  |
| name | text | yes |  |
| seat | text | yes |  |
| wants | text | yes |  |
| stance | text | no |  |
| members | list of text | no | [] |
| allies | list of text | no | [] |
| rivals | list of text | no | [] |
| join | one of: one of never, hired, reputation \| a map: patrons, not_patrons, at, tag, fee, reputation, says | no | "never" |
| law | text | no |  |

## realms (data/factions.yaml)

The lands and powers beyond the region, and how they stand to each other.

When a world has none: No realms and no politics.

A list; each has:

| field | what | required | default |
| --- | --- | --- | --- |
| id | text | yes |  |
| name | text | yes |  |
| ruler | text | yes |  |
| capital | text | yes |  |

## tensions (data/factions.yaml)

How two realms stand at the start.

When a world has none: All at peace.

A list; each has:

| field | what | required | default |
| --- | --- | --- | --- |
| between | 2 values | yes |  |
| tension | number | yes |  |
| why | text | yes |  |

## plans (data/plans.yaml)

Consequences and schemes in steps: a flood, a muster, an opponent who does not wait.

When a world has none: Nothing unfolds but what the rules make.

A list; each has:

| field | what | required | default |
| --- | --- | --- | --- |
| id | text | yes |  |
| name | text | yes |  |
| groups | a map of names to a map: areas, npcs, except | no | {} |
| phases | list of a map: after, effects | no | [] |
| max_effects | number | no | 30 |
| steps | list of a map: id, at, after, wait, each, when, otherwise, chance, every, unguarded, ... | no | [] |
| expires | number | no |  |
| topic | text | no |  |

## watchers (data/watchers.yaml)

What change is a signal: a death, a theft, a shortage, a threat.

When a world has none: Changes pass without a signal.

A list; each has:

| field | what | required | default |
| --- | --- | --- | --- |
| id | text | yes |  |
| signal | text | yes |  |
| event | text | no |  |
| fact | a map: key, value, not, kind | no |  |
| belief | a map: key, value, kind | no |  |
| when | list of one of: a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map | no |  |
| probe | one of: a map: house_empty \| a map: standing_rise \| a map: grudge \| a map: strangers_stay \| a map: friction \| a map: shortage \| a map: surplus \| a map: price_doubled \| a map: missing_trade \| a map: befriended | no |  |
| who | list of text | no |  |
| place | text | no |  |
| belang | number | no |  |

## aftermath (data/aftermath.yaml)

What follows a signal by custom, in steps of verbs.

When a world has none: Signals have no custom aftermath.

A list; each has:

| field | what | required | default |
| --- | --- | --- | --- |
| id | text | yes |  |
| signal | text | yes |  |
| event | text | no |  |
| when | list of one of: a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map | no | [] |
| topic | text | yes |  |
| expires | number | no | 30 |
| groups | a map of names to a map: areas, npcs, except | no | {} |
| steps | list of a map: id, at, after, wait, each, when, otherwise, chance, every, unguarded, ... | yes |  |
| brain | yes or no | no | false |
| about | one of all, first | no | "all" |

## intentions (data/intentions.yaml)

What a person may choose to do about a signal, with a model.

When a world has none: People follow custom.

A list; each has:

| field | what | required | default |
| --- | --- | --- | --- |
| id | text | yes |  |
| signal | text | yes |  |
| event | text | no |  |
| when | list of one of: a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map \| a map | no | [] |
| topic | text | yes |  |
| expires | number | no | 14 |
| groups | a map of names to a map: areas, npcs, except | no | {} |
| about | one of all, first | no | "first" |
| choice | a map: name, line, open | yes |  |
| steps | list of a map: id, at, after, wait, each, when, otherwise, chance, every, unguarded, ... | yes |  |

## verbs (data/verbs.yaml)

How each verb is told as news in this world.

When a world has none: The standard words.

A list; each has:

| field | what | required | default |
| --- | --- | --- | --- |
| id | one of set_tie, end_tie, move_home, join_household, leave_household, set_work, quit_work, hire, ... | yes |  |
| belang | number | yes |  |
| title | text | yes |  |
| precise | text | yes |  |
| village | text | yes |  |
| far | text | yes |  |

## creatures (rules/bestiary.yaml)

Creatures with their numbers for a fight.

When a world has none: No creatures.

A list; each has:

| field | what | required | default |
| --- | --- | --- | --- |
| id | text | yes |  |
| name | text | yes |  |
| plural | text | no |  |
| kind | one of beast, human, spirit, undead, fey | yes |  |
| level | number | yes |  |
| hp | number | yes |  |
| defence | number | yes |  |
| saves | a map of names to number | no | {} |
| perception | number | no |  |
| attacks | list of a map: name, bonus, damage, kind, crit, effect | no | [] |
| abilities | list of a map: actions, uses, target, range, do, id, name, dc | no | [] |
| morale | a map: courage, flees_below, surrenders, never | no | {"courage":0,"surrenders":false,"neve... |
| immune | list of text | no | [] |
| weak | a map of names to number | no | {} |
| faction | text | no |  |
| reputation | a map of names to list of a map | no | {} |
| lore | a map: dc, text, topic | no |  |
| text | text | yes |  |
| says | a map: hit, flee, surrender, down | no | {} |

## encounters (rules/bestiary.yaml)

Fights that may happen at places and times.

When a world has none: No fights happen.

A list; each has:

| field | what | required | default |
| --- | --- | --- | --- |
| id | text | yes |  |
| name | text | yes |  |
| places | list of text | yes |  |
| chance | number | no | 0.25 |
| again_after | number | no | 3 |
| hours | 2 values | no |  |
| foes | list of a map: creature, count, range, joins | yes |  |
| opening | text | yes |  |
| demand | a map: amount, text, paid | no |  |
| surrender | a map: take, text | yes |  |
| flee_dc | number | no | 15 |
| news | a map: title, belang | no |  |
| when_flag | text | no |  |
| unless_flag | text | no |  |
| win_flag | text | no |  |
| load | a map: chance, take | no |  |
| tempts | yes or no | no | false |

## settlements (data/economy.yaml)

The ledger of each settlement: people, what they use and keep, workshops.

When a world has none: Fixed prices, and shops stocked as written.

A list; each has:

| field | what | required | default |
| --- | --- | --- | --- |
| id | text | yes |  |
| tags | list of text | no | [] |
| people | number | yes |  |
| use | a map of names to number | no | {} |
| keep | a map of names to number | no | {} |
| stock | a map of names to number | no | {} |
| resources | list of text | no | [] |
| workshops | list of a map: id, name, at, makes, uses, from, requires, workers, named | no | [] |
| openness | number | no | 0 |
| income | number | no | 0 |

## resources (data/economy.yaml)

The ground and what it gives.

When a world has none: Nothing is gathered from the land.

A list; each has:

| field | what | required | default |
| --- | --- | --- | --- |
| id | text | yes |  |
| name | text | yes |  |
| gives | list of text | yes |  |
| months | list of number | no |  |
| amount | number | no |  |
| gather | a map: item, dc, qty, minutes, text | no |  |

## routes (data/economy.yaml)

Trade routes that carry goods between settlements and from beyond.

When a world has none: No goods come in.

A list; each has:

| field | what | required | default |
| --- | --- | --- | --- |
| id | text | yes |  |
| name | text | yes |  |
| from | text | yes |  |
| to | text | yes |  |
| carries | a map of names to number | yes |  |
| returns | a map of names to number | no | {} |
| by | text | yes |  |
| every | number | no | 1 |
| via | 2 values | no |  |
| closed | yes or no | no | false |
| toll | a map: at, amount, by | no |  |

## outlands (data/economy.yaml)

Regions beyond the map that trade and can be travelled to.

When a world has none: Nothing beyond the map trades.

A list; each has:

| field | what | required | default |
| --- | --- | --- | --- |
| id | text | yes |  |
| name | text | yes |  |
| topic | text | no |  |
| realm | text | no |  |
| sends | list of text | yes |  |
| asks | list of text | no | [] |
| prices | number | no | 1 |
| by | text | yes |  |
| every | number | yes |  |
| faith | text | no |  |

## newcomers (data/growth.yaml)

Households that may come to live in the world.

When a world has none: Nobody moves in.

A list; each has:

| field | what | required | default |
| --- | --- | --- | --- |
| id | text | yes |  |
| trade | text | yes |  |
| from | text | yes |  |
| people | list of a map: role, age, profession, pronoun, looks | yes |  |
| facts | list of text | no | [] |
| speech | text | no |  |

## projects (data/growth.yaml)

What settlements may build.

When a world has none: Nothing is built.

A list; each has:

| field | what | required | default |
| --- | --- | --- | --- |
| id | text | yes |  |
| name | text | yes |  |
| settlement | text | yes |  |
| after | text | no |  |
| needs | a map of names to number | no | {} |
| days | number | yes |  |
| cost | number | no | 0 |
| place | a map of names to unknown | no |  |
| link | a map: from, direction | no |  |
| workshops | list of a map: id, name, at, makes, uses, from, requires, workers, named | no | [] |
| sets | list of text | no | [] |
| crowd | a map: name, one, count, at, from, profession, looks | no |  |

## crafts (data/crafts.yaml)

Crafts with their techniques, to learn and practise.

When a world has none: No crafts to learn.

A list; each has:

| field | what | required | default |
| --- | --- | --- | --- |
| id | text | yes |  |
| name | text | yes |  |
| maker | text | yes |  |
| skill | text | yes |  |
| professions | list of text | no | [] |
| techniques | list of a map: id, name | no | [] |
| masterwork | text | no |  |
| practice | 3 values | no | [10,30,100] |
| per_day | number | no | 5 |
| failure | a map: outcome, item, qty, share, why, critical | no |  |

## props (data/props.yaml)

Templates of objects the chronicler may place in a home: a chest, a letter.

When a world has none: The chronicler places nothing.

A list; each has:

| field | what | required | default |
| --- | --- | --- | --- |
| id | text | yes |  |
| type | text | yes |  |
| name | text | yes |  |
| where | list of text | yes |  |
| lock | a map: quality, material | no |  |
| items | list of text | no | [] |
| max_items | number | no | 2 |
| money | number | no | 0 |
| check_hour | number | no | 21 |
| hints | list of a map: precise, village, far | yes |  |

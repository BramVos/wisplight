# Skerrow: the world book

Written out of the content of Skerrow (npm run worldbook isle); the editor writes it again on every save. Do not edit it by hand.

## 1. The world

The land is the Sundered Isles; play begins in Skerrow; the stranger comes from the sea.

### The frame every model call gets

```text
WORLD: The Sundered Isles, a scatter of islands in the Glass Sea. Year 412 of the Starfall,
the night the sky broke and the empire of Aldmar drowned. Magic is real but rare: hedge-witches,
runes, and the ruined towers of Aldmar's mages. Elves of the western isles live long and speak
little; wyrms sleep under the old barrows. Money: gold, silver and copper pieces (1 gp = 10 sp,
1 sp = 10 cp). Faith: the Tidemother, who gives and takes back; sailors swear by the Old Stars.
REGION: Skerrow, a small rocky island with one fishing hamlet, Skerrow Hythe. The beacon on the
headland went out in the storm, and no ship has called since. The stranger was washed up from
the wreck of the Grey Gull, and the winter storms will soon close the sea.
PEOPLE speak plain English with a salt turn of phrase. They count time by tides and bells.
```

### The opening

```text
Cold water, then stones. You wake on your face on a strand of black shingle, with the sea still pulling at your boots. Of the Grey Gull there is not much left: a broken mast, a spill of cordage, a cask rolling in the surf. Of her crew there is nothing at all.

Gulls argue overhead. Somewhere beyond the rocks a bell rings once, thin and far, and then stops. There are people on this island, then.

This is Skerrow, though you do not know it yet. No ship has called here since the light went out.

Type LOOK to look around. Type HELP if you are lost. You are, rather.
```

### What the chronicler keeps to

- The world is the Sundered Isles, high fantasy four hundred years after the
  Starfall. You play on Skerrow, one small rocky island; everything beyond it
  (Havenmoor, the western isles, drowned Aldmar) is far away.
- Keep the names of the island as they are: Skerrow Hythe, the Salt Kettle,
  the Lamp of Skerrow, Old Skarth the wyrm, the Tidemother.
- Magic is real but rare and old. No new spells, gods or peoples.
- Money is gold, silver and copper pieces. People count time by tides and bells.
- NAMED people are the kin, old shipmates, old skippers, friends or trading
  partners of whoever spoke of them, on Skerrow, in Havenmoor or the western
  isles. Bring one in only by a letter or a visit.

## 2. The map of the land

<!-- picture:map -->

### Skerrow

4 by 6 km, in hexes of 250 m, drawn a character to 250 by 250 m; the open land between the places is Skerrow.

```map
~~~~~~~~~~~~~~~~
~~~~~~~~~~~~~~~~
~~~~~~~~~~~~~~~~
~~~~~~~~~~~~~~~~
~~~~~####~~~~~~~
~~~~##^^^#~~~~~~
~~~~#^^^^^~~~~~~
~~~~#^^^^^^~~~~~
~~~~#^^^^^^~~~~~
~~~~#^^^^^^~~~~~
~~~~#^^^^^^#~~~~
~~~~#^^^^^^#~~~~
~~~~#^^^^^^~~~~~
~~~~#^^....~~~~~
~~~~#^.....~~~~~
~~~~###....~~~~~
~~~~##""...~~~~~
~~~~#%""...~~~~~
~~~~~%%%"..~~~~~
~~~~~~%%~~~~~~~~
~~~~~~~~~~~~~~~~
~~~~~~~~~~~~~~~~
~~~~~~~~~~~~~~~~
~~~~~~~~~~~~~~~~
~~~~~~~~~~~~~~~~
```

| Mark | Land | Walks like | What you read there |
| --- | --- | --- | --- |
| ~ | sea | water | Grey sea heaves all around you, cold and deep, and the island looks small from here. |
| . | salt grass | fields | Salt grass grows short and wiry here, bent flat by the wind off the sea. |
| ^ | heather | heath | Heather and bare grey stone climb towards the sky, and the wind never lets up. |
| " | salt marsh | fen | Salt marsh squelches under you, cut by little creeks that fill and empty with the tide. |
| # | cliffs | heath | The ground ends in grey cliffs here; far below, the sea booms in the caves. |
| % | dune | heath | Pale sand and marram grass shift under your feet, and the sea is loud beyond the dunes. |
| : | road |  |  |
| , | path |  |  |

| Edge | What lies beyond | On to |
| --- | --- | --- |
| east | East, the grey water runs on to the mainland. Havenmoor, the harbour town, lies two days' sail that way with a fair wind, and the packet goes there from the Hythe when it sails at all. | Havenmoor |
| west | West, the Glass Sea runs out to the edge of sight. Somewhere beyond it lie the western isles, and no boat of Skerrow goes that far. |  |
| north | North there is only open sea, and the cold wind that comes off it. |  |
| south | South, far over the water, the smoke of another island hangs on the horizon, and somewhere under the waves lies drowned Aldmar. |  |

Levels: the caves, ground level, the cliff tops.

### Far places

| Place | What people know | Districts |
| --- | --- | --- |
| Havenmoor | Havenmoor is the harbour town on the mainland, two days' sail east with a fair wind. | the quays: The long quays where the packet from Skerrow puts in, among fish sheds, chandlers and a tavern for sailors. the upper town: Steep streets above the harbour, with the merchants' houses and a temple of the Tidemother that looks out to sea. |

## 3. Lands

Besides the Sundered Isles itself, the home land, this world has one other land, with a frame of its own. Whoever is in a land plays under its frame; the stranger crosses into one only at a border, and takes their time along: the calendar and the clock are the world's.

### The Western Isles

| Area | Kind | What it is |
| --- | --- | --- |
| Ynys Wen (border) | hamlet | The nearest of the Western Isles to Skerrow, a low white island with a stone landing and the long hall of the elves. |

The stranger crosses in at Ynys Wen. At the landing an elf takes your coin without a word of bargaining and counts glass beads into your hand for it. Nobody here calls you stranger; you are a child of the short years, and they speak to you slowly, as if you might not follow.

Coins: silver ring (ring, 20), glass bead (bead, 1); one of the world's smallest coin buys 2 of its smallest. Prices stay in the world's coin and are told in these.

Faith: the Old Stars.

The law on the Western Isles is kept by the steward (Eluned Silverstrand).

A stranger is called child of the short years.

#### The frame every model call gets here

```text
WORLD: The Sundered Isles, a scatter of islands in the Glass Sea. Year 412 of the Starfall,
the night the sky broke and the empire of Aldmar drowned. Magic is real but rare. Money here:
silver rings and glass beads (1 ring = 20 beads); the elves take a copper piece of the east
for two beads. Faith: the elves keep to the Old Stars and do not swear by the Tidemother.
LAND: The Western Isles, where the elves live: few, long-lived and slow to speak. They remember
Aldmar before it drowned, and they do not speak of it to strangers.
REGION: Ynys Wen, the nearest of the Western Isles to Skerrow, a low white island with one
landing and one long hall, where strangers from the east are received and seldom let further.
PEOPLE speak the Old Tongue of the isles; with a stranger who has learnt it they speak it slowly
and formally, with long silences, and call a stranger "child of the short years". They count time by seasons and tides, never by bells.
```

## 4. History and lore

| Topic | What people know |
| --- | --- |
| Old Skarth | They say a wyrm called Old Skarth sleeps under the long barrow on the heights, and has since before the Starfall. |
| the coin of the isles | On the Sundered Isles people pay in gold, silver and copper pieces, ten copper to the silver and ten silver to the gold. |
| the folk of the isles | Islanders are born on the Sundered Isles and live by the sea; mainlanders come over from Havenmoor for trade or a post; and now and then an elf of the western isles is seen, old and quiet, keeping to herself. |
| the Starfall | Four hundred and twelve years ago the sky broke, stars fell into the sea, and the empire of Aldmar drowned. |
| the tide | On Skerrow the tide rules the day; the strand floods twice between dawn and dawn, and at low water the tidepools and the wreck lie open. |
| the Tidemother | The Tidemother is the sea itself; she gives the fish and the wrecks, and she takes back what she likes. |
| the waystone | In the ruined tower on the heights stands a waystone of Aldmar, a ring of black stone taller than a man. |

## 5. Powers

| Faction | Seat | Wants | Stands | Joining |
| --- | --- | --- | --- | --- |
| The folk of the Hythe | the Salt Kettle in Skerrow Hythe | The Lamp lit again, and a ship to call before the winter storms close the sea. |  | reputation |
| The Tidemother's faithful | the old birch in the silver grove | Gifts to the sea, and the drowned remembered. |  | sworn to tidemother, at The Silver Grove |
| The sailors of the Old Stars | wherever a ship is at sea; Skerrow Hythe, the Harbour: The Kittiwake mended, the lamp on the headland lit, and the packet calling again. | Fair winds, a safe landfall, and the old star-lore kept. |  | sworn to old_stars |
| The wreckers | the cliff path, on dark nights | Ships on the rocks, and their cargo on the shore. |  | never |

### Relations

| Faction | Friends | Enemies |
| --- | --- | --- |
| The folk of the Hythe | the Tidemother's faithful | the wreckers |
| The Tidemother's faithful | the folk of the Hythe |  |
| The wreckers |  | the folk of the Hythe |

### Great lines

| Line | What | Where | Pushed by | Threatens, breaks |
| --- | --- | --- | --- | --- |
| The great storm | storm | Skerrow Hythe, the Shore | autumn (+1), winter (+2), beacon_burning (-1), facts of crime (+6) | 40, 90: the great storm |

## 6. Faith

| Faith | Patrons | Faction |
| --- | --- | --- |
| the Tidemother | the Tidemother | the Tidemother's faithful |
| the Old Stars | the Old Stars | the sailors of the Old Stars |

### Patrons and blessings

| Patron | What they are | Blessings |
| --- | --- | --- |
| the Tidemother | The sea that gives and takes back; fish, weather and the drowned. | Salt Blood, The Mother's Hand, Given Back |
| the Old Stars | The stars that fell and the ones that stayed; sailors' oaths, luck and the way home. | Star-sight, Steady Course, The Way Home |

### Holy places

- The Silver Grove (the Tidemother)

## 7. Towns and villages

| Settlement | Kind | People | The ground | Workshops |
| --- | --- | --- | --- | --- |
| Skerrow Hythe | hamlet | 30 | sea, heath, wreck | brewhouse, ale_brewing, salvage, inshore_fishing, kettle_kitchen |
| the Heights | wilderness | 0 | kelp | kelp_gathering, salve_still |
| Ynys Wen | hamlet | 12 | white_shallows | shallows_fishing |

## 8. The starting region

| Area | Kind | What it is | Sound |
| --- | --- | --- | --- |
| Skerrow | wilderness | The open island between the hamlet, the shore and the heights, salt grass and heather and cliff, with the sea all round. |  |
| Skerrow Hythe | hamlet | The only hamlet on Skerrow, a dozen stone cottages round a little harbour, with the Salt Kettle for an inn. | sea |
| the Heights | wilderness | The high ground of Skerrow, with the silver grove, the wyrm's barrow, the beacon and the old tower. | wind |
| the Shore | wilderness | The rocky south shore of Skerrow, where the currents throw up whatever the sea breaks. | surf |
| Ynys Wen | hamlet | The nearest of the Western Isles to Skerrow, a low white island with a stone landing and the long hall of the elves. | sea |

### Seasons and weather

| Season | Chances |
| --- | --- |
| spring | clear 25%, overcast 30%, rain 25%, fog 15%, storm 5% |
| summer | clear 45%, overcast 25%, rain 15%, fog 10%, storm 5% |
| autumn | clear 10%, overcast 25%, rain 25%, fog 30%, storm 10% |
| winter | clear 15%, overcast 35%, rain 20%, fog 15%, storm 10%, frost 5% |

## 9. Places

### Skerrow Hythe

<!-- picture:area_skerrow_hythe -->

**Skerrow Hythe, the Green** (public, social, landmark)

A dozen stone cottages with turf roofs stand round a patch of wind-flattened grass and a squat well. Hens pick about your feet, and somewhere a door bangs in the wind, over and over. The low, lit door of the Salt Kettle is on the east side of the green. Steps lead south to the harbour, a track climbs north to the headland and the [beacon], and west the cliff path runs along the sea.

Ways: south to Skerrow Hythe, the Harbour; east to The Salt Kettle; north to The Headland; west to The Cliff Path. Here: well.

**Skerrow Hythe, the Harbour** (public)

A curved wall of piled stone keeps the sea out of a harbour no bigger than a barn floor. Brannoc's boat, the Kittiwake, lies on the slip with her mast bare, and nets hang drying from every post. It smells of fish, wet rope and woodsmoke. Steps go up north to the green; west, the rocks lead back to the [Tidepools], and a low door by the slip opens into a cottage.

Ways: north to Skerrow Hythe, the Green; west to The Tidepools; in to The Reeds' Cottage. Here: the Kittiwake, coracle.

**The Reeds' Cottage** (private)

One low room, with a driftwood fire in the hearth and two box beds let into the wall. Floats, shells and a half-finished model ship crowd every shelf, which must be the boy's work. The smoke stings your eyes a little. The door out to the harbour is behind you.

Ways: out to Skerrow Hythe, the Harbour.

**The Salt Kettle** (public, social)

The inn is one long, smoky room under black beams, with a fire at one end and a barrel of ale at the other. It smells of fish stew, tallow and wet wool drying. A ship's figurehead, a woman with a chipped nose, watches the door from the corner; they say she came off the last ship that broke here before the [Grey Gull]. The door west goes out to the green.

Ways: west to Skerrow Hythe, the Green. Here: bench, Maren's strongbox.

### the Heights

<!-- picture:area_skerrow_heights -->

**Tamsin's Hut** (private)

The hut is one round room, dark and warm, hung so thick with drying herbs that you have to duck. Jars of things you would rather not name line the shelves. It smells of thyme, smoke and the sea. The door out to the grove is a hide curtain behind you.

Ways: out to The Silver Grove. Here: salve pot.

**The Drowned Mage's Tower** (public, landmark)

Half a tower of black stone stands on the last rise of Skerrow, its top storeys long since fallen into the sea. Inside, stairs climb round the wall to nowhere, and in the middle of the floor stands the [waystone], a ring of black stone taller than a man. The air hums faintly, like a struck glass that never quite stops. Someone has made a study of the place, with books, a lamp and a narrow cot; the way out is south, down to the headland.

Ways: south to The Headland. Here: waystone.

**The Headland** (public, landmark)

The island ends here in a blunt headland with the sea on three sides and a squat stone tower on top: the [beacon]. Its great lamp stands cold behind green glass, and the wind whistles through the empty gallery. Below the tower a lean-to store shed has lost half its roof, and it smells strongly of fish oil. A track runs south to the hamlet and west to the grove; north, a ruined tower stands alone on the last rise.

Ways: south to Skerrow Hythe, the Green; west to The Silver Grove; north to The Drowned Mage's Tower. Here: beacon.

**The Silver Grove** (public, holy)

Birches with bark gone silver-white stand close together here, out of the wind, and the moss between them is soft underfoot. Shells and scraps of cloth hang from the branches on threads, and they tick and chime whenever the air moves. A turf hut with a crooked chimney sits among the trees. The cliff path runs south, the heights climb north to the barrow of [Old Skarth], and a track crosses east to the headland.

Ways: south to The Cliff Path; north to The Wyrm Barrow; east to The Headland; in to Tamsin's Hut. Here: old birch.

**The Wyrm Barrow** (public, landmark)

A long green mound lies across the top of the island like a sleeping animal, and nothing grows on it but short, warm grass. Put your ear to the ground and you hear, very slow and very deep, something like breathing. A gap between two standing stones at the east end is black and goes down. The only way off the height is south, back to the grove.

Ways: south to The Silver Grove.

### the Shore

<!-- picture:area_skerrow_shore -->

**The Cliff Path** (public)

A sheep track runs along the top of the cliff between thrift and sea campion. The wind comes straight off the Glass Sea and leans on you like a hand, and far below the waves boom in the caves. South, it drops to the [Wreck Strand]. Inland it climbs north towards a stand of pale trees, and east it runs down to the hamlet.

Ways: south to The Wreck Strand; north to The Silver Grove; east to Skerrow Hythe, the Green; down to The Tidepools.

**The Sea Cave**

Green light leaks in past the weed behind you and fades a few steps on, where the cave runs back into the cliff. Every wave fills the dark with a slow boom and a long suck of water, and the cold air tastes of salt and iron. Grey driftwood lies wedged on a ledge above your head, far above where any tide should reach. The way out is back through the weed to the [Tidepools].

Ways: out to The Tidepools.

**The Tidepools** (public)

Flat shelves of rock run out into the sea here, pocked with pools as clear as window glass. Crabs sidle away from your shadow, and anemones close like fists when you lean over them. The weed is slick and cold under your hand. West lies the [Wreck Strand]; east, the roofs of the Hythe show above a harbour wall.

Ways: west to The Wreck Strand; east to Skerrow Hythe, the Harbour; up to The Cliff Path; in to The Sea Cave (secret).

**The Wreck Strand** (public, landmark)

You stand on a strand of black shingle where the sea throws up what is left of the [Grey Gull]: a broken mast, a spill of wet rope, a cask rolling in the shallows. The stones clatter and hiss with every wave, and the air tastes of salt and tar. Gulls quarrel over something you would rather not look at. North, a path climbs the low cliff; east, the rocks give way to the [Tidepools].

Ways: north to The Cliff Path; east to The Tidepools.

### Ynys Wen

<!-- picture:area_ynys_wen -->

**The Long Hall of Ynys Wen** (public, law)

The hall is longer than any building on Skerrow, and so quiet you hear your own breath. Light falls in pale bars through tall windows onto a floor of white stone, and the smell of beeswax hangs in the air. Elves sit along the walls and look at you without curiosity. The landing is back south.

Ways: south to Ynys Wen, the Landing.

**Ynys Wen, the Landing** (public, route)

A landing of white stone runs out over a strand so pale it hurts your eyes, and the sea is clear enough to count the pebbles under it. The air smells of salt and of some flower you cannot name. Nobody hurries here. A path of flat stones goes up north to the [long hall].

Ways: north to The Long Hall of Ynys Wen.

## 10. People

| Name | Who | Age | Trade | Home |
| --- | --- | --- | --- | --- |
| Brannoc Reed | Brannoc the boatman | 41 | boatman | The Reeds' Cottage |
| Elowen | Elowen the elf | 312 | scholar | The Drowned Mage's Tower |
| Eluned Silverstrand | Eluned the steward | 340 | steward | The Long Hall of Ynys Wen |
| Garrick Stone | Garrick the lightkeeper | 63 | lightkeeper | The Headland |
| Gwion Whitesand | Gwion of the white boat | 212 | boatman | The Long Hall of Ynys Wen |
| Maren Holt | Maren of the Salt Kettle | 54 | innkeeper | The Salt Kettle |
| Pip Reed | Pip, the boatman's boy | 10 | child | The Reeds' Cottage |
| Tamsin Hale | Old Tamsin the hedge-witch | 74 | hedge-witch | Tamsin's Hut |
| Wenna Dray | a fisherwoman | 29 | fisher | The Salt Kettle |

<!-- picture:portraits -->

### What they want

| Name | Values | Quirks |
| --- | --- | --- |
| Brannoc Reed | family 3, craft 2 | superstitious |
| Elowen | knowledge 3, freedom 1 | aloof |
| Eluned Silverstrand | tradition 3, law 2 | long_silences |
| Garrick Stone | duty 3 | drinker |
| Gwion Whitesand | freedom 2, community 1 |  |
| Maren Holt | community 3, law 2, tradition 1 | counts_every_coin |
| Pip Reed | adventure 3, family 2 | collector |
| Tamsin Hale | tradition 3, faith 2 | storyteller |
| Wenna Dray | work 2 |  |

### Ties

- Brannoc Reed: child Pip Reed, spouse Ysolde, neighbour Maren Holt
- Elowen: acquaintance Tamsin Hale
- Garrick Stone: friend Maren Holt
- Gwion Whitesand: kin Eluned Silverstrand
- Maren Holt: spouse Tobin, friend Garrick Stone, neighbour Brannoc Reed, employer Wenna Dray
- Pip Reed: parent Brannoc Reed, friend Tamsin Hale
- Tamsin Hale: friend Pip Reed, acquaintance Elowen
- Wenna Dray: employee Maren Holt

## 11. Secrets and stories

### the Starfall

```text
My gran had it from her gran, so it's true enough. There was an empire once, Aldmar, with towers so tall the mages in them could talk to the stars. And one night they talked too loud. The sky cracked like an egg, and the stars came down hissing into the sea, and the sea got up and walked over Aldmar and never lay down again. What you're standing on is the top of one of its hills. Dig deep enough on Skerrow and you'll find a roof.
```

### Old Skarth

```text
The old gentleman? He came before the Starfall, when this was a mountain and not an island. The last mage of the tower made a bargain with him: a bed under the hill for as long as he liked, and in return he'd keep the mage's bones and the mage's key. He's kept them. He likes salt fish, and he doesn't like to be woken. Nobody's ever tested the second part. Nobody I'd want to bury, anyway.
```

### Secrets

| Whose | Secret |
| --- | --- |
| Brannoc Reed | Brannoc has not crossed to the mainland since his wife died, and he is afraid of the open sea. |
| Elowen | Elowen knows the rune key of the waystone lies in the wyrm's barrow, but she has never dared to go in for it. |
| Maren Holt | When the store shed lost its roof, Maren saved two casks of the beacon's oil from the sea, and she sells them to anyone who can pay. |
| Pip Reed | Pip has crept into the wyrm's barrow at noon, when Tamsin says the wyrm sleeps soundest, and seen a black key on a stone shelf. |

## 12. Bestiary

| Creature | Kind | Level | Faction |
| --- | --- | --- | --- |
| crab swarm | beast | 1 |  |
| weever | beast | 0 |  |
| bull seal | beast | 1 |  |
| great conger | beast | 2 |  |
| wrecker | human | 2 | the wreckers |
| the wreckers' captain | human | 5 | the wreckers |
| drowned sailor | undead | 3 |  |
| barrow-wight | spirit | 4 |  |
| salt-wraith | spirit | 3 |  |
| Old Skarth | beast | 6 |  |
| Old Skarth | beast | 3 |  |

### Encounters

| Encounter | Where | Who |
| --- | --- | --- |
| The drowned on the strand | The Wreck Strand | 1 drowned sailor |
| Wreckers on the cliff path | The Cliff Path | 1 wrecker, 1 wrecker |
| The wight at the tower | The Drowned Mage's Tower | 1 barrow-wight |
| Old Skarth wakes | The Wyrm Barrow | 1 Old Skarth |

## 13. Coins, measures and calendar

### Coins

<!-- picture:coins -->

| Coin | Short | Worth |
| --- | --- | --- |
| gold piece | gp | 100 |
| silver piece | sp | 10 |
| copper piece | cp | 1 |

### Prices

| Thing | Worth |
| --- | --- |
| armful of kelp | 1 cp |
| bolt of sailcloth | 1 gp 5 sp |
| bowl of fish stew | 8 cp |
| brass key | 2 cp |
| bundle of heather | 1 cp |
| bundle of letters | 1 cp |
| cask of lamp oil | 3 sp |
| coil of rope | 1 sp |
| cutlass | 3 sp |
| diary | 2 cp |
| driftwood staff | 1 cp |
| fishing spear | 1 sp 6 cp |
| great conch | 5 cp |
| handful of small fry | 1 cp |
| iron boat-hook | 2 sp 4 cp |
| knife | 1 sp 2 cp |
| mug of ale | 3 cp |
| pot of kelp salve | 1 sp 5 cp |
| pot of pitch | 2 sp |
| pot of thin salve | 3 cp |
| quilted coat | 1 sp |
| ring shirt | 1 gp |
| round shield | 1 sp 6 cp |
| salt fish | 4 cp |
| scale vest | 6 sp |
| sealskin jerkin | 2 sp |
| ship's biscuit | 2 cp |
| yew bow | 5 sp |

### Measures

a fathom of rope, a cask of oil, a creel of fish.

### Calendar

<!-- picture:calendar -->

Months: Deepwinter, Thawmoon, Seedtide, Blossom, Brightsun, Midsummer, Highsun, Harvest, Leaffall, Mistmoon, Frostwane, Longnight, Starfall Days. The week: Moonday, Tidesday, Windsday, Thornsday, Fireday, Starday, Restday. Years are counted SF.

### Bells

- The harbour bell at Skerrow Hythe, the Harbour, at 6, 18 o'clock

### The law

The law on Skerrow is kept by the headwoman (Maren Holt).

No fine buys off a death: the stranger is held 24 hours and heard. In the morning the island gathers on the shingle, every household that can walk, and the headwoman asks what happened. They hear you and they hear the dead one's kin, and at the end they let you go, because the sea will judge you in its own time.

## 14. Quests

| Quest | What it is about | Given by | Ways it ends |
| --- | --- | --- | --- |
| Off Skerrow | Stranded on Skerrow after the wreck of the Grey Gull, the stranger has to find a way off the island before winter. | Maren Holt | In the Kittiwake; A ship for the light; Through the waystone; Winter closes the sea |

## 15. Names and speech

### Sayings

- The sea gives, and the sea keeps count.
- Tide waits for nobody, least of all the lazy.
- No light, no ships; no ships, no salt.

### How people address a stranger

- stranger: stranger, castaway
- known: neighbour
- friend: love, friend
- high: mistress/master/honoured one

### Words that are not of this world

o'clock, potatoes, potato, tobacco, coffee, chocolate, gun, guns, pistol, musket, gunpowder, pocket watch, okay, ok, photograph, percent, awesome, dude, police, weekend, dollars, dollar, pennies, penny, cents, internet, online, website, email, phone, computer, robot, television, electricity, plastic, hashtag, Monday, Tuesday, Wednesday, Thursday, Friday, Saturday, Sunday, January, February, April, June, July, August, September, October, November, December.

## 16. Trades and crafts

| Trade | Works |
| --- | --- |
| innkeeper | 07:00-23:00 |
| fisher | 05:00-12:00, 13:00-17:00 |
| boatman | 06:30-12:00, 13:00-18:00 |
| child |  |
| hedge-witch | 07:30-12:00, 13:00-17:00 |
| scholar | 08:30-13:00, 13:30-19:00, 19:30-23:30 |
| lightkeeper | 10:00-14:00 |
| steward | 08:00-19:00 |

### Crafts

| Craft | Maker | Techniques | A failure leaves |
| --- | --- | --- | --- |
| fishing | fisher | hand lines | poor (handful of small fry) |
| salve-making | salve-maker | kelp salve | poor (pot of thin salve) |

## 17. Transport

| Line | Kind | Stops | Days | Fare |
| --- | --- | --- | --- | --- |
| the Havenmoor packet | ferry | Skerrow Hythe, the Harbour, havenmoor | Tidesday, Starday | 3 sp |
| the white boat | boat | Skerrow Hythe, the Harbour, Ynys Wen, the Landing | Restday | 4 sp |

## 18. What happens when

- When asked about: seek player A.
- When request open (a signal of the game itself): seek player A.
- When befriended: set tie A, player; A thinks: "The stranger is a friend of yours now.".
- When theft mended (own accord) (a signal of the game itself): A think better of player; A thinks: "The stranger came back of their own accord and made it right. That counts for something.".
- When theft mended (after caught) (a signal of the game itself): A think better of player; A thinks: "The stranger made it right, but only once they were caught.".
- When broken promise (a signal of the game itself): word goes round: "the stranger's broken word to {a}"; A thinks: "The stranger gave you their word, and it was worth nothing.".
- When promise kept (a signal of the game itself): word goes round: "the stranger keeping their word to {a}".
- When made good (a signal of the game itself): A think better of player; word goes round: "the stranger making good their word to {a}".
- When craft rank (a signal of the game itself): A think better of player; A thinks: "The stranger is {value} now. There may be work in that, or trouble.".
- When death: Maren Holt thinks: "{a}'s place by the fire is empty. You keep looking at it, and you say so to whoever sits down there."; a mark at The Salt Kettle: "A stool by the fire stands empty, and nobody sits on it; a cup is turned upside down on it for {a}."; The Salt Kettle takes a mood of grief for 3 days; word goes round: "{a} to be given back to the Tidemother"; a burial at The Headland; word goes round: "the burial of {a}"; a mark at The Headland: "Among the old cairns at the cliff edge stands a new one of grey stones, with {a}'s name scratched on a slate."; word goes round: "a song for {a} at the Salt Kettle".
- When lost: Maren Holt thinks: "{a} is lost, and there is nothing to bury. The place by the fire stays empty."; a mark at The Salt Kettle: "A stool by the fire stands empty, and nobody sits on it; a cup is turned upside down on it for {a}."; The Salt Kettle takes a mood of grief for 3 days; a mark at Skerrow Hythe, the Harbour: "Someone has scratched {a}'s name into the harbour wall, low down, where the spray keeps it wet.".
- When departure: Maren Holt thinks: "{a} has gone off the island, and the Kettle is quieter for it. You mention it to anyone who asks.".
- When lamp lit: a mark at The Salt Kettle: "At the end of the long table a cup stands poured for the stranger, and nobody touches it."; a feast at The Salt Kettle; prices at The Salt Kettle times 0.9 for 2 days; word goes round: "the song of the stranger and the Lamp".
- When pupil learnt (a signal of the game itself): A thinks: "You can do {value} on your own now; the stranger taught you."; word goes round: "{a} learning {value} from the stranger".
- When improvised (The Silver Grove) (a signal of the game itself): a mark at The Silver Grove: "Gulls sit in the birches tonight, silent, every one of them facing the sea.".
- When pulse tamsin: seek player Tamsin Hale.
- When pulse sail: word goes round: "a sail far out to the south".
- When pulse errand: request A.

## 19. The rules in short

Ancestries: Islander, Mainlander, Elf of the western isles. Classes: Shieldhand, Harpooner, Knave, Hedge-witch, Runecaster, Tidecaller. Backgrounds: castaway, fisher, lamp hand, witch apprentice, rune reader, wreckers child, havenmoor guard, merchants clerk, fugitive, merchant.

Conditions: Frightened, Bleeding, Grabbed, Prone, Wet and cold, Off-guard, Sickened, Cursed, Blinded, Slowed.

Death: You wake on your back on the shingle a day later, coughing up salt water.

## 20. The look and sound of the world

Pictures: A small illustration in the manner of an old high-fantasy book plate, pen and ink with a light watercolour wash, sea greens and storm greys, a lone rocky island under a vast sky.

<!-- picture:palette -->

The map calls its land sea (water), tide channel (channel), salt grass (fields), heather (heath), salt marsh (fen), cliffs (cliff), dune (dune), caves (tunnel), cliff tops (crown).

Where an act the rules do not know may be improvised: The Silver Grove (offering), the waystone (lore).

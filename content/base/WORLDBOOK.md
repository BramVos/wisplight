# The Nethermarch: the world book

Written out of the content of The Nethermarch (npm run worldbook base); the editor writes it again on every save. Do not edit it by hand.

## 1. The world

The land is the Nethermarch; play begins in the Holleveen; the stranger comes from Graafhaven.

### The frame every model call gets

```text
WORLD: The Nethermarch, a low, wet land by the Grey Sea. Year 211 After the Wolf
(the great flood). Dykes, polders, peat fens, windmills, barges. Money: guilders, stuivers
and duiten (1 gl = 20 st, 1 st = 8 d). Faith: the Church of the Lantern (Saint Brand) in the
towns; the Old Powers (Nehalennia, the Grey Rider, Mother Holle, Baduhenna) in old customs.
Folk believe in kabouters, the White Women, the Haakman, will-o'-the-wisps and witches.
Some of it is true.
REGION: the Holleveen. The Count wants to drain it. The peat-cutters and the fen folk are
against it. Tempers are short, and a girl is missing.
PEOPLE speak plain, practical English with a little local colour. They measure distance in
hours' walk and time by bells and daylight.
```

### The opening

```text
The barge from Graafhaven leaves you at the Veenhoek quay just as the light goes. The bargeman won't tie up. "Not after dark, not out here," he says, and poles away into the mist, taking his lantern with him.

This is the Holleveen: peat and reed and black water, mile upon mile of it between the Great Dyke and the heath. The villages sit on the few dry places like cats on a fence. Peat smoke. A windmill standing still against a sky the colour of pewter, its sails torn to rags.

Somewhere a dog barks. On the doorstep of the nearest house a grey cat watches you, very still, the way cats don't usually watch people.

Type LOOK to look around. Type HELP if you are lost. You probably are.
```

### What the chronicler keeps to

- The world is the Nethermarch, a late-medieval Low Countries of peat, dykes,
  canals and saints. You play in the Holleveen; its neighbours are the regions
  on the map of the land.
- Names and facts come from the world book (Wereldboek). The water spirit is
  the Haakman. Use no other name for him.
- Money is guilders, stuivers and duiten; faith is the Church of the Lantern
  and the Old Powers. People measure distance in hours' walk and time by bells.
- NAMED people are the kin, old masters, friends, trading partners or debtors
  of whoever spoke of them, in the Holleveen or the towns beyond it. Bring one
  in only by a letter or a visit.

## 2. The map of the land

<!-- picture:map -->

### the Holleveen

30 by 20 km, in hexes of 250 m; the open land between the places is the Holleveen.

```map
T T T T T T T T T T T T . . . . . . . . . . . ^ heath ^ : ^ ^
 T T T T T T T T T T T . . . . . . . . . . . . ^ ^ ^ ^ : ^ ^
T T T T T T T T T T + Kloosterveen  . . .  Reuzenrust n ^ ^ ^
 T T T T T T T T T T T,,,, . . . . . . . . . . ^ ^ ::^ ^ ^ ^
. . . . . . . . . . . . .,,,, . .m Molenend . ^ ^:: ^ ^ ^ ^ ^
Oude Zijl H========= Veenhoek o==. . . . . . .:::. . . . . .
. . . . . . . . . . . . . .,, .,.=@ Drowned Goose " " " " " "
 . . . . . . . . . . . . .,, . ,,. . . ===* Waagdam :::::::::
. . . . .  Kabouterberg k,. . . , . . . . . . . . " " " " "~~
 . . . . . . . . . . . . . . . . , . . . . . . . . " "~~ " "
" " " " " " " " " " " " " " " " "," " " " " " " " " " " " " "
 " " " " " " " " " " " " "  weirs e,,,,,,,,, Kattenbroek w "
" " " " " " " " " " " " " " " " "~~~~~~~~~~~" " " " " " "~~ "
 " " " " " " " " " " " " " " " ~~~Blackmere~~~ " " " ~~" " "
" " " " " " " " " " " " " " " " "~~~~~~~~~~~" " " " " " " " "
 " " " " " " " " " " " " " " " " " " " " " " " " " " " " " "
" " " " " " " " " " " " " " " " " " " " " " " x Rietdoolhof " "
 " " " " " " " " " " " " " " " " " " " " " " " " " " " " " "
" " " " " " " " " " " " " " " " " " " " " " " " " " " " " " "
 " " " " " " " " " " " " " " " " " " " " " " " " " " " " " "
" " " " " " " " " " " " " " " " " " " " " " " " " " " " " " "
```

| Mark | Land |
| --- | --- |
| T | woods |
| . | fields |
| " | fen |
| ~ | open water |
| ^ | heath |
| : | road |
| = | canal |
| , | path |

| Edge | What lies beyond | On to |
| --- | --- | --- |
| west | West, the fen runs on to the Great Dyke, and behind it lies the grey sea. Graafhaven, the Count's city by the sea, is some seventy kilometres on: two days on foot by the tow path, or a day on the barge from Oude Zijl. | Graafhaven |
| north | North, past the priory woods, the peat gives way to the open water of the Zuyder Mere. Stavermouth, the silting harbour on its shore, lies two days and a crossing away. | Stavermouth |
| east | East, the fen dries into heath and forest. The Oostweg runs two days on to Zwolderkamp, the trading town on the river, and the heath road climbs north-east past the giant-beds to Hunnenloo, three days off. | Zwolderkamp, Hunnenloo |
| south | South, the fen goes on into reed and black water, and beyond it lies the delta of the Three Rivers, where drowned Saeftinge shows at low tide. No road you know of goes that way. |  |

Levels: under the ground, ground level, the crowns.

## 3. History and lore

| Topic | What people know |
| --- | --- |
| Lord Halewijn's song | Lord Halewijn sang a song that drew girls into the Grey Wold, and none came back, until a king's daughter took his head with his own sword. |
| milk for the kabouters | The kabouters of the Kabouterberg will do your work at night, in the house and on the land, if you leave them a bowl of milk. Spy on them and they turn nasty. |
| Mother Holle's featherbed | When it snows, Mother Holle is shaking out her featherbed. She rewards hard work and punishes idleness, and people still drop a pin in the well for her. |
| Reynard the Fox | Reynard the Fox fooled the king and all his court. Everyone knows a Reynard story, and children know a dozen. |
| Saint Brand | Saint Brand lit a lantern on the Great Dyke on the Night of the Water Wolf and led the drowning to dry land. The Church of the Lantern keeps his light. |
| Tall Pier's sword | Tall Pier of Terpwold was seven feet tall, with a sword as long as a man, and no Count could tax him. His sword still hangs in the hall at Terpwold. |
| the Cat-Widow of the Kattenbroek | Folk say a widow out in the Kattenbroek turns thieves into cats. |
| the drowned bells of Saeftinge | Saeftinge was the richest city of the delta until the Night of the Water Wolf drowned it. At low tide the stumps of its towers still stand out of the mud, and people hear its bells ringing under the water. |
| the dyke law | Who will not dyke, must yield. Everyone who lives behind a dyke owes dyke work, and whoever won't do his share loses his land to someone who will. It has been the law since the Water Wolf. |
| the Fen Charter | There is said to be an old charter that gives the peat of the Holleveen to the people who cut it, for ever. Hardly anyone has seen it, and most have never heard of it. |
| the Goat-Riders | The Goat-Riders are robbers in goat-skins who say they ride through the air with the devil. They take a toll on the tow path and hide in the Rietdoolhof. |
| the Haakman | The Haakman lives in the Blackmere and drags down anyone who insults the water. |
| the Lady of Stavermouth | The Lady of Stavermouth, a rich widow, had a whole ship of grain thrown into the sea out of pride. The sea threw back a sandbank, the harbour silted up, and the town has been dying ever since. |
| the last sheaf | At harvest you leave the last sheaf standing for the Grey Rider's horse, or he takes something else. |
| the lights over Harmen's field | On foggy autumn nights two small lights drift over Harmen's field at Molenend, low over the stubble. Nobody with any sense goes after them. |
| the Night of the Water Wolf | Two hundred and eleven years ago the sea broke the Great Dyke in one night and drowned seventy-two villages. |
| the ringed oak of Baduhenna | In Baduhenna's Wood beyond Terpwold stands an old oak with an iron ring grown into its trunk. An oath sworn there cannot be broken without the oak knowing. |
| the Surveyor's Lights | Will-o'-the-wisps are the souls of people who moved a boundary stone in life, most of all surveyors who measured crooked. They wander the fields and the fen at night with a little light, and lead whoever follows them into a peat hole. |
| the Waylost | The Waylost is Captain Van der Decken's ship. He cursed heaven in a storm off Skelling, and now he must sail until the end of days and never make harbour. |
| the Weeping Stone | A giant-bed near Hunnenloo, far away on the heath, that weeps salt when someone in the village is about to die. |
| the White Women of Reuzenrust | In the autumn mist at Reuzenrust the White Women rise from the burial mounds. They heal or foretell for those who greet them with respect, and curse those who mock the dead. |
| the Witches' Scale | In the Waag of Waagdam people accused of witchcraft are weighed on the great scale. Whoever weighs what an honest person should gets a certificate that is honoured everywhere. |

## 4. Powers

| Faction | Seat | Wants | Stands | Joining |
| --- | --- | --- | --- | --- |
| The Count's men | Graafhaven; locally the schout's house in Veenhoek | Order, taxes and a new polder. | for the drainage | hired |
| The Dyke Board | the dyke house by the Oude Zijl | Dry feet, dyke work, money for upkeep. | for the drainage, if it pays for the dykes | never |
| The Church of the Lantern | the Brandaris in Graafhaven; the chapel in Veenhoek and the priory at Kloosterveen | Souls, charity, an end to witchcraft and the old rites. | divided on the drainage; the prior knows of the charter | sworn to lantern |
| The Old Faith | holy places in the fen and on the heath | The old rites, respect for spirits and the dead. | against the drainage |  |
| The Brotherhood of Peat-cutters | the peat sheds of Veenhoek | The fen as common land, and a fair price for peat. | fiercely against the drainage | reputation |
| The burghers of Waagdam | the town hall and the Waag | Market, trade and quiet. | in two minds on the drainage; more grain, but less peat | at The Waag or The Weighing Room, for 5 gl |
| The villagers of Veenhoek | Veenhoek | Bread, peat, safety, and Fenna back. | divided on the drainage | never |
| The Goat-Riders | the Rietdoolhof south of the Blackmere | Toll, loot and fear. | on the drainage, for whoever pays best | reputation |
| The Fen-folk of the Kattenbroek | the hut on stilts in the Kattenbroek | That the fen is left alone. | against the drainage, to the last | never |
| The kabouters | the Kabouterberg | Milk, respect, and not to be spied on. | indifferent to the drainage, as long as their hill stays | never |
| The water spirits | the Blackmere | Water, and reverence for water. | against the drainage; the mill pumps their mere dry | never |
| The White Women | the barrows at Reuzenrust | Rest and respect for the dead. | indifferent to the drainage | never |
| The Cog League | Zwolderkamp, outside the region | A return on their loans to the Count. | for the drainage | never |

### Relations

| Faction | Friends | Enemies |
| --- | --- | --- |
| The Count's men | the Dyke Board, the Cog League | the Brotherhood of Peat-cutters, the Fen-folk of the Kattenbroek, the Goat-Riders |
| The Dyke Board | the Count's men |  |
| The Church of the Lantern | the Count's men, the burghers of Waagdam | the Old Faith, the Fen-folk of the Kattenbroek |
| The Old Faith | the Fen-folk of the Kattenbroek, the kabouters, the White Women | the Church of the Lantern |
| The Brotherhood of Peat-cutters | the villagers of Veenhoek, the Old Faith | the Count's men, the Goat-Riders |
| The villagers of Veenhoek | the Brotherhood of Peat-cutters |  |
| The Goat-Riders |  | the Count's men, the Brotherhood of Peat-cutters |
| The Fen-folk of the Kattenbroek | the Old Faith, the water spirits | the Count's men, the Church of the Lantern |
| The kabouters | the Old Faith |  |
| The water spirits | the Fen-folk of the Kattenbroek |  |
| The White Women | the Old Faith |  |
| The Cog League | the Count's men |  |

## 5. Faith

| Faith | Patrons | Faction |
| --- | --- | --- |
| the Church of the Lantern | the Lantern | the Church of the Lantern |
| the Old Powers | Nehalennia, the Grey Rider, Mother Holle, Baduhenna | the Old Faith |

### Patrons and blessings

| Patron | What they are | Blessings |
| --- | --- | --- |
| the Lantern | Saint Brand, light and rescue, community and mercy. | Comfort, Light of Brand, Safe Harbour |
| Nehalennia | The sea, trade, safe passage. | Fair Wind, Merchant's Blessing, The White Dog |
| the Grey Rider | Hunt, death, harvest and storm; the Wild Hunt. | Hunter's Eye, Ride with the Storm, The Rider's Share |
| Mother Holle | Hearth, weather, spinning and hard work. | Busy Hands, The Feather Bed, Gold at the Well |
| Baduhenna | Battle, oaths and holy woods. | Oath-bound, Wrath of the Wood, Unbroken |

### Holy places

- The Priory Gate (the Church of the Lantern)
- The Priory Church (the Church of the Lantern)
- The Giant-Bed at Reuzenrust (the Old Powers)
- The Three Barrows (the Old Powers)
- Chapel of the Lantern (the Church of the Lantern)
- The Church of the Lantern (the Church of the Lantern)

## 6. Towns and villages

| Settlement | Kind | People | The ground | Workshops |
| --- | --- | --- | --- | --- |
| Veenhoek | village | 150 | fen, peat_banks, mere | peat_cuttings, eel_weirs, herb_gathering, spinning, cooperage |
| Molenend | hamlet | 6 | fields, pasture | mill, farms, dairy |
| Waagdam | town | 900 | fields, clay | horse_mill, farms, schaal_kitchen, smithy |
| The Drowned Goose | inn | 4 |  | goose_kitchen |
| Kloosterveen | hamlet | 12 | garden | brewery, herb_garden |
| Oude Zijl | hamlet | 8 |  |  |

## 7. The starting region

| Area | Kind | What it is | Sound |
| --- | --- | --- | --- |
| Kloosterveen | hamlet | The priory of Kloosterveen in the woods north-west of Veenhoek, with its church, its library and a brewery famous for autumn beer. | birds |
| Molenend | hamlet | A hamlet a short walk north-east of Veenhoek, around the windmill De Zwaan that grinds grain and pumps the polder dry. | wind |
| Oude Zijl | hamlet | The old sluice and dyke house at the western end of the Graafse Vaart, where Heemraad Sijbrand keeps the gates. | water |
| Reuzenrust | wilderness | Where the heath begins north-east of Waagdam, a giant-bed and three burial mounds mark the start of the road to Hunnenloo. | wind |
| the Blackmere | wilderness | A black fen lake south of Veenhoek, with Wouter's eel weirs on its shore and drowned willows in the shallows. | water |
| The Drowned Goose | inn | The inn at the crossroads between Veenhoek and Waagdam, run by Trijntje Kroes. Everyone's news passes through it. | wind |
| the Holleveen | wilderness | The fen country between the Graafse Vaart and the heath, thirty by twenty kilometres of peat, reed and black water. | reeds |
| the Kabouterberg | wilderness | A sandy hill south-west of Veenhoek with a hollow under an old oak. The kabouters live there, people say, and you leave them milk. | wind |
| the Kattenbroek | wilderness | A fen of reeds and black pools south-east of Veenhoek, where a widow is said to live. | reeds |
| the Rietdoolhof | wilderness | A maze of reed channels south of the Blackmere. Nobody with any sense goes in there. | reeds |
| the roads of the Holleveen | route | The tow path along the Graafse Vaart and the road past the Drowned Goose, both leading from Veenhoek to Waagdam. | wind |
| Veenhoek | village | A peat-cutters' village of about 180 souls on the Graafse Vaart, with a bakery, a chapel and the peat sheds. | birds |
| Waagdam | town | The market town of the Holleveen, an hour and a quarter east along the Vaart, famous for its Witches' Scale. Market day is Woensdag. | crowd |

### Routes

| From | To | Carries |
| --- | --- | --- |
| zwolderkamp | Waagdam | jug of lamp oil, handful of iron nails, bolt of sailcloth, coil of rope, bar of iron |
| hunnenloo | Waagdam | fleece |
| Molenend | Waagdam | sack of flour |
| Molenend | Veenhoek | sack of flour |
| Veenhoek | Waagdam | basket of peat, eel, skein of yarn |
| Veenhoek | The Drowned Goose | basket of peat, eel |
| Molenend | The Drowned Goose | jug of milk |
| Veenhoek | Kloosterveen | basket of peat |
| Veenhoek | Oude Zijl | basket of peat, eel |
| Kloosterveen | The Drowned Goose | mug of beer |
| Kloosterveen | Waagdam | mug of beer |

### Seasons and weather

| Season | Chances |
| --- | --- |
| spring | clear 30%, overcast 30%, rain 30%, fog 10% |
| summer | clear 55%, overcast 25%, rain 15%, storm 5% |
| autumn | clear 15%, overcast 25%, rain 20%, fog 35%, storm 5% |
| winter | clear 20%, overcast 30%, frost 25%, snow 15%, fog 10% |

## 8. Places

### Kloosterveen

<!-- picture:area_kloosterveen -->

**The Herb Garden** (public)

Square beds of herbs lie between gravel paths, each bed edged with boards and marked with a wooden tag. Sage, rue and mint grow thick here, and the wet air brings you their smell before you see them. Snails have been at everything low enough to reach. A wicket gate in the west wall opens onto the wood; the church is east.

Ways: east to The Priory Church; west to The Priory Wood.

**The Prior's Lodging** (private)

A small brick room with a box bed built into the wall, a table heaped with papers and a jug of beer that has gone flat. The fire is banked with peat and ticks quietly under its ash. On a slate by the window someone has written MORE HOPS, and under it, NO, LESS. The library is west; a door south opens onto the brewery.

Ways: west to The Priory Library; south to The Priory Brewery.

**The Priory Brewery** (workshop)

Copper kettles squat over their hearths in a long, low brewhouse, and barrels are stacked to the rafters along the back wall. The air is thick and sweet with malt and the bitter green of hops. Through the open door you see the hop poles standing in rows along the priory wall. The church is west; a door north leads to the prior's lodging.

Ways: west to The Priory Church; north to The Prior's Lodging.

**The Priory Church** (holy, public)

The church is tall and bare inside, its brick walls whitewashed and stained green where the damp comes through. At the far end a lantern with three panes burns above a plain altar, and on the wall beside it someone has painted [Saint Brand] on the dyke, holding up his light against a black flood. Your footsteps come back to you from the roof. A low door leads north to the library, the brewery is east, the herb garden west, and the gate is south.

Ways: south to The Priory Gate; north to The Priory Library; east to The Priory Brewery; west to The Herb Garden. Here: altar.

**The Priory Gate** (holy, public, edge)

A gatehouse of dark brick stands where the wood opens, its door studded with iron. Beyond the wall rise the church roof and the hop poles of the brewery. You smell malt and wet leaves. The path back to Veenhoek runs south-east through the trees.

Ways: north to The Priory Church; northwest to The Priory Wood; southeast to The Priory Path.

**The Priory Library** (private)

Books lie chained to sloping desks under narrow windows, and the rest stand on shelves that reach up to the beams. It smells of old leather, dust and the tallow of a hundred winters. Along one wall stand chests bound with iron, their lids sealed with wax and marked in a hand that nobody writes any more. The church is back through the low door to the south; another door, east, leads to the prior's lodging.

Ways: south to The Priory Church; east to The Prior's Lodging.

**The Priory Wood** (wilderness)

Oaks and beeches stand close together here, old and grey with moss, and the ground is soft with the leaves of many years. Every step sinks a little and gives off a smell of mould and mushrooms. Through the trees to the east you glimpse the garden wall of the priory; the gate lies to the south-east.

Ways: east to The Herb Garden; southeast to The Priory Gate.

### Molenend

<!-- picture:area_molenend -->

**Harmen's Field** (wilderness)

A long rye stubble field running down to the ditch. Halfway along, a boundary stone leans a little, as if it had been set in a hurry. Crows lift off the furrows as you come near. The lane is east.

Ways: east to Molenend, the Lane.

**Molenend, the Lane** (public, edge)

A handful of houses huddle along a single lane at the foot of the mill. Chickens scratch in the ruts and the wind whistles through the torn sails above, which do not move. North rises the mill [De Zwaan]; the miller's house is east and his field west. The peat road leads back south-west.

Ways: southwest to The Peat Road; north to The Mill De Zwaan; east to The Miller's House; west to Harmen's Field.

**The Mill De Zwaan** (workshop, landmark)

De Zwaan stands on its post like a heron on one leg. Inside, the millstones sit silent under a coat of flour, and the whole mill smells of dust and tar. Through the door you can see the sails, torn to rags by the storm. The lane is south.

Ways: south to Molenend, the Lane. Here: De Zwaan.

**The Miller's House** (private)

A solid house with a slate roof, the best in Molenend by a long way. A money chest sits under the window where the miller can see it from his chair. The house smells of pipe smoke and beeswax. The lane is west.

Ways: west to Molenend, the Lane.

### Oude Zijl

<!-- picture:area_oude_zijl -->

**On the Great Dyke** (public)

From the top of the dyke you see the Holleveen spread out on one side, flat and green and lower than it has any right to be. On the other side grey water runs out to a grey sky, and the wind off it tastes of salt and leans on you without a pause. Sheep have cropped the grass short, and their droppings are everywhere. The sluice lies below you, down the slope.

Ways: down to The Old Sluice.

**The Dyke House** (private)

A square brick house with small windows, built into the side of the dyke so that its back wall is earth. Inside, a long table is covered with rolled plans of dykes and ditches, held flat at the corners with stones. It smells of lamp oil and damp plaster, and somewhere behind the back wall water ticks. The door opens south onto the sluice.

Ways: south to The Old Sluice.

**The Ferry Landing** (public, route)

West of the sluice the tow path runs on along the water towards [Graafhaven], two days away. Here a flat ferry boat is tied to a landing of black planks, and a rope runs from a post across the water to the far bank. The rope drips and creaks when the wind leans on it. The sluice is back to the east.

Ways: east to The Old Sluice.

**The Old Sluice** (public, landmark, edge)

Two great sluice gates of tarred oak hold back the Vaart where it meets the dyke. Water leaks through the seams with a steady hiss, and gulls cry from the dyke top. A dyke house stands to one side with its shutters closed. The tow path runs east along the Vaart to Veenhoek.

Ways: north to The Dyke House; up to On the Great Dyke; west to The Ferry Landing.

### Reuzenrust

<!-- picture:area_reuzenrust -->

**The Edge of the Heath** (wilderness)

Here the heath ends in a low bank of sand and heather, and below it the fields and the fen run away south as far as the eye goes. On a clear day you can make out the tower of the Waag at [Waagdam] to the south-west, small and grey. The wind hisses in the heather, and something slides away through it at your feet, too quick to see. The giant-bed is north, back up on the heath.

Ways: north to The Giant-Bed at Reuzenrust.

**The Giant-Bed at Reuzenrust** (holy, haunted, landmark, hazard:fog, edge)

Great grey stones lie in a row on the heath, a capstone balanced on them like a table for giants. Three burial mounds rise beyond, furred with heather. The wind carries the smell of sheep and sand. The road to [Hunnenloo] runs away north-east; Waagdam lies to the south-west.

Ways: east to The Three Barrows; south to The Edge of the Heath; northeast to The Road to Hunnenloo.

**The Road to Hunnenloo** (route, hazard:fog, edge)

Past the giant-bed the road goes on across the heath, two sandy ruts curving away north-east between the heather until the land swallows them. It is many days' walk to [Hunnenloo], over country you do not know. The wind comes over the heath with nothing to stop it and smells of sand and sheep. The stones of the giant-bed stand close by to the south-west.

Ways: southwest to The Giant-Bed at Reuzenrust.

**The Three Barrows** (holy, haunted, hazard:fog)

Three round barrows rise from the heather, each as high as a house and furred with heath and moss. Someone has worn a narrow path between them, but none up their sides. The wind drops as you come among them, until you can hear the heather tick. The giant-bed lies back to the west.

Ways: west to The Giant-Bed at Reuzenrust.

### the Blackmere

<!-- picture:area_blackmere -->

**The Drainage Channel** (wilderness, hazard:bog)

A channel has been dug from the mere as straight as a stretched rope, running north towards [Molenend] and the mill that draws the water off. Along the shore the old waterline shows as a dark band on the reeds, well above the water, and below it lies a strip of raw black mud that stinks of rot. Dead mussels crack under your boots. The shore is back to the west.

Ways: west to The Shore of the Blackmere.

**The Drowned Willows** (wilderness, haunted, hazard:bog)

You wade out among the drowned willows, and the mud takes your feet to the ankle at every step. The trees are long dead, grey and split, and their bare branches hang down to the water. Up close they creak, though the air is still, and it is hard not to hear voices in it. The shore is back to the east.

Ways: east to The Shore of the Blackmere.

**The Haaksteen** (wilderness, haunted, fae)

A grey stone stands a little way out in the shallows, flat on top, and the water round it is darker than anywhere else. On it lie a crust of bread gone soft and a cup with a little beer left in it, gifts for the [Haakman], and the top of the stone is greasy with older ones. It smells of wet stone and sour beer. The shore is north; south of the stone, the bottom drops away into deep water.

Ways: north to The Shore of the Blackmere; south to The Open Water.

**The Open Water** (wilderness, haunted, hazard:deep_water)

Past the stone the bottom drops away, and you are up to your chest in water so cold it hurts, then over your head at a single misstep. The water is black and clear at once, and far below you something pale lies on the bottom that could be a branch, or bones. There is no sound out here but your own breathing and the lap of the water. The stone and the shallows are back to the north.

Ways: north to The Haaksteen.

**The Shore of the Blackmere** (wilderness, haunted, fae, hazard:deep_water, edge)

The fen ends at black water that gives back no reflection. Drowned willows stand out in the shallows like men wading, and the reeds whisper though there is no wind. The water smells of iron and old leaves. The eel weirs are north along the shore.

Ways: north to Wouter's Eel Weirs; west to The Drowned Willows; south to The Haaksteen; east to The Drainage Channel.

**Wouter's Eel Weirs** (wilderness, workshop, edge)

Rows of willow stakes march out into the water, hung with eel traps of woven withy. A plank walk runs along them, slick and bowed, and you hear the water slap against the stakes. A rusty nail is driven into the first stake, against the [Haakman]. The fen path runs north to Veenhoek and east towards the Kattenbroek; the open shore is south.

Ways: south to The Shore of the Blackmere.

### The Drowned Goose

<!-- picture:area_drowned_goose -->

**The Crossroads at the Drowned Goose** (public, landmark, edge)

Two raised roads cross here above the wet fields, and the inn sits in the corner between them like a hen on her nest. A painted sign creaks overhead: a goose, upside down, feet in the air. You smell woodsmoke and stew. The door is in; the road runs west to Veenhoek and east to [Waagdam], and the stable yard is south.

Ways: in to The Drowned Goose, Common Room; west to The Peat Road; east to The Waagdam Road; south to The Stable Yard.

**The Drowned Goose, Common Room** (public, social)

A low room of black beams and scrubbed tables, warm from a peat fire that never quite goes out. Voices and pipe smoke hang under the ceiling. A counter runs along the back wall, the kitchen door is north, and narrow stairs go up to the rooms. The door out is behind you.

Ways: out to The Crossroads at the Drowned Goose; north to The Kitchen of the Goose; up to Upstairs at the Goose. Here: bench.

**The Kitchen of the Goose** (private)

A big pot of eel stew bubbles over the hearth, and the air is thick with steam and onions. Strings of garlic and dried fish hang from the rafters. The common room is south.

Ways: south to The Drowned Goose, Common Room.

**The Stable Yard** (public, edge)

A cobbled yard with a stable, a pump and a notice board nailed to the wall. A mule looks out over its door with deep suspicion. It smells of hay and dung. The crossroads is north.

Ways: north to The Crossroads at the Drowned Goose. Here: notice board.

**Upstairs at the Goose** (private)

A creaking corridor under the thatch with four doors. One of them has a brass plate: CORNELIS DE WIT, LANDMETER. Behind another, somebody snores. The stairs lead down.

Ways: down to The Drowned Goose, Common Room.

### the Kabouterberg

<!-- picture:area_kabouterberg -->

**The Hollow under the Oak** (fae, taboo)

You crouch into a hollow under the roots, where the sand is dry and cool and the light comes in green. Roots hang from the roof like ropes, and among them hangs a row of tiny tools: a hook, a knife no longer than your thumb, a spade. The air smells of earth and milk. Further in, the hollow narrows into a dark you could never fit through; the way out is back up into the light.

Ways: out to The Old Oak.

**The Kabouterberg** (fae, landmark, edge)

A low hill of pale sand rises out of the fields, crowned by an oak older than anyone's grandfather. Between its roots a hollow opens into the hill, and someone has left a bowl of milk at its mouth. It is very quiet here; even the wind seems to go round. Veenhoek lies north-east across the fields.

Ways: up to The Old Oak; northeast to Crossroads of Fen Tracks.

**The Old Oak** (fae)

The oak is broad and low, its lower branches bent almost to the sand, and its roots grip the hilltop like fingers. Between two of them lies a flat stone with a wooden bowl on it, and the milk in the bowl is fresh. Overhead the leaves hiss in a wind you cannot feel down here, and the sand round the bowl has been swept smooth. The hollow opens under the roots; the slope runs down to the foot of the hill.

Ways: down to The Kabouterberg; in to The Hollow under the Oak.

### the Kattenbroek

<!-- picture:area_kattenbroek -->

**Below the Hut on Stilts** (fae, cursed, landmark)

A hut of grey planks stands on stilts over the black water, its ladder drawn up. Fish bones hang from the eaves on strings and turn in the wind, clicking softly. A cat sits on the top rung and does not blink. The reed path runs back west.

Ways: west to The Edge of the Kattenbroek; east to The Cats' Yard; south to The Black Pools; northwest to The Alder Hummock.

**The Alder Hummock** (wilderness, fae, cursed, hazard:fog, edge)

A few crooked alders grow on a hummock of firm ground here, the only dry footing for a long way. Under the sedge you can feel the firm ground go on, a low back of old peat that runs off north-west into the fen and is soon lost among the tussocks. Somewhere close a cat is crying. To the south-east the roof of the hut on stilts shows above the reeds.

Ways: southeast to Below the Hut on Stilts.

**The Black Pools** (wilderness, fae, cursed, hazard:bog, hazard:fog)

Pools of black water lie among the reeds, perfectly still, with a sheen of colours like oil where the light falls on them. Bubbles rise from the bottom now and then and burst with a smell of rotten eggs. A heron stands at the far side on one leg, watching you, and does not fly. The hut on stilts is north; a reed path leads back west.

Ways: north to Below the Hut on Stilts; west to The Reed Paths.

**The Cats' Yard** (fae, cursed)

Beside the hut a patch of higher ground has been trodden bare, and it is covered in cats: on the woodpile, on an upturned tub, in the dry places under the stilts. They are thin and sleek and every colour, and all of them turn their heads to look at you at once. One big grey tomcat sits apart from the rest, very upright, his front paws stained dark as if he had walked through ink. The yard smells of fish and cat, and the hut is back to the west.

Ways: west to Below the Hut on Stilts.

**The Drowned Oak** (wilderness, fae, cursed, hazard:bog, hazard:fog)

A huge oak stands dead in the water here, drowned when the fen rose round it, its bark long gone and its wood weathered to silver. Its lowest branches reach out over the path like arms, and things hang from them on strings: small bones, knots of reed, a bunch of dried heather. They turn and click together in the wind. The reed path runs back north; east, the reeds open on a patch of still water.

Ways: north to The Reed Paths; east to The Moon Pool.

**The Edge of the Kattenbroek** (wilderness, fae, cursed, hazard:bog, hazard:fog, edge)

Reed closes in on every side, taller than a man, and the path under your feet turns to black water in places. Cats watch you from the tussocks, more of them than there should be. The air smells of rot and, strangely, of fish frying. Far in to the east, a hut on stilts shows its roof above the reeds.

Ways: east to Below the Hut on Stilts; south to The Reed Paths.

**The Moon Pool** (wilderness, fae, cursed, hazard:fog)

The reeds stand back here from a round pool, so still that it holds the whole sky without a ripple. No reed grows in it and no duckweed, and nothing moves in it. It is very quiet; even the frogs stop when you come near. Behind you, to the west, the drowned oak stands pale above the reeds.

Ways: west to The Drowned Oak.

**The Reed Paths** (wilderness, fae, cursed, hazard:bog, hazard:fog)

The path splits, and splits again, each way a narrow gap in reed taller than you are. Underfoot the stems have been trodden into a mat that floats on the water and sinks a hand's breadth at every step. Something pads along beside you on the other side of the reed wall, keeping pace, and when you stop, it stops. The edge of the fen is north; one way leads east to black pools, another south towards a great dead tree.

Ways: north to The Edge of the Kattenbroek; east to The Black Pools; south to The Drowned Oak.

### the Rietdoolhof

<!-- picture:area_rietdoolhof -->

**Black Mathijs's Hut** (private, lair)

The hut is bigger inside than it looks, and dry, with a floor of planks and a real bed under a blanket of good wool. A chest with three locks stands at the foot of the bed, and on a peg by the door hang a black cloak and a mask of goat hide with the horns still on. It smells of goat, peat smoke and wet wool. The door opens back onto the camp.

Ways: out to The Goat-Riders' Camp.

**The Goat-Riders' Camp** (lair)

On a low island of dry ground a few huts of reed and turf stand round a fire pit. Goat-skins hang drying on a line, whole, with the horns still on the heads, and beside them hang masks of the same hide. The place stinks of goat and peat smoke, and under both lies a rotten, gassy smell that bubbles up from the mud wherever you step. The passages are north and the jetty north-west; the biggest hut, off to one side, has a door of real planks.

Ways: north to The Reed Passages; northwest to The Hidden Jetty; in to Black Mathijs's Hut.

**The Hidden Jetty** (wilderness, lair)

Tucked into a bend of the reeds is a jetty of new planks, so well hidden that you are standing on it before you see it. Two narrow boats lie alongside, light and low and painted black, their rowlocks wrapped in rags. The planks smell of fresh tar. The passages lead back east; a path of boards runs south-east towards the smoke of a camp.

Ways: east to The Reed Passages; southeast to The Goat-Riders' Camp.

**The Reed Maze** (wilderness, lair, hazard:bog, edge)

Channels of brown water wind between walls of reed, so alike that you lose your way just by looking at them. Somewhere ahead a goat bleats, which makes no sense out here. The smell of woodsmoke drifts over the reeds. The only way you are sure of is back north, the way you came.

Ways: south to The Reed Passages.

**The Reed Passages** (wilderness, lair, hazard:bog)

The reed here has been cut back into passages just wide enough for a punt, and the cut stems stand up out of the water like spikes. Some of the passages end in nothing, and one ends in a snare of twine strung low across the water. Woodsmoke drifts over the reeds, and with it a sharp smell of goat. North leads back to the edge of the maze; the passages go on south and west.

Ways: north to The Reed Maze; south to The Goat-Riders' Camp; west to The Hidden Jetty.

### the roads of the Holleveen

<!-- picture:area_roads -->

**Crossroads of Fen Tracks** (route)

Three tracks meet here on a low rise, each no more than two ruts with a strip of grass between them. A post stands at the crossing with no sign on it, only a bunch of rye ears tied to the top, grey with weather. Peewits cry over the wet fields on every side. The track runs north-east to the peat stacks and Veenhoek, south-west to the [Kabouterberg], and south-east to the old peat pits.

Ways: northeast to The Peat Stacks; southwest to The Kabouterberg; southeast to The Flooded Peat Pits.

**The Flooded Peat Pits** (wilderness, hazard:bog)

Here the peat was dug out long ago, and the pits have filled with water as black and still as ink. Only narrow strips of peat are left between them, and they quake when you step on them. A smell of rot comes up whenever the surface breaks. The track back to the crossroads is north-west; beyond the pits there is only the fen.

Ways: northwest to Crossroads of Fen Tracks.

**The Peat Stacks** (route)

Cut peat stands in rows of small stacks along a track through the fields, each stack built loose so the wind can get through it. The blocks are black at the bottom and going brown at the top, and they smell of earth and old smoke. A crow sits on one stack and watches you pass. The tow path is north, the peat cuttings east, and the track runs on south-west to a crossroads.

Ways: north to Tow Path, west of Veenhoek; east to The Peat Cuttings; southwest to Crossroads of Fen Tracks.

**The Priory Path** (route)

Here the path from Veenhoek leaves the fields and goes in under the trees, a strip of wet sand and roots between banks of fern. It is quieter at once; the wind stays up in the branches, and you hear your own breathing. Cart ruts cut deep into the sand, full of brown water. Ahead, to the north-west, a bell tower shows above the trees; the fields and roofs of Veenhoek lie back to the south-east.

Ways: northwest to The Priory Gate; southeast to Chapel Lane.

**The Waagdam Road** (route)

The road from the crossroads to Waagdam runs on a dyke above sodden pasture. Cows stand up to their knees in the wet. A cart has left deep ruts that shine with water. The Drowned Goose is west; Waagdam's gate is east.

Ways: west to The Crossroads at the Drowned Goose; east to Waagdam, the West Gate.

**Tow Path, halfway to Waagdam** (route)

Halfway between Veenhoek and Waagdam the tow path runs through nothing at all: water on one side, reeds on the other, and a sky that goes on for ever. A heron stands in the shallows and does not bother to fly off. The wind hisses in the reeds. Veenhoek lies west, Waagdam east.

Ways: west to Tow Path, east of Veenhoek; east to Waagdam, the West Gate.

### Veenhoek

<!-- picture:area_veenhoek -->

**Aaltje's Cottage** (shop, private)

Bunches of herbs hang from every beam, so you have to stoop. It smells of mint, smoke and something older. On the wall, in a frame of black wood, hangs a yellowed paper with a red seal: a certificate from the Waag of Waagdam, stating that one Aaltje Hendriks weighed as much as an honest woman should. The door opens east onto the lane.

Ways: east to Chapel Lane.

**Bakery Yard** (private, workshop)

A cramped yard behind the bakery. The bread oven squats against the back wall like a brick beehive, still warm to the touch. Peat is stacked under a lean-to. The back door leads west into the bakery.

Ways: west to The Bakery. Here: bread oven.

**Canal Quay** (public, landmark, edge)

Grey water slaps against the planks of the quay. A barge rope lies coiled by the mooring posts, and beside them stands a worn stone, waist-high, with a dog carved into it. Someone has put an apple on top. The [Graafse Vaart] runs east and west; the green is north and the peat sheds are south.

Ways: north to Veenhoek, the Green; east to Gerrit's House; west to Tow Path, west of Veenhoek; south to The Peat Sheds; southwest to The Old Cooperage. Here: old stone.

**Chapel Lane** (public)

A muddy lane between two rows of low houses, their doors painted green against the damp. It smells of wet thatch. North, the lane ends at the [Chapel of the Lantern]; the schout's brick house stands to the east and a cottage hung with drying herbs to the west.

Ways: north to Chapel of the Lantern; south to Veenhoek, the Green; east to The Schout's House; west to Aaltje's Cottage; northwest to The Priory Path.

**Chapel of the Lantern** (holy, public)

A small brick chapel that smells of candle smoke and wet wool. Above the altar hangs a lantern with three panes, lit day and night. Rain ticks on the roof tiles. The door stands open to the lane.

Ways: south to Chapel Lane. Here: altar.

**Gerrit's House** (private)

A low house at the water's edge, its walls hung with peat spades worn to the shape of their owner's grip. A heavy chest with the mark of the Brotherhood of Peat-cutters stands by the hearth. It smells of tobacco and wet boots. The quay is west; the tow path starts east.

Ways: west to Canal Quay; east to Tow Path, east of Veenhoek.

**The Bakery** (shop)

Warm, low and white with flour. Loaves cool on racks along the wall, and a slate by the counter says RYE 2 D in chalk, underlined twice. Through the back door, east, you can see the glow of the oven in the yard.

Ways: west to Veenhoek, the Green; east to Bakery Yard. Here: counter.

**The Old Cooperage** (private, vacant)

A low brick house leans against its own workshop, the shutters closed. Staves lie stacked under the eaves, grey with weather, and a bent iron hoop hangs on a nail by the door. It smells of damp oak and old tar. The quay is north-east.

Ways: northeast to Canal Quay.

**The Peat Cuttings** (wilderness, hazard:bog)

Here the land has been cut away in black steps, and water fills the old pits to the brim. The air is cold and smells of iron and rot. Each step you take squelches. The sheds are east; a path runs south to a hut at the fen's edge.

Ways: east to The Peat Sheds; south to Wouter's Hut; west to The Peat Stacks. Here: peat bank.

**The Peat Road** (route)

A raised track of packed peat and gravel leaves the village here. Ditches on both sides are full of black water and duckweed, and a frog plops out of sight as you pass. North-east it bends towards the sails of [Molenend]; east it runs on to the crossroads and the [Drowned Goose]. The green lies back to the south-west.

Ways: southwest to Veenhoek, the Green; northeast to Molenend, the Lane; east to The Crossroads at the Drowned Goose.

**The Peat Sheds** (workshop, public)

Long open sheds where blocks of peat are stacked in airy walls to dry. Everything smells of earth and smoke, and your boots stick to the floor. The quay is north; west, the ground drops away to the cuttings.

Ways: north to Canal Quay; west to The Peat Cuttings.

**The Schout's House** (private, law)

The only brick house in Veenhoek with glass in every window. Inside, a clerk's desk faces the door, stacked with ledgers, and a barred cell takes up one corner. It smells of ink and floor wax. The lane is back to the west.

Ways: west to Chapel Lane.

**Tow Path, east of Veenhoek** (route)

The tow path heads east along the Graafse Vaart, straight as a ruled line, towards [Waagdam]. Moorhens scold from the water. Behind you, to the west, is Gerrit's house at the edge of the village.

Ways: west to Gerrit's House; east to Tow Path, halfway to Waagdam.

**Tow Path, west of Veenhoek** (route)

The tow path runs west along the Vaart between reeds and water. The towing horses have worn it to a hard groove, and the reeds whisper on either side. Somewhere far west lies the old sluice and, beyond it, [Graafhaven]; today the path is empty. Veenhoek's quay is back east.

Ways: east to Canal Quay; south to The Peat Stacks.

**Veenhoek, the Green** (public, landmark, edge)

The village green is a patch of trampled grass around a stone well. Peat smoke hangs low over the roofs, and the ground gives a little underfoot, the way it does everywhere in the Holleveen. East, the [Bakery] door stands open, and west a grey cat sits very upright on the doorstep of a narrow house. A lane runs north to the [Chapel]; south, the canal glints between the houses, and a track leaves north-east.

Ways: north to Chapel Lane; east to The Bakery; south to Canal Quay; west to Visser House, the doorstep; northeast to The Peat Road. Here: well.

**Visser House, the doorstep** (private)

A narrow house with a green door. On the doorstep sits a grey cat with one white paw, very upright, watching the lane; when you come close it doesn't run, but looks at you as if it is waiting for you to say something. Inside, a spinning wheel hums. The green is east.

Ways: east to Veenhoek, the Green. Here: spinning wheel.

**Wouter's Hut** (private)

A reed-thatched hut on stilts where the village gives up and the fen begins. Willow eel traps hang from the eaves, and a smoking barrel breathes out the smell of hot fish. Beyond it there is only reed and water. The cuttings are north.

Ways: north to The Peat Cuttings. Here: eel traps.

### Waagdam

<!-- picture:area_waagdam -->

**Canal Street** (public)

A street along a narrow canal, with warehouses on one side and the water on the other. The guild house is north, the grain store south, and at the east end you hear the plod of a horse going round and round. The market square is west.

Ways: west to The Market Square; north to The Guild House; south to Lubbert's Grain Store; east to The Horse Mill.

**De Schaal** (public, social)

A dim, panelled tavern where the townsfolk of Waagdam drink out of sight of the church. Pipe smoke, wet wool and spilled beer. Behind the tap a small, sharp-eyed woman keeps count of every tankard. The church alley is east.

Ways: east to The Church of the Lantern. Here: bench.

**Gate Street** (public)

A cobbled street of narrow gabled houses leaning together over your head. You hear a hammer ringing from the smithy to the north. East the street opens onto the market square; south are the harbour steps, and the West Gate is behind you.

Ways: west to Waagdam, the West Gate; east to The Market Square; south to The Harbour; north to Hendrik's Smithy.

**Hendrik's Smithy** (shop, workshop)

Heat hits you in the doorway. The forge glows under a hood of soot, and the anvil rings under the smith's hammer. Lanterns, knives and coils of rope hang for sale along one wall. Gate Street is south.

Ways: south to Gate Street. Here: forge.

**Lubbert's Grain Store** (shop)

Sacks of grain are stacked to the ceiling, and a fine dust hangs in the air and tickles your nose. A slate by the door lists today's prices; the flour price has been rubbed out and written again, higher. Canal Street is north.

Ways: north to Canal Street. Here: Lubbert's strongbox.

**The Church of the Lantern** (holy, public)

A tall brick church with a lantern of real glass hanging above the door. Inside it is cold and smells of lime-wash and old incense. The market square is north; west, a narrow alley leads to the inn De Schaal.

Ways: north to The Market Square; west to De Schaal. Here: altar.

**The East Gate** (public, edge)

The east gate opens onto a straight road across the fields towards Zwolderkamp, two days away. Carts wait here to pay the toll, and the tollkeeper's brazier smells of hot coals. That journey waits for another day; the horse mill is back west.

Ways: west to The Horse Mill.

**The Guild House** (private)

The meeting house of the Waagdam guilds, with the bakers' wheatsheaf and the brewers' barrel carved over the door. Inside, long tables and a smell of beeswax and old arguments. Canal Street is south.

Ways: south to Canal Street.

**The Harbour** (public, edge)

The Graafse Vaart widens here into a basin crowded with flat barges. Men shout and swear as sacks go up and down the planks, and the water smells of tar and rotting weed. Gate Street is up the steps to the north.

Ways: north to Gate Street.

**The Heath Road** (route)

North of the town hall the houses stop and a sandy road climbs gently towards the heath, where the ground is higher and drier. Larks sing somewhere overhead. It is a long road to Reuzenrust and beyond; for now the town hall is south.

Ways: south to The Town Hall.

**The Horse Mill** (workshop)

Under a thatched roof an old grey horse walks a patient circle, turning a millstone that grumbles like a sleeping dog. The air is warm and smells of horse and flour. Canal Street is west; the East Gate is east.

Ways: west to Canal Street; east to The East Gate. Here: horse mill.

**The Market Square** (public, landmark, social, edge)

A wide square of uneven cobbles, big enough for the Woensdag market and the arguments that come with it. On the north side stands the [Waag] with its stepped gable; the church is south, the town hall north-east, and Canal Street leads east. Pigeons squabble over spilled grain.

Ways: west to Gate Street; north to The Waag; east to Canal Street; south to The Church of the Lantern; northeast to The Town Hall.

**The Notary's Office** (private, law)

A room lined floor to ceiling with deed boxes, each labelled in a small precise hand. It smells of dust, wax and candle smoke. A desk by the window holds a half-written chronicle. The town hall is west.

Ways: west to The Town Hall.

**The Town Hall** (public, law)

A handsome building with a flight of steps and a bell in a little tower. Clerks hurry in and out with papers under their arms, smelling of ink. The notary's office is east, the heath road leaves north, and the square is south-west.

Ways: southwest to The Market Square; east to The Notary's Office; north to The Heath Road.

**The Waag** (public, landmark)

The ground floor of the weigh house is a great echoing hall where merchants' goods are weighed and taxed. It smells of sacking and cold stone. A steep stair goes up to the Weighing Room; the weighmaster's house adjoins it to the east, and the square is south.

Ways: south to The Market Square; up to The Weighing Room; east to The Weighmaster's House.

**The Weighing Room** (public, landmark)

Under the rafters hangs the great scale: a beam of black oak and iron with a wooden seat on one side and a stack of weights on the other. The floorboards creak when you shift your weight. A framed list of the weighed hangs on the wall, some names crossed out. The stair leads down.

Ways: down to The Waag. Here: great scale.

**The Weighmaster's House** (private)

A tidy, narrow house joined to the Waag by a door in the wall. Every surface is clean and every book is straight. A clock ticks on the mantel, the only one you have heard in the Holleveen. The Waag is west.

Ways: west to The Waag.

**Waagdam, the West Gate** (public, landmark, edge)

A squat brick gate with the town's arms over the arch: a pair of scales above three fish. The gatekeeper's bench is empty, but the smell of the town reaches you anyway: smoke, dung and fresh bread. The tow path runs west, the road to the Goose north-west, and Gate Street leads east into town.

Ways: west to Tow Path, halfway to Waagdam; northwest to The Waagdam Road; east to Gate Street.

## 9. People

| Name | Who | Age | Trade | Home |
| --- | --- | --- | --- | --- |
| Aaltje Hendriks | Old Aaltje | 71 | herbalist | Aaltje's Cottage |
| Aleid Vos | Burgomaster Aleid Vos | 52 | burgomaster | The Town Hall |
| Ansfried | Prior Ansfried | 65 | prior | The Prior's Lodging |
| Black Mathijs | Black Mathijs | 41 | robber | Black Mathijs's Hut |
| Cornelis de Wit | Master Cornelis the surveyor | 36 | surveyor | Upstairs at the Goose |
| Dirck Schaal | Weighmaster Dirck | 60 | weighmaster | The Weighmaster's House |
| Everhard van Lienden | Schout Everhard | 50 | schout | The Schout's House |
| Fenna Visser | Fenna Visser | 15 | child | Visser House, the doorstep |
| Geesje Kroes | Geesje | 19 | barmaid | The Kitchen of the Goose |
| Gerrit Turfsteker | Gerrit the peat-cutter | 38 | peat-cutter | Gerrit's House |
| Grietje Visser | Grietje Visser | 40 | spinner | Visser House, the doorstep |
| Harmen Molenaar | Harmen the miller | 55 | miller | The Miller's House |
| Hendrik Smid | Hendrik the smith | 40 | smith | Hendrik's Smithy |
| Jacob van Dam | Jacob van Dam | 41 | cat | The Cats' Yard |
| Jan Visser | Jan Visser | 44 | peat-cutter | Visser House, the doorstep |
| Kaatje | the widow Kaatje | 70 | witch of the Kattenbroek | Below the Hut on Stilts |
| Klaas | Klaas the miller's lad | 16 | miller's lad | The Miller's House |
| Kobus | Kobus the pedlar | 60 | pedlar | The Drowned Goose, Common Room |
| Lubbert Graanhandel | Lubbert the grain merchant | 45 | grain merchant | Lubbert's Grain Store |
| Mirte Bakker | Mirte the baker | 42 | baker | The Bakery |
| Neeltje Kuiper | Neeltje the landlady | 44 | innkeeper | De Schaal |
| Ouwe Knoert | Ouwe Knoert | 500 | spirit | The Hollow under the Oak |
| Pieter Pen | Master Pen the notary | 58 | notary | The Notary's Office |
| Pim Visser | Pim | 9 | child | Visser House, the doorstep |
| Sijbrand | Heemraad Sijbrand | 47 | heemraad | The Dyke House |
| Teunis Ros | Teunis the horse-miller | 58 | horse-miller | The Horse Mill |
| the Haakman | the Haakman | 400 | spirit | The Open Water |
| the White Women | the White Women | 1000 | spirit | The Three Barrows |
| Trijntje Kroes | Trijntje the innkeeper | 49 | innkeeper | The Kitchen of the Goose |
| Wendela | Sister Wendela | 34 | sister of the Lantern | Chapel of the Lantern |
| Wouter Aalman | Wouter the eel-fisher | 29 | eel-fisher | Wouter's Hut |

<!-- picture:portraits -->

### What they want

| Name | Values | Quirks |
| --- | --- | --- |
| Aaltje Hendriks | nature 3, knowledge 2, tradition 2 | old_customs, keeps_secrets |
| Aleid Vos | order 2, wealth 2 | careful |
| Ansfried | knowledge 3, faith 2 | bookish, brewer |
| Black Mathijs | wealth 3, freedom 2 | charming |
| Cornelis de Wit | knowledge 2, wealth 1, law 1 | ambitious |
| Dirck Schaal | justice 3, knowledge 1 | precise |
| Everhard van Lienden | law 3, order 2 | hates_disorder |
| Fenna Visser | freedom 2 | restless |
| Geesje Kroes | freedom 3 | restless |
| Gerrit Turfsteker | freedom 3, tradition 2, law -1 | drinker, hates_the_count |
| Grietje Visser | family 3, faith 1 | old_customs, grieving |
| Harmen Molenaar | wealth 2, craft 2 | greedy |
| Hendrik Smid | craft 3 | old_customs |
| Jacob van Dam | knowledge 2, family 2 | nervous |
| Jan Visser | family 3 | grieving |
| Kaatje | nature 3, honour 3 | old_customs, cats |
| Klaas | family 1 | shy |
| Kobus | wealth 2, freedom 2 | gossip |
| Lubbert Graanhandel | wealth 3 | greedy |
| Mirte Bakker | family 2, craft 2, faith 1, law 1 | gossip, counts_every_duit, afraid_of_deep_water |
| Neeltje Kuiper | wealth 2, law 1 | counts_every_duit |
| Ouwe Knoert | respect 3 | spirit |
| Pieter Pen | knowledge 3, law 2 | bookish |
| Pim Visser | family 3 | knows_hidden_paths |
| Sijbrand | safety 3, law 2 | worried |
| Teunis Ros | craft 2 | talks_to_his_horse |
| the Haakman | water 3, respect 3 | spirit |
| the White Women | respect 3, rest 3 | spirit |
| Trijntje Kroes | family 3, wealth 2 | gossip |
| Wendela | faith 3, law 1, family 1 | pious, afraid_of_deep_water |
| Wouter Aalman | freedom 2, nature 2, wealth 1 | loner |

### Ties

- Aaltje Hendriks: neighbour Harmen Molenaar, acquaintance Wendela
- Aleid Vos: spouse her husband
- Black Mathijs: employer Cornelis de Wit
- Cornelis de Wit: acquaintance Everhard van Lienden
- Everhard van Lienden: spouse your wife
- Fenna Visser: parent Jan Visser, parent Grietje Visser, sweetheart Klaas
- Geesje Kroes: parent Trijntje Kroes, parent your late father, sweetheart Wouter Aalman
- Gerrit Turfsteker: rival Everhard van Lienden
- Grietje Visser: spouse Jan Visser, child Pim Visser, child fenna
- Harmen Molenaar: debtor Mirte Bakker, neighbour Aaltje Hendriks
- Jacob van Dam: spouse his wife
- Jan Visser: spouse Grietje Visser, child Pim Visser, child fenna, foreman Gerrit Turfsteker
- Kaatje: spouse her husband, pupil Aaltje Hendriks, creditor Dirck Schaal
- Klaas: employer Harmen Molenaar
- Kobus: employer Lubbert Graanhandel
- Mirte Bakker: spouse Joris, creditor Harmen Molenaar
- Pim Visser: sibling fenna
- Trijntje Kroes: child Geesje Kroes, spouse your late husband, acquaintance Wouter Aalman
- Wendela: sibling your little brother, acquaintance Aaltje Hendriks
- Wouter Aalman: sweetheart Geesje Kroes, grandparent your grandmother, acquaintance Trijntje Kroes

### Romance

- Geesje Kroes: open to anyone. Wants to get away to Graafhaven; romance runs through her personal quest, and Trijntje is dead against it.
- Gerrit Turfsteker: open to women. Distrusts anyone who sides with the Count; honesty counts for more with him than charm.
- Hendrik Smid: open to anyone. Shy; values craft and patience.
- Kobus: open to anyone. Charming and unfaithful; a romance with Kobus is mostly a story to tell later.
- Trijntje Kroes: open to men. A widow; looks for someone to carry the inn with her who won't chase Geesje off.
- Wendela: open to nobody. Only if she leaves the order in her personal quest; whoever undermines her vows loses her for good.
- Wouter Aalman: open to anyone. In love with Geesje; whoever wants him has to deal with her.

## 10. Secrets and stories

### the Cat-Widow of the Kattenbroek

```text
Out in the Kattenbroek there's a hut on stilts, and in it a widow. Kaatje, they call her. Her man was an eel-fisher who went into the black water one spring and never came up. She's kept the fen ever since, like it's his grave, and maybe it is. Take an egg, a reed, an eel from her water without asking, and you come home on four legs. Or you don't come home. My mother knew a boy it happened to. A year and a day he was a ginger tom, and after that he never could abide fish. Is it true? Half the cats in this parish are just cats. But I wouldn't kick one.
```

### the Haakman

```text
My gran fished the Blackmere seventy years. She said the Haakman is grey as a heron, with teeth like water-weed and a long hook, and he drags down anyone who spits in his water or takes more eels than they need. She had a song for him. I only have the start of it: Haakman, Haakman, cold and grey, iron at the door keeps you away, iron in the hand and bread on the stone. There was more. Something about his name. She took the rest with her.
```

### the Night of the Water Wolf

```text
Two hundred years back, near enough, the sea came over the Great Dyke in one night. The old folk called it the Water Wolf, because it came hungry and took everything: seventy-two villages and all of Saeftinge. In the dark a dyke-man called Brand lit a lantern on the last dry stretch, and those who saw it lived. That's why there's a lantern over every church door. And that's why, when the heemraad calls, you dig.
```

### Saint Brand

```text
On the Night of the Water Wolf the sea came over the Great Dyke in the dark, and nobody could tell land from water. Brand was a dyke-man, nobody special, mud to his knees like the rest of them. He climbed to the last stretch of dyke that still stood, lit his lantern and held it up all night, with the wind trying to tear it out of his hands. Those who saw it waded towards it through water up to their chests, and they lived. Those who didn't see it, didn't. In the morning he came down, and he never said a word about it for the rest of his life. The sisters say the light was the Lantern itself, burning in his hands. Some old dyke-men will tell you it was a pot of peat fire and a stubborn man, and that that's miracle enough.
```

### the last sheaf

```text
At harvest you leave the last sheaf standing in the field, tied with a red thread. That one's for the Grey Rider's horse. Priests say it's superstition. Fine. Old Dirk Hoeve cut his last sheaf in 203. That winter the Rider came through in a storm, and Dirk's barn went up like tinder. You leave the sheaf.
```

### the Witches' Scale

```text
When somebody's called a witch, she goes to the Waag in Waagdam, pays her guilder and two stuivers, and stands on the great scale in front of the weighmaster and two witnesses. A witch weighs next to nothing, you see, because she has given her weight away to fly. If you weigh what an honest body your size should, Weighmaster Dirck writes you a certificate with the town's seal on it, and after that no priest or schout in the land can touch you for witchcraft. Old Aaltje has hers framed on the wall. Men get weighed too, now and then, but mostly it's women, and mostly it's a neighbour who pointed the finger. The scale has been honest for fifty years, people say. People say a lot of things.
```

### the Goat-Riders

```text
The Goat-Riders came up out of the south thirty years ago, and all the hangings down there never finished them. They meet at a crossroads at midnight and swear themselves to the devil, and he gives each of them a black goat that flies. On those goats they ride through the air over the fen, faster than any horse, and come down on a barge or a farm before anyone can bar the door. A bargeman on the Vaart saw them go over last winter, green fire under the hooves and a stink behind them like rotten eggs and peat smoke. They took his cargo and half his teeth. Black Mathijs rides in front on the biggest goat, and he's never been caught, because how do you catch a man who flies? So you pay the toll on the tow path, and you don't look up.
```

### the dyke law

```text
After the Water Wolf, the ones who were left swore it would never happen again. They made the Dyke League, and the Dyke League made the law: who will not dyke, must yield. When the heemraad calls you out, you go, whoever you are, and you bring your own spade. If you won't, they stick a spade in your field, and whoever pulls it out and does your stretch of dyke gets your field. My grandfather saw it done at the Oude Zijl, to a man with three cows and a fine opinion of himself. By midsummer his field had a new owner, and nobody would lend him so much as a pail. The sea doesn't care whose land it is, you see. So neither can we.
```

### Mother Holle's featherbed

```text
There was a girl who spun by the well until her fingers bled, and one day she dropped her spindle in. Her stepmother told her to fetch it out, so she jumped in after it. She woke in a green meadow, and there was an old woman at a cottage door with teeth as big as a horse's, who asked her to keep house. Every morning she was to shake the featherbed out of the window until the feathers flew, because that is what makes it snow down here. She worked a year and was never once lazy, and when she went home, Mother Holle stood her under a gate and gold rained down on her. Her lazy sister jumped in on purpose, shook nothing and swept nothing, and came home under a rain of pitch that never washed off. So when the snow comes, you know who's working. And you keep your spinning tidy, and you put a pin in the well.
```

### Reynard the Fox

```text
The lion was king of the beasts, and he called his court, and every animal came except Reynard, because every animal had a complaint against him. So the king sent Bruin the bear to fetch him. Reynard told Bruin about a tree trunk full of honey, split open with a wedge, and when the bear put his head in, the fox pulled the wedge out. Bruin came home without his ears. Then the king sent the cat, and the cat came home without an eye. In the end they had Reynard on the gallows with the rope round his neck, and he told the king about a buried treasure, and the king let him down to go and fetch it. There was no treasure. There never is, with a fox.
```

### the drowned bells of Saeftinge

```text
Saeftinge was so rich, they say, the girls wore gold buckles on their clogs. One day the fishermen hauled up a mermaid in their nets and carried her through the streets for everyone to gape at. Her mate came up out of the water and asked for her back, once, twice, three times, and they laughed at him. So he cursed them. Saeftinge shall go under, he said, and only the tops of its towers shall show. Not long after came the Night of the Water Wolf, and the city went down with every soul in it. Bargemen from the south say you can still see the tower stumps in the mud when the tide is out, and on a still evening you hear the bells. Don't go out to them. The tide comes back faster than a man can run.
```

### Lord Halewijn's song

```text
Lord Halewijn sang a song, and every girl who heard it had to go to him. One after another they went into the Grey Wold, and not one came back. Then a king's daughter heard it. She asked her father and her mother if she might go, and they said no, and she went anyway, in her best dress, on her father's best horse. Halewijn met her under a tree with other girls hanging in it, and told her to choose how she would die. She asked him to take off his coat first, so her blood wouldn't spoil it, and while he bent to do it she took his own sword from his belt and struck off his head. The head went on singing all the way home, and she never once looked back at it. That's why a girl in these parts is told never to follow a song in the dark.
```

### the Waylost

```text
Captain Van der Decken sailed out of Skelling on a day when nobody with any sense would. The storm came up over the sands, and his men begged him on their knees to turn back. He lashed himself to the helm, cursed heaven and the Lantern both, and swore he would get round if it took him till the end of days. Something heard him. His ship never came home, and she never went down either. The Skelling boatmen see her before a storm, black sails full though the wind is the other way. If she comes alongside and her men hold out letters for home, you don't take them. They're for people dead these hundred years, and whoever carries them goes to the bottom.
```

### Tall Pier's sword

```text
Tall Pier was a farmer in Terpwold, seven feet tall if he was an inch, with hands like shovels. When the Count's men came for the tax, he told them the terps belonged to the people who had built them, and he sent them home in their shirts. They came back with soldiers, and he met them with a two-handed sword as long as a man that nobody else could lift. They say he once picked up a horse, rider and all, and threw them in a ditch. For fifteen years no tax-gatherer got past Terpwold. Then one winter he walked out across the ice and didn't come back, and nobody ever found him. His sword hangs in the hall there to this day, waiting. Peat-cutters here still drink to him, when the schout isn't listening.
```

### the Lady of Stavermouth

```text
There was a widow in Stavermouth so rich she didn't know what to buy next. She sent her best captain to sea to bring her back the most precious thing in the world. He thought long and hard, and came home with a hold full of good wheat, because what's more precious than bread? She asked him which side of the ship he had loaded it on, and when he told her, she said, then tip it out on the other side. Out it went at the mouth of the harbour, with the poor of the town watching from the quay. The wheat sprouted in the sea, but the ears were empty, and the sand built up round it until no ship could get in. She died begging for bread at the doors she used to own, or so they say. Bakers tell that to every apprentice who spills flour.
```

### the White Women of Reuzenrust

```text
When the autumn mist lies on the heath at Reuzenrust, the White Women come up out of the mounds. You see them first as mist that stands still while the rest of it moves. My grandmother went to them once, when her little boy had the fever, with a loaf and her best manners, and she greeted them as you'd greet the neighbours. They told her the boy would live, and he did, to be an old man. But a shepherd lad once laughed at them and called them old sheets on a line. He came home blind in one eye and never saw straight again. So you greet them, you don't laugh, and when you go, you don't turn round.
```

### the Surveyor's Lights

```text
A surveyor who measures crooked for a bribe, or a farmer who shifts his boundary stone a furrow into his neighbour's land, gets no rest when he dies. He has to walk the fields at night with a little light, carrying the stone, looking for where it belongs. That's what the lights in the fen are. My uncle met one on the fen path in the fog, and it called out, where shall I put it, where shall I put it? He was so frightened he shouted back, put it back where you found it, you fool! The light gave a sort of sigh and went out, and he never saw it again. But if a light only bobs along ahead of you and says nothing, don't follow it. That way lies a peat hole, and nobody finds you till spring.
```

### the lights over Harmen's field

```text
You can see them any foggy night from the mill lane: two little lights over Harmen's field, low down, drifting and stopping and drifting again. They never come near the mill. They keep to the middle of the field, round the old boundary stone, as if they'd dropped something there and can't find it. Harmen says it's marsh gas. Marsh gas doesn't stop and wait for you. Old Aaltje says wisps only come where something has been put where it doesn't belong, and then she looks at nobody in particular. Klaas won't cross that field after dark for a week's wages, and I don't blame him.
```

### milk for the kabouters

```text
When I was a girl, my mother put out a bowl of milk every night, and every morning the bowl was empty, the floor was swept and the churn was full of butter. Kabouters, from the Kabouterberg. They're no taller than your knee and older than the fen, and they'll work all night for a bowl of milk and a little respect. But you must never watch them. My brother did, once, through a crack in the shutter, to see what they looked like. After that the milk turned in the pail every morning for a month, and every left shoe in the house went missing, and we never did find them all. My mother went up the hill with a jug of cream and said sorry for him, and that was the end of it. And whatever you promise a kabouter, you keep.
```

### the Fen Charter

```text
About a hundred and fifty years ago there was a Count, Floris the Second, who wasn't a thief, or so the story goes. He gave the peat of the Holleveen to the fen folk and whoever cuts peat there, for ever, and he had it written on parchment under his seal. For ever, mind. Not until some Count after him needs money. The peat-cutters kept the story, but the parchment went where old parchments go, into a chest, into a library, into the dust. Nobody has seen it in a hundred years, and most people think it's a tale the Brotherhood tells itself to feel better. If it were ever found, and still good, the Count could whistle for his polder.
```

### the ringed oak of Baduhenna

```text
Long before there was a Count, the free folk of the terps swore by Baduhenna in her wood. They drove an iron ring into the oldest oak there, and the tree has grown round it since, so that only half the ring still shows. When a Terpwold man makes a promise that matters, he goes to the wood, puts his hand through the ring and says it out loud. The oak hears it. Break that oath, and the oak knows, and so does Baduhenna, and sooner or later the debt is called in. There was a man who swore at the ring to marry a girl and then took a richer one. They found him under that same oak in the spring, without a mark on him, and nobody in Terpwold would say more than that.
```

### Secrets

| Whose | Secret |
| --- | --- |
| Aleid Vos | The town is broke. |
| Ansfried | He knows the Fen Charter is still valid, but the Count is patron of the priory. |
| Black Mathijs | The flying goats are goat-skins and bog gas. |
| Cornelis de Wit | He pays Black Mathijs to keep the peat-cutters off his stakes. |
| Cornelis de Wit | He knows from the old survey that drained peat shrinks and sinks below the level of the Vaart. |
| Kaatje | She knows who the grey tomcat in her yard is. |
| Kaatje | The grey cat on the Vissers' doorstep is Fenna, who paid for a love charm with a lie. |
| Kobus | Lubbert pays him to tell everyone that the mill will not turn again before winter, and he sells false weighing certificates. |
| Mirte Bakker | She owes Harmen the miller three guilders, since the wet spring. |
| Ouwe Knoert | He knows every hidden path in the Holleveen. |
| Pieter Pen | He once saw a note in a register that the Fen Charter lies in the library at Kloosterveen. |
| Pim Visser | He knows the children's path to the Kattenbroek, along a hidden ridge of dry ground. |
| Sijbrand | He knows the sluice will not hold if the polder sinks. |
| Wendela | Her little brother drowned in the Blackmere when they were children. She has been afraid of deep water ever since. |
| Wouter Aalman | He knows a hidden ridge of dry ground through the fen to the Kattenbroek; his gran showed him. |

## 11. Bestiary

| Creature | Kind | Level | Faction |
| --- | --- | --- | --- |
| rat swarm | beast | 1 |  |
| adder | beast | 0 |  |
| feral dog | beast | 1 |  |
| great pike | beast | 2 |  |
| Goat-Rider | human | 2 | the Goat-Riders |
| Black Mathijs | human | 5 | the Goat-Riders |
| veenlijk | undead | 3 |  |
| Kludde | spirit | 4 |  |
| Reigerbeen | spirit | 3 |  |
| the Haakman | spirit | 6 |  |
| the Haakman | spirit | 3 |  |

### Encounters

| Encounter | Where | Who |
| --- | --- | --- |
| The Goat-Riders on the tow path | Tow Path, halfway to Waagdam | 1 Goat-Rider, 1 Goat-Rider |
| The Haakman rises | the Blackmere | 1 the Haakman |
| The Goat-Riders' camp | The Goat-Riders' Camp | 1 Black Mathijs, 1 Goat-Rider, 1 Goat-Rider |
| The veenlijken rise | the Kattenbroek, the Blackmere | 1 veenlijk |
| The surveyor's guards | The Flooded Peat Pits | 1 Goat-Rider |

## 12. Coins, measures and calendar

### Coins

<!-- picture:coins -->

| Coin | Short | Worth |
| --- | --- | --- |
| guilder | gl | 160 |
| stuiver | st | 8 |
| duit | d | 1 |

### Prices

| Thing | Worth |
| --- | --- |
| apple | 1 d |
| apple cake | 4 d |
| bar of iron | 6 d |
| barrel | 5 st |
| basket of clay | 2 d |
| basket of peat | 2 d |
| bolt of sailcloth | 1 gl 5 st |
| bowl of stew | 4 d |
| brick | 3 d |
| brigandine | 1 gl 10 st |
| bundle of herbs | 2 st |
| bundle of letters | 1 d |
| burnt loaf | 1 d |
| chain shirt | 2 gl 10 st |
| club | 1 st |
| coil of rope | 1 st 4 d |
| diary | 2 d |
| eel | 1 d |
| feast bread | 5 st |
| fleece | 2 st |
| handful of iron nails | 1 st |
| hanger | 15 st |
| hatchet | 5 st |
| hunting bow | 1 gl 5 st |
| iron key | 2 d |
| iron lock | 7 st 4 d |
| jug of lamp oil | 3 st |
| jug of milk | 2 d |
| knife | 6 st |
| lantern | 1 gl |
| leather jerkin | 10 st |
| loaf of rye bread | 2 d |
| mace | 12 st |
| measuring chest | 7 st 4 d |
| mug of beer | 1 d |
| padded coat | 5 st |
| piece of scrap iron | 3 d |
| round shield | 8 st |
| sack of flour | 4 st 4 d |
| sack of rye | 3 st |
| saw | 2 st 2 d |
| short bow | 15 st |
| skein of yarn | 3 st |
| sling | 4 d |
| smoked eel | 2 d |
| spear | 8 st |
| staff | 4 d |
| surveyor's chain | 15 st |

### Measures

an ell of cloth, a pound of butter, a mudde of rye, a stack of turf.

### Calendar

<!-- picture:calendar -->

Months: Louwmaand, Sprokkelmaand, Lentemaand, Grasmaand, Bloeimaand, Zomermaand, Hooimaand, Oogstmaand, Herfstmaand, Wijnmaand, Slachtmaand, Wintermaand, Dijkdagen. The week: Maandag, Dinsdag, Woensdag, Donderdag, Vrijdag, Zaterdag, Rustdag. Years are counted AW.

### Bells

- The chapel bell at Chapel of the Lantern, at 6, 12, 18 o'clock

### The law

The law in the Count's land is kept by the schout (Everhard van Lienden).

## 13. Quests

| Quest | What it is about | Given by | Ways it ends |
| --- | --- | --- | --- |
| The Grey Cat on the Doorstep | The grey cat on the Vissers' doorstep is Fenna, cursed by the widow of the Kattenbroek. | Grietje Visser, Pim Visser | Paid; Broken; Honest; Burned; The fen is closed; Nobody left to lift it |
| The Vissers to Safety | Veenhoek is under water. Bring the Vissers somewhere dry. | Grietje Visser | Safe in Waagdam; Safe at the Goose; Safe at the priory; Somebody else came; Lost to the water |
| Flour for Veenhoek | The mill stands still and Veenhoek has no flour. | Mirte Bakker | Flour brought; The mill turns; The rumour exposed; Market day passed |
| The Surveyor's Lights | Will-o'-the-wisps dance over Harmen's field, where he moved the boundary stone. | Aaltje Hendriks, Klaas | Reported; Blackmailed; The stone put back; Nobody to put it back |
| What the Haakman Wants | The mill pumps the Blackmere empty, and the Haakman takes revenge. | Wouter Aalman | A bargain with the water; Driven off with iron; Named; The Haakman's revenge |
| Milk for the Kabouters | Things go missing and milk turns sour, because Pim spied on the kabouters. | Grietje Visser, Mirte Bakker | Seven nights of milk; Pim pays his own debt; An apology, properly made; The trap |
| The Goat-Riders' Toll | The Goat-Riders levy a toll on the Vaart, and Cornelis pays them. | Trijntje Kroes | The camp broken; The trick exposed; A lawful toll; One of them |
| The White Women's Riddle | In the mist at Reuzenrust the White Women ask a riddle about the dead of the Water Wolf. | Aaltje Hendriks | Solved with lore; An offering with respect; Walked away |
| The Drainage Question | Will the Holleveen be drained? | Gerrit Turfsteker, Cornelis de Wit, Everhard van Lienden | The charter; The truth; Resistance; A settlement; The polder comes; The polder comes; The surveyor is dead |
| A Stall at the Market | Mirte wants a stall in Waagdam, but the bakers' guild keeps outsiders out. | Mirte Bakker | A licence from the council; A cousin of the guild; Under a master's name; The fair passed |
| The Honest Scale | An envoy of the Lantern wants to take over the weighing, and Wendela accuses Aaltje. | Dirck Schaal | Weighed and found true; The envoy discredited; The secret kept; The secret used; The hearing lost |
| The Brotherhood's Charter | Find the Fen Charter and have it recognised, without bloodshed if possible. | Gerrit Turfsteker | Recognised by law; Kept by the Brotherhood; By force |
| The Apprentice's Debt | Bring Aaltje to the widow for a last conversation. | Aaltje Hendriks | Reconciled; A last conversation; A letter; Too late |
| A Boat and a Bride | Money for a boat, and Trijntje to be won over. | Wouter Aalman | With her blessing; Her daughter asked; Eloped; No boat |
| The Bell of Kloosterveen | A bell that rings by itself at the Blackmere, and Wendela's fear of the water. | Wendela | The bell raised; Faced; A mass for the drowned |
| The Road to Graafhaven | To the city, with or against her mother. | Geesje Kroes | With her blessing; Without it; A start |

## 14. Names and speech

### Sayings

- When the calf has drowned, they fill in the well.
- Better half an egg than an empty shell.
- Water always finds the weakest board.
- East, west, home is best.

### How people address a stranger

- stranger: stranger, traveller
- known: goodwife/goodman/neighbour
- friend: lass/lad/friend, neighbour
- high: mistress/master/honoured guest

### Words that are not of this world

o'clock, potatoes, potato, tobacco, cigarette, cigar, coffee, chocolate, tomatoes, tomato, pocket watch, wristwatch, okay, ok, photograph, photo, percent, awesome, dude, police, policeman, newspaper, weekend, dollars, dollar, pennies, penny, cents, internet, online, website, email, e-mail, phone, smartphone, computer, laptop, robot, television, electricity, plastic, hashtag, Monday, Tuesday, Wednesday, Thursday, Friday, Saturday, Sunday, January, February, April, June, July, August, September, October, November, December.

## 15. Trades and crafts

| Trade | Works |
| --- | --- |
| baker | 04:30-12:00 |
| miller | 06:00-12:00, 13:00-18:00 |
| peat-cutter | 06:00-12:00, 13:00-16:30 |
| herbalist | 08:00-12:00, 13:00-18:00 |
| eel-fisher | 05:00-10:00, 10:00-13:00 |
| sister of the Lantern | 08:00-12:00 |
| schout | 08:00-12:00, 13:00-14:00, 14:00-15:00 |
| spinner | 08:00-12:00, 13:00-17:00 |
| child |  |
| innkeeper | 07:00-23:00 |
| barmaid | 11:00-23:00 |
| grain merchant | 07:00-18:00 |
| labourer | 06:00-18:00 |
| merchant | 07:00-18:00 |
| horse-miller | 07:00-17:00 |
| weighmaster | 09:00-16:00 |
| smith | 07:00-12:00, 13:00-18:00 |
| pedlar | 07:30-17:00, 07:30-16:00, 08:00-12:00, 12:00-17:00 |
| surveyor | 08:00-12:00, 13:00-17:00 |
| burgomaster | 08:00-12:00, 13:00-17:00 |
| notary | 08:30-12:30, 13:30-18:00, 19:00-22:30 |
| prior | 07:00-12:00, 13:00-17:00, 19:00-21:00 |
| heemraad | 07:00-12:00, 13:00-18:00 |
| miller's lad | 06:00-12:00, 13:00-18:00 |
| witch of the Kattenbroek | 07:00-12:00, 13:00-19:00 |
| robber | 10:00-17:00 |
| spirit |  |
| cat |  |
| cooper | 07:30-12:00, 13:00-17:30 |
| homemaker |  |

### Crafts

| Craft | Maker | Techniques | A failure leaves |
| --- | --- | --- | --- |
| baking | baker | rye loaves, sweet dough, feast bread | poor (burnt loaf) |
| smithing | smith | drawing out nails, blade work, sheet work, lock work | poor (piece of scrap iron) |
| milling | miller | grinding | leftover |
| peat-cutting | peat-cutter | cutting turves | nothing |
| eel-fishing | eel-fisher | setting traps | nothing |
| coopering | cooper | raising a barrel | nothing |
| brick-making | brick-maker | firing bricks | nothing |

## 16. Transport

| Line | Kind | Stops | Days | Fare |
| --- | --- | --- | --- | --- |
| the barge on the Graafse Vaart | barge | graafhaven, The Old Sluice, Canal Quay, The Harbour | Maandag, Donderdag | 2 st |
| the coach on the Oostweg | coach | The East Gate, zwolderkamp | Dinsdag, Vrijdag | 3 st 6 d |

## 17. What happens when

- When life event (betrothal): a feast at the social near of the mover of A, B; word goes round: "{a} and {b} are married".
- When life event (wedding): set tie A, B; join household the mover of A, B; the family of B think better of A; the family of A think better of B; expect home the one who stays; quit work the one who moves.
- When eloped: leave A, B; word goes round: "{a} and {b} came back married".
- When vacancy: post the board near of the place; B thinks: "{a} has gone, and you need someone at {at}. You have put a note on the board."; hire whom it is about.
- When house empty: word goes round: "nobody lives at {place} now".
- When realm stance (peace): news in the area: "There's peace, they say. The barges will run again.".
- When place restored: news in the area: "{place} is itself again, and people are going back.".
- When place destroyed: the area takes a mood of panic for 2 days.
- When rose in standing: word goes round: "{a} has come up in the world"; A thinks: "You are somebody now, and people had better see it.".
- When rose in standing: the neighbours of A think worse of A.
- When quarrel: mediate A, B.
- When feud: set tie A, B; word goes round: "{a} and {b} are not speaking".
- When doubt (a signal of the game itself): ask around A.
- When stranger unwelcome (a signal of the game itself): chase away A, B.
- When recognised (a signal of the game itself): recall A; goal Talk.
- When warned: carry word A.
- When asked about: seek player A.
- When request open (a signal of the game itself): seek player A.
- When befriended: set tie A, player; A thinks: "The stranger is a friend of yours now.".
- When theft mended (own accord) (a signal of the game itself): A think better of player; A thinks: "The stranger came back of their own accord and made it right. That counts for something.".
- When theft mended (after caught) (a signal of the game itself): A think better of player; A thinks: "The stranger made it right, but only once they were caught.".
- When broken promise (a signal of the game itself): word goes round: "the stranger's broken word to {a}"; A thinks: "The stranger gave you their word, and it was worth nothing.".
- When promise kept (a signal of the game itself): word goes round: "the stranger keeping their word to {a}".
- When made good (a signal of the game itself): A think better of player; word goes round: "the stranger making good their word to {a}".
- When heard working: goal Visit.
- When strangers stay: A thinks: "Those people are still here, eating our bread.".
- When friction: form group A, B, c; form group the welcoming of the area.
- When plans cross (a signal of the game itself): word goes round: "{a} and {b} are at cross purposes".
- When warning proven (a signal of the game itself): A think better of B; A thinks: "{b} tried to warn you, and {b} was right."; A thinks: "You ran {b} out of the village for telling the truth. You cannot look at the water without thinking of it."; word goes round: "the stranger who was right".
- When shortage: news in the area: "{value} are short in {area}. The merchants have put their prices up and talk of sending far afield."; word goes round: "{value} short in {area}".
- When shortage: news in the area: "There are no {value} to be had in {area}. People make do, and grumble about it."; word goes round: "no {value} in {area}".
- When surplus: news in the area: "{value} are piling up in {area}; you can have them for next to nothing.".
- When price doubled: news in the area: "{a} is asking twice the worth for {value}, and people say so."; the neighbours of A think worse of A.
- When missing trade: arrive the other; post the board near of the place.
- When route closed: news in the area: "Nothing comes along {subject} any more. What it brought will be dear soon.".
- When shortage (lasting): order the other; word goes round: "{a} sent a cart far afield for {value}".
- When shortage (lasting): arrive the other.
- When threat: crowd refugees from the eastern border.
- When project done: leave Aleid Vos; news in Waagdam: "Mayor Aleid Vos has gone to Graafhaven to ask the Count for town rights, now the wall stands."; rank Waagdam; set waagdam_city; word goes round: "the Count said no to Waagdam".
- When threat: the area takes a mood of threat for 14 days.
- When threat: build waagdam_brickworks; news in the area: "Mayor Aleid Vos wants a wall round the town, and first a brickworks by the Vaart: there is no stone in the Holleveen."; build waagdam_wall.
- When craft rank (a signal of the game itself): A think better of player; A thinks: "The stranger is {value} now. There may be work in that, or trouble.".
- When mill turning: a feast at The Market Square; prices at The Market Square times 0.8 for 1 days; The Market Square takes a mood of feast for 1 days; Harmen Molenaar thinks: "The stranger brought what De Zwaan needed to turn again. Say so to anyone who talks of the mill."; word goes round: "the song of the stranger and De Zwaan".
- When danger passed: a mark at The Drowned Goose, Common Room: "A place is kept at the long table for the stranger, with a cup poured and a plate turned down."; a feast at The Drowned Goose, Common Room; word goes round: "Sijbrand's words at the Drowned Goose".
- When pupil learnt (a signal of the game itself): A thinks: "You can do {value} on your own now; the stranger taught you."; word goes round: "{a} learning {value} from the stranger".
- When improvised (old stone) (a signal of the game itself): word goes round: "a dog barking across the water in the night".
- When improvised (The Kabouterberg) (a signal of the game itself): a mark at The Kabouterberg: "The bowl at the mouth of the hollow is empty this morning, and licked clean.".

## 18. The rules in short

Ancestries: Dykelander, Heathborn, Fenfolk, Changeling. Classes: Warden, Poacher, Rascal, Herbalist, Conjurer, Lanternbearer. Backgrounds: peat cutter, eel fisher, bargeman, lantern novice, pedlar, dyke worker, smuggler, herb apprentice, knights youngest, counts soldier, clerk, surveyor.

Conditions: Frightened, Bleeding, Grabbed, Prone, Off-guard, Sickened, Fen Fever, Mired, Wet and cold, Cursed, Catform, Blinded, Slowed.

Death: You wake a day later, cold to the bone, with the taste of earth in your mouth. After the third time, a price: The last sheaf is left where roads cross.

## 19. The look and sound of the world

Pictures: A small illustration in the manner of a 17th-century Dutch etching with a light ink wash, muted greys, browns and greens, fine lines, a low wet land under a wide grey sky.

<!-- picture:palette -->

The map calls its land fen (fen), boggy fen (bog), hummock (hummock), dry ridge (ridge), open water (water), channel (channel), woods (woods), heath (heath), fields (fields), tunnel (tunnel), crowns (crown).

Where an act the rules do not know may be improvised: The Haaksteen (offering), The Kabouterberg (offering), The Old Oak (offering), the old stone (spirit).

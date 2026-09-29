# Brams speelsessies van 29 september 2026, nagekeken

Bronnen en methode. Gelezen (alleen lezen) zijn de gamelog van de app (tabel `gamelog`, spel 3357f810 in The Quiet Reach, branch 1 en 2) en het AI-log (`ai.jsonl`), als momentopname tot 22:38:41. Alle tijden hier zijn Amsterdamse tijd; de logs staan in UTC, twee uur eerder. De sessies zijn gesplitst bij de notities "New game" en "Loaded the save" en bij gaten van meer dan 20 minuten tussen twee regels. Zo ontstaan drie sessies (S1, S2, S3); de twee herstarts van 18:31 en 20:01 gaven alleen een automatische LOOK en geen enkel commando, en tellen niet als sessie. De automatische LOOK na elke herstart (25 keer) telt niet als getypt commando; een gekozen nummer (bijvoorbeeld 1 bij "Talk to whom?") staat in de gamelog als het uitgeschreven commando en telt wel. Een praatregel is een getypte regel die als "PLAYER SAYS" in een voice-call terugkomt. Calls zonder `source`-veld (de app schreef dat pas vanaf ongeveer 20:00) zijn aan Brams spel toegekend op de namen en de kalender van The Quiet Reach in de prompt, of doordat de spelerszin gelijk was aan een regel uit zijn gamelog. In dezelfde tijdvakken liepen 496 andere calls op dezelfde sleutel (vooral een run in de Nethermarch en kaartmetingen, samen $5,54); die zijn weggelaten, net als alle calls met `source: trial`. Afkeuringen en ingrepen van de guard staan in het AI-log als eigen regel met dezelfde tijd als de call; zo zijn ze gekoppeld. Het geëxporteerde transcript stond niet in de logmap en is niet gebruikt. Vijf korte spellen eerder op de dag (vier tussen 09:23 en 09:47, een om 15:27, hooguit 15 commando's) vallen buiten deze analyse; na 22:38 was er in de momentopname niets meer.

## Uitkomst

1. **Commando's voor de eigen tas en voor onderweg lopen vast.** Van de 270 commando's buiten gesprekken deden er 70 (26 procent) niet wat Bram bedoelde, al zei de parser maar 13 keer dat hij het niet begreep. De grootste groep (20) is iets uit de eigen tas gebruiken, lezen of pakken; daarna gaan en volgen (13), waarvan drie keer een keuze uit de eigen FOLLOW-lijst van het spel binnen werd geweigerd. Beide dokters heten in het spel "Dr" (29 regels), maar `talk dr` vindt niemand. Onderdeel: parser, verplaatsen, namen.
2. **De nieuwe guardregel "zegt niets hardop" gooide goede antwoorden weg.** Alle 6 afkeuringen met reden `schema` in S3 waren bruikbare antwoorden van Mara die zonder aanhalingstekens begonnen met "He'll"; de regel leest dat als een handeling. Gevolg: drie vaste regels achter elkaar op precies de vraag die Bram de hele dag stelde (waar is Dr Sorell), en $0,010 aan weggegooide antwoorden. Onderdeel: guard. Hersteld dezelfde avond (4dbd405): alleen de naam of het eigen voornaamwoord van de spreker gevolgd door een werkwoord telt nog als handeling, en "He'll" of "Mara says" zijn woorden.
3. **Woorden in gesprekken die de wereld niet waarmaakt.** Niko schuift zijn notitieboek over tafel, maar in de tas zit daarna geen notitieboek (zes keer INVENTORY, telkens zonder). Ilyan zegt dat hij over tien minuten bij de Peregrine Hangar is, gaat kort daarna naar bed, loopt later twee keer naar het luisterstation en terug, en komt pas na 28,5 speluren in de Hangar; Bram wachtte intussen drie keer op het Common Deck erboven. Onderdeel: gesprek (beloften en voorwerpen), agenda van personages.
4. **Een storing bij de provider gaf zes van de negen vaste regels.** Van 16:14 tot 16:36 faalde elke Anthropic-call op de sleutel met "503 credential validation failed". Bram stelde Tessa vier keer dezelfde vraag en kreeg vier keer dezelfde vaste zin, met de technische reden tussen haakjes; daarna stopte hij elf minuten. Eerder liep een call op 10,0 seconden af (timeout). Onderdeel: modelverbinding, vaste regels.
5. **Kosten en snelheid zijn in orde; de brain is nu de grootste post.** Alles samen kostte $0,35 voor 2 uur 56 minuten ($0,12 per uur), en een praatregel $0,004. 's Avonds kwam 87 procent van de voice-invoer uit de cache (middag 0 procent) en was de voice-mediaan 3,0 seconden met een max van 4,5. De brain (Sonnet 5) maakte 59 procent van de avondkosten: 15 plannen, vooral rond de drie WAITs, en 2 regels voor LISTEN; in 3 plannen werd een doel afgekeurd. Onderdeel: kosten, modellatentie, brain.

## Overzicht per sessie

| | S1 | S2 | S3 | Samen |
|---|---|---|---|---|
| Tijd | 15:38 tot 15:57 | 15:58 tot 17:38 | 21:40 tot 22:38 | |
| Duur (echt) | 18 min | 1 u 39 min | 58 min | 2 u 56 min |
| Waarvan pauzes van meer dan 5 min | 0 | 38 min | 17 min | 55 min |
| Getypte commando's | 17 | 117 | 187 | 321 |
| Waarvan praatregels | 6 | 29 | 16 | 51 |
| Gesprekken geopend | 2 | 7 | 5 | 14 |
| Speltijd verstreken | 5 u 3 min | 31 u 53 min | 39 u 34 min | |
| Herstarts ("Continued") | 0 | 0 | 22 | 22 |
| Mislukte of verkeerd begrepen commando's | 0 van 11 | 20 van 88 | 50 van 171 | 70 van 270 |
| Vaste regels in gesprekken | 0 | 6 | 3 | 9 |
| Kosten | $0,047 | $0,152 | $0,151 | $0,351 |

### Omvang per sessie

S1 is een nieuw spel: Bram zette eerst de wereldinstellingen (FRAMES), liep naar de Commons en sprak Mara Venn (4 regels) en Sana Holt (2 regels). Om 15:58 laadde hij de save van 15:49; wat na 15:49 gebeurde (het gesprek met Sana) bleef alleen in branch 1.

S2 speelt verder op branch 2: gesprekken met Sana (6 regels), Tessa Rook (8) en Niko Serrin (15), de werkbank in de Workshop, en het schip in de Peregrine Hangar. Er zitten vier pauzes van 7 tot 12,5 minuten in, drie daarvan tijdens of direct na de storing van 16:14 tot 16:36.

S3 begint met een herstart om 21:40; het eerste commando kwam om 21:49. Bram sprak Mara (9 regels) en Ilyan Sorell (7), liep over open land naar de Orison Listening Room en de Ridge Shelter, en kocht een lamp. De app herstartte in deze 58 minuten 22 keer (de eerste is het begin van de sessie), soms 11 tot 15 seconden na elkaar; 's middags niet één keer. In hetzelfde uur kwamen 16 commits in de map binnen, 's middags 1. De speltijd van S3 komt voor 28 uur 30 minuten uit drie keer `wait for ilyan`.

## Niet begrepen commando's

Strikt onbegrepen ("You can't ... here") waren 13 commando's: 4 in S2 en 9 in S3. Daarnaast begreep de parser 57 commando's wel, maar deden ze niet wat Bram bedoelde: het voorwerp werd niet gevonden, de weg werd geweigerd, of er kwam iets anders terug. Gewone wedervragen (TALK zonder naam, FOLLOW zonder richting) zijn niet meegeteld. S1 had geen enkele mislukking. Hieronder de 70 gegroepeerd naar wat Bram wilde; getallen tussen haakjes zijn S2 en S3.

**Iets uit de eigen tas gebruiken, lezen of pakken: 20 (5 en 15).** USE, GET, TAKE, READ, HOLD, LOOK en X met de communicator (5 keer), de pocket terminal (8), de credit chip (4), de lamp (2) en "notes in bag" (1), bijvoorbeeld `use communicator`, `read pocket terminal`, `take credit chip`, `use lamp`. Het antwoord was "There is no ... here", bij READ steeds "Read whom?", en bij HOLD een regel over karakterregels. Twee keer kwam er iets heel anders terug: `l scuffed chip` gaf de gang naar het oosten, `x notes in bag` gaf de kast. Na de koop van de lamp om 22:37 lukte `use lamp` ook niet.

**Ergens heen gaan of iemand volgen: 13 (6 en 7).** `go outside`, `go common room`, `go dr`, `follow dr`, `follow niko`, `walk to hangar`, `walk to 5,6`, `walk to 3,7`, `out` op het Common Deck en `s` in de Workshop. Drie keer koos Bram een regel uit de lijst die het spel zelf bij FOLLOW gaf, in de Workshop en in de Ridge Shelter, en kreeg hij te horen dat hij van binnenuit niet over land kon. FOLLOW met een naam geeft paden, geen persoon. Buiten, op het Coastal Service Path, werkte een FOLLOW-keuze wel.

**Iemand aanspreken met een korte naam of titel: 6 (5 en 1).** `talk dr` (2 keer), `talk n`, `t niko`, `t mara`, `tal`. Het spel noemt zowel Ilyan Sorell als Edda Vale "Dr" in 29 regels ("Dr leaves south"), en om 17:37 stond in de keuzelijst twee keer "Dr".

**Iets doen waar het spel geen werkwoord voor heeft: 8 (0 en 8).** `fly`, `sit`, `touch edda`, `poke edda`, `touch peregrine`, `operate scanner`, `read scanner`, `enter code`. De laatste werd als GO gelezen.

**Een detail uit een beschrijving bekijken of pakken: 7 (1 en 6).** `l changes`, `examine torn page`, `l codes`, `get connector`, `look connector`, `x notes`, `get reading lenses`.

**Tikfouten en korte vormen: 10 (2 en 8).** `l perefrine`, `o`, `uo`, `floow`, `q`, `else`, `e stairs`, `e cabinet`, `open cab`, en `l 8` (een nummer uit de lijst bij LOOK, met het werkwoord ervoor).

**LOOK met een letter, beantwoord met iets uit de tas: 6 (1 en 5).** `l e` (2 keer), `l n`, `l s`, `l in` en `look a` gaven een rantsoen, de credit chip of de pocket terminal in plaats van de uitgang. `l east`, `l north` en `l south` werkten direct daarna.

Verder viel in de uitvoer een ruwe id op: na het leren aan de werkbank (17:08) meldde het spel een rang met `npc_tessa_rook` erin.

## Vaste regels en ingrepen van de guard

| | S1 | S2 | S3 | Samen |
|---|---|---|---|---|
| Praatregels | 6 | 29 | 16 | 51 |
| In een keer door het model beantwoord | 6 | 23 | 12 | 41 |
| Na een tweede poging beantwoord | 0 | 0 | 1 | 1 |
| Vaste regel: timeout | 0 | 1 | 0 | 1 |
| Vaste regel: netwerk (503) | 0 | 5 | 0 | 5 |
| Vaste regel: antwoorden afgekeurd | 0 | 0 | 3 | 3 |

Afgekeurd (`rejected`), alleen in S3: `schema` 6 keer (voice), `leak` 1 keer (voice, tweede poging goed), `goal` 3 keer (brain: een doel in een plan afgekeurd, de rest van het plan bleef staan). Geen `invented`, `promise`, `character`, `anachronism` of `limits` in Brams spel. Ingrepen (`fixed`): alleen `number`, 6 keer (4 in S2, 2 in S3); dat zijn notities, geen correcties, want de getallen (seventeen, thirty, ten twee keer, eight, five) bleven in de tekst staan. Geen `oath` of `not_here`.

Mislukte calls: in S2 5 keer `network` (503 credential validation failed) en 1 keer `timeout`; in S1 en S3 geen. Geen fouten van het soort budget of config.

De 6 afkeuringen `schema` horen bij drie praatregels aan Mara om 21:59 en 22:00, elk met twee pogingen. Alle zes antwoorden waren geldige JSON met een bruikbaar antwoord op de vraag, en begonnen met "He'll" zonder aanhalingstekens; de controle op "zegt niets hardop" (toegevoegd om 19:50, dus nieuw in de app van de avond) ziet een zin die met he, she of they begint als een handeling. Bram opende daarna een nieuw gesprek met Mara, stelde de vraag een vierde keer en kreeg om 22:00 wel antwoord.

De vijf netwerkfouten vielen in één storing van 16:14 tot 16:36, die ook alle calls van de run ernaast trof; plaatjes (OpenAI) werkten in die tijd wel. Vier ervan waren dezelfde vraag aan Tessa over haar vrije tijd, binnen acht minuten, elk beantwoord met dezelfde vaste zin. De timeout (16:10) was de eerste regel aan Tessa.

## Te late antwoorden en latentie

Een voice-call boven de 10.000 ms kwam één keer voor: de timeout van 16:10 (10.006 ms), die een vaste regel werd.

| Rol | Sessie | Calls | Mediaan | 90e percentiel | Max |
|---|---|---|---|---|---|
| voice | S1 | 6 | 6,4 s | 6,9 s | 7,2 s |
| voice | S2 | 29 (23 beantwoord) | 3,4 s | 7,1 s | 10,0 s |
| voice | S3 | 20 | 3,0 s | 3,7 s | 4,5 s |
| voice | samen | 55 | 3,3 s | 6,7 s | 10,0 s |
| brain | S3 | 17 | 4,3 s | 5,6 s | 6,9 s |
| chronicler | S3 | 1 | 2,6 s | | 2,6 s |
| plaatjes | S1, S2 | 10 | 8,7 s | | 11,4 s |

's Middags was elke praatregel een losse prompt van ruim 4.000 tokens zonder cache; 's avonds liep een gesprek als draad met cache, en was ook de langste voice-call korter dan de mediaan van S1. In de middag waren er geen brain- of chronicler-calls voor Brams spel. De plaatjes liepen op de achtergrond en hielden niets op.

## Wachttijd zoals Bram die merkte

Gemeten van een getypte regel tot de eerstvolgende regel van het spel in de gamelog.

| | S1 | S2 | S3 |
|---|---|---|---|
| Praatregels: mediaan | 6,4 s | 3,3 s | 3,1 s |
| Praatregels: 90e percentiel | 7,0 s | 7,3 s | 6,8 s |
| Praatregels: langste | 7,2 s | 10,0 s | 7,7 s |
| Andere commando's: mediaan | 0,0 s | 0,0 s | 0,0 s |
| Andere commando's: langste | 0,0 s | 0,0 s | 2,6 s |

De langste wachttijden: 10,0 s bij "Afternoon!" (Tessa, timeout en daarna een vaste regel), 9,3 s bij "Eh," (Tessa), 7,7 s bij "Where" (Mara, twee afgekeurde pogingen en daarna een vaste regel), 7,6 s bij "Yes," (Niko), 7,2 s bij "Specialist?" (Sana) en bij "Wait" (Niko). Buiten gesprekken wachtte Bram alleen merkbaar bij `walk` (2,6 s, een reistekst van de chronicler) en twee keer bij `listen` (2,2 en 1,9 s, een brain-call). Ook `wait for ilyan`, dat telkens tien speluren oversloeg, en het leren aan de werkbank (drie speluren) kwamen direct terug.

## Kosten

| | S1 | S2 | S3 | Samen |
|---|---|---|---|---|
| voice (Haiku 4.5) | $0,032 (6) | $0,117 (29) | $0,059 (20) | $0,209 |
| brain (Sonnet 5) | | | $0,089 (17) | $0,089 |
| chronicler (Haiku 4.5) | | | $0,002 (1) | $0,002 |
| plaatjes (gpt-image-1-mini) | $0,015 (3) | $0,035 (7) | | $0,050 |
| lijntest (advisor) | | | $0,0004 (1) | $0,0005 |
| Totaal | $0,047 | $0,152 | $0,151 | $0,351 |
| Per uur sessietijd | $0,16 | $0,09 | $0,15 | $0,12 |
| Per praatregel (voice / praatregels) | $0,0054 | $0,0040 | $0,0037 | $0,0041 |
| Voice-invoer uit de cache | 0 % | 0 % | 87 % | 47 % |

Tussen haakjes staat het aantal calls. Per model: Haiku 4.5 $0,212, Sonnet 5 $0,089, gpt-image-1-mini $0,050, gpt-5-mini $0,0001 (een lijntest om 20:06, tussen de sessies). Per sessietijd zonder de pauzes van meer dan vijf minuten wordt het $0,15 per uur in S2 en $0,22 in S3.

In S3 is de voice-call groter (7.500 tokens invoer tegen 4.400 's middags) maar goedkoper per regel, omdat 87 procent uit de cache komt; bij de brain was dat 70 procent. Weggegooid werd in S3 $0,011 aan zeven afgekeurde voice-antwoorden ($0,010 daarvan door de zes afkeuringen `schema`). De brain-calls kwamen in groepjes: 7 rond de drie WAITs (22:26 en 22:27), 8 om 22:35 en 22:37, en 2 voor LISTEN.

## Wat goed ging

**S1.** Alle 6 praatregels in een keer door het model beantwoord, bij Mara en Sana, zonder één ingreep van de guard. De instellingen van de wereld (FRAMES, vijf keer) werkten direct.

**S2.** Buiten de storing en de ene timeout werden alle 23 praatregels in een keer door het model beantwoord; het gesprek met Niko over het signaal telde 15 regels zonder vaste regel of afkeuring. De werkbank werkte zoals bedoeld: bekijken lukte na twee mislukkingen, leren na een mislukking, en de derde keer gaf een rang. Bram bezocht 7 plekken, waarvan 5 nieuw (Guest Quarters, Medical Bay, Workshop, Peregrine Hangar en het Common Deck van de Peregrine).

**S3.** 12 van de 16 praatregels in een keer, 1 na een tweede poging, en geen voice-call boven de 4,6 seconden. Zeven herstarts vielen midden in een gesprek, en telkens liep het gesprek daarna gewoon door. De tocht over open land naar Orison Ridge lukte met zes keer `walk to` (inclusief verdwalen in de mist), met drie nieuwe plekken (Coastal Service Path, Orison Listening Room, Ridge Shelter) en vijf vakken open land. WAKE, TRACK, LIST, BUY, READ bij consoles en logboeken, USE bij de radio en de terminal, MAP en HELP deden wat ze moesten; LISTEN vond om 22:38 een gesprek tussen Ilyan en Niko. De lamp kostte bij Tessa 35 cr, hetzelfde bedrag dat Ilyan noemde.

Een quest staat in geen van de sessies in de gamelog; het verhaal liep alleen via gesprekken (Niko over het signaal, Mara over waar Dr Sorell is, Ilyan met de vraag om naar het luisterstation te gaan).

## Onzeker of niet in de logs

- De toekenning van calls zonder `source`: voice-calls zijn op de spelerszin gekoppeld (alle 51 praatregels hebben een call); de 10 plaatjes ($0,050) zijn aan Bram toegekend omdat ze sciencefiction zijn en mensen en plekken van Port Vesper tonen, maar dat staat nergens met zoveel woorden. Lijntests met Opus om de vijf minuten (16:24 tot 16:47) en de kaartmetingen van 16:23 tot 17:09 zijn als niet-spel weggelaten.
- De oorzaak van de 22 herstarts in S3 staat niet in de logs. Ze vallen samen met 16 commits in de map in dat uur, wat op herladen door codewijzigingen wijst, maar een crash of eigen herstart is niet uit te sluiten.
- Waarom er 's middags geen enkele brain-call was, terwijl er 37 speluren verstreken, is uit de logs niet te zeggen: uitgezet, niet nodig of niet gelogd.
- Of een quest begon, kan de gamelog niet laten zien: het dagboek wordt er niet in bijgehouden. De map van The Quiet Reach heeft geen questbestand.
- De tijd in de gamelog is het moment van loggen; de echte wachttijd van Bram kan iets langer zijn dan de gemeten tijd.
- Bram speelde misschien na 22:38 nog door; dat deel valt buiten deze momentopname.

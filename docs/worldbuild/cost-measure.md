# De wereldbouw goedkoper, en elke soort aanroep echt beproefd

Verslag van 29 september 2026 (M10.20). Bram's twaalf hoofdstukken van The Quiet Reach zijn opnieuw gebouwd (zijn eigen tekst staat niet in de repo; elk hoofdstuk staat in de fixture van zijn stap in `tests/fixtures/worldbuild/quiet-reach/`, in het veld `said`), nu met `npm run trial -- --kind world_step`: de app speelt het document stap voor stap zoals de editor, met Bram's sleutel en modellen, in een wereld die alleen in het geheugen bestaat en binnen een eigen bouwbudget. Een voorstel dat niet laadt krijgt de herstelronde, zoals de knop in de editor. Elk antwoord is opgenomen als fixture in `tests/fixtures/worldbuild/quiet-reach/`, en `tests/m1020fixtures.test.ts` speelt de hele bouw daarmee na.

## Uitkomst

De eerste bouw in de app kostte $10,09. De laatste meting kostte $2,84 voor alle twaalf stappen: de run van $2,77, met de stap Economie opnieuw ($0,44 in plaats van $0,37 die niet laadde). Alle twaalf laden. Drie stappen hadden één herstelronde nodig. Economie is één keer opnieuw gevraagd, nadat de melding waarop de herstelronde vastliep duidelijker was gemaakt (zie hieronder). De wereld laadt, start en speelt.

| Stap | Model | Denken | Aanroepen | In (uit cache) | Uit | Kosten | Laadt | Namen terug |
|---|---|---|---|---|---|---|---|---|
| Kader | Opus 5.5 | medium | 1 | 21.282 (0) | 3.847 | $0,236 | ja | 19/21 |
| Stem | Sonnet 5 | low | 1 | 23.275 (0) | 2.087 | $0,105 | ja | 22/50 |
| Kalender | Sonnet 5 | low | 1 | 23.323 (18.926) | 1.470 | $0,027 | ja | 37/55 |
| Geld | Sonnet 5 | low | 1 | 22.675 (18.926) | 1.747 | $0,029 | ja | 15/26 |
| Geloven | Opus 5.5 | medium | 1 | 25.700 (0) | 7.063 | $0,320 | ja | 28/31 |
| Plekken | Opus 5.5 | medium | 1 | 29.710 (18.926) | 26.465 | $0,576 | ja | 53/60 |
| Beroepen | Opus 5.5 | low | 1 | 26.373 (18.926) | 5.777 | $0,149 | ja | 36/65 |
| Mensen | Opus 5.5 | medium | 2 | 66.838 (37.852) | 19.435 | $0,512 | na één ronde | 72/83 |
| Economie | Opus 5.5 | low | 2 | 83.587 (37.852) | 12.517 | $0,441 | na één ronde | 30/47 |
| Vervoer | Sonnet 5 | low | 2 | 70.957 (37.852) | 4.891 | $0,123 | na één ronde | 46/62 |
| Signalen | Opus 5.5 | medium | 1 | 32.172 (18.926) | 8.917 | $0,235 | ja | 18/36 |
| Palet | Opus 5.5 | low | 1 | 25.888 (18.926) | 2.902 | $0,090 | ja | 26/42 |

"Namen terug" is een ruwe maat voor trouw aan de tekst: van de namen en getallen in het hoofdstuk, hoeveel het voorstel gebruikt. Hij is voor alle modellen hetzelfde, dus twee runs zijn te vergelijken.

## De maatregelen, in de volgorde van de roadmap

1. **Het systeemdeel in twee blokken.** Vooraan staat wat gelijk blijft: de gids, het contract zonder de tellingen, de verplichte velden van elke soort, `CHRONICLER.md` en de antwoordvorm. Dat deel is ongeveer 19.000 tokens en krijgt een cachemarkering van een uur, omdat een ontwerper minuten leest tussen twee stappen. Daarna komt wat per stap verandert: de stap, de exacte velden en het ontwerplogboek. De tellingen staan in de prompt ("THIS WORLD HAS NOW: ..."). Gemeten: elke stap leest het vaste deel uit de cache. Opus schrijft het twee keer per bouw (voor en na het kader, dat `CHRONICLER.md` schrijft) en Sonnet één keer. Het logboek was al ingekort tot besluiten en notities.
2. **Per stap alleen wat hij nodig heeft.** Van `world.yaml` gaan mee: de naam, de start, het kader, de sleutels die de stap vult en de sleutels die de gids voor de stap noemt (`STEP_CALLS` in `worldguide.ts`). Kaart en afbeeldingen gaan niet mee, en een regel zegt wat er weggelaten is. De lijst van wat er is, is per stap beperkt tot de soorten die de stap nodig heeft. Mensen, Economie, Vervoer en Signalen zien alles, omdat zij naar alles kunnen verwijzen.
3. **`maxTokens` per stap.** Kader 4.000, Plekken en Mensen 16.000, de rest 8.000, plus zes tokens per token van het hoofdstuk (een antwoord groeit met wat de ontwerper schreef), hooguit 48.000. De reservering vooraf daalt daarmee van bijna een dollar naar $0,20 tot $0,60.
4. **Inspanning per stap.** Low voor Stem, Kalender, Geld, Beroepen, Economie, Vervoer en Palet. Medium voor Kader, Geloven, Plekken, Mensen en Signalen. Plekken schrijft op medium nog steeds 26.000 tokens en is daarmee de duurste stap. Low is daar de volgende knop, maar niet gemeten; het is een verhaalstap.
5. **Een model per stapsoort.** De tabelstappen zijn met beide modellen gemeten (zie hieronder). Kalender, Geld, Vervoer en Stem gaan naar het model dat de speler voor het brein koos (bij Bram Sonnet 5, de helft van Opus), omdat ze daar even goed laden en even trouw zijn. Palet blijft bij de kroniekverteller: op Sonnet faalde het twee keer (kleuren in de verkeerde vorm, tekens over meer dan 100% van een land), op Opus laadde het in één keer. Haiku is niet geprobeerd: het doel was al gehaald.

### De tabelstappen op beide modellen

| Stap | Sonnet 5, low | Opus 5.5, low |
|---|---|---|
| Stem | $0,128, laadde niet (hoofdsleutel `voice:` ontbrak); na de reparatie hieronder $0,105 in één keer | $0,215 (met een cacheschrijfbeurt van $0,15), laadt, 25/50 |
| Kalender | $0,027, laadt, 35/55 | $0,059, laadt, 37/55 |
| Geld | $0,026, laadt, 16/26 | $0,062, laadt, 14/26 |
| Vervoer | $0,061, laadt, 44/62 | $0,146, laadt, 48/62 |
| Palet | $0,083, laadt niet, ook niet na de herstelronde | $0,094, laadt, 26/42 |

## Wat de echte voorstellen aan het licht brachten

- **Een stemkit zonder hoofdsleutel.** Sonnet schreef de velden van `data/voice.yaml` aan de wortel. De herstelronde deed hetzelfde. De bouwer zet de sleutel `voice:` (en `journey:` voor het reisbestand) er nu zelf boven als alle velden van die soort zijn (`rootedFile`), en de antwoordvorm noemt de sleutel.
- **Een pas zonder waarde.** Plekken stelde een pas voor de hangar voor, als item zonder het verplichte `value`, omdat een stap alleen de velden ziet van wat hij vult. Het vaste deel noemt nu voor elke soort de velden die er altijd moeten zijn (`requiredFields`).
- **Een herstelronde die een aanvulling heel maakte.** Palet vulde een streek aan met `merge: true`. De herstelronde stuurde de streek terug zonder `merge`, met alleen die velden, zodat de plekken en de legenda verdwenen. Een correctie op een aanvulling blijft nu een aanvulling, en de instructie zegt het.
- **Een melding die het model niet begreep.** "a poor outcome needs the item it makes" noemt nu het veld (`failure.critical is poor, so failure.item must name the poorer item it makes`).
- **YAML met een dubbele punt in een tekst.** De gids zegt al dat zo'n tekst tussen aanhalingstekens moet. Het gebeurde toch twee keer bij Economie, en de herstelronde loste het op.

## Elke soort aanroep echt beproefd

`npm run trial -- --kind <soort>` speelt voor elke soort een vaste situatie (`src/engine/trials.ts`, dezelfde die `tests/m1020coverage.test.ts` met het mockmodel speelt), stuurt hem naar het model dat de speler voor die rol koos, en leest het antwoord zoals het spel het leest. De antwoorden staan in `tests/fixtures/model/<soort>/`, en de test leest ze met de huidige code opnieuw. De tabel staat in `docs/COVERAGE.md` (`npm run coverage`). Alle 21 soorten zijn beproefd; samen kostte dat ongeveer $1,40.

Vier soorten gingen mis met een echt model, en geen mocktest had dat kunnen zien:

- **De nachtelijke ronde** (`chronicle`): Anthropic weigerde het schema als te groot ("The compiled grammar is too large"). Met Anthropic draaide de ronde van de kroniekverteller dus nooit; Bram's AI-log laat dezelfde weigering zien.
- **Het palet in de editor** (`palette_draft`): Anthropic neemt geen map van namen (`additionalProperties` met een schema).
- **De doelen van het brein** (`npc_goals`): in Bram's eigen spel weigerde Anthropic een keer `maxItems`.
- **De stemkit in de editor** (`voice_draft`): het model schreef tijdsaanduidingen als objecten, omdat het verzoek de velden niet noemde.

De providers brengen het schema nu terug tot wat ze aankunnen. Voor Anthropic vallen getal-, lengte- en lijstgrenzen weg en wordt elk object gesloten. OpenAI vraagt strikt alleen als elk veld verplicht is; `builder_draft`, `world_step` en `district` werden daar tot nu toe geweigerd. Kan een schema niet als grammatica, of weigert de provider het toch, dan gaat de vraag één keer zonder grammatica, met het schema als tekst. Dat geldt daarna voor die soort zolang de app draait. De lezers van het spel controleren het antwoord zoals altijd. Het verzoek voor de stemkit noemt nu de exacte velden. Daarna namen alle vier het antwoord aan.

## Wat de metingen kostten

Eerste run $2,72, vergelijking van de tabelstappen $0,58, laatste run $2,77, Economie opnieuw $0,44, de soorten samen ongeveer $1,40: ongeveer $7,90.

## De kaart goedkoper (M10.26, 29 september 2026)

Bram vroeg na de kaart van The Quiet Reach of die net zo goed met een goedkoper model kan: op Opus kostte de eerste poging $0,27 en stond fout, de tweede $0,12. Toen schilderde de hele stap Palet de kaart en stuurde het hele palet uit `world.yaml` terug, met tekens en stijlen. Daarop faalde Sonnet in M10.20 twee keer.

Nu is de stap gesplitst. Wat code kan, doet code: de plekken neerleggen uit hun uitgangen en minuten (`mapDraft`, gratis), en de streek en het palet schrijven. Het model vult alleen een tabel (`map_paint`, `src/engine/map/paint.ts`):

- per land een teken, een naam, twee kleuren, hoe het loopt en één regel;
- de tekening als rijen tekens;
- een regel per pad en per rand.

Het vaste deel is de instructie, de wereld, de woorden van de ontwerper en per plek de rij en kolom in de tekening. Het staat met een cachemarkering vooraan. Een tweede poging stuurt dezelfde tabel mee met wat er fout stond ([Paint it again with this]).

Gemeten met `npm run trial -- --kind map_measure`: The Quiet Reach met Brams hoofdstuk Palet, en Skerrow met een korte beschrijving van het eiland, beide zonder hun kaart. Elk model twee keer, en op The Quiet Reach één tweede poging met "de Orison Ridge ligt op het hoge gesteente".

| Model | The Quiet Reach | Skerrow | Kosten per kaart | Tweede poging |
|---|---|---|---|---|
| Sonnet 5, low | laadt 2 van 2 | laadt 2 van 2, eiland met zee rondom | $0,030, uit de cache $0,013 | $0,016, laadt, ridge op hoog gesteente |
| Haiku 4.5, low | 1 van 2 | 0 van 2 (rijen van 19 en 32 tekens waar 16 moeten) | $0,007 tot $0,012 | $0,014, geen cache (het vaste deel is korter dan de 2.048 tokens die Haiku vraagt) |

Keuze: de kaart gaat naar het lichtere model dat de speler koos (`tier: light`, bij Bram Sonnet 5). Dat kost een tiende van de stap Palet op Opus, en een tweede poging kost ongeveer de helft van de eerste. Haiku is afgevallen: het telt de tekens niet en maakt van plaatsnamen landen.

De eerste antwoorden brachten drie dingen aan het licht, en de lezer doet nu wat de kaart zelf al deed:

- Sonnet schreef de namen van plekken in de tekening. Een teken dat geen land is, neemt het land ernaast, zoals de kaartlezer altijd deed. De instructie verbiedt het nu, en de toelichting bij het voorstel noemt het.
- Beide modellen tellen een teken of twee per rij mis. Een tekening die hoogstens twee rijen of tekens afwijkt, maakt de code op maat, met het land aan het eind van de rij. Meer is een fout voor de herstelronde.
- Sonnet noemde de landen "On the black basalt". De code maakt er de kale naam van, en de instructie geeft nu dat voorbeeld.

Een tweede ronde met Sonnet 5 na die drie verbeteringen laadde vijf van vijf: twee kaarten van elke wereld en de tweede poging. De namen waren kaal, er stond geen naam in een tekening en niets hoefde op maat. Een kaart kostte $0,030 tot $0,031, uit de cache $0,014 tot $0,018, en de tweede poging $0,016. Die ronde kostte $0,108. De antwoorden hebben `-r2` in hun naam.

De opgenomen antwoorden staan in `tests/fixtures/model/map_paint/` (Skerrow) en `tests/fixtures/worldbuild/quiet-reach-map/`. `tests/m1026map.test.ts` leest die met de lezer van nu, die milder is dan bij het opnemen. Het oordeel van toen staat erbij als `recordedProblems`. Brams hoofdstuk noemt geen windrichting voor de zee. Oost en west zijn dus allebei trouw aan de tekst, en de overeenkomst met de aangenomen kaart (ongeveer 40%) zegt daarom weinig over fouten. De eerste meting kostte $0,157 en de tweede $0,108.

## Inspanning per soort en lichtere modellen (M10.27, 29 september 2026)

Tot M10.27 zetten alleen `region_story`, `map_paint` en de wereldstappen een inspanning. Elke andere aanroep op Opus 5.5 draaide op de standaard van het model, medium, en het denken telt als uitvoer. Nu heeft elke soort in de tabel van soorten (`MODEL_KINDS` in `src/engine/modelkinds.ts`) een eigen inspanning, en de gateway neemt die als het verzoek er zelf geen noemt. Twee soorten gaan naar een lichter model: de reistekst naar het model van de gesprekken, en de grote lijnen zijn geprobeerd op het brein.

Gemeten met `npm run trial -- --kind <soorten> --times 2 --record --cap 1` op Brams sleutel: elke soort twee keer in zijn vaste situatie, gelezen zoals het spel leest. Voor is het opgenomen antwoord van M10.20 (medium), na zijn de twee nieuwe (`-r2` en `-r3` in `tests/fixtures/model/<soort>/`, met `effort` in het bestand).

| Soort | Model | Voor | Na, twee keer | Uit, voor en na | Laadt |
|---|---|---|---|---|---|
| `palette_draft` | Opus 5.5, low | $0,140 | $0,105 en $0,109 | 3.633, 1.847 en 2.057 | 2 van 2 |
| `voice_draft` | Opus 5.5, low | $0,099 | $0,084 en $0,087 | 2.122, 1.329 en 1.474 | 2 van 2 |
| `outline` | Opus 5.5, low | $0,063 | $0,060 en $0,060 | 1.512, 1.385 en 1.380 | 2 van 2 |
| `district` | Opus 5.5, low | $0,074 | $0,044 en $0,047 | 3.071, 1.518 en 1.671 | 2 van 2 |
| `expansion` | Opus 5.5, low | $0,055 | $0,042 en $0,043 | 1.249, 607 en 658 | 2 van 2 |
| `land` | Opus 5.5, low | $0,052 | $0,044 en $0,043 | 1.267, 900 en 853 | 2 van 2 |
| `weave` | Opus 5.5, low | $0,023 | $0,022 en $0,024 | 668, 622 en 715 | 2 van 2 |
| `far_place` | Opus 5.5, low | $0,024 | $0,023 en $0,024 | 820, 736 en 822 | 2 van 2 |
| `legends` | Opus 5.5, low | $0,014 | $0,014 en $0,014 | 439, 434 en 428 | 2 van 2 |
| `tides` | Opus 5.5, low | $0,010 | $0,011 en $0,011 | 254, 267 en 286 | 2 van 2 |
| `journey` | Haiku 4.5 (was Opus) | $0,0053 | $0,0010 en $0,0010 | 67, 43 en 47 | 2 van 2 |
| `tides` op het brein | Sonnet 5, low | $0,0099 | $0,0040 en $0,0039 | 254, 148 en 134 | 2 van 2, niet genomen |

Alles laadt twee keer op rij, dus geen soort blijft op medium. Trouw is per antwoord nagelezen tegen het antwoord op medium. Een wijk op low heeft vijf of zes plekken en mensen en twee zetels, zoals op medium. Een omtrek heeft vier gebieden, zeven plekken en vier of vijf mensen, een land dezelfde velden en stemregels, en een weving drie banden en een of twee geheimen. Het palet heeft dezelfde vier velden. Waar het denken het meeste woog, daalt de prijs het meest: de wijk met 39%, het palet met 24% en de uitbreiding met 22%. Bij de weving, de legende, de verre plek en de grote lijnen dacht Opus op medium al nauwelijks, en daar blijft de prijs gelijk.

**De reistekst op Haiku.** De motor keurt elk woord van een reistekst: een plek of een uur dat niet klopt, blijft liggen en de tekst van de motor komt ervoor in de plaats. Haiku schreef twee keer twee zinnen met het dijkpad, de wind over het water, het riet en de sluis rond de middag, zoals Opus dat deed. Het kost een vijfde, en met vier tot acht reizen per uur scheelt dat $0,017 tot $0,034 per uur. De speeltest `faraway` speelt met het mockmodel en blijft groen.

**De grote lijnen blijven bij de kroniekverteller.** In de situatie staan twee grote lijnen allebei op druk 95, voorbij de grens waarop ze mogen breken, en nog kalm. Sonnet koos twee keer voor beide lijnen "event": de vloed en het veenoproer in dezelfde maand. Opus liet de vloed twee keer eerst dreigen ("de dijken zijn stil geweest, dus eerst kwel en gezwollen sloten") en liet het oproer breken, met de plannen van de graaf en het vermiste meisje als reden. Opus deed dat op medium en op low. De opdracht zegt dat een wereld waarin elke maand iets groots gebeurt een armere wereld is, en dat volgt Sonnet niet. De besparing zou ongeveer $0,006 per spelmaand zijn, dus de grote lijnen blijven bij de kroniekverteller, op low. De antwoorden van Sonnet staan erbij als meting.

**De reservering vooraf.** Een model dat altijd denkt (Opus 5.5, Fable en Mythos) krijgt van de gateway 4.000 denktokens bovenop `maxTokens`, en het schema van de uitvoer telt als invoer. `upperBoundUsd` rekent beide nu mee (`mostOut` en `sent` in `src/node/ai/pricing.ts`), zodat het uurbudget niet stilletjes overschreden wordt.

De meting kostte $0,897 voor elf soorten twee keer, en $0,021 voor de grote lijnen op Opus low: samen $0,918, binnen de dollar die Bram gaf.

## Een uur spelen voor en na M10.27 (29 september 2026)

Met Brams modellen: Haiku 4.5 voor de stem, Sonnet 5 voor het brein en Opus 5.5 voor de kroniekverteller. Voor is de doorlichting van `docs/worldbuild/cost-audit.md` met de opgenomen antwoorden van toen. Na zijn de antwoorden die in M10.27 op Brams sleutel zijn opgenomen. Een soort die niet elk uur komt (een wijk, een omtrek, de wereldbouw) staat per aanroep in de tabel hierboven.

| Soort | Model | Aanroepen per uur | In, waarvan uit de cache | Uit | Per aanroep | Per uur |
|---|---|---|---|---|---|---|
| `npc_reply` | Haiku 4.5 | 40 en 40 | 3.481 en ongeveer 3.150, niets (onder het minimum) | 244 | $0,0047 en $0,0043 | $0,188 en $0,171 |
| `npc_goals` | Sonnet 5 | 63 en 31 | 2.850, voor elke aanroep 2.850 geschreven, na 1.072 gelezen bij drie van de vier | 264 | $0,0093 en $0,0070 | $0,588 en $0,218 |
| `chronicle` | Opus 5.5, medium en low | 1,5 en hooguit 1,5 | 12.032 en 10.082, voor elk systeemdeel geschreven, na niets | 2.243 en 1.448 tot 1.706 | $0,101 en $0,072 | $0,151 en $0,108 |
| `journey` | Opus 5.5 en Haiku 4.5 | 6 en 6 | 1.001 en 751, niets | 67 en 47 | $0,0053 en $0,0010 | $0,032 en $0,006 |
| `lore_check` | Sonnet 5 | 1,5 | 727, niets | 40 | $0,0019 | $0,003 |
| `improvise` | Haiku 4.5 | 2 | 1.338, niets | 121 | $0,0019 | $0,004 |
| `party_reply` en `chat_line` | Haiku 4.5 en Sonnet 5 | 1 en 1 | - | - | - | $0,004 |
| `spark` (nieuw) | Sonnet 5 | hooguit één per stille nacht | 1.893, niets | 73 tot 76 | $0,0045 | minder dan $0,005 |
| **Een uur** | | | | | | **$0,97 en ongeveer $0,51** |

Wat het deed, van groot naar klein:

- **Minder doelkeuzes** ($0,37 per uur). Alleen mensen dicht bij de speler, in zijn gebied, in een open verhaallijn of in een plan vragen het model. Gemeten in drie speldagen met het mockmodel: 139 keuzes, nu 69. Het gedeelde deel van een keuze leest nu uit de cache, waar elke aanroep het vroeger opnieuw schreef.
- **De nachtronde** ($0,04 per uur). Ze leest een kortere gids en neemt het plandeel alleen mee als er iets te plannen valt. Een nacht zonder nieuws doet geen hele ronde meer, maar klimt de ladder naar een vonk. Op low is ze even vol als op medium: zes keer dezelfde opbouw (lore, een lijn, een of twee quests, twee gedachten, twee nieuwsregels, een plan), gemeten met `npm run trial -- --kind chronicle --effort low --times 3` en hetzelfde op medium. De meting in het uur rekent met 1,5 rondes. Een stille nacht die geen vonk krijgt, kost niets.
- **De reistekst op Haiku** ($0,03 per uur).
- **De gespreksregel** ($0,02 per uur). Regels en schema samen zijn 20% korter, van 5.016 naar 4.012 tekens. Gemeten met `npm run trial -- --kind voice_set`: drie reeksen van acht antwoorden met de nieuwe regels en drie met de oude, op Haiku. Bruikbaar waren 23 van 24 bij beide, de bewaker greep één keer per reeks in, en de karakterscore was 0,968 tegen 0,987. De twee afwijzingen gingen over namen en kennis. Die twee regels zijn weer expliciet gemaakt, en daarna kwam een reeks acht van acht uit, met karakterscore 1,000. Per regel scheelt het ongeveer 9% invoer.

Het doel van $0,44 is niet gehaald: $0,51. Wat overblijft is vooral het gesprek ($0,17) en de doelkeuzes ($0,22). Het gesprek komt in M10.28: een gecachet blok per gebied, het gesprek als berichten en regels in plaats van het model voor kleine antwoorden. Het doel daar is $0,0015 per regel, en dat brengt het uur onder de $0,40.

De richtprijs onder Instellingen > AI toont nu "an hour as it was measured", op de modellen waar elke soort echt heen gaat. Bij Brams modellen is dat $0,58. Dat is iets hoger dan de tabel, want die regel rekent niet met de cache en leest voor het gesprek nog het antwoord van voor de kortere regels. Daaronder staat wat het vorige uur echt kostte op de sleutel.

De metingen kostten samen $1,70: de inspanning per soort $0,918, de nachtronde $0,49, de gesprekken $0,28 en de vonk $0,01.

## Het uur bij elke stand van de klok (M10.28, 29 september 2026)

Sinds M10.28 is de snelheid van de klok een knop, `clock.seconds_per_minute`: het aantal echte seconden dat een spelminuut duurt, van 1 tot 8.

- **1 seconde:** een dag duurt 24 minuten, zoals voorheen.
- **4 seconden:** een dag duurt anderhalf uur. Dit is de standaard.
- **8 seconden:** een dag duurt ruim drie uur.

De wereld geeft haar eigen waarde bij de stap Kalender. The Quiet Reach neemt 4, Skerrow 5. De speler draait hem per spel bij op het kaderscherm.

Wat per speldag komt, loopt mee met de klok: de doelkeuzes, de nachtronde en haar tweede blik. Wat de speler zelf doet, loopt niet mee: praten, reizen en een daad die de regels niet kennen.

Het gedeelde deel van de doelkeuzes staat sinds M10.28 een uur in de cache. Bij 4 komt een keuze ongeveer elke zeven minuten, en de cache van vijf minuten was dan steeds verlopen. Met een uur is er één schrijfbeurt per uur (twee keer de invoerprijs) en wordt de rest gelezen. Dat is bij elke stand goedkoper.

| Soort | 1 seconde | 4 seconden | 8 seconden |
|---|---|---|---|
| `npc_reply` (40 per uur, $0,0022 per regel met het blok per gebied) | $0,088 | $0,088 | $0,088 |
| `npc_goals` | 31 per uur, $0,203 | 8 per uur, $0,055 | 4 per uur, $0,030 |
| `chronicle` en `lore_check` | 1,5 per uur, $0,111 | 0,38 per uur, $0,028 | 0,19 per uur, $0,014 |
| De rest (reizen, improviseren, groepen, flarden) | $0,014 | $0,014 | $0,014 |
| **Een uur** | **ongeveer $0,42** | **ongeveer $0,19** | **ongeveer $0,15** |

Het gesprek in deze tabel is dat van na M10.28: het blok per gebied en het gesprek als berichten, gemeten op Haiku 4.5 op $0,0022 per regel (zie hieronder). De eerste regel in een groep gebieden schrijft het blok, dat daarna een uur in de cache blijft; dat is ongeveer $0,018 per groep per uur. In M10.27 kostte een regel nog $0,0043. Het doel van M10.27, $0,44 per uur, is hiermee bij elke stand gehaald.

De richtprijs in de app rekent sinds M10.28 ook wat een aanroep uit de cache leest. Onder Instellingen > AI noemt hij bij Brams modellen ongeveer $0,20 bij 4 seconden, $0,48 bij 1 en $0,15 bij 8. Op het kaderscherm staat onder de schuif wat een uur bij de gekozen stand ongeveer kost.

## Het gesprek per gebied, als berichten, een uur in de cache (M10.28, 29 september 2026)

Gemeten op Brams sleutel met Haiku 4.5 (`npm run trial -- --kind talk_twenty|voice_set|keep_warm --model claude-haiku-4-5-20251001`). De drie metingen kostten samen $0,34, binnen de grens van $0,50 die Bram gaf.

**Voor.** In Brams eigen log lazen 383 gesprekszinnen op Haiku niets uit de cache. Het vaste deel (regels, kader en de kaart van één spreker) was ongeveer 1.300 tokens, ver onder de ondergrens van 4.096. Een zin kostte ongeveer $0,0035, met 2.800 tokens invoer.

**Na.** Het vaste deel is nu één blok per gebied: de regels, het kader, de stemkit van het land, het gebied met zijn plekken en de kaarten van wie er woont. Kleine gebieden delen een blok met hun buren. Het gesprek gaat als berichten, en een volgende zin zegt alleen wat nieuw is. Een gesprek van twintig zinnen met Mirte (19 met het model, de groet aan het eind komt uit de regels):

| | Voor het vaste schema | Na |
|---|---|---|
| Het hele gesprek | $0,193 | $0,049 |
| De eerste zin | $0,011 | $0,012 |
| De andere zinnen, gemiddeld | $0,010 | $0,0021 |
| Invoer uit de cache | 42% | 94% |
| Tijd per zin | 5 à 6 s | 2 à 3 s |

**Wat de eerste meting liet zien.** Anthropic zet het schema van het antwoord in de cache vóór het systeemdeel. Het schema van een gespreksregel noemde per zin de toegestane onderwerpen, aanbiedingen en questacties, en veranderde dus bijna elke zin. Een zin las alleen uit de cache als zijn schema gelijk was aan dat van de zin ervoor: elf van de negentien schreven het hele blok opnieuw. Het gesprek heeft nu één vast schema (`TALK_REPLY_SCHEMA`). De sleutels staan in het bericht, en de engine controleert ze zoals voorheen. Dat verklaart ook waarom Sonnet in M10.27 maar 23 van 62 keer uit de cache las. De andere sessie heeft de doelkeuzes daarom ook één schema gegeven.

**De situatieset**, drie reeksen van acht antwoorden, tegen M10.27:

| | M10.27 (oude regels, drie reeksen) | M10.28 |
|---|---|---|
| Bruikbaar | 23 van 24 | 24 van 24 |
| Ingrepen van de bewaker | één per reeks | één in drie reeksen (een belofte) |
| Karakterscore | 0,968 tot 0,987 | 1,000, 1,000 en 0,982 |
| Kosten per reeks | | $0,017 tot $0,022 |

**De cache warm houden.** De ping van de roadmap (een leeg verzoek met `max_tokens: 0`, vlak voor de vijf minuten) werkt niet voor gesprekken. Een leeg verzoek mag geen schema dragen, en het schema staat vóór het blok in de cache. De ping schreef daarom een eigen ingang van 7.025 tokens, het blok zonder de ongeveer 1.900 tokens van het schema, voor $0,0088. De zin erna las niets. Zoals de roadmap voor dat geval zegt, staat het blok nu een uur in de cache, en er gaan geen pings. Gemeten: een zin met Harmen zes minuten na een zin met Mirte las 8.367 van de 8.989 tokens uit de cache. De eerste zin in een streek betaalt de schrijfbeurt voor een uur (ongeveer 8.900 tokens tegen twee keer de invoerprijs, $0,018). Daarna leest elke zin daar het blok, zolang er binnen het uur gesproken wordt, met of zonder open venster. Het einde van het gesprek blijft vijf minuten in de cache, want de zinnen van één gesprek volgen elkaar sneller op.

**Het uur.** Met 40 gesprekszinnen per uur kost het gesprek nu ongeveer 40 × $0,0021 plus één of twee blokken voor een uur, samen ongeveer $0,10 tot $0,12 in plaats van $0,17. Bij de standaardklok (4 seconden) komt een uur spelen daarmee op ongeveer $0,20 in plaats van $0,27.
## gpt-5-mini tegen Haiku 4.5 voor de stem (M10.28, 29 september 2026)

Bram vroeg een uitgebreide vergelijking van gpt-5-mini met Haiku 4.5 voor de stem, op zijn eigen sleutels.

- **Wat gemeten is:** de situatieset (drie reeksen van acht antwoorden per model), het gesprek van twintig regels met Mirte, en de vijf soorten van de stem elk twee keer.
- **Op welke code:** het nieuwe gesprek, met het blok per gebied en één vast schema voor een gespreksregel.
- **Waar de antwoorden staan:** elk antwoord, met de zin van de speler ervoor, in `docs/playtest/voice/2026-09-29-gpt-5-mini.md` en `docs/playtest/voice/2026-09-29-claude-haiku-4-5-20251001.md`. Zo zijn ze naast elkaar te lezen.
- **De leesscore:** de karakterscore telt woorden en feiten, niet hoe een regel leest. Daarom leest Sonnet 5 (low) elke reeks en elk gesprek. Het geeft per antwoord 0 tot 3 punten op vier vragen: klinkt als deze persoon, natuurlijk Engels zonder tic, beantwoordt en voegt iets toe, houdt het gesprek gaande. Daarbij noemt het de drie zwakste antwoorden.

De raming vooraf was ongeveer $0,45 met een grens van $1,00. Het kostte ongeveer $0,28: gpt-5-mini $0,11, Haiku $0,15, en $0,015 voor een eerste proef die de antwoorden nog niet bewaarde.

| | Haiku 4.5 | gpt-5-mini |
|---|---|---|
| Situatieset, bruikbaar | 24 van 24, geen tweede poging, geen vaste regel | 11 van 24; 9 tweede pogingen en 13 vaste regels (7 keer iets verzonnen; verder het schema en te laat) |
| Karakterscore (regels) | 1,000, 1,000, 1,000 | 0,875, 0,813, 0,875 |
| Leesscore situatieset | 0,81, 0,83, 0,72 (24 antwoorden) | 0,92, 0,83, 0,75 (alleen de 11 die doorkwamen) |
| Seconden per antwoord | 3,5 (hooguit 5,0) | 6,6 (hooguit 9,9) |
| Een reeks van acht | $0,017 tot $0,022 | $0,010 tot $0,013 |
| Gesprek van twintig regels | $0,041; na de eerste $0,0022 per regel; 2,4 s per regel; 1 tweede poging | $0,041; na de eerste $0,0020 per regel; 8,4 s per regel (vier keer boven de 10 s); 4 tweede pogingen |
| Leesscore gesprek | 0,76 (deze persoon 2,9, natuurlijk 2,8, beantwoordt 2,6, gaat door 0,7) | 0,71 (2,5, 2,3, 2,7, 0,9) |
| `npc_reply` los | 2 van 2, $0,0015 tot $0,0024, 2,5 tot 2,9 s | 1 van 2 (de tweede te laat), $0,0021, 9,1 s |
| `chat_line` | 2 van 2, $0,0009, 1 tot 2 s | 2 van 2, $0,0007 tot $0,0012, 3 tot 5 s |
| `party_reply` | 2 van 2, $0,0015, 2 s | 2 van 2, $0,0009, 3 s |
| `improvise` | 2 van 2, $0,0019 tot $0,0021, 3 s | 2 van 2, $0,0010, 3 s |
| `journey` | 2 van 2, $0,0010, 2 tot 3 s | 2 van 2, $0,0006, 2 s |

Wat opvalt:

- **Snelheid.** gpt-5-mini denkt eerst, ook op low: 500 tot 1.000 tokens per regel, waar Haiku er 100 tot 200 schrijft. Een regel duurt daardoor 6 tot 9 seconden. Het spel geeft een antwoord 10 seconden (in te stellen bij het model). Moet de bewaker een antwoord opnieuw vragen, dan past de tweede poging niet meer en komt er een vaste regel. De meeste vaste regels van gpt-5-mini komen daarvandaan.
- **Verzinnen en het schema.** gpt-5-mini noemde zeven keer iets wat niet in de invoer stond, zoals namen of een plaats. Voor een gespreksregel legt OpenAI het schema niet strikt op, omdat niet elk veld altijd verplicht is; het schema stuurt dan alleen. In de situatieset en in het gesprek (regel 3 en regel 11) klopte een antwoord daardoor een paar keer niet. Bij de vier kleine soorten was het schema wel strikt, en daar ging niets mis.
- **Hoe het leest.** Waar gpt-5-mini wel doorkwam, lezen de antwoorden goed: in de situatieset gemiddeld 0,83 tegen 0,79 voor Haiku. Over een heel gesprek scoort Haiku hoger (0,76 tegen 0,71). gpt-5-mini herhaalt zich dan: "Mirte wipes/brushes flour from her hands" in bijna elke regel, en "neighbour". Twee regels waren een opsomming zonder haar stem. Haiku's zwakke plek is vragen terugstellen (0,7 op 3). Dat geldt voor beide modellen en is iets voor de regels van het gesprek, niet voor de keuze van het model.
- **Kosten.** Per gespreksregel zijn ze gelijk: $0,0020 tegen $0,0022. Alleen de eerste regel in een gebied is op Haiku duurder: koud ongeveer $0,018 voor het blok, dat daarna een uur in de cache blijft, tegen $0,004 op gpt-5-mini, dat vanzelf cachet. De vier kleine soorten kosten op gpt-5-mini ongeveer de helft, maar samen gaat het om minder dan een cent per uur.

Aanbeveling per soort:

- **`npc_reply`, het gesprek:** Haiku 4.5. gpt-5-mini haalt de drempel van het modeladvies niet (80% bruikbaar en 4 seconden per antwoord), is op de leesscore van een heel gesprek lager, en een gesprek met gpt-5-mini kost per regel niet minder.
- **`chat_line`, `party_reply`, `improvise` en `journey`:** beide modellen voldoen. De stem is één model voor al deze soorten, en de besparing is een fractie van een cent per uur, dus ze blijven bij het stemmodel.
- **Advies:** de stem op Haiku 4.5. gpt-5-mini is pas een kandidaat als hij sneller antwoordt dan de tijd voor een antwoord. Denkinspanning `minimal` bij OpenAI zou dat kunnen doen, maar is niet gemeten.

Het modeladvies onder Instellingen > AI toont deze vergelijking bij de stem. De keuze blijft bij Bram. Op het moment van meten stond zijn stem op gpt-5-mini.

## Wat de regels zelf beantwoorden (M10.28, 29 september 2026)

Sommige regels gaan niet meer naar de stem. De motor beantwoordt ze zelf met de sjablonen van de wereld:

- een groet van hooguit zes woorden;
- een ja of nee na iets wat geen vraag was;
- kopen of verkopen wat te koop is;
- dezelfde vraag in dezelfde woorden eerder in het gesprek ("As I said: ...");
- wie iemand is of wat hij doet.

Draagt de beurt iets wat de stem moet verwoorden, dan gaat de regel altijd naar de stem. Dat geldt voor een controle, een geheim, een bewering van de speler, een reactie, een opdracht om aan te bieden of een regel die de stem zou kunnen lezen.

Gemeten met het mockmodel:

- **Twintig vaste regels met Mirte:** drie gaan zonder aanroep: de groet, de prijs van roggebrood en het afscheid.
- **Speeltest `faraway`:** geen van de negen regels, want die gesprekken zijn allemaal vragen naar nieuws.

De verwachte een op de vier haalt alleen een gesprek met meer groeten, ja-nee en handel. Een regel kost ongeveer $0,0022, dus drie op twintig scheelt ongeveer $0,013 per honderd regels. De grote besparing op het gesprek komt van het blok per gebied.

Het AI-logboek toont zo'n regel als "by rule", zonder kosten.


## Een kleine wereld en de regels van het gesprek (M10.28, 29 september 2026)

Gemeten op Brams sleutel met Haiku 4.5, voor $0,16 samen (Haiku $0,13, de leesscore op Sonnet 5 $0,03).

**Skerrow heeft geen opvulling nodig.** Twintig zinnen met Maren van de Salt Kettle (`talk_twenty --world isle`): de eerste twee beantwoordden de regels, de eerste modelzin schreef 6.006 tokens, en elke volgende zin las ze uit de cache. De twintig zinnen kostten $0,037, een zin na de eerste $0,0015, en 94% van de invoer kwam uit de cache. Het minimum van 4.096 tokens telt het hele voorvoegsel, en daarin zit ook het antwoordschema (ongeveer 1.900 tokens) en de harde grenzen. Heel Skerrow (ongeveer 3.300 van onze schattokens) komt daardoor ruim over het minimum. Deepwell, de kleinste testwereld, zit met ongeveer 2.300 schattokens naar dezelfde verhouding op ongeveer 4.800 echte tokens, ook erboven. Opvullen zou alleen een grotere schrijfbeurt kosten, dus het blijft uit.

**De regels van het gesprek, eerste meting.** De situatieset drie keer, met de nieuwe regels (een verhaal in eigen woorden, een wedervraag, een vaste aanspreekvorm, afstanden alleen als gegeven):

| | Vóór de regels | Met de regels, eerste versie |
|---|---|---|
| Bruikbaar | 24 van 24 | 15 van 24 |
| Vaste regels | 0 | 9 |
| Karakterscore | 1,000 / 1,000 / 0,982 | 0,931 / 0,903 / 0,917 |
| Leesscore | 0,76 | 0,771 / 0,750 / 0,889 |

Twee regels van de bewaker waren te streng, en beide zijn meteen bijgesteld:

- Het verbod op opzeggen keurde 17 verhalen af die juist in eigen woorden waren ("I heard it from Wouter", "my teacher Kaatje"), omdat ze het ene opvallende beeld van het verhaal overnamen: grijs als een reiger, met tanden als waterwier. Opzeggen is nu pas meer dan 60% van het antwoord overgenomen uit andermans verhaal. Opnieuw beoordeeld op de antwoorden van deze meting keurt de regel van de 27 verhaalantwoorden er geen enkele meer af.
- De controle op de spreker las de tekst vóór het eerste aanhalingsteken als een handeling. Haiku antwoordt vaak zonder aanhalingstekens, dus "Brannoc the boatman and his boy live by the slip" van Maren gold als Brannoc die iets doet. In Brams eigen spel gebeurde hetzelfde met "Tessa said that? I-". Zonder aanhalingstekens is een antwoord nu spraak.

De leesscore ging omhoog (0,71 tot 0,89 tegen 0,76), de karakterscore omlaag door de afgekeurde antwoorden. **De regels van het gesprek, schone herhaling.** Met de bijgestelde regels, op Brams akkoord, voor $0,13 samen (Haiku $0,093, de leesscore op Sonnet 5 $0,039). De situatieset drie keer:

| | Vóór de regels | Eerste versie | Bijgesteld |
|---|---|---|---|
| Bruikbaar | 24 van 24 | 15 van 24 | 24 van 24 |
| Vaste regels | 0 | 9 | 0 |
| Opnieuw gevraagd | één belofte | | één antwoord zonder te lezen tekst of zonder gesproken woorden |
| Karakterscore | 1,000 / 1,000 / 0,982 | 0,931 / 0,903 / 0,917 | 0,982 / 1,000 / 1,000 |
| Leesscore | 0,76 | 0,771 / 0,750 / 0,889 | 0,750 / 0,819 / 0,847 |
| Kosten per reeks | $0,017 tot $0,022 | | $0,016 tot $0,025 |

Het gesprek van twintig zinnen met Mirte kostte $0,034 (17 zinnen met het model, drie uit de regels), $0,0020 per zin na de eerste, met 98% van de invoer uit de cache en een leesscore van 0,804. Wat de regels moesten doen:

- **De aanspreekvorm** blijft "lamb" in alle zeventien antwoorden. Eerder ging Mirte van lamb naar neighbour naar friend.
- **De wedervraag** komt in ongeveer een op de vier antwoorden ("Are you far from your own people, lamb?"), niet meer in bijna elk.
- **De afstand** naar de Drowned Goose noemt ze één keer, een half uur naar het oosten, en die verandert niet.
- **Het verhaal van de Haakman** vertelt ze kort, met het ene beeld uit de lore en daarna iets van haarzelf ("I keep to the bakery and away from deep water").

Niets is verzonnen: haar man Joris, het jaagpad en de weekdagen Maandag en Vrijdag staan in de content. De trouw blijft dus gelijk en de leesscore gaat omhoog; de regels blijven.

## Een quest uit een verzoek, na de nachtronde (M10.30, 30 september 2026)

Gemeten op Brams sleutel met Opus 5.5, zijn model voor de kroniekverteller (`npm run trial -- --kind night_quest --effort low|medium --record`), voor $0,104 samen, met zijn akkoord. De situatie: Harmen vraagt de vreemdeling naar zijn door de storm gescheurde zeilen te kijken, en na de nachtronde wordt daar een quest van gemaakt.

| | Low (2×) | Medium (1×) |
|---|---|---|
| Invoer | 3.571 tokens | 3.571 tokens |
| Uitvoer | 1.074 en 1.044 | 934 |
| Kosten | $0,036 en $0,035 | $0,033 |
| Tijd | 22 s en 16 s | 15 s |
| Wat het spel ervan bouwt | beide een quest van drie stadia | niets: één stadium zonder commando |

De twee antwoorden op low zijn trouw aan de wereld en aan wat Harmen vroeg: De Zwaan, Klaas die het oude zeildoek op zolder bewaarde, geen geld voor nieuw doek. Ze hebben drie stadia, elk met een daad, een doel en per persoon wat die weet. Geen van de drie noemde een verborgen waarheid; het verzoek had er ook geen. Het antwoord op medium stopte na één stadium met een leeg commando. De proefrit controleerde toen alleen de vorm en zei dat het spel het nam; de controle bouwt nu de quest zoals het spel doet, en keurt het af.

**Keuze.** Low, op Opus 5.5 zoals de speler de kroniekverteller kiest. De invoer is 3.571 tokens in plaats van de geschatte 1.500: het antwoordschema en de vaste regels tellen mee. Een quest kost dus ongeveer 3,5 cent, hooguit één per speelnacht. Bij de standaardklok (anderhalf uur per speldag) is dat hooguit 2,4 cent per uur spelen, en alleen in een nacht waarin iemand de vreemdeling iets vroeg.

## De stap Verhalen voor The Quiet Reach (M10.30, 30 september 2026)

Op Brams sleutel, met zijn akkoord tot $1,00 (raming $0,30). De stap gebruikt de streekronde (`region_story`) op de kroniekverteller (Opus 5.5, medium), in de stand "verhaal": één aanroep voor Port Vesper en één voor de hoofdlijn. Vesper Works en het land ertussen hebben geen bewoners en kregen geen eigen aanroep.

| Aanroep | In, waarvan uit de cache | Uit | Seconden | Kosten |
|---|---|---|---|---|
| Port Vesper (twee kleine lijnen) | 28.281, niets (geschreven voor de volgende) | 3.325 | 38 | $0,205 |
| De hoofdlijn (vijf stadia, vier waarheden) | 28.667, waarvan 25.831 | 5.265 | 64 | $0,122 |
| **Samen** | | | | **$0,327** |

Het gedeelde deel (het vaste deel van de wereldbouw, de regels van de stap, de wereld, de opdracht en de woorden van de ontwerper) staat in de cache. De tweede aanroep las het terug en kostte daarom de helft. Een wereld met meer nederzettingen betaalt dat deel één keer en daarna per nederzetting ongeveer $0,10 tot $0,15, afhankelijk van hoeveel er geschreven wordt.

Waarom Opus 5.5 op medium: het is de rol van de kroniekverteller, dezelfde als voor de streekronde in het spel. De lijnen moeten één waarheid over het hele verhaal volhouden, per stadium en per persoon. Het voorstel laadde in één keer, en de kleine lijn over de voorraden en de hoofdlijn vertellen hetzelfde spoor. Een lichtere stand is niet gemeten.


## Niko en Tessa over de opnamen, en de quest uit een verzoek opnieuw (M10.30, 30 september 2026)

Gemeten op Brams sleutel met zijn akkoord, voor $0,172 samen: $0,047 voor het gesprek op Haiku en $0,125 voor vier antwoorden van `night_quest` op Opus 5.5. Dat is ruim twee cent meer dan de $0,15 die ik vooraf noemde, omdat na de eerste twee antwoorden een tweede ronde nodig was.

**Vertellen Niko en Tessa hetzelfde verhaal?** In grote lijnen wel (`npm run trial -- --kind story_twenty`, tien regels aan elk, aan het begin van The Orison Recordings, 19 met het model).
- Ze vertellen hetzelfde over het signaal: het herhaalt zich al weken, Niko vond het, het komt van ver, en een deel lijkt op een testpatroon van de Peregrine.
- Ze houden de verborgen waarheid binnen: Niko noemt de bypass niet en zegt dat de bedrading oud maar in orde is, en Tessa praat niet over de aandrijftest ("That's not your concern right now") en zegt dat de aandrijving niet klaar is.
- De bewaker hoefde niets opnieuw te vragen.
- Het model koppelde "What is wrong with the listening station?" aan de eerste daad van de quest. Daarna antwoordde Niko uit het tweede stadium: "I never cut anything from the archive". Dat staat letterlijk in wat hij in dat stadium weet.

Wat ze wel verzinnen, zijn kleine bijzonderheden: dat het signaal elke drieënveertig seconden terugkomt, dat de verwarming drie weken geleden uitviel, en dat Sorell meer toegang heeft dan Niko. Tessa zegt dat het station zelf goed loopt, terwijl Niko het "tired" noemt. Dat is geen tegenstrijdig plot, maar wel een klein verschil in beeld.

**De quest uit een verzoek, met afloopopties.** Met de regel voor afloopopties, maar met afloopopties als optioneel veld in het schema, schreef Opus 5.5 op low twee keer een quest van één stadium zonder commando en zonder afloop ($0,025 en $0,023). Het spel nam die niet. Nu staan de afloopopties verplicht in het schema van `night_quest`, en zegt de regel dat alleen het laatste stadium zijn daad aan de afloopopties overlaat. Twee nieuwe antwoorden op low ($0,039 per stuk, 4.142 tokens in, ongeveer 1.130 uit) neemt het spel allebei aan. Elk heeft twee of drie stadia en drie afloopopties: zelf de zeilen repareren met Klaas, Lubbert overhalen om doek te lenen, of een overhaaste reparatie die scheurt. Een quest kost dus ongeveer 4 cent, hooguit één per speelnacht.

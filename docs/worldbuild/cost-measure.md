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

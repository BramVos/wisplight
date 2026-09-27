# Review van de opzet van Wisplight

Stand van de code op 27 september 2026, na M8.1. Gelezen: de hele `src/engine`, `src/chronicler`, `src/node/ai`, de editor, de content van beide werelden, het ontwerp "Signalen en nasleep" (de basis voor M8.2 tot M8.4) en de roadmap. Gecontroleerd: `npm run typecheck` is schoon, `npm test` slaagt (355 tests in 20 bestanden). De promptgroottes hieronder zijn gemeten met het oefenmodel op de vaste testset (ongeveer 4 tekens per token).

## 1. Oordeel in het kort

**Het generieke model werkt en is de juiste basis.** De opzet (content als data met strikte validatie, een headless motor met geseede toevallen en een herspeelbaar log, één modelgateway met drie rollen en een validator per rol, kennis per persoon met niveaus en versies, en sinds M8.1 signalen, wachters en plannen als data) komt overeen met wat het onderzoek naar emergent narrative de laatste tien jaar als beste praktijk heeft opgeleverd. Er is geen reden voor een herbouw. Wat er staat, is geschikt voor "levende verhalen": de wereld verandert door regels, de AI kiest binnen grenzen, en alles wat verandert wordt nieuws dat zich verspreidt en verkeerd kan aankomen.

**Vier dingen verdienen sturing vóór M8.2 wordt gebouwd.**

1. **Eén werkwoordentaal in plaats van vijf.** Er bestaan nu vijf overlappende vocabulaires voor "iets gebeurt": questeffecten, planeffecten, werkwoorden van de nasleep, de doelcatalogus van het brein en de stappen van een NPC-plan. M8.2 dreigt er een zesde bij te maken (voornemens). Voeg die samen tot één lijst met een tabel wie welk werkwoord mag gebruiken.
2. **Het brein moet niet zelf plannen schrijven, maar voornemens uit de content kiezen.** Het ontwerp laat een klein model stappen uit werkwoorden componeren. Dat is het duurste en minst betrouwbare deel van het plan. Laat voornemens sjablonen in de content zijn (zoals de standaardnasleep) en laat het brein kiezen en invullen. Alleen de kroniekschrijver, met het sterke model, schrijft vrije stappen.
3. **Het brein is nu de zwakste plek in tokengebruik en aanroepmomenten.** De catalogus (ongeveer 450 tokens) en alle bekende plekken met naam staan in het veranderlijke deel van de prompt, en elke NPC vraagt elke ochtend een keuze, ook als er niets veranderde. Dat is met twee kleine ingrepen te halveren.
4. **De code kent de Nethermarch nog op zo'n tien plekken.** Kapel, brink, schout, Graafhaven, kruiden en zes vaste roddelonderwerpen staan in de motor. Skerrow verliest daardoor stilletjes gedrag. Dit is klein werk, maar het is precies het soort lek dat de regel "een nieuwe soort gebeurtenis is content" ondergraaft.

Verder: de stem en de kroniekschrijver zijn goed ingericht (gecachte vaste delen, alleen de herkende onderwerpen, gebonden opzoekrondes). De editor is voor een soloproject toereikend, maar de taal van voorwaarden en werkwoorden staat nergens als naslag. Een RPG-laag en een diep ambachtssysteem zijn allebei al optioneel; wat voor diep ambachtswerk ontbreekt, is klein.

## 2. Wat er staat, in één beeld

| Laag | Wat het doet | Waar |
|---|---|---|
| Content | Alles wat een wereld is: plekken, mensen, voorwerpen met affordances, beroepen met schema's, onderwerpen met drie kennisniveaus, patronen, quests als storylets (voorwaarden, stadia, uitkomsten), plannen, wachters, nasleep, regels, bestiarium | `content/<wereld>/`, gevalideerd met zod in `content.ts` |
| Simulatie | Per minuut: NPC's dichtbij denken (schema, behoeften, HTN/GOAP-planner met terugwaarts zoeken over affordances), per kwartier nieuws, per uur economie, wachters, verhalenmotor | `simulation.ts`, `npc/*`, `news.ts`, `stories.ts` |
| Kennis | Vaste worp per persoon en onderwerp; feiten met drie versies en een bewering; horen, doorvertellen, vervagen, vergeten, geloven | `dialogue/knowledge.ts`, `news.ts` |
| Nasleep (M8.1) | Wachter ziet toestand, signaal, standaardnasleep als plan met stappen (moment, voorwaarde op weten of waar, werkwoord), elke stap is nieuws; laag over de content voor banden, huis, werk, huishouden | `signals.ts`, `aftermath.ts`, `quests/plans.ts`, `layer.ts` |
| AI-rollen | Stem (per beurt, gecacht systeemdeel per NPC), brein (doelkeuze uit catalogus met validator en budget), kroniekschrijver (nachtrun met overzicht in vaste notatie, opzoeken, lore, notities, verzoeken, gedachten, nieuws, spanning, effectplannen), adviseur (modelkeuze) | `dialogue/*`, `npc/goals.ts`, `src/chronicler`, `node/ai/*` |
| Detail op afstand | NPC's: volledig, grof, notitie; verre plekken: omtrek eenmalig door de kroniekschrijver | `lod.ts`, `outlines.ts` |
| Speler | Personage met regels als content (optioneel), relaties met poorten, facties, misdaad, gezellen, romance, huwelijk via de nasleep | `rules/*`, `social/*` |
| Editor | Formulieren voor plekken en mensen, YAML voor de rest, controle met waarschuwingen, speeltest zonder speler met signalen en plannen, NPC-inspecteur, sparren met de kroniekschrijver als diff | `editor.ts`, `edit.ts`, `playtest.ts`, `EditorApp.tsx` |

Wat opvalt aan de samenhang: er zijn drie manieren waarop de wereld iets "weet". Vlaggen (waarheid, alleen voor quests en plannen), beweringen op feiten (kennis die zich verspreidt en fout kan zijn) en plaatstoestand plus de laag (waarheid over mensen en plekken). Dat is een goede driedeling, maar er staat nergens een regel voor contentschrijvers wanneer je welke kiest. Vuistregel die uit de code volgt: alles waarover mensen kunnen twijfelen of liegen is een bewering, alles wat alleen de quest hoeft te weten is een vlag.

## 3. Toets aan verhaalmodellen

### Welke modellen er zijn

Ik heb de bronnen via zoeken bevestigd; de papers zelf kon ik vanuit deze omgeving niet openen, dus ik vat samen wat ik ervan ken en de zoekresultaten bevestigden.

- **Emergent narrative met een curator.** James Ryan, *Curating Simulated Storyworlds* (UC Santa Cruz, 2018): verhalen ontstaan uit een simulatie, en een systeem dat het interessante eruit haalt en vertelt ("curationist approach") is de sleutel. Zijn *Talk of the Town* laat NPC's kennis vormen, doorvertellen, verkeerd onthouden, vergeten en liegen; *Bad News* is de live versie. Wisplight's `news.ts` en `knowledge.ts` zijn precies dit model: feiten met versies, doorvertellen met verlies, vergeten, en sinds M8.1 beweringen waarop iemand kan handelen.
- **Story sifting.** Kreminski, Wardrip-Fruin en Mateas (*Felt*, *Authoring for Story Sifters*, *Select the Unexpected*): patronen die in een gebeurtenissenlog naar verhaalwaardige reeksen zoeken. Wisplight's verhaallijnen (`storylines.ts`) zijn een eenvoudige sifter (dezelfde mensen, hetzelfde patroon, dezelfde plek binnen een dag) en de kroniekschrijver is de curator.
- **Storylets en quality-based narrative.** Emily Short (*Beyond Branching*, *Storylets: You Want Them*): kleine, losse verhaalstukken met voorwaarden, inhoud en effecten, die opgaan zodra de wereldtoestand past. Wisplight's quests (starts, stages met `when`, outcomes met `when`, actions) zijn storylets; wachters plus nasleep zijn storylets zonder speler.
- **Social physics.** McCoy, Treanor, Samuel, Reed, Mateas, Wardrip-Fruin (*Comme il Faut*, *Prom Week*, later *Ensemble*): sociale regels als volume-regels die bepalen wat een personage sociaal kan doen; het verhaal is wat de speler daarin uitlokt. Recent (*Paradise*, FDG 2024) is Ensemble uitgebreid met een taalmodel voor de dialoog, met de symbolische laag als grond. Wisplight's poorten (`social/gates.ts`), daden en houdingen zijn dezelfde scheiding: het systeem beslist, het model verwoordt.
- **Versu** (Evans en Short, 2013): personages als autonome agenten met sociale praktijken. Verwant aan Wisplight's schema's, behoeften en doelcatalogus.
- **Drama management / experience management.** Riedl en Bulitko (*Interactive Narrative: An Intelligent Systems Approach*, AI Magazine 2013) en het overzicht van Roberts en Isbell: een agent die niet-spelerelementen bijstuurt in dienst van een verhaalervaring, tussen structuur en vrijheid van de speler. Wisplight heeft dit alleen als tempo (`stories.ts`, naar het voorbeeld van de RimWorld-storyteller en de Left 4 Dead-director: cooldowns en een verwachte frequentie), niet als sturing op verhaalboog.
- **Generative Agents** (Park e.a., 2023) en *Affordable Generative Agents* (2024): agenten met geheugenstroom, reflectie en planning zijn geloofwaardig maar duur; hergebruik van beleid en compressie van sociaal geheugen besparen tot 97% tokens. Wisplight zit al aan de goedkope kant: het model kiest doelen, het systeem plant en voert uit, en de simulatie draait zonder model door.
- **Klassieke verhaalstructuren** (Propp's functies, Polti's 36 situaties, Booker's zeven plots) worden in generatieonderzoek (Gervás e.a.) als sjablonen gebruikt. Ze zijn nuttig als checklist voor welke *soorten* verhalen een wereld kan dragen, niet als motor.
- **Consequentie en geheugen in commerciële spellen**: het Nemesis-systeem (Monolith, GDC 2018) laat tegenstanders alles onthouden wat de speler ze aandeed en dat later benoemen; Dwarf Fortress laat een wereld eeuwen doorrekenen en de geschiedenis nalezen (Legends). Wisplight's geheugennotities per NPC, wrok, misdaadregister, "recently" en de echte kroniek aan het eind zijn hetzelfde principe.

### Welke verhaalsoorten het model draagt

| Verhaalsoort | Nu | Met M8.2 tot M8.4 volgens ontwerp | Beoordeling |
|---|---|---|---|
| Persoonlijk drama: liefde, huwelijk, rouw, familie | Ja: romance, huwelijk via nasleep, rouw in het brein, familie hoort slecht nieuws eerst | Verdieping via voornemens | Sterk |
| Vete en verzoening | Wrok en confrontatie bestaan; geen vete die blijft | Wachter `feud`, bemiddelen | Goed, mits bemiddeling een werkwoord wordt (zie 6) |
| Bedrog, geheim, ontmaskering | Geheimen met hint en proef; leugens als feit met `truth: false`; verdachten bij diefstal | `deceived_found_out`, liegen met motief, navragen | Goed. Een "wie zag wat"-mysterie is al inherent aan het kennismodel (getuigen per feit) |
| Misdaad en recht | Ja: getuigen, aangifte, boete, omkopen | | Goed, maar de wet is een vaste enum van twee waarden (`count`, `waagdam`) in `FactionSchema`: niet generiek |
| Ramp en herstel | Ja: effectplannen, plaatstoestand, vlucht en terugkeer op kennis | | Sterk |
| Oorlog en politiek | Spanning per paar rijken, oorlogsplan, de kroniekschrijver beslist wie vlucht | Groepen, wrijving | Grof maar bruikbaar; facties hebben geen eigen doelen of plannen |
| Economie: tekort, groei, nieuwkomers | Productie via affordances en planner; aanvoer als vaste regel | Grootboek, hulpbronnen, `arrive`, projecten | Het ontwerp is zuinig en juist (twee lagen); zie 7 |
| Sociale klim en stand | Alleen geld | Vijf standen, `rose_in_standing` | Goed |
| Mysterie en onderzoek | Quest-gescript; `Investigate` als doel; bewijs is een vlag of een voorwerp | Navragen bij reizigers | Voldoende; geen apart aanwijzingenmodel nodig zolang getuigen en voorwerpen het dragen |
| Bovennatuurlijk, horror | Content: wezens, ontmoetingen, vloeken als aandoening, tags op plekken | | Voldoende; generiek via regels en content |
| Reis en ontdekking | Kaart, hexen, mist, notities op afstand, omtrek van verre plekken | | Goed; "genereren tot speelbaar" is terecht uitgesteld tot een tweede streek |
| Gezellen en persoonlijke bogen | Ja: loyaliteit, band, goedkeuring, persoonlijke quest | | Goed |
| De wereld werkt op de speler in | Ja: houding, poorten, gezocht, partner die je thuis verwacht, gezellen die vertrekken, reputatie, facties | Openheid van een plek, herkennen na jaren | Sterk |
| Lange bogen met opbouw en climax | Alleen tempo (aantal kleine incidenten per dag) en verhaallijnen met haakjes | De kroniekschrijver mag plannen (M8.3) | **De echte lacune.** Zie 3.3 |

### De lacune: opbouw over weken

Wat ontbreekt is niet een verhaalsoort maar dramatische *sturing*: niets zorgt dat een verhaallijn van opzet naar verwikkeling naar climax loopt, of dat er niet drie climaxen in één week vallen. De verhalenmotor kent alleen "hoeveel kleine dingen per dag". De kroniekschrijver noteert per lijn `next` (wat mag volgen) maar kan dat niet laten gebeuren; vanaf M8.3 kan hij dat via plannen. Dat maakt hem feitelijk de experience manager. Maak dat expliciet en klein:

- Geef een verhaallijn een **fase** (`setup`, `rising`, `crisis`, `resolution`, `closed`), door de kroniekschrijver gezet in zijn notitie. Het is één veld.
- Laat de verhalenmotor het aantal open lijnen in `rising` of `crisis` meewegen: geen nieuwe kleine incidenten in een dorp waar al twee lijnen naar een crisis lopen. Dat is de RimWorld-regel (cooldown en spanningscurve) in twee regels code.
- Laat de kroniekschrijver in M8.3 per lijn hooguit **één geplande beat** aanleveren: een stap met een `when` en een werkwoord, in het bestaande planformaat. Meer sturing is niet nodig; de simulatie doet de rest.

Dit is geen nieuwe laag; het is drie velden op wat er al is.

## 4. Generiek en uitbreidbaar

### Wat echt generiek is

- Affordances: elk voorwerp verbruikt en maakt, met toegang, uren en duur; de planner zoekt terug tot diepte 3. Brood, meel, turf, garen: één mechaniek.
- Voorwaarden: één taal (`ConditionSchema`) voor quests, wachters en plannen, met `knows` op een bewering. Dit is de sterkste ontwerpkeuze in de code.
- Signalen, wachters, nasleep, plannen, laag: de code kent geen bruiloft. Het bewijs staat in `tests/m81.test.ts`: een nieuwe soort gebeurtenis alleen met content.
- Regels als content: een wereld zonder `rules.yaml` speelt met een kant-en-klare reiziger en zonder gevecht (Skerrow). De RPG-laag is dus al optioneel, zonder een schakelaar.
- Wereldwoorden: kalender, munten, wet, streek en herkomst uit `world.yaml`.

### Waar de code de Nethermarch nog kent

| Plek | Wat | Gevolg voor een andere wereld |
|---|---|---|
| `npc/brain.ts` | `loc_veenhoek_chapel` als bidplek, `loc_veenhoek_green` als speelplek voor kinderen, `npc_everhard` als schout | Skerrow bidt en speelt thuis, kinderen spelen op de brink van een andere wereld niet |
| `dialogue/conversation.ts` | `RUMOUR_TOPICS` (fenna, grey_cat, the_storm, drainage, surveyor, kattenbroek) | "What's new" kent op Skerrow geen vast dorpspraatje |
| `social/crime.ts`, `quests/antagonists.ts` | `npc_everhard` | Wet werkt via `world.law`, maar de schout is op drie plekken hard |
| `content.ts` `FactionSchema.law` | enum `count` of `waagdam` | Een derde wereld kan geen eigen wet noemen |
| `requests.ts`, `stories.ts`, `chronicler.ts`, `combat/ai.ts` | `herbs` als het geneesmiddel | Skerrow heeft geen kruiden; de koortslijn werkt niet |
| `map/journey.ts` | Graafhaven | Tekst over de schuit |
| `quests/antagonists.ts` | 185 regels gescripte tegenspelers van de Holleveen | Niet herbruikbaar; het ontwerp erkent dit |

Aanbevolen: tags in plaats van ids (`holy`, `social`, `play`), een item-tag `remedy` (bestaat al als veld) in plaats van `herbs`, `standing_talk: true` op een onderwerp in plaats van de vaste lijst, en `law` als vrije id met controle tegen `world.law`. Dit is een dag werk en hoort vóór een derde wereld.

De tegenspelers zijn een goede lakmoesproef voor de plantaal: als `antagonists.ts` als plan in `plans.yaml` kan worden geschreven (stappen om 18:00 en 02:00, voorwaarden op vlaggen, werkwoorden `fact`, `tick`, `vanish`), dan is de taal compleet. Het enige wat daarvoor ontbreekt is een **kans** op een stap (`chance: 0.3`, geseed). Dat is één veld dat voor elk plan bruikbaar is. Ik zou dat in M8.3 als bewijs meenemen.

### Vijf vocabulaires voor hetzelfde

| Vocabulaire | Waar | Voorbeeld |
|---|---|---|
| Questeffecten | `quests/schema.ts` | `move`, `send`, `vanish`, `fact`, `goal` |
| Planeffecten | `planschema.ts` | `flee`, `close`, `market`, `news` |
| Werkwoorden van de nasleep | `planschema.ts` | `move_home`, `set_work`, `hire`, `tell` |
| Doelcatalogus van het brein | `npc/goals.ts` | `Visit`, `Deliver`, `Flee`, `Investigate` |
| NPC-stappen en acts | `state.ts`, `npc/acts.ts` | `move`, `spend`, `act: court` |

De overlap is echt: `move` (effect), `move_home` (werkwoord) en `Flee` (doel) verplaatsen alle drie iemand; `fact` (effect), `tell` (werkwoord) en `Spread` (doel) maken alle drie nieuws. Dat is niet fout, want elk heeft een andere reikwijdte, maar het ontwerp voor M8.2 voegt nog een laag toe: "alle 29 doelen van het brein als stap". Voorstel:

- Eén `VerbSchema` (die bestaat al en omvat de questeffecten). Voeg er één werkwoord `goal` aan toe met de doelcatalogus als waarde (`{ goal: Visit, who: $a, target: loc_x }`), zodat een plan een NPC een doel kan geven zoals de quest dat nu al kan. Dan is "een stap uit een voornemen is een gewoon doel" geen nieuwe code maar één regel in `runVerb`.
- Eén tabel `PERMISSIONS: Record<verb, { content, rules, brain, chronicler }>` in de code, gegenereerd tot tekst voor de editor en voor `CHRONICLER.md`. De tabel in het ontwerp ("Werkwoorden", brein mag/kroniekschrijver mag) wordt dan code in plaats van proza.
- De NPC-stappen (`Step` in `state.ts`) blijven intern; ze zijn de uitvoering, niet de taal.

## 5. Inzet van de modellen

### Wanneer welk model, en met wat

| Rol | Wanneer | Krijgt | Mag terug | Controle | Terugval |
|---|---|---|---|---|---|
| Stem | Elke gespreksbeurt, na injectiefilter en herkenning van onderwerpen door regels | Gecacht: regels, wereldkader, kaart, mensen die hij kent. Wisselend: scène, wat hij net deed, wie erbij is, gedachten, verzoeken, houding, kennispakket alleen voor herkende onderwerpen, laatste vier beurten | Antwoord, namen, onderwerpen, hooguit één klein relatie-effect, geheugennotitie, questactie | Schema, anachronismen, naamlek, lengte; opnieuw vragen, dan sjabloon | Sjabloonzin |
| Brein | 's Ochtends, bij nieuws van belang 2 over naasten, na een afgerond doel (met rust van 5 uur); hooguit 6 per dag, 3 actieve doelen | Kaart, behoeften, geld, doelen, laatste nieuws, gedachten, trigger, de hele catalogus, alle bekende plekken, mensen, dingen | 1 tot 3 doelen met prioriteit | Catalogus, ids uit eigen kennis, poorten, niet al gewild | Nutsfunctie en schema |
| Kroniekschrijver | Om 04:00 bij belang 3, direct bij belang 4 of 5 of de dood van iemand met een questrol | Gecacht: instructie, wereld, catalogus, antwoordvorm. Wisselend: alleen de veranderde lijnen met notitie en nieuwe gebeurtenissen, kaartjes in één regel, verwante lore, open verzoeken; opzoeken tot drie rondes | Lore, notities, hooguit 2 verzoeken, 3 gedachten, nieuws, 1 spanning, plannen alleen voor gemarkeerde lijnen | Sleutels, lengtes, namen tegen de wereld, getuigen, aangeboden of niet | Sjabloonlore |
| Adviseur | Bij koppelen van een sleutel | Modellijst en prijstabel | Model per rol | Alleen ids uit de lijst | Zelf kiezen |

Dit is de juiste verdeling. Het principe "de systemen beslissen wat mag, het model kiest en verwoordt" wordt overal volgehouden, en elk antwoord wordt in het log vastgelegd zodat naspelen geen model nodig heeft.

### Gemeten promptgroottes

| Rol | Vast deel (gecacht) | Wisselend deel | Schema | Max. uitvoer |
|---|---|---|---|---|
| Stem | 1.150 tot 1.200 | 100 tot 300 | 350 | 850 |
| Brein | 340 tot 370 | 1.230 tot 1.250 | 550 tot 575 | 400 |
| Kroniekschrijver | 3.870 | 500 tot 1.200 | 525 tot 945 | 1.800 |
| Editor, sparren | 3.260 | 2.970 | klein | 4.000 |

De stem en de kroniekschrijver zijn goed: het grootste deel is cachebaar en het wisselende deel bevat alleen wat de beurt nodig heeft. Het brein staat op zijn kop: het vaste deel is klein en het wisselende deel groot, terwijl het veruit de meeste aanroepen doet.

### Waar het brein tokens en aanroepen verspilt

1. **De catalogus staat in het wisselende deel.** Negenentwintig regels, ongeveer 450 tokens, bij elke keuze opnieuw zonder cache. Hoort in het systeemdeel.
2. **Alle bekende plekken met id én naam.** Mirte kent zo'n 25 plekken; dat is 300 tokens per keuze. De kroniekschrijver lost dit al op met korte sleutels (`p1`, `l1`); doe dat ook hier, of noem alleen plekken die voor de aangeboden doelen relevant zijn.
3. **Doelen die toch geweigerd worden, worden wel aangeboden.** De poorten (`allowAct`) staan na het antwoord; zet ze ervoor en laat gesloten doelen weg. Dan kan het schema per keuze kleiner en zijn er minder weggegooide antwoorden.
4. **De ochtendkeuze zonder aanleiding.** Elke NPC vraagt elke ochtend een keuze. Bij dertig NPC's is dat een salvo van dertig aanroepen rond zes uur, waarvan de meeste "Work" opleveren, wat de validator dan weggooit. Regel: geen aanroep zonder delta. Een delta is nieuws sinds gisteren, een signaal, een gedachte, een open verzoek, een lopend voornemen, een behoefte onder een grens. Zonder delta doet het schema het werk. Dat is de kern van "de juiste informatie op het juiste moment": het model wordt alleen gevraagd als er iets te kiezen valt. Dit is ook wat Affordable Generative Agents doet (hergebruik van beleid waar niets veranderde).

Met 1 en 2 daalt het wisselende deel van ongeveer 1.240 naar ongeveer 400 tokens; met 4 halveert het aantal aanroepen op rustige dagen. Samen is dat ruwweg een derde van de huidige breinkosten, en het maakt ruimte voor de extra aanroepen die M8.2 wil (10 tot 20 per speldag volgens het ontwerp).

### Voor M8.2: laat het kleine model niet componeren

Het ontwerp zegt: "het brein antwoordt met een doel of een voornemen uit de werkwoorden". Dat betekent dat een klein, goedkoop model stappen moet schrijven met momenten, selectors (`{ home_of: $b }`) en voorwaarden in de questtaal. Drie bezwaren:

- Het schema voor een vrij plan is groot (de werkwoordenunie met selectors is als JSON-schema meerdere duizenden tokens) en kleine modellen maken er vaak iets ongeldigs van; elke afgekeurde aanroep is weggegooid geld en een terugval op de standaardnasleep, zodat de speler het verschil niet ziet.
- Het is een tweede plantaal naast de nasleep in de content, terwijl het ontwerp juist wil dat een nieuwe soort gedrag content is.
- Het is niet nodig voor de criteria van M8.2: Harmen die zich anders gedraagt, een ruzie die vete of verzoening wordt, twijfel en navragen, wegjagen of melden. Dat zijn allemaal *keuzes uit een klein aantal voornemens*.

Voorstel: **voornemens als content** (`intentions.yaml`, hetzelfde formaat als `aftermath` maar met `signal` én een `choice`-blok: naam, één regel voor het model, wie het mag kiezen, bindingen). Bij een signaal krijgt het brein de handvol voornemens die voor dit signaal en deze persoon bestaan, kiest er nul of één en vult de open bindingen in (wie bemiddelt, waar naartoe). De validator is dan triviaal, het schema klein (een enum plus een paar ids), en het gewone doel blijft de andere uitkomst. Een voornemen staat in de spelstand als plan met `source: brain`, zoals het ontwerp wil; de dagelijkse keuze neemt eerst de volgende stap ervan. Alleen de kroniekschrijver (M8.3) schrijft vrije stappen, en die zijn al begrensd.

Dit is ook een sturing op het ontwerp zelf: de tabel "Werkwoorden, brein mag" wordt dan een lijst welke voornemens er zijn, niet welke werkwoorden een model mag typen. Ik zou dit in het ontwerpdocument aanpassen voor de bouw van M8.2 begint.

### Heen en weer

De opzoekrondes van de kroniekschrijver (hooguit drie, met een gecacht vast deel) zijn het juiste patroon: het model krijgt eerst een kort overzicht en vraagt zelf om meer. Ik zou dat niet aan het brein geven; een klein model met lage tijdslimiet (10 seconden) is niet gebaat bij rondes. Wat het brein nodig heeft, is de gestructureerde context van het signaal (wie, wat, van, naar, oorzaak in één regel), en dat is precies wat M8.2 al voorziet.

## 6. Diepte op afstand

Voor mensen werkt het: dichtbij elke minuut, verder elk kwartier, ver weg een notitie die weer een persoon wordt als de speler binnen 3 km komt, met een regel over hoe hij daar kwam. Voor plekken buiten de kaart is er de omtrek. Voor het verhaal zelf is er geen afstand: de kroniekschrijver behandelt een lijn in Waagdam even zwaar als een lijn naast de speler. Dat is verdedigbaar (nieuws moet overal kloppen), maar twee dingen zou ik wel op afstand laten sturen:

- **Voornemens en plannen van mensen ver weg** hoeven geen feest te simuleren of iemand echt te laten lopen; een feit plus een toestandswijziging volstaat. `runVerb` kan dat al voor `flee` (dichtbij lopen ze, ver weg worden ze een notitie); trek die regel door naar `feast`, `leave` en `return`.
- **Het brein van mensen ver weg** hoeft geen model: een NPC in de grove of notitielaag krijgt de goedkoopste afhandelaar (regels), en pas de eerste keuze na de overgang naar volledig gaat naar het model. Dat past bij het ontwerp ("dan wordt het direct dieper uitgewerkt tot het niveau waarop het nodig is") en scheelt de meeste breinaanroepen in een streek met dertig mensen.

## 7. Ambacht, beroepen en de RPG-laag

### Wat er is

- Voor NPC's is ambachtswerk al diep en generiek: affordances met verbruik, opbrengst, duur, toegang (eigenaar, huishouden, personeel), vereiste toestand en reparatie; beroepen met dagdoelen die de voorraad van een dienst aanvullen; een planner die terugzoekt (brood wil meel wil rogge, bij de molen die kapot kan zijn). Nieuwe ketens (wol naar garen naar kleding, turf naar vuur) zijn alleen YAML.
- Voor de speler: affordances met `actors: [player]` (zes in de Nethermarch), het commando `use`, kopen en verkopen, leveren. Geen koppeling aan vaardigheden, geen niveau, geen kwaliteit.
- Regels (`rules.yaml`): vaardigheden per attribuut, rangen, oefenstreepjes na een geslaagde proef, talenten, klassen, ervaring uit ontdekking, lore, geheimen, verzoeken en gevecht. Alles optioneel per wereld.

### Wat er voor "diep ambacht met levelen" ontbreekt

Weinig, en het is generiek:

1. Op `AffordanceSchema` een optionele `check: { skill, dc }` en `xp`. Een gebruik door de speler doet dan een proef via `playerCheck`, die al oefenstreepjes zet en ervaring geeft; bij mislukken gaat de grondstof verloren of komt er minder uit. Dat maakt elk voorwerp een oefenplek zonder aparte laag. Omvang: een dag.
2. Voor een NPC: `check` als kans in plaats van worp, zodat een leerling-bakker meer verspilt. Dit kan met de bestaande `personality.diligence` of een `skills`-veld op de NPC; ik zou het pas doen als een verhaal erom vraagt.
3. Werken voor loon (`set_work` voor de speler) staat al in M8.4. Dat is de brug tussen de economie en de RPG-laag.
4. Een beroep voor de speler is dan geen aparte statistiek maar een vaardigheid plus een werkplek. Dat is de goedkoopste vorm en past bij "meer verhaal, minder RPG" als de wereld dat wil.

Kwaliteit van goederen en slijtage van gereedschap zou ik, zoals het ontwerp zegt, buiten houden: het verdubbelt het aantal voorwerpen en levert zelden verhaal op.

### Interface in de editor

Voorwerpen, dingen en beroepen zijn in de editor YAML-lijsten met controle; er is geen formulier en geen overzicht van ketens. Voor een ontwerper die een ambachtswereld bouwt, is één ding waardevol: een **ketenoverzicht** in het controlepaneel (welke voorwerpen worden nergens gemaakt of verkocht, welke affordances hebben geen leverancier van hun invoer, welke dagdoelen kunnen nooit slagen). De planner heeft die informatie al; het is een lijst van waarschuwingen in `builder.ts`. Omvang: een dag. Een grafische recepteneditor is niet nodig.

## 8. De editor

Toereikend voor een soloproject en voor de kroniekschrijver als medebouwer: formulieren voor plekken en mensen, YAML voor de rest, opslaan alleen als de hele wereld laadt, uitgangen beide kanten op, diff vooraf, speeltest met signalen en plannen, NPC-inspecteur met de laag, sparren als diff. Twee lacunes:

- **Geen naslag van de taal.** Voorwaarden, werkwoorden, selectors en bindingen staan alleen in `schema.ts` en `planschema.ts`. Wie een wachter of nasleep schrijft, moet in de code kijken. Genereer een naslagpagina uit de zod-schema's (de beschrijvingen staan er al als commentaar; zet ze in `.describe()`), en gebruik dezelfde tekst voor `CHRONICLER.md` (taak in M8.3) en voor het editorpaneel. Eén bron, drie lezers.
- **Geen zicht op de verhaallijnen.** De speeltest toont signalen en plannen, niet de lijnen, notities en haakjes van de kroniekschrijver. Voor het beoordelen van opbouw (zie 3.3) is dat de eerste plek om te kijken.

## 9. Kleine bevindingen

- `pendingExtra` in `quests/plans.ts` wordt nergens gevuld: dode code sinds de terugkeer in de vlucht zelf zit.
- `news.facts` groeit onbegrensd (alleen `heard` wordt opgeschoond, en `carryOver` snoeit bij een nieuw personage). `believes()` en `hire()` lopen alle feiten door. Bij 60 speldagen is dat nog niets, bij 300 wordt het merkbaar. Een archief van feiten die niemand meer kent en die niet in een lijn of lore zitten, lost dit op.
- Een wachter op `when` neemt als plek de plek van de speler als er geen `place` staat. Dat is een gok die meestal verkeerd is; beter is geen plek, of de plek uit de eerste voorwaarde.
- Verhaallijnen groeien aan elkaar via "dezelfde mensen": een drukke NPC (Mirte, Gerrit) trekt alles naar één lijn tot die na veertien dagen sluit. Een maximum aan feiten per lijn en een splitsing op patroon zou de kroniekschrijver kleinere, betere lijnen geven.
- `CLAUDE.md` noemt een id-map voor hernoemingen; die bestaat niet in de code. Nu is een hernoeming in de content een gebroken save. Voor een soloproject aanvaardbaar, maar noteer het.
- `FactionSchema.law` als enum en de drie plekken met `npc_everhard` (zie 4).
- Stappen van een plan hebben geen kans. Voor tegenspelers en voor "een enkeling jaagt hem weg" is `chance` een klein en generiek veld.
- De `Ask_help`-sleutel in de catalogus tegenover `AskHelp` als doeltype is een klein verschil dat elke nieuwe lezer laat struikelen.

## 10. Wat ik zou sturen voor M8.2 tot M8.4

In volgorde, met omvang (S is een dag, M een week).

1. **Vóór M8.2 (S):** de Nethermarch-ids uit de motor, `law` als vrije id, `chance` op een stap, `pendingExtra` weg.
2. **Vóór M8.2 (S):** brein-prompt op orde: catalogus naar het systeemdeel, korte sleutels, gesloten poorten weglaten, geen ochtendkeuze zonder delta, geen model voor mensen buiten de volledige laag.
3. **M8.2, ontwerpwijziging (M):** voornemens als content (`intentions.yaml`) waaruit het brein kiest en invult, in plaats van vrije stappen uit werkwoorden. Werkwoord `goal` in `VerbSchema` zodat een voornemen gewone doelen kan bevatten. Eén permissietabel per werkwoord in code. De rest van M8.2 (stand, liegen met motief, navragen, vete, openheid, geloven, vergeten en herkennen) kan zoals ontworpen; het zijn regels en wachters.
4. **M8.3 (M):** de kroniekschrijver plant met de volledige werkwoordenlijst, begrensd zoals nu; plus de drie velden voor opbouw (fase per lijn, tempo dat fases meeweegt, hooguit één geplande beat per lijn). Als bewijs van volledigheid: de tegenspelers van de Holleveen als plan in content.
5. **M8.3 (S):** naslag van voorwaarden en werkwoorden gegenereerd uit de schema's, voor editor en `CHRONICLER.md`; verhaallijnen in de speeltest.
6. **M8.4:** zoals ontworpen. Het grootboek per nederzetting met `supply` als terugval is de juiste maat. Voeg het ketenoverzicht in de editor toe (S) en `check`/`xp` op affordances (S) zodat werken voor loon meteen ambacht met oefening is.

## Bronnen

Gevonden via zoeken op 27 september 2026; de teksten zelf kon ik vanuit deze omgeving niet openen.

- James Ryan, *Curating Simulated Storyworlds*, proefschrift UC Santa Cruz 2018: https://escholarship.org/uc/item/1340j5h2 ; over Talk of the Town en Bad News: https://jamesryan.computer/ en https://www.researchgate.net/publication/307924025_Bad_News_An_Experiment_in_Computationally_Assisted_Performance
- Kreminski e.a., *Felt: A Simple Story Sifter*: https://mkremins.github.io/publications/Felt_SimpleStorySifter.pdf ; *Authoring for Story Sifters*: https://link.springer.com/chapter/10.1007/978-3-031-05214-9_13 ; *Select the Unexpected*: https://link.springer.com/chapter/10.1007/978-3-031-22298-6_18
- Emily Short, *Beyond Branching*: https://emshort.blog/2016/04/12/beyond-branching-quality-based-and-salience-based-narrative-structures/ ; *Storylets: You Want Them*: https://emshort.blog/2019/11/29/storylets-you-want-them/
- McCoy e.a., *Prom Week: Social Physics as Gameplay*: https://dl.acm.org/doi/10.1145/2159365.2159425 ; *Social Story Worlds with Comme il Faut*: https://mtreanor.com/publications/TCIAIG-CiF.pdf ; *Paradise: Extending the Ensemble Social Physics Engine with Language Models* (FDG 2024): https://dl.acm.org/doi/10.1145/3649921.3659841
- Evans en Short, *Versu, a simulationist storytelling system* (2013): https://emshort.blog/2013/02/14/introducing-versu/
- Riedl en Bulitko, *Interactive Narrative: An Intelligent Systems Approach*, AI Magazine 2013: https://onlinelibrary.wiley.com/doi/abs/10.1609/aimag.v34i1.2449 ; Roberts en Isbell, survey van drama management: https://www.researchgate.net/publication/228926772_A_survey_and_qualitative_analysis_of_recent_advances_in_drama_management
- Park e.a., *Generative Agents* (2023): https://www.emergentmind.com/topics/generative-agents-smallville ; *Affordable Generative Agents* (2024): https://arxiv.org/pdf/2402.02053
- Gervás e.a., *Schemas for Narrative Generation Mined from Existing Descriptions of Plot* (Propp, Polti, Booker): https://drops.dagstuhl.de/entities/document/10.4230/OASIcs.CMN.2015.54
- RimWorld-storytellers en de Left 4 Dead-director: https://boardgamegeek.com/videogame/158370/rimworld en https://left4dead.fandom.com/wiki/The_Director
- Nemesis-systeem, GDC 2018: https://www.gdcvault.com/play/1025150/Helping-Players-Hate-(or-Love) en https://www.gamedeveloper.com/design/designing-i-shadow-of-mordor-i-s-nemesis-system
- Dwarf Fortress, interview met Tarn Adams: https://www.gamedeveloper.com/design/interview-the-making-of-dwarf-fortress

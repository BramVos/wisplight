# Changelog

## M10.30 deel: de kroniekverteller maakt een quest in het spel, 30 september 2026

- **Een verzoek wordt een quest (7).** Vraagt iemand je in een gesprek iets te doen ("Could you go and look at them for me?"), dan is dat een feit van gewicht 3, en dat wekt de nachtronde. Heeft die persoon geen eigen quest of verzoek lopen en is er plek in de streek, dan schrijft de kroniekverteller na de nachtronde één quest: stadia, wat je per stadium moet doen, wat ieder weet en wat het verhaal verborgen houdt. Dat gebeurt hooguit één keer per nacht en nooit twee keer voor hetzelfde verzoek. Bij Doorspelen staat de quest meteen in de wereld en vraagt de persoon het je de volgende keer dat je praat. Bij Meedenken komt hij als haak in de ochtend, bij Regisseur als voorstel. Zo pakt het spel een opdracht als die van Ilyan op, ook in een wereld die zijn verhalen al heeft.
- **Niet vijf door elkaar.** De wereldknop `story.quests_active` (standaard 2) begrenst hoeveel quests er per streek tegelijk lopen, naast de hoofdlijn. Een quest die daarboven zou beginnen, wacht. Skerrow zet hem op 1.
- **Wat de nachtronde ziet.** Per verhaallijn krijgt de ronde de herinneringen van gesprekken sinds de vorige ronde die de lijn raken, de nieuwste tien, in de woorden van de mensen zelf. De hele geschiedenis gaat er niet in. Een geheim dat iemand je vertelt, is ook een feit van gewicht 3, maar niemand anders hoort het, dus het gaat niet rond.

Testen: praat in The Quiet Reach met Ilyan tot hij je vraagt de opnamen op te halen, slaap een nacht, en praat dan weer met hem. Met het mockmodel gaat het net zo met Harmen in de Nethermarch. Tests in `tests/m1030night.test.ts` en `tests/m1030made.test.ts`.

Kosten: één nieuwe soort aanroep, `night_quest`, voor de kroniekverteller. Die leest alleen het eigen deel van `CHRONICLER.md`, niet de werkinstructie die elke wereld deelt. Gemeten op je sleutel met Opus 5.5 ($0,104 voor drie antwoorden, met je akkoord): 3.571 tokens invoer in de Nethermarch, $0,035 per quest. Op low gaven beide antwoorden een quest van drie stadia die het spel bouwt; het ene antwoord op medium had maar één stadium zonder commando, dus de inspanning is low. Hooguit één per speelnacht, dus bij de standaardklok hooguit 2,4 cent per uur, en alleen in een nacht waarin iemand je iets vroeg. De nachtronde zelf wordt 69 tokens langer.

Bekende gaten: een verzoek herkent het spel aan de woorden ("could you", "I need you to") of aan de notitie van de spreker, niet aan betekenis. De Quiet Reach heeft nog geen geschreven verhalen, dus daar is dit voorlopig de enige manier waarop Ilyans opdracht een quest wordt.

Wat de editor en de kroniekverteller leerden: de knop `story.quests_active` staat onder Knobs en in `docs/KNOBS.md`, en de stap Verhalen noemt hem (andere sessie). De quest van de nachtronde gebruikt dezelfde vorm als de stap Verhalen, dus er is niets nieuws voor de wereld zelf.

Ontwerp: functioneel ontwerp, bij de quests, alinea "Stand na M10.30: de kroniekverteller maakt een quest in het spel".

## M10.30 deel: de stap Verhalen, 30 september 2026

- **Een stap Verhalen in de wereldbouw.** Na Signalen staat nu de stap Stories. Die vraagt je maar drie dingen: de verborgen waarheid van de hoofdlijn, wat je niet wilt, en of je zelf een lijn wilt schrijven. Je antwoord komt in `CHRONICLER.md`. De rest haalt de kroniekverteller uit je wereld: de opdracht van de vreemdeling, en wat de mensen willen, verbergen en aan wie ze vastzitten.
- **Hoe vol.** In de stap kies je omtrek (één kleine lijn per nederzetting), verhaal (ook de hoofdlijn) of vol (ook een persoonlijke lijn voor wie het meest telt). Dat zijn dezelfde drie standen als de verhaalknop in het spel.
- **Wat eruit komt.** Quests zoals die van de Nethermarch, als voorstel om te accepteren. Elk stadium zegt wat je nu kunt doen en wat elke betrokkene weet. De hoofdlijn begint bij de start, houdt zijn waarheid verborgen tot het juiste stadium, en loopt af als je niets doet.
- **Onder Check.** Een wereld zonder quests krijgt nu de regel "This world has no stories". The Quiet Reach krijgt die dus, tot punt 4 zijn verhalen maakt.

Testen: open de editor (`npm run editor`), kies The Quiet Reach, New world, [Build further on The Quiet Reach] en stap 13, Stories. Zonder sleutel werkt het niet in de app; in de browser (`npm run web` met `?editor=1&mock=1`) zie je een voorstel met de mock. De tests staan in `tests/m1030stories.test.ts` en `tests/m1030sketch.test.ts`.

Kosten: geen nieuwe soort aanroep; de stap gebruikt de streekronde. Voor The Quiet Reach zijn dat bij "verhaal" twee aanroepen (Port Vesper en de hoofdlijn), naar schatting samen $0,30, en bij "vol" ongeveer $0,40. Het echte getal komt met punt 4, als jij akkoord geeft om de verhalen van The Quiet Reach op je sleutel te maken.

Bekende gaten: een klok voor de hoofdlijn (`timer`) schrijft de stap nog niet, alleen wat er gebeurt als je niets doet (`lapses`). Een quest die de controle niet haalt, gaat nog niet terug naar het model; dat is punt 6. De Nethermarch en Skerrow houden hun geschreven quests.

Wat de editor en de kroniekverteller leerden: de stap Stories met zijn vragen, zijn controles en de keuze voor hoe vol; de wereldgids en `docs/NEW-WORLD.md` beschrijven hem, ook de knop `story.quests_active`. De questvorm voor een model (`quests/sketch.ts`) is er één voor de streekronde, de stap en de nachtronde.

Ontwerp: functioneel ontwerp, bij het dagboek, alinea "Stand na M10.30: de stap Verhalen in de wereldbouw".

## M10.29 af: wat je speeltest van The Quiet Reach opleverde, 30 september 2026

Alle tweeëntwintig punten van M10.29 (A tot en met V) zijn af. De delen staan hieronder in tien stukken "M10.29 deel"; dit is het overzicht.

- **Gesprekken die kloppen.** Wie je niet kent, begroet je als nieuw. Woorden zijn geen daden: een belofte, een overhandigd ding of een tijd zonder aanbod wordt opnieuw gevraagd, en een tijd die de spreker zelf noemt ("in ten minutes", "after my shift") wordt een afspraak. Een spreker praat over zichzelf als ik, en improviseren verzint geen verleden.
- **Het dagboek.** Waarom je hier bent en wie je van vroeger kent. Wat iedereen weet, met RECALL. Per persoon About en History met elk gesprek. Plekken met wat ze verkopen, en namen zonder titel.
- **Commando's.** Wat je draagt komt eerst, Tab vult aan, en GO en WALK TO verstaan jouw woorden ("go outside", "go common room", "walk to 5,6" van binnen). Een onbekend werkwoord zegt wat wel kan.
- **Het scherm.** Een plattegrond van hier boven de streekkaart, de laatste regels in beeld na een herstart, de cursor in het invoerveld, en de klok stil zolang een afgelopen gesprek openstaat.
- **Achter de schermen.** Het AI-logboek kan als volledig bestand naast het verhaallog, een storing wordt één keer gemeld, en je sessies van 29 september zijn nagekeken (`docs/playtest/sessions-2026-09-29-analysis.md`).

Testen, in deze volgorde, in een nieuw spel in The Quiet Reach:
- Lees de kaart bij aankomst en open Why you are here in het dagboek.
- Praat twee keer met Sana en kijk op haar pagina onder History.
- Loop door Port Vesper met de plattegrond, typ `go outside` en `walk to 5,6`, en druk Tab na "l poc".
- Sluit de app en kies Continue: je ziet de laatste regels.

Kosten: M10.29 voegde geen soort aanroep toe en liep niets op je sleutel. De metingen van vandaag horen bij M10.28.

Bekende gaten: The Quiet Reach heeft nog geen quests, dus Ilyans opdracht staat nog nergens als verhaal. Dat komt met M10.30: de kennis per stadium en de zichtbare opdracht zijn al gebouwd, de stap Verhalen en een run op je sleutel volgen. Tot er iets nieuws gebeurt, volgen de mensen daar hun rooster.

Wat de editor en de kroniekverteller leerden: achtergronden met `knows` en `how`, `common` op een onderwerp, `with` op een affordance, `verbs` op een item, `colour` op een persoon, `call` bij een titel, een beschrijving bij elk veld, en de controle op een id in tekst (zie de delen).

Ontwerp: functioneel ontwerp, de tien alinea's "Stand na M10.29".

## M10.29 deel: een storing één keer, gaan met jouw woorden, en een overhandigd ding, 30 september 2026

- **Een storing één keer (V a).** Toen de provider van 16:14 tot 16:36 elke aanroep weigerde, kreeg je vier keer dezelfde vaste regel met de technische reden erbij. Nu zegt het gesprek één keer: "The link to the model is down. Until it is back, people answer from what the game knows of them." Daarna antwoorden de regels dertig seconden lang zonder het model te vragen, en dan probeert het gesprek het stil opnieuw. Werkt het weer, dan staat er één keer "The link to the model is back." De gateway koelt nu dertig seconden af in plaats van twee minuten. In de terminal gaat het net zo.
- **Gaan met jouw woorden (V b).** `go outside` neemt de uitgang naar buiten, ook als die niet `out` heet. `go common room` en `walk to common room` vinden de Commons, op de woorden van de naam, de andere namen en de samenvatting. `walk to workshop` vanuit de Commons gaat door de deur en niet over land eromheen. Van binnen loopt WALK eerst naar buiten: `walk to 5,6` in de Workshop werkt, en in de speeltest loopt `walk to veenhoek` nu uit Lubberts winkel over het jaagpad naar huis. `sit` en `fly` zeggen wat hier wel kan: de uitgangen, wie er is en wat de dingen doen.
- **De dokters (V c).** F had dit al opgelost: ze heten Ilyan en Edda, en `talk dr` vraagt welke je bedoelt.
- **Een ding over de tafel (V d).** "Niko slides his notebook across" is nu een daad, net als "hands you". Zonder aanbod vraagt de bewaker opnieuw. Een uitgestoken hand blijft gewoon een groet.
- **Waarom het brein 's middags stil was (V e).** Het stond niet uit en de rem greep niet in. In The Quiet Reach vraagt niemand het brein iets zolang er niets nieuws is om over te kiezen: nieuws over hen, een gedachte, een open verzoek, een lopend plan, een lage behoefte of een signaal. De wereld begint zonder nieuws en je gaf 's middags geen WAIT. 's Avonds kwamen de eerste keuzes op een ochtend nadat je gepraat van de middag was rondgegaan. Zo is het bedoeld (M8.2, zuinig). Met de verhalen van M10.30 krijgen de mensen wel iets om over te kiezen. De 242 hersenaanroepen tussen 16 en 18 uur in het kostenregister waren de proefritten van de andere sessie in de Nethermarch en op Skerrow, van vóór de kolom die zegt waar een aanroep vandaan komt.

Testen:
- Zet je internet even uit tijdens een gesprek, praat verder, en zet het na een halve minuut weer aan.
- In Port Vesper: `go outside` in de Commons, `go common room` in de Workshop, `walk to 5,6` in de Workshop, en `sit`.
- Test in `tests/m1029v.test.ts`.

Kosten: geen nieuwe soort aanroep. Een storing kost minder: na de eerste mislukte aanroep volgen er dertig seconden geen.

Bekende gaten: een plek in dezelfde nederzetting die je nooit zag, kun je met WALK TO nog niet vinden; GO met de richting werkt wel.

Wat de editor en de kroniekverteller leerden: niets, want een wereld kan niets nieuws bevatten.

Ontwerp: functioneel ontwerp, bij het dagboek, alinea "Stand na M10.29: een storing één keer, en gaan met de woorden van de speler".

## M10.28 af: wat een uur en een zin kosten, 30 september 2026

Alle tien punten van M10.28 zijn af. De delen staan hieronder in drie stukken "M10.28 deel"; dit is de optelsom.

- **Een uur spelen** kost met jouw modellen ongeveer $0,42 bij 1 seconde per spelminuut, $0,19 bij 4 (de standaard) en $0,15 bij 8. Na M10.27 was het $0,51 bij 1 seconde.
- **Een zin in een gesprek** kost $0,0021 in plaats van $0,0035. Dat komt van het gesprek per gebied als berichten, een uur in de cache, één antwoordschema per soort en de zinnen die de motor zelf beantwoordt.
- **De stem blijft Haiku 4.5.** gpt-5-mini gaf 11 van de 24 bruikbare antwoorden en was trager.
- **De regels van het gesprek** zijn opnieuw gemeten en blijven: 24 van de 24 antwoorden bruikbaar, karakter 0,98 tot 1,00, leesscore 0,75 tot 0,85 (was 0,76).

Testen: speel een uur met je sleutel op de standaardklok en kijk onder Instellingen > AI wat het kostte. Het zou rond $0,19 moeten liggen.

Bekende gaten: de prijzen per uur zijn opgeteld uit gemeten aanroepen maal hoe vaak ze komen (`docs/worldbuild/cost-measure.md`), niet uit een uur echt spelen. Een echt uur met veel praten kost meer, een uur reizen minder.

Wat de editor en de kroniekverteller leerden: de klok als wereldknop in de stap Kalender, en minuten op een weg naar iets wat gebouwd wordt (zie de delen).

Ontwerp: functioneel ontwerp, de vier alinea's "Stand na M10.28" (het gesprek per gebied; hoe snel de dag gaat en de stem vergeleken; wat de regels zelf beantwoorden; één schema per soort en de regels van het gesprek).

## M10.29 deel: het AI-logboek als bestand, 30 september 2026

- **Elke aanroep heel.** Onder Instellingen > Advanced staat de knop `ai_log_full`. Staat die op 1, dan schrijft de app elke aanroep van een model onafgekapt weg naar `logs/ai-<spel>-<datum>.md` in de map van de app, één bestand per spel en per dag. Per aanroep staan erin: de tijd, de soort, het model, de kosten, de cache, de seconden, het vaste deel, het gesprek tot nu toe, de prompt en het antwoord. Wat de bewaker met het antwoord deed, staat eronder. Een sleutel komt er nooit in.
- **Voor jou staat hij aan.** Ik heb hem in je `knobs.json` op 1 gezet. Het bestand groeit met enkele megabytes per uur spelen; zet hem op 0 als je het niet meer nodig hebt.
- **Met de export mee.** `log export` schrijft naast het verhaallog een tweede bestand (`<naam>-ai.md`) met de aanroepen van dezelfde periode.

Testen: speel een kwartier met je sleutel. Open `~/Library/Application Support/Wisplight/logs/` en lees het bestand van vandaag naast `log export`. De test staat in `tests/m1029ailog.test.ts`.

Kosten: geen; het is alleen schrijven.

Bekende gaten: de periode van de export wordt vertaald naar echte tijd, vanaf de eerste regel van het verhaallog in die periode. Aanroepen die ervoor vielen maar bij dezelfde speldag horen, komen niet mee.

Wat de editor en de kroniekverteller leerden: niets; dit is de app. Een aanroep uit de editor komt, met de knop aan, in een eigen bestand (`ai-editor-<datum>.md`).

Ontwerp: functioneel ontwerp, bij het dagboek, alinea "Stand na M10.29: het AI-logboek als bestand naast het verhaallog".

## M10.29 deel: een plattegrond van hier, 30 september 2026

- **De plattegrond.** In een dorp, stad, gehucht of herberg met meer dan één plek staat boven de kaart een plattegrond van de plekken die je kent. Noord is boven. Waar je bent, is gevuld. Een plek waar je alleen van hoorde, is grijs met een vraagteken. Een weg die je nog niet nam, is een stippellijn. Klik op een plek waar je was, en je loopt erheen.
- **Mensen in kleur.** Wie je sprak, staat als gekleurde stip bij de plek waar je die persoon het laatst zag. Dezelfde kleur staat rechtsboven op de pagina van die persoon in het dagboek en bij de naam in het gespreksvenster. De kleur komt uit het spel zelf; een wereld mag er per persoon een kiezen.
- **Als tekst.** `plan` geeft de plattegrond als tekening in tekst. Dezelfde tekening staat op de pagina van het gebied in je dagboek.
- **Lopen binnen.** `walk to <plek>` loopt nu ook binnen een nederzetting naar een plek waar je was, langs de uitgangen.

Testen: begin The Quiet Reach en kijk rechts boven de kaart. Loop naar de Commons, de Guest Quarters en de Medical Bay, en klik op de Arrival Lock. Praat met Sana en kijk naar de stip. Typ `plan`, en open Port Vesper in je dagboek. De test staat in `tests/m1029plan.test.ts`.

Bekende gaten: de stip komt pas als het spel heeft vastgelegd dat je iemand zag. Dat gebeurt elk kwartier dat jullie op dezelfde plek zijn, niet op het moment dat het gesprek begint. De Workshop hoort bij een ander gebied (Vesper Works) en staat daarom niet op de plattegrond van Port Vesper, alleen als stippellijn naar het oosten.

Wat de editor en de kroniekverteller leerden: het personenformulier heeft een veld Colour, de stap Mensen van de wereldgids noemt `colour` (met een regel onder de controles), en `docs/NEW-WORLD.md` zegt wat er gebeurt als je hem weglaat. Het contract beschrijft het veld. Maren op Skerrow heeft een eigen kleur; Deepwell laat hem weg, en een test speelt de kleur uit het id.

Ontwerp: functioneel ontwerp, bij het dagboek, alinea "Stand na M10.29: een plattegrond van hier".

## M10.30 deel: wat mensen per stadium weten, en wat je nu kunt doen, 30 september 2026

- **Ieder zijn eigen stuk (2).** Een stadium van een quest zegt per persoon wat die weet en mag zeggen (`knows`). Dat gaat naar de stem, met de regel dat dit alles is wat ze ervan weet. Improviseren op een plek van de quest krijgt dezelfde regels. Zo vertellen Niko en Tessa straks niet elk hun eigen plot.
- **Wat een verhaal verborgen houdt.** Een quest kan waarheden hebben (`truths`), met de woorden waaraan je ze herkent en vanaf welk stadium of welke voorwaarde ze gezegd mogen worden. Noemt een antwoord of een improvisatie er eerder een, dan vraagt de bewaker opnieuw. Wat het spel die spreker zelf gaf, mag wel: de eigen regel, een geheim dat die persoon je vertelde, of een ander deel van het gesprek. Jouw eigen gok telt niet.
- **Wat je nu kunt doen (3).** Een stadium heeft een `goal`. De questpagina eindigt met "Now: Find out what happened to Fenna Visser.", en `quests` (of `opdrachten`) toont wat openstaat en wat voorbij is, met de verzoeken erbij. `journal grey cat` vindt de pagina van een quest.
- **Waar het al in zit.** De grijze kat in de Nethermarch: Grietje, Jan, Pim en de weduwe hebben elk hun stuk, en niemand zegt dat de kat Fenna is voordat jij het ontdekt hebt. De weduwe zegt het pas als ze haar geheim prijsgeeft. Op Skerrow weet elke eilandbewoner een stuk van hoe je wegkomt, en de sleutel blijft in de grafheuvel tot je hem hebt. Deepwell speelt zonder, zoals voorheen.
- **De gespreksregels opnieuw gemeten.** Met je akkoord, voor $0,13 op Haiku: 24 van 24 bruikbaar, karakterscore 0,982 / 1,000 / 1,000 (zoals zonder de regels) en een hogere leesscore (0,75 tot 0,85). Mirte blijft twintig zinnen lang "lamb" zeggen. De regels blijven.

Testen:
- Start de Nethermarch, praat met Grietje in het Vissershuis en vraag naar Fenna. Typ daarna `quests` en open de quest in het dagboek.
- Vraag Grietje of Jan of de kat Fenna is: ze weten het niet. Met een model zie je in het AI-logboek een afgewezen antwoord als het model het toch zegt.
- Op Skerrow: `quests`, en vraag Maren hoe je van het eiland komt.
- Test in `tests/m1030story.test.ts`.

Kosten: geen nieuwe soort aanroep. Wie een regel in een stadium heeft, krijgt die één keer per gesprek, een zin of twee. Het contract voor de kroniekverteller wordt ongeveer 240 tokens langer (in het deel dat in de cache staat).

Bekende gaten: The Quiet Reach heeft nog geen quests, dus daar merk je het pas met punt 4 (de stap Verhalen van de andere sessie en een run op je sleutel). De wereldgids en `docs/NEW-WORLD.md` leren de velden met die stap.

Wat de editor en de kroniekverteller leerden: het sjabloon voor een quest heeft `goal`, `knows` en `truths`; onder Check staat een fout bij `knows` van iemand die niet bestaat, bij een waarheid met een onbekend stadium of een kapot patroon, en een waarschuwing als het verzoek of een dagboekregel een waarheid al te vroeg zegt; het contract (`docs/CONTENT.md` en de korte versie voor de schrijfhulp) beschrijft de drie velden.

Ontwerp: functioneel ontwerp, bij de quests, alinea "Stand na M10.30: wat mensen per stadium weten, wat een verhaal verborgen houdt, en wat je nu kunt doen".

## M10.29 deel: verder spelen met de laatste regels in beeld, 29 september 2026

- **Verder spelen.** Na een herstart was het venster leeg op "You pick up where you left off.". Nu staan bij Continue en bij het laden van een save eerst de laatste regels van je spel in beeld: wat je typte en wat het spel zei, de gesprekken meegerekend. Ze staan vervaagd, met de dag erboven ("Earlier, Primeday 18:") en een stippellijn eronder. Bij een geladen save zijn het de regels tot aan die save.
- **Hoeveel regels.** Standaard 40. Je zet het onder Instellingen > Advanced bij `recall_lines`; 0 zet het uit.
- **Ook in de terminal.** `npm run play` houdt nu een eigen log bij en toont die regels bij LOAD.

Testen: speel een paar minuten, sluit de app en start hem opnieuw met Continue. Of laad een oudere save via [Load a save...]. De test staat in `tests/m1029resume.test.ts`.

Kosten: geen; er komt geen model aan te pas. Het log wordt van achteren gelezen, dus een spel van maanden opent even snel.

Bekende gaten: in de browserversie (`npm run web`) is er geen log op schijf. Alleen de saves in het geheugen van `?mock=1` geven de regels mee. De knop heet `recall_lines` en niet `screen.recall_lines`, omdat de andere appknoppen ook platte namen hebben.

Wat de editor en de kroniekverteller leerden: niets; dit is de app, niet een wereld.

Ontwerp: functioneel ontwerp, bij het dagboek, alinea "Stand na M10.29: verder spelen met de laatste regels in beeld".

## M10.29 deel: de commando's uit je log, 29 september 2026

De ontwerpsessie las je log van vandaag. Dit zijn de dingen die aan de commando's lagen:
- **`wait niko`** betekent nu `wait for niko`. Het telde als tien minuten wachten.
- **FOLLOW binnen.** Op een plek zonder rand, zoals Ridge Shelter, bood FOLLOW de paden aan en weigerde ze daarna. Nu noemt het per weg de uitgang ernaartoe ("the path to Orison Ridge north: up from here"), en je kiest met een nummer. Een pad dat naar de plek zelf heet, heet naar zijn richting.
- **`hold`** zei "This world has no rules for characters". In een wereld zonder personages antwoorden die werkwoorden nu zoals elk onbekend werkwoord.
- **Wat je wel kunt.** `poke tessa`, `touch edda`, `operate cabinet`: een werkwoord dat het spel niet kent, op iemand of iets wat er is, zegt nu wat je wel kunt ("You could talk to her, look at her or give her something."). `read` op iets zonder tekst zegt dat er niets op staat.
- **Afgekorte namen.** "open cab" vindt het kastje. Een woordbegin van drie letters of meer telt, behalve als het iemands naam is.
- **`l 8`** kiest nummer 8 uit de lijst die net openstond, ook als je er één andere opdracht tussen typte.

Testen: ga in The Quiet Reach naar Ridge Shelter en typ `follow`, `open cab`, `read cab` en `hold`. Typ in de Workshop `l x`, dan `time` en dan `l 2`. De tests staan in `tests/m1029small.test.ts`.

Bekende gaten: een afgekorte naam werkt voor voorwerpen en details, niet voor mensen. `talk ma` vindt Mara nog op de oude manier, en met twee mensen die erop passen vraagt het spel wie je bedoelt.

Wat de editor en de kroniekverteller leerden: niets nieuws; dit zijn regels van de motor die voor elke wereld gelden.

Ontwerp: functioneel ontwerp, bij het dagboek, alinea "Stand na M10.29: Tab, de cursor en de kleine dingen van de commando's".

## M10.29 deel: de persoonspagina in twee tabbladen, en drie dingen uit je log, 29 september 2026

- **About en History (R).** De persoonspagina in het dagboek heeft nu twee tabbladen. About is wat je van iemand weet: het kaartje, wat die persoon je vertelde ("Sana told you: ..."), wat er tussen jullie staat ("Between you: ..."), wat ze je vroeg, en de laatste regel van het laatste gesprek ("Last time: ..."). History heeft elk gesprek zoals het ging, per dag met de nieuwste bovenaan, één blok per gesprek. De ring houdt nu 200 regels per persoon in plaats van 40, en een ouder gesprek valt er als geheel uit. Niets daarvan gaat naar het model. In de terminal geeft `journal sana` de pagina en `journal sana history` elk gesprek; HELP noemt beide.
- **Een tijd in de woorden van de spreker (T d).** "Meet me at the hangar in ten minutes" wordt nu een afspraak, net als "in half an hour", "at first light", "at dusk" en "after my shift". Dat laatste rekent vanaf het rooster van de spreker.
- **Een spreker die over zichzelf praat als over een ander (T e).** "Niko didn't mention it. He's been worried", gezegd door Niko, wordt afgewezen en opnieuw gevraagd.
- **Improviseren verzint geen verleden (T i).** `check antenna` zegt wat je ziet, niet wat er drie weken geleden gebeurde of waarom. Wat een verhaal op dat moment vrijgeeft, komt met M10.30.

Testen:
- Praat twee keer met iemand, open het dagboek, kies die persoon en klik op History.
- Typ `journal <naam>` en `journal <naam> history`.
- Laat iemand een afspraak voorstellen "in ten minutes" of "after my shift" en zeg ja; kijk bij `promises`.
- Tests staan in `tests/m1029earlier.test.ts` en `tests/m1029talk.test.ts`.

Kosten: geen nieuwe soort aanroep. History gaat nooit naar het model; de save wordt per persoon hooguit 200 regels groter.

Bekende gaten: regels uit een save van voor vandaag weten niet bij welk gesprek ze horen. History neemt daarom regels die binnen twintig minuten na elkaar vielen samen als één gesprek.

Wat de editor en de kroniekverteller leerden: niets, want een wereld kan niets nieuws bevatten. De knop `talk.kept_lines` staat met zijn nieuwe standaard in `docs/KNOBS.md`.

Ontwerp: functioneel ontwerp, bij het dagboek, alinea "Stand na M10.29: de persoonspagina in twee tabbladen".

## M10.29 deel: de werkbank, wat je draagt, nooit een id in tekst, de cursor en Tab, 29 september 2026

- **De werkbank.** Werk dat niets maakt, zoals een lamp nakijken, zegt geen "You have ." meer. Mislukt het, dan staat er "Nothing comes of it this time." en geen verhaal over verspild materiaal. Een les bij Tessa kan alleen als Tessa aan de bank staat en wakker is ("Tessa is not here."). Na drie mislukkingen op rij is de soldeerbout oververhit en rust het werk een uur. Op Skerrow rust het zalf maken anderhalf uur na drie mislukkingen.
- **Wat je draagt.** Gebruiken, lezen, pakken en kijken zoeken eerst in je rugzak, dus `use short-range communicator`, `read terminal` en `get pocket terminal from pack` werken. Kijken naar iets wat je draagt, zegt wat je ermee kunt. Niko heeft zijn notitieboek echt bij zich, en je kunt het lezen zodra het van jou is. Een lamp die je draagt, kun je gebruiken.
- **Uit je sessies van vandaag.** `l s` en `l w` gaven de communicator en de jas in plaats van de richting. Dat kwam door de rugzak-eerst van hierboven en is hersteld: een richting gaat voor, en een woord van één of twee letters vindt alleen een heel woord. `talk dr` en `look dr` met beide dokters in de kamer vragen nu wie je bedoelt. Kijken naar iemand begint met een hoofdletter.
- **Nooit een id in tekst.** "The stranger is a journeyman npc_tessa_rook now" komt niet meer voor. Het ambacht van The Quiet Reach heeft als maker "field technician", en de titel van een ambacht valt nooit meer terug op een id. De contentcontrole weigert een id in elk tekstveld dat je leest, ook in de stemkit. De groei en de kroniekverteller laten zo'n tekst niet door, en de wereldbouw stuurt zo'n voorstel terug met de reden. De test las zijn eigen opnames na en vond dezelfde fout in een streek van de Nethermarch (`maker: npc_trees_driestromen`).
- **Tab vult aan.** In het invoerveld en in het gespreksvenster vult Tab het laatste woord aan uit wat je kent: de namen in je dagboek, de mensen hier, de uitgangen en de dingen in de kamer en in je rugzak. "l poc" wordt "l pocket terminal", en "ter" vindt ook het terminal. Past er meer dan één, dan vult Tab aan tot waar ze gelijk zijn, met een regel met de keuzes erboven. Iemand die je nog niet sprak, staat erin als wat hij lijkt te doen ("port coordinator"), niet met zijn naam. Shift-Tab springt nog steeds naar het volgende veld.
- **De cursor in het invoerveld.** Zodra er niets meer over het spel ligt, staat de cursor in het invoerveld. Dat geldt ook na Instellingen, het einde en de logexport, waar hij eerder wegbleef. Een scherm dat nog openstaat, zoals het maken van een personage, houdt zijn eigen eerste veld. De smoke test zegt nu waar de focus staat.
- **Elk veld zegt wat erin hoort.** Alle 457 velden van alle soorten hebben nu een beschrijving in het schema. `docs/CONTENT.md` toont die in een eigen kolom, en de kroniekverteller krijgt ze bij elke stap van de wereldbouw achter de velden. Een nieuw veld zonder beschrijving laat de tests falen.

Testen:
- Start The Quiet Reach en typ `use short-range communicator`, `l terminal`, `read terminal`, `l s` en `l e`.
- Ga naar de werkbank in de Workshop, probeer `use electronics bench learn` met en zonder Tessa erbij, en laat het werk drie keer mislukken.
- Zet beide dokters in één kamer (of wacht tot ze samen eten in de Commons) en typ `talk dr`.
- Typ `l poc` en druk op Tab; typ in een gesprek "tell me about the ar" en druk op Tab.
- Open en sluit Instellingen, het dagboek en een gesprek, en typ meteen verder zonder te klikken.
- Lees de kolom "what it holds" in `docs/CONTENT.md`.
- Tests staan in `tests/m1029bench.test.ts`, `tests/m1029carried.test.ts`, `tests/m1029ids.test.ts`, `tests/m1029names.test.ts` en `tests/m1029tab.test.ts`.

Kosten: er is geen nieuwe soort aanroep. De stappen van de wereldbouw worden 2.000 tot 6.000 tekens langer door de beschrijvingen, ongeveer 11% over een hele wereldbouw. Dat is een paar procent van de $2,84 die The Quiet Reach kostte, en het zijn precies de woorden die de fout met `maker` hadden voorkomen.

Bekende gaten: de opgenomen wereldbouw van The Quiet Reach heeft in de stap Economie nu een correctie die met de hand is geschreven (in de fixture gemarkeerd als `hand`), omdat er geen echt antwoord op de nieuwe terugvraag is opgenomen. Een verwijzing naar een id die niet bestaat, wordt gecontroleerd waar dat al gebeurde, niet opnieuw voor elk veld.

Wat de editor en de kroniekverteller leerden:
- Onder Check staat een regel bij werk waarvan de tekst iemand noemt zonder `with` of `access: staff`, en een regel bij elk id in een tekst.
- De stap Economie van de wereldgids en `docs/NEW-WORLD.md` zeggen wat `maker` is, wat `with` doet, en wat `crafts.fail_cooldown` met `cooldown_text` doet. De stap Mensen zegt dat een item `verbs` kan hebben.
- De schrijfhulp weet dat een naam, maker, beschrijving of regel woorden zijn en nooit een id.
- Skerrow heeft een rusttijd voor het zalf maken en een hoorn die je kunt blazen.

Ontwerp: functioneel ontwerp, bij het dagboek, alinea "Stand na M10.29: de werkbank, wat je draagt, en nooit een id in tekst".

## M10.29 deel: waarom je hier bent, wat iedereen weet, eerdere gesprekken, de weg en luisteren, 29 september 2026

- **Waarom je hier bent (C).** De intro van de wereld komt bij een nieuw spel als kaart. Het dagboek heeft een pagina Why you are here met de intro, je reden, wie je moet vragen en wat je hoorde. Wie je van vroeger kent, zegt het spel één keer bij aankomst, met hoe ("you worked a winter together in the infirmary at Harrow Station"); zijn pagina zegt het, en hij weet het zelf ook. The Quiet Reach heeft nu de vijf specialismen uit je kader, allemaal door Sorell gestuurd. Je bent eerst systems engineer; `background signal linguist` (of een ander) kiest één keer. Vijf plekken hebben een aankomstkaart: de sluis, de Commons, de hangar, de luisterkamer en het kustpad.
- **Wat iedereen weet (P).** De Nacreans, de Beltborn, de Transit Families, het Compact en het Belt-krediet staan vanaf het begin in je dagboek onder What you know of the world. `recall nacreans` (of `remember`) zegt wat je ervan weet. In de editor is het een vinkje in een nieuw formulier voor onderwerpen, en Check noemt een volk of het geld zonder onderwerp.
- **Eerdere gesprekken (J).** Het gespreksvenster toont het vorige gesprek vervaagd bovenaan, en de persoonspagina heeft Last talks per dag. Niets daarvan gaat naar het model.
- **De weg (H).** Vraag je de weg of naar iemand, dan krijgt de spreker de richting en de looptijd, of waar hij denkt dat die persoon nu is. Een kade of deur verzinnen mag niet meer. Sana zet Sorell niet meer vast op het schip.
- **Luisteren (L).** De eerste keer dat twee mensen praten staat er "(LISTEN to catch it.)", en HELP noemt het.
- **Je sessies van vandaag (Q).** Die staan nagekeken in `docs/playtest/sessions-2026-09-29-analysis.md`. Eén fout heb ik meteen hersteld: zes antwoorden van Mara die met "He'll" begonnen, werden weggegooid als "zegt niets hardop".

Testen: begin The Quiet Reach en kijk naar de kaart, `journal` en Why you are here. Probeer `background expedition medic`, praat met Edda, en typ `recall credits`. Praat twee keer met iemand en kijk bovenin het venster. Vraag `how do I get to the hangar?`. Tests in `tests/m1029why.test.ts`, `m1029recall.test.ts`, `m1029earlier.test.ts`, `m1029way.test.ts` en `m1029listen.test.ts`.

Bekende gaten: er is geen apart keuzescherm voor een achtergrond in een wereld zonder klassen, alleen BACKGROUND en de pagina. De Nethermarch en Skerrow hebben nog geen onderwerpen voor al hun volken en munten (Skerrow wel); Check noemt ze.

Wat de editor en de kroniekverteller leerden: `knows` met `how` en achtergronden zonder vaardigheden (sjabloon, contract, stap Mensen); `arrival` in de stap Plekken; `common` in de stap Kader, het contract en het formulier; de knop `talk.kept_lines` staat vanzelf bij de knoppen. Skerrow heeft zijn eigen versie van alles, Deepwell speelt de standaard.

Ontwerp: functioneel ontwerp, alinea "Stand na M10.29: waarom je hier bent, wat iedereen weet, eerdere gesprekken, de weg en luisteren".

## M10.28 deel: één schema per soort, en de regels van het gesprek, 29 september 2026

- **Eén antwoordschema per soort aanroep.** Dat is nu een regel in `CLAUDE.md`. Anthropic zet het schema vóór het vaste deel in de cache, dus een schema dat per zin verandert, liet de helft van de zinnen niets uit de cache lezen. Na de fix kostte het gesprek van twintig zinnen $0,049 in plaats van $0,19. Het groepsgesprek, de vonk en de nachtronde zijn ook omgezet, en een test bouwt elke soort in twee situaties.
- **Regels na de leesscore.** Een verhaal vertel je in eigen woorden; opzeggen wordt opnieuw gevraagd. Ongeveer één antwoord op drie eindigt met een wedervraag, als het bij iemand past. De aanspreekvorm blijft het hele gesprek dezelfde. Tijd en afstand uit de stemkit zijn stijl, en "is it far?" krijgt de looptijd van de laatst genoemde plek.

Testen: praat met Mirte over de Haakman en daarna over brood; let op "lamb" en op een vraag terug. Tests in `tests/m1028schema.test.ts` en `tests/m1028talkrules.test.ts`.

Bekende gaten: geen meer. De herhaling op Haiku is gedaan met je akkoord ($0,13, f87f887): 24 van de 24 antwoorden bruikbaar, karakter 0,98 tot 1,00, leesscore 0,75 tot 0,85. De regels blijven. Skerrow hoeft zijn blok niet op te vullen (cfdabb7).

Ontwerp: functioneel ontwerp, alinea "Stand na M10.28: één schema per soort, en de regels van het gesprek na de leesscore".

## M10.28 deel: hoe snel de dag gaat, gpt-5-mini tegen Haiku, en wat de regels zelf beantwoorden, 29 september 2026

- **Hoe snel de dag gaat.** Een spelminuut duurt nu 1 tot 8 echte seconden, en standaard 4, een dag van anderhalf uur. Voorheen was het 1 seconde, een dag van 24 minuten. Een wereld zet haar eigen snelheid bij de stap Kalender: The Quiet Reach 4, Skerrow 5. Op het kaderscherm staat een schuif "How fast the day goes" met de daglengte, wat een uur ongeveer kost, en een knop terug naar de snelheid van de wereld. In de terminal is het `FRAMES CLOCK 8`. Slapen, wachten en reizen springen zoals altijd.
- **Wat een uur kost, per stand.** Met jouw modellen en het nieuwe gesprek: ongeveer $0,42 bij 1 seconde, $0,19 bij 4 en $0,15 bij 8. De doelkeuzes en de nachtronde lopen mee met de klok, het praten niet. De richtprijs in de instellingen rekent nu ook wat uit de cache komt.
- **Doelkeuzes uit de cache.** Anthropic zet het antwoordschema in de cache vóór de rest van het verzoek. Omdat het schema van elke persoon anders was, las geen enkele doelkeuze iets terug. Nu delen alle personen één schema en blijft het gedeelde deel een uur in de cache. De motor controleert het doel, het doelwit en de poort zoals altijd.
- **gpt-5-mini tegen Haiku 4.5 voor de stem.** Gemeten op het nieuwe gesprek, voor ongeveer $0,28 (de raming was $0,45):
  - Haiku: alle 24 antwoorden van de situatieset bruikbaar, karakterscore 1,000, 2 à 4 seconden per regel.
  - gpt-5-mini: 11 van de 24 bruikbaar, karakterscore 0,85. Het denkt eerst na en doet 6 tot 9 seconden over een regel, soms meer dan de 10 seconden die een antwoord krijgt. Als de bewaker opnieuw moet vragen, past dat niet meer en komt er een vaste regel.
  - Per gespreksregel kosten ze bijna hetzelfde: $0,0022 tegen $0,0020.
  - De vier kleine soorten (flarden, groepen, improviseren, reizen) werken op allebei.
- **Een leesscore naast de karakterscore.** Sonnet leest elke reeks antwoorden. Het geeft per antwoord 0 tot 3 punten op vier vragen en noemt de drie zwakste. Over een heel gesprek scoort Haiku 0,76 en gpt-5-mini 0,71; gpt-5-mini begint bijna elke regel met "Mirte wipes her hands". Beide stellen weinig vragen terug.
- **Wat de regels zelf beantwoorden.** De motor beantwoordt nu zelf zonder de stem aan te roepen:
  - een groet;
  - een ja of nee na iets wat geen vraag was;
  - kopen of verkopen wat te koop is;
  - dezelfde vraag nog een keer in dezelfde woorden ("As I said: ...");
  - wie iemand is of wat hij doet.

  Zo'n regel staat in het AI-logboek als "by rule" en kost niets. In de twintig vaste regels met Mirte zijn het er drie; de verwachte een op de vier haal je alleen in een gesprek met meer groeten en ja-nee.
- **Minuten op de weg naar iets wat gebouwd is.** Een plek die een project bouwt, kreeg altijd een weg van één minuut. Nu zegt het project hoe ver het is, en anders is het drie minuten, zoals bij een wijk. De steenbakkerij van Waagdam ligt zes minuten van de haven. Een save waarin iets al gebouwd was, houdt zijn ene minuut.
- **Alle antwoorden bewaard.** Elk antwoord staat met jouw vraag ervoor in `docs/playtest/voice/2026-09-29-claude-haiku-4-5-20251001.md` en `docs/playtest/voice/2026-09-29-gpt-5-mini.md`, om naast elkaar te lezen. Het modeladvies onder Instellingen > AI toont de vergelijking bij de stem.

Je stem staat op Haiku 4.5, en dat blijft zo. Toen de meting klaar was stond hij al zo, omgezet in de app om 21:41, en je zei ja op Haiku. De ontwerpsessie las daarna de bewaarde antwoorden en bevestigde de keuze. Bij gpt-5-mini werden 13 van de 24 antwoorden een vaste regel of liepen ze uit de tijd. Het verzon namen en prijzen in het gesprek, liet Mirte in bijna elke regel het meel van haar handen vegen, en kostte per regel hetzelfde.

Kosten per nieuwe soort aanroep: de leesscore (`read_score`) kost op Sonnet 5 (low) $0,004 tot $0,013 per reeks, afhankelijk van hoeveel antwoorden ze leest. Ze gaat naar het brein, omdat het een begrensd oordeel is; ze komt alleen in een meting voor, niet in het spel.

Testen:
- Open het kaderscherm (Instellingen > [The frames of this game]) en schuif "How fast the day goes". Kijk hoe snel de klok rechtsboven loopt.
- Open Instellingen > AI. Onder VOICE staat wat er gemeten is.
- Zeg in een gesprek "Good morning." en vraag twee keer hetzelfde. Kijk daarna onder Instellingen > AI log: die regels staan er als "by rule".
- Lees de twee bestanden in `docs/playtest/voice/` naast elkaar.
- Tests staan in `tests/m1028clock.test.ts`, `tests/m1028read.test.ts` en `tests/m1028byrule.test.ts`.

Bekende gaten: gpt-5-mini is gemeten op denkinspanning low. De stand minimal zou sneller kunnen zijn, maar is niet gemeten. De leesscore van de situatieset rust bij gpt-5-mini alleen op de antwoorden die doorkwamen.

Wat de editor en de kroniekverteller leerden:
- De klok is een wereldknop, `clock.seconds_per_minute`. De stap Kalender vraagt ernaar en mag hem zetten, en een wereldpatch voegt knoppen nu samen in plaats van ze te vervangen.
- De stap Signalen zegt dat termijnen in speldagen staan en hoe lang een dag in echte tijd duurt. `docs/NEW-WORLD.md` en `docs/KNOBS.md` zeggen hetzelfde.
- Skerrow staat op 5, The Quiet Reach op 4. Deepwell laat de knop weg en speelt de standaard, en een test speelt dat.
- De leesscore is een soort in de tabel van soorten, met een situatie en een mockantwoord.

Ontwerp: functioneel ontwerp, hoofdstuk 16, alinea "Stand na M10.28: hoe snel de dag gaat, de doelkeuzes in de cache, en de stem vergeleken".

## M10.28 deel: gesprekken per gebied, als berichten, een uur in de cache, 29 september 2026

- **Eén blok per gebied.** Het vaste deel van een gesprek zijn nu de regels, het kader, de stemkit van het land, het gebied met zijn plekken (wat elke plek is en wie er wat verkoopt) en de kaarten van iedereen die er woont, met huis en werk. Dat weet elke bewoner zeker. Kleine gebieden delen een blok met hun buren: het Nethermarch heeft er twee, The Quiet Reach één. Wie spreekt en zijn eigen mensen staan in het gesprek zelf. Iemand van verder weg brengt zijn kaart mee en weet van hier alleen wat hem verteld is. Spreekt een antwoord als iemand anders uit het blok ("Harmen scowls."), dan vraagt de bewaker opnieuw.
- **Het gesprek als berichten.** Elke eerdere zin staat in de cache. Een nieuwe zin stuurt alleen wat nieuw of veranderd is: je woorden, nieuwe kennis en de keuzes van die beurt.
- **Eén schema voor elke zin.** De eerste meting liet zien dat Anthropic het antwoordschema vóór het blok in de cache zet. Dat schema noemde per zin andere onderwerpen, dus las de helft van de zinnen niets: $0,19 voor twintig zinnen. Nu is er één vast schema en controleert de engine de sleutels.
- **Een uur in plaats van pings.** De ping die het blok warm zou houden, raakt een andere plek in de cache, want een leeg verzoek mag geen schema dragen. Het blok staat daarom een uur in de cache, zonder pings. De pingknop is weer weg. Onder Usage staan nu de kosten per rol.

Gemeten op Haiku, $0,34 van je $0,50:

- Twintig zinnen met Mirte kostten $0,049. De eerste zin kost $0,012, daarna $0,0021 per zin, tegen $0,0035 voorheen.
- 94% van de invoer komt uit de cache, en een zin duurt 2 à 3 seconden in plaats van 5 à 6.
- De situatieset gaf 24 van 24 bruikbare antwoorden, met karakterscore 1,000, 1,000 en 0,982.
- Zes minuten later las een zin het blok nog uit de cache.
- Een uur spelen bij de standaardklok komt zo op ongeveer $0,20 in plaats van $0,27. Het verslag staat in `docs/worldbuild/cost-measure.md`.

Testen: speel een gesprek met Haiku als stem en kijk in het AI-logboek. De eerste zin in een streek schrijft het blok, daarna lees je "read" op bijna alles. Loop naar een buurdorp: in dezelfde groep leest de eerste zin daar het blok ook. Zelf meten kan met `npm run trial -- --kind talk_twenty --model claude-haiku-4-5-20251001`. Tests in `tests/m1028block.test.ts`.

Bekende gaten: Skerrow en Deepwell zijn samen te klein voor het minimum van Haiku. Daar gaat de cache pas vanaf de tweede of derde zin van een gesprek werken. De eerste zin in een streek betaalt de schrijfbeurt voor een uur ($0,018), ook als je er maar één ding vraagt.

Wat de editor en de kroniekverteller leerden: de stap Plekken van de wereldgids en `docs/NEW-WORLD.md` zeggen dat de samenvatting van een gebied en een plek nu in elk gesprek daar meegaat, dus één gewone zin die klopt.

Ontwerp: functioneel ontwerp, bij de kosten en de cache, alinea "Stand na M10.28: het gesprek per gebied, als berichten, een uur in de cache".

## M10.29 deel: namen, het dagboek en de kleine dingen van de interface, 29 september 2026

Uit je speeltest van The Quiet Reach, bevindingen 1, 2, 3, 3a, 8, 11, 18, 20 en 21.

- **Dr Ilyan Sorell heet niet meer "Dr".** De naam die mensen gebruiken slaat een titel over (Dr, Mr, Mrs, Ms, Prof, Sir, Dame, Fr, Capt). Een persoon kan ook `call` hebben, de naam waarmee men iemand noemt. The Quiet Reach zet Ilyan en Edda, Skerrow Old Tamsin. Onder Check staat een regel als een naam met een titel begint en er geen `call` is.
- **Je ziet de naam zodra je iemand gesproken hebt.** Het gespreksvenster en de regel Here: tonen dan "Mara Venn, the port coordinator (at work)". Daarvoor staat er alleen de rol.
- **Haken de eerste keer.** Noemt iemand een plek of persoon die hij kent, dan staat die meteen tussen haken, en niet pas de volgende keer. Mara's "guest quarters" en "medical bay" kun je dus meteen volgen.
- **Eén regel per verkoper.** De Commons zegt nu "Sana sells field rations, cups of herbal tea, cups of coffee and hot meals here, 07-20; hot meals 07-09, 12-14, 18-20." in plaats van drie keer "Sana sells hot meals here."
- **Wat je alleen van horen kent.** Een plek waar je nog niet stond, staat in het dagboek als "(heard of)", na de plekken waar je wel was. "The ship" in een gesprek wijst niet meer naar het gesloten dek van de Peregrine, en "landing pad" is de sluis.
- **Niet door een deur kijken.** `l hangar` in de Workshop toont nu de hangardeur. Kijken door een uitgang naar een plek waar je nooit stond, geeft de richting, wat je vanaf hier ziet en de looptijd. De naam komt pas als je ervan hoorde, en hoe het er is pas als je er was.
- **Klein.** Onder de afbeelding staat de naam van de plek. De klok staat stil zolang het venster van een afgelopen gesprek open is. Elke keuzelijst zegt hoe je eruit komt: "(a number, the name, or anything else to leave it)", want x is examine.

Testen: begin The Quiet Reach, praat met Mara en kijk daarna naar de regel Here:. Open de Commons in het dagboek, en Dr Sorell. Ga naar de Workshop en typ `l hangar` en `look in`. Laat een gesprek open staan na bye en kijk naar de klok. Tests in `tests/m1029names.test.ts` en `tests/m1029look.test.ts`.

Wat de editor en de kroniekverteller leerden: `call` staat in het formulier van een persoon, onder Check, in het contract (`docs/CONTENT.md`), in de stap Mensen van de wereldgids en in `docs/NEW-WORLD.md`. Skerrow heeft Old Tamsin, Deepwell speelt de standaard.

Ontwerp: functioneel ontwerp, bij het dagboek, alinea "Stand na M10.29: namen, het dagboek en kijken door een uitgang".

## M10.29 deel: wat de spreker van je weet, en woorden zijn geen daden, 29 september 2026

Uit je speeltest van The Quiet Reach, bevindingen 5, 10, 12, 13, 23 en 24.

- **Geen "There you are again" bij een eerste gesprek.** De begroeting uit de regels kijkt nu ook naar hoe goed iemand je kent. Wie je nauwelijks kent, zegt "Good evening. You'll be new here."
- **Geen gedeeld verleden met een vreemdeling.** De stem hoort nu dat jullie niets samen gedaan hebben buiten de herinneringen en dit gesprek. Een herinnering als "I showed the stranger the bunk" wordt alleen bewaard als die afspraak echt in het register staat; anders onthoudt de persoon alleen dat je sprak.
- **Een antwoord is woorden.** "Sana smiles warmly." zonder iets te zeggen wordt opnieuw gevraagd.
- **De leeftijd die iemand zelf noemt, telt.** Zegt Niko "28" over zichzelf, dan staat het op het kaartje. De schatting ("about 25 to 35?") is daar nu zelf de knop om het te vragen; het losse woord "ask" is weg.
- **Woorden zijn geen daden.** De bewaker vangt nu ook "hands you", "here, take it", "I'll be done at", "see you at", "I'll point you right" en "come on". Staat daar geen aanbod achter, dan vraagt het spel het antwoord opnieuw. Een oude fout ging mee: "I'll tell you what I know" gold als belofte.
- **Tessa's "I'll be done at seventeen thirty" wordt een afspraak.** Noemt iemand zelf een tijd en een plek, dan zie je "Tessa offers to meet you at the Commons, 17:30. YES to agree". Met ja staat de afspraak in het register: ze gaat erheen, en een gemiste afspraak is een gebroken woord aan beide kanten. Dat ze nu nog aan het werk is, staat een afspraak na haar werk niet in de weg. De tijd verstaat ook "seventeen thirty", "17:30", "half past five" en "quarter to seven".

Testen: begin een nieuw spel en praat met iemand die je nog niet kent. Vraag Tessa of Niko later iets af te spreken, en kijk op het kaartje naar de leeftijd. Tests in `tests/m1029talk.test.ts`.

Niet gedaan: het notitieboek van Niko als voorwerp, en "bunk", "sleep" en "bed" als woorden voor de Guest Quarters. Dat is content en hoort bij E.

Ontwerp: functioneel ontwerp, bij "gesprekken die de wereld raken" (M10.3), alinea "Stand na M10.29: wat de spreker van je weet, en woorden zijn geen daden".

## M10.27 af: de kosten omlaag, 29 september 2026

Een uur spelen met jouw modellen kost nu ongeveer $0,51 in plaats van $0,97. De tabel per soort staat in `docs/worldbuild/cost-measure.md`, onder "Een uur spelen voor en na M10.27". Het doel was $0,44. Wat overblijft is vooral het gesprek, en dat is M10.28.

- **Minder doelkeuzes.** Alleen mensen dicht bij je vragen het model wat ze willen: binnen 1,5 km, in jouw gebied, in een open verhaallijn of bij naam in een plan. De anderen kiezen op de regels, zoals iemand ver weg al deed. In drie speldagen gaat het van 139 naar 69 keuzes, en het dorp blijft even druk. Het deel dat alle mensen delen komt nu uit de cache. Dat scheelt $0,37 per uur. Een wereld kan de afstand zetten met de knop `people.model_km`; Skerrow zet hem op 1 km.
- **De nachtronde.** Ze leest een kortere gids en neemt het plandeel alleen mee als er iets te plannen valt. Ze draait nu op low, want daar is ze gemeten even vol als op medium: $0,072 in plaats van $0,091. Een stille nacht doet geen hele ronde meer, maar heeft een oplopende kans op een vonk: één klein onverwacht ding uit je open verhaallijnen, zoals een bezoeker, een tijding of een verzoek. De kans is 1 op 8, dan 1 op 4, dan 1 op 2 en dan altijd, en ze stijgt sneller als je al drie dagen niet verder komt in je opdracht. Zonder model doet de polswachter hetzelfde op die ladder. Skerrow klimt langzamer.
- **Elke soort een eigen inspanning.** Alle tien soorten die een tabel invullen draaien op low, gemeten op jouw sleutel: twee keer achter elkaar geladen en even vol. Een wijk werd 39% goedkoper, het palet 24% en de uitbreiding 22%.
- **Lichtere modellen waar de motor toch alles keurt.** De reistekst gaat naar het stemmodel: op Haiku $0,0010 in plaats van $0,0053, en even trouw. De grote lijnen zijn op het brein geprobeerd, maar blijven bij Opus. Sonnet liet twee keer de vloed en het veenoproer in dezelfde maand breken, terwijl de besparing maar $0,006 per spelmaand was.
- **De gespreksregel.** Regels en schema zijn samen 20% korter. De lijst van 27 soorten handelingen is weg, want die bepaalt de motor zelf. Op Haiku bleven de antwoorden even bruikbaar en de bewaker greep even vaak in. Per regel scheelt het ongeveer 9%.
- **Een cachemarkering alleen waar een tweede aanroep hem terugleest.** Het gaat om het gedeelde deel van de doelkeuzes, een gesprek per persoon en de schrijfhulp. Nergens anders wordt nog een koude schrijfbeurt betaald.
- **De richtprijs klopt.** Onder Instellingen > AI staan twee regels: een uur zoals de gids het telt, en een uur zoals het gemeten is (bij jou $0,58, iets hoger dan de tabel omdat die regel de cache niet meerekent). Daaronder staat wat het vorige uur echt kostte. De reservering vooraf rekent het denken van Opus en het schema mee, zodat het uurbudget niet stilletjes overschreden wordt.

Kosten per nieuwe soort aanroep: de vonk (`spark`) kost op Sonnet 5 ongeveer $0,0045. Hij gaat naar het brein, omdat het één kleine, begrensde keuze is uit wat de motor aanbiedt, en de motor keurt hem als elke haak. Er komt hooguit één per stille nacht. De metingen op jouw sleutel kostten samen $1,70.

Testen:
- Instellingen > AI: de twee regels van de richtprijs en wat het vorige uur kostte. Speel een uur en vergelijk.
- Speel een paar dagen niets bijzonders in een dorp: na een paar stille nachten komt er iets onverwachts naar je toe.
- In het AI-logboek staan nu ongeveer half zo veel doelkeuzes (soort npc_goals) per uur als voorheen.

Bekende gaten: de regel "as it was measured" in de instellingen rekent zonder cache, en voor het gesprek met het antwoord van vóór de kortere regels. Hij valt dus iets hoger uit dan de werkelijkheid. Het doel van $0,44 per uur komt pas met M10.28.

Wat de editor en de kroniekverteller leerden: de stap Mensen in de wereldgids en `docs/NEW-WORLD.md` noemen `people.model_km`, de stap Signalen noemt `story.quiet_ladder`, en beide staan onder Knobs in de editor. Skerrow zet ze allebei (1 km, en een langzamere ladder). Deepwell laat ze weg en speelt de standaard; een test laat zien dat die voor `people.model_km` 1,5 km is. De vonk is een soort in de tabel van soorten, met een situatie, een mockantwoord en twee echte opnames.

Ontwerp: functioneel ontwerp, hoofdstuk 16, de alinea's "Stand na M10.27: minder doelkeuzes, een inspanning en een model per soort, en het uur zoals het gemeten is" en "Stand na M10.27: de nachtronde, de gespreksregel en de cachemarkering", en bij de alinea over de pols (M10.24) "Stand na M10.27: de vonk van een stille nacht".

## M10.26 deel: de cache op elke soort aanroep, 29 september 2026

- **Wat er mis was.** Elke aanroep had al een cachemarkering, over het hele systeemdeel. Het ging op twee plekken mis. Bij sommige soorten stond iets wisselends vóór de markering: de kaart van een personage, de doelen die nu openstaan, het ontwerplogboek. En een model cachet niets onder zijn minimum: Haiku 4.5 pas vanaf 4.096 tokens, Sonnet 5 vanaf 1.024, Opus 5.5 vanaf 512. Een gesprek op Haiku is in zijn geheel zo'n 3.000 tokens, dus daar kwam nooit iets uit de cache.
- **Het vaste deel voorop.** Elke soort zet nu voorop wat gelijk blijft, met de markering erna, en wat wisselt erachter. Waar een soort een deel heeft dat elke aanroep deelt (de regels en het kader vóór de kaart van een spreker of personage), krijgt dat een eigen markering, zodat ook iemand nieuw het uit de cache leest. De doelkeuze van een personage, de soort met de meeste aanroepen, heeft daarvoor de hele lijst van doelen in het gedeelde deel; welke er nu openstaan komt erna. Dat gedeelde deel is zo'n 1.100 tokens, net boven het minimum van Sonnet. De verhaalronde van een streek leest het vaste deel dat de wereldbouw van een volle streek al schreef.
- **Het logboek zegt waarom.** Waar niets uit de cache kwam, staat in de kolom cache in plaats van 0% bijvoorbeeld "under the minimum: about 1,450 of 4,096", of "written for the next call". Het spel vult een deel niet kunstmatig aan om het minimum te halen.
- **De meting.** `docs/COVERAGE.md` heeft een tabel per soort: het model van de laatste echte opname, het vaste deel, het gedeelde deel, het minimum en wat een volgende aanroep uit de cache leest. Met Opus leest de nachtronde de volgende keer zo'n 80% uit de cache, de doelkeuze op Sonnet 80% (iemand anders 73%), en een gesprek op Haiku niets.

Testen: speel even met een model en open Instellingen > AI log: de kolom cache. Tests in `tests/m1026cache.test.ts`; `npm run coverage` maakt de tabel.

Wat dit voor je keuze betekent: met Haiku als stem wordt een gesprek nooit gecachet, met Sonnet 5 wel (het vaste deel van zo'n 1.460 tokens). Welke goedkoper uitkomt hangt af van hoeveel je praat; dat zou ik eerst meten voordat je iets verandert.

Ontwerp: functioneel ontwerp, hoofdstuk over wat de AI kost, alinea "Stand na M10.26: de cache per soort aanroep".
## M10.25 af: een nieuwe streek met een eigen verhaal, 29 september 2026

- **De verhaalronde.** Een verre plek of een streek die aan de rand ontstond, was speelbaar maar dun. Zodra de vreemdeling er iets doet, schrijft de kroniekverteller in één aanroep van de nieuwe soort `region_story` wat er te beleven valt: één quest van twee of drie stadia bij de mensen die er zijn, twee gewoonten op de standaardnasleep van de wereld, een verhaal over de plek en een geheim voor één op de drie mensen. De motor legt de vorm vast (ids, vlaggen, stadia, voorwaarden), houdt alleen wat past en controleert het geheel als content. Een daad met iemand erbij gebeurt waar die persoon woont of werkt. In `Meedenken` wacht de quest als haak, in `Regisseur` is het geheel een voorstel. Zonder model krijgt de streek één gewoonte uit de standaardset. De wijkronde geeft zelf al één op de drie mensen een geheim.
- **Hoe vol een nieuwe streek wordt, kies je zelf.** Een vierde draaiknop op het kaderscherm en onder Instellingen > AI, met de prijs per streek: `outline`, `story` (de standaard met een model) of `full`. In `full` lopen de stappen Plekken, Beroepen, Mensen, Economie en Signalen van de wereldbouw over de streek, met een herstelronde en de polijstronde, en daarna het verhaal. Je krijgt één vraag voor de hele bouw. Een ronde zonder antwoord wacht; een poging die niets kostte (geen verbinding, het uurbudget) telt niet mee.
- **Onderweg wordt de wereld gebouwd** (de entry van de andere sessie hieronder).
- **De kaart hoort bij de wereldbouw.** Na de laatste stap legt de editor de kaart neer uit de plekken en laat hij haar schilderen. The Quiet Reach kreeg zo in de app de kaart van de Vesper Coast, uit jouw hoofdstuk Palet. Sinds M10.26 schildert het lichtere model de kaart als tabel.
- **Het gespeelde bewijs.** De Holleveen in alle drie de standen, en Skerrow over de zee in `story`, elk drie speldagen met jouw modellen. De verslagen staan in `docs/playtest/region-base.md` en `region-isle.md`, en de uitkomst in `docs/playtest/region-proof-plan.md`. **`story` blijft de standaard:** voor ongeveer $0,16 per streek krijgt ze een quest die een nieuwe speler in beide werelden in drie dagen haalde, een gewoonte die afging en een verhaal over de plek. `outline` gaf dertien plekken en twintig mensen, en niets om te doen. `full` voegt voor ongeveer $2,70 beroepen, lore, een schepsel en acht wachters toe. De quest in `full` is niet gespeeld, want het harnas bleef toen in een gevecht steken (hersteld). Je koos om zonder nieuwe ronde af te sluiten.
- **De streken om te bekijken.** Elke streek die het bewijs liet ontstaan, staat genummerd in een kopie van zijn wereld: `content/base_proofs` en `content/isle_proofs`, te openen in de editor. Ze staan niet in git en niet in een installer.

Kosten per nieuwe soort aanroep: `region_story` op Opus 5.5 met medium denkwerk kost ongeveer $0,16 per streek (24.000 tokens in, 2.000 uit). Waarom dat model: het is een verhaal met een quest die moet kloppen, en de echte antwoorden laadden alle vier in één keer. De rondes van `full` zijn stappen van de wereldbouw (`world_step`, gemeten in M10.20) en kostten samen ongeveer $2,26 per streek. Het bewijs kostte in totaal ongeveer $17,93.

Testen: kies onder Instellingen > AI de stand bij "How full a new region is built". Ga naar de zuidrand van de Holleveen (in een ontwikkelversie `@goto hex:60,0`), `explore south`, `head south`, en speel een paar dagen in de nieuwe streek. Kijk in het dagboek naar de quest. Open de kopie "The Nethermarch, with the proof regions" in de editor om de streken van het bewijs te zien.

Gevonden en hersteld door het bewijs:

- Een dichtgeklapte laptop liet de rondes van `full` opgeven (acb2494).
- De Economie raadde de vaardigheden, en het harnas kende geen gevechten (389f4cb).
- Een plan-doel van de nachtronde met een persoon als plek liet het spel vastlopen op "Unknown location npc_cornelis". Een doel heeft nu een doelwit van zijn eigen soort, en een oud doel in een save wordt losgelaten (99d9d75).
- Een proefrit stond niet in het log van de app en telde niet mee in het uur van het spel (0435b6c, M10.26).

Wat de editor en de kroniekverteller leerden: het contract veranderde niet, want quests, wachters, lore en geheimen bestonden al. De stap Signalen vraagt om nasleep die overal werkt. De stappen die vaardigheden noemen, krijgen hun id's. `docs/NEW-WORLD.md` heeft het deel "Een streek die tijdens het spel ontstaat" en noemt de kaart na de laatste stap.

Bewust anders: een verre plek uit het wereldboek wordt niet bij vertrek opgebouwd, zodat doorlopen niets kost. Zonder model laat de regel de eerste bruikbare nasleep van de wereld afgaan als de vreemdeling de streek binnenkomt.

Je document: `docs/worldbuild/quiet-reach-prompts.md` is uit de repo; de proefrit leest je antwoorden uit de fixtures. Het bestand staat nog in de geschiedenis van git. Alleen een force push haalt het daar weg, en dat is jouw beslissing.

Ontwerp: FO hoofdstuk 4, de alinea's "Onderweg wordt de wereld gebouwd", "Een nieuwe streek met een eigen verhaal" en "De kaart hoort bij de wereldbouw" (M10.25).

## M10.26 deel: alles op je sleutel in één logboek en één budget, 29 september 2026

- **Eén logboek.** Het AI-log van de app laat nu ook de aanroepen zien van een proefrit, de editor en een run met afbeeldingen, met een kolom "from" (game, editor, trial, pictures). Het leest het gedeelde bestand in plaats van alleen wat de app zelf deed. Zo had je de $4,14 van vanmiddag wel gezien.
- **Eén budget.** Het kostenregister en het gebruik per maand zijn gedeeld tussen processen: een proefrit die naast je spel loopt, telt mee in hetzelfde uur en dezelfde maand, en elk proces leest wat de andere schreven. Een proefrit met een vast model telt nu ook mee, net als de testaanroep bij het kiezen van een model. Een stap van de wereldbouw gaat nog steeds volgens de grens van zijn eigen bouw en wacht niet op je uur, maar wat hij uitgeeft telt nu mee in dat uur, als editor.
- **Wat er op je sleutel ging.** Onder Instellingen > AI staat onder het uurbudget "On your key": dit uur en vandaag, met per bron wat het kostte.
- **Vooraf gezegd.** Een proefrit (`npm run trial`) zegt bij de start dat hij op jouw sleutel loopt en wat hij hoogstens kost. Het verslag van het gespeelde bewijs heeft een regel "Hooguit, vooraf gezegd", en de meting van de kaart stopt bij haar grens.

Testen: open Instellingen > AI en kijk onder het uurbudget. Speel even en open het tabblad AI log: de kolom "from". Tests in `tests/m1026key.test.ts`; `tests/m1020budget.test.ts` zegt nu dat een bouw in het uur meetelt.

Bewust anders: in M10.20 koos je dat de wereldbouw niet in het uurbudget telt. De bouw wacht nog steeds niet op het uur, maar het uur ziet nu wat de bouw uitgaf. Anders is het uurbudget geen grens voor je sleutel.

Ontwerp: FO, de alinea "Eén logboek en één budget voor de sleutel (M10.26)" onder "Afbeeldingen per wereld (M10.26)" (hoofdstuk Instellingen).

## Wat er op je sleutel liep, 29 september 2026 (antwoord op je vraag over $4,14)

Alles wat ik liet lopen staat stil tot jij "ga" zegt. Het tegoed zakte tussen 17:10 en 17:34 met $4,14, maar Anthropic boekt met vertraging. Het ging om mijn proefritten van 16:47 tot 17:30 (14:47Z tot 15:30Z). Die staan in `ai.jsonl` en in het kostenregister van de app, maar zonder kolom die zegt dat ze van een proefrit komen. Daarom zag je in de app alleen je eigen gesprekken.

| Tijd (lokaal) | Wat | Kosten |
|---|---|---|
| 16:37 tot 16:47 | drie testaanroepen na de storing (Opus, een paar tokens) | ongeveer $0,01 |
| 16:47 tot 16:50 | de kaart als tabel gemeten, Sonnet 5 en Haiku 4.5, 10 aanroepen | $0,157 |
| 16:50 tot 17:03 | het bewijs `outline`, eerste poging, liep vast op een fout (hersteld in 99d9d75) | $1,62 |
| 17:07 tot 17:09 | de kaart nog eens gemeten, Sonnet 5, 5 aanroepen | $0,108 |
| 17:09 tot 17:28 | het bewijs `outline`, opnieuw, 189 aanroepen | $2,24 |
| samen | | ongeveer $4,14 |

Wat nog zou lopen, `full` op de Holleveen (ongeveer $3,30), heb ik gestopt voordat het begon. Voor elke volgende betaalde ronde vraag ik het je eerst. Voortaan schrijft alles wat op je sleutel loopt in hetzelfde log met een kolom `source`, en zegt het vooraf wat het hoogstens kost (M10.26, eerst gebouwd).

## M10.26 af: afbeeldingen per wereld, en de kaart goedkoper, 29 september 2026

- **Een wereld zegt of ze afbeeldingen wil.** `pictures.wanted` staat naast `pictures.style` in `world.yaml`, en staat standaard uit. De stap Palet vraagt het, met de prijs per plek en per portret bij het beeldmodel uit Instellingen > AI. Staat het aan, dan maakt de editor na de laatste stap, en na elke stap die plekken of mensen toevoegt, de afbeeldingen van wat nieuw is. Per afbeelding zegt hij wat ze kostte. Zonder beeldmodel zegt hij dat en maakt hij niets. Skerrow en The Quiet Reach willen afbeeldingen, en Deepwell laat het weg.
- **De ontbrekende afbeeldingen van een wereld.** Onder Contract, bij het wereldboek, telt [Make the missing pictures] wat er mist: gebieden en portretten, zonder de egale figuren. Hij zegt wat het ongeveer kost en maakt het binnen een grens in euro die je zelf zet, met een regel per afbeelding. Daarna tonen het wereldboek en de atlas ze. `WISPLIGHT_PICTURES` blijft bestaan.
- **In het spel beslis jij.** Onder Instellingen > AI staat naast het beeldmodel "Make pictures of new places and people". Die schakelaar staat aan zodra je een beeldmodel kiest. Aan krijgt ook wat in het spel ontstaat een afbeelding: een verre plek, een wijk, een geschetste streek, de mensen van een wijk of een verre plek, en een geschreven land. Dat gebeurt in de stijl van de wereld of van het land, op het moment dat je er komt of iemand ontmoet, binnen het budget. Uit toont het spel alleen de afbeeldingen die er al zijn. De keuze van de wereld telt in het spel niet, want jij betaalt.
- **De kaart goedkoper.** Na de laatste stap legt de code de streekkaart neer uit de plekken, hun uitgangen en minuten, zoals in M10.25. Het schilderen is nu een eigen, kleine aanroep (`map_paint`): het model vult een tabel met per land een teken, een naam, twee kleuren, hoe het loopt en één regel, de tekening als rijen tekens, en een regel per pad en per rand. De code schrijft daar de streek en het palet van. Het gaat naar het lichtere model dat je koos, bij jou Sonnet 5: ongeveer $0,03 voor een kaart, tegen $0,27 op Opus. Staat er iets verkeerd, dan typ je wat, en [Paint it again with this] leest het vaste deel uit de cache voor ongeveer de helft. Een naam die het model in de tekening schrijft, of een rij die een teken of twee afwijkt, leest de editor zoals de kaart dat altijd deed, en de toelichting noemt het. De meting staat in `docs/worldbuild/cost-measure.md`: Sonnet laadde twee keer op rij op The Quiet Reach en Skerrow, Haiku 4.5 niet.
- **The Quiet Reach heeft zijn afbeeldingen.** Met de knop in de app en jouw sleutel: 5 ontbraken (de Coastal Traverse, Vesper Coast, Orison Ridge, Niko Serrin en Dr Edda Vale), $0,025.

Kosten per nieuwe soort aanroep: `map_paint` kost op Sonnet 5 (low) ongeveer $0,03 voor een kaart, en een tweede poging uit de cache ongeveer $0,013 tot $0,016. Waarom dat model: het laadde twee keer op rij op beide werelden, Haiku 4.5 niet, en Opus kost tien keer zo veel. De meting kostte $0,157 en een tweede ronde met de verbeterde instructie $0,108 (Sonnet 5 laadde vijf van vijf, met kale namen en zonder correcties); de afbeeldingen van The Quiet Reach $0,025.

Testen:
- Kies in de editor een wereld en ga naar Contract. Bij het wereldboek staat Pictures: wat mist, wat het kost, en [Make the missing pictures] met een grens in euro.
- Bouw verder aan een wereld die `pictures.wanted` heeft (Skerrow). Voeg bij een stap een plek toe en neem die aan: de editor maakt dan de afbeelding.
- In het spel staat onder Instellingen > AI de schakelaar onder het beeldmodel. Reis met de schakelaar aan naar een nieuwe streek en kijk naar de afbeelding boven de kaart en bij een gesprek. Zet hem uit en praat met iemand nieuws.
- Bij de laatste stap van The Quiet Reach staat "Then: the map" met de tweede poging.

Tests in `tests/m1026pictures.test.ts`, `tests/m1026map.test.ts` en `tests/m1025map.test.ts`.

Nog open: het gespeelde bewijs van M10.25 wacht op de laatste ronde `full`, die zijn uur nodig heeft; de afsluiting van M10.25 komt daarna.

Gevonden en hersteld: de mensen van een wijk en van een verre plek kregen altijd een egale figuur, nooit een portret, en het spel vroeg de afbeelding van een gegroeide plek aan de wereld zoals die geschreven was, waar die plek niet in staat. Een plek of persoon van een land nam de stijl van de wereld in plaats van die van het land.

Wat de editor en de kroniekverteller leerden: het contract noemt `pictures.wanted` (`docs/CONTENT.md`), de stap Palet in de wereldgids vraagt het met de prijs en zegt wat een wereld zonder krijgt, en `docs/NEW-WORLD.md` heeft een alinea over afbeeldingen. De kaartstap is een eigen soort aanroep, `map_paint`, met een rij in de tabel van soorten, een situatie (Skerrow zonder kaart) en het mockmodel.

Ontwerp: FO, de alinea "Afbeeldingen per wereld (M10.26)" onder de alinea over plaatjes (hoofdstuk Instellingen), en in hoofdstuk 4 "De kaart als tabel (M10.26)" onder "De kaart hoort bij de wereldbouw".

## M10.25 deel: onderweg wordt de wereld gebouwd, 29 september 2026

- **De aanroepen beginnen bij vertrek.** Reis je naar een streek die in het spel ontstond, dan vraagt het spel bij vertrek al wat de stand van de vierde draaiknop wil: de eerste wijk en de verhaalronde. Ook de woorden van een land dat alleen een kader heeft (M10.23) komen dan. Het reisverslag geeft het vertrek en daarna één regel: "While you travel, the chronicler is laying out the Grey Saltings." De statusbalk zegt hetzelfde, en links staat "On the way to ..." tot je er bent. In de terminal staat dezelfde regel in het verslag.
- **De aankomst wacht.** Een reis speelt zich in speltijd in één commando af, dus in echte tijd lopen de aanroepen erna. De rest van de weg en de aankomst komen zodra alles klaar is, in de minuut daarna. Tot dan gaan het dagboek, wachten, opslaan en de kaders gewoon door. Andere commando's horen "You are not there yet". Met `ARRIVE` ga je meteen naar binnen, en wat nog niet af is verschijnt als het klaar is. Mislukt een aanroep, dan komt de aankomst met de sjablonen, zoals nu. Terwijl je wacht, zet de app de klok niet stil na een minuut niets typen, anders zouden de aanroepen nooit klaar komen.
- **Een wijk waar je heen loopt** wacht op dezelfde manier: "While you walk, the chronicler is laying out the creek landing of the Grey Saltings."
- **Wat niet verandert.** Door een verre plek uit het wereldboek (Zwolderkamp, Graafhaven) trekken kost nog steeds niets (M10.21). Zonder model, of met de draaiknop op `outline`, is er niets om op te wachten, behalve een land dat nog geschreven wordt of een wijk waar je in loopt.
- **Het harnas voor het gespeelde bewijs.** `npm run regionplay` speelt met het mockmodel de zuidrand van de Holleveen één keer per stand en Skerrow over de zee in `story`, elk drie speldagen volgens `docs/PLAYTEST.md`. De speler kijkt, loopt, praat, probeert mensen te lezen, drukt door op wat hij ziet en volgt de quest uit het dagboek. Het verslag `docs/playtest/region-mock-base.md` zet per stand naast elkaar: plekken (woorden, haken, uitgangen), mensen, geheimen, de quest en wat eraan niet klopt, wachters en wat afging, lore, aanroepen en kosten. De echte run met jouw sleutel loopt via `npm run trial -- --kind region_play --record [--cap n]`. Die schrijft `docs/playtest/region-base.md` en de antwoorden als fixtures, en komt zodra `full` klaar is.

Testen: ga met een model naar de zuidrand van de Holleveen (in een ontwikkelversie `@goto hex:60,0`), `explore south`, dan `head south` en ga door. Kijk naar de regel in het verslag en de statusbalk, en wacht tot je aankomt. Of typ `ARRIVE`. Tests in `tests/m1025underway.test.ts`, ook voor het land, de wijk, zonder model en de boot op Skerrow.

Gevonden en hersteld: de weg naar een verre plek ging de verkeerde kant op van noord en zuid. De kaart telt naar het noorden (Stavermouth heeft een grotere y dan de Holleveen), maar de code rekende alsof het naar het zuiden ging. Een streek die ten zuiden werd geschetst, stuurde je bij de poort terug naar het zuiden. De plekken uit het wereldboek liggen oost en west, dus daar merkte niemand het. Het harnas vond ook een quest van de verhaalronde die niet te halen was: iemand moest op de markt zijn waar hij nooit komt. Dat herstelt de andere sessie in de verhaalronde zelf.

## M10.24 deel: een woord aan de kroniekverteller, 29 september 2026

- **Eén regel in gewone taal.** In het dagboek staat onder You de pagina "A word to the chronicler". Daar schrijf je één regel, zoals "meer over het veen, geen oorlog dit seizoen". In de terminal is het `CHRONICLER <regel>`. Er is geen menu en er zijn geen schuifjes.
- **Het ontwerplogboek van dit spel.** De regel komt in de save (`state.wishes`). De kroniekverteller leest bij elke ronde de nieuwste drie, in elke speelstand, als THE PLAYER'S WORDS. Hij volgt ze waar de feiten, het kader en de grenzen dat toelaten, maar ze veranderen nooit wat er gebeurde. Per regel zegt hij in één zin wat hij ermee deed. Dat staat op de pagina en in de kroniek van het spel (THE PLAYER'S WORDS TO THE CHRONICLER).
- **Grenzen.** Een regel mag hoogstens 200 tekens hebben. Een regel die op een instructie aan een model lijkt, of die de grenzen van het spel raakt, weigert het spel. `CHRONICLER FORGET` zet alle regels opzij. Zonder model leest niemand ze, en dat staat op de pagina.
- **Zonder woorden verandert er niets.** De vraag aan de kroniekverteller krijgt het deel en het veld `heard` alleen als er een regel is. De opgenomen antwoorden en de kosten blijven dus hetzelfde.

Testen: open het dagboek, kies onder You "A word to the chronicler" en schrijf een regel. Laat de nacht voorbijgaan of doe iets groots (in een ontwikkelversie `@fact 4 ...`). Lees de pagina daarna nog eens, en de kroniek van het spel. Tests in `tests/m1024words.test.ts`.

Wat de editor en de kroniekverteller leerden: de kroniekverteller kent de regels van de speler en het veld `heard`. Het mockmodel antwoordt erop. Een wereld kan er niets nieuws door bevatten, dus het contract en de editor veranderden niet.

Bewust anders: het ontwerplogboek van een spel staat in de save en niet in een bestand naast het `DESIGN.md` van de wereld, want het hoort bij dat ene spel.

Gevonden en hersteld (melding van de ontwerpsessie): de test die in de editor elke soort bewerkt en terugzet, haalde op een machine met vier kernen de minuut niet meer. Het laden van de Nethermarch kostte 125 ms, voor bijna 60 procent het lezen van de YAML van alle bestanden, bij elke bewerking opnieuw. De controles zelf kosten weinig; de wereld is gewoon gegroeid. De lader leest nu elk bestand één keer per tekst en bewaart het resultaat bevroren, zodat geen enkele lading kan veranderen wat een volgende leest. Laden kost nu 35 ms, die test 27 in plaats van 63 seconden, en de hele suite 39 in plaats van 62. De editor merkt het bij elke bewerking.

## M10.21 af: het wereldboek groeit aan de rand, 29 september 2026

- **Verder het onbekende in.** Aan een kaartrand waar niemand je iets heeft verteld, biedt het spel met een model naast "terug" ook "Go on into the unknown" (`EXPLORE <kant>`). Eén aanroep van de nieuwe soort `expansion` schetst dan één nieuwe streek of één nieuw land die kant op. Dat komt uit wat het wereldboek al suggereert en blijft binnen het kader: een naam, wat men weet, een verhaal, twee tot vier wijken, hoeveel dagen lopen, en bij een land het eigen kader (met de WORLD-regels van de wereld ervoor) en wat je bij de grens merkt. Wat klopt, komt als laag in de save: je kent het meteen, en het is canon voor elke volgende ronde. Ga je erheen, dan maken de lagen van M10.21 het speelbaar, en een geschetst land krijgt zijn stem van de landschrijver (M10.23) zodra je binnenkomt.
- **Inspraak volgens de speelstand.** In `Doorspelen` komt het er meteen. In `Meedenken` kies je in de wereld uit twee omtrekken (`CHART`), of geen van beide. In `Regisseur` staat het als voorstel met de wijzigingen. Zonder model blijft de rand de rand. Er is één ronde tegelijk, en boven je drempel wordt eerst gevraagd.
- **Voorbij het boek.** De export van wat je ontdekte heeft een hoofdstuk "Beyond the book" met elke geschetste plek en hoe die erbij kwam. Voor de Nethermarch is dat de aanvulling die ik je zou voorleggen voor het wereldboek in Claude Docs.

Testen: ga met een model naar de zuidrand van de Holleveen (in een ontwikkelversie `@goto hex:60,0`, dan `head south`) en kies "Go on into the unknown". Daarna wijst de rand de weg naar wat er kwam. Of vraag op de kade van Skerrow "what lies beyond the sea?" en neem daarna de boot. Tests in `tests/m1021expansion.test.ts`, ook op Skerrow; Deepwell heeft geen kaart en dus geen rand. Kosten: ongeveer 3.500 tokens in en 1.000 uit bij de kroniekverteller, een paar cent per ronde. De rest (wijken, weefronde, stem van het land) kost pas iets als je er echt heen gaat. Een echt antwoord moet nog worden opgenomen.

- **Ook in de haven.** Vraag je in een haven (een plek waar een lijn over het water stopt) wat er achter de zee ligt, dan zegt niemand het, maar met een model kun je een schipper zoeken die verder vaart (`explore by sea`). De ronde schetst dan wat er over het water ligt, in de richting van de dichtstbijzijnde kaartrand, en er komt een boot vanuit die haven heen. Een lijn naar een streek die alleen een naam is, had al zijn eigen lagen (M10.21): de omtrek komt als je er bent.

Een geschetst land begint zonder eigen grote lijn, de neutrale standaard. Het bereik tot de andere landen volgt meteen uit de content: dichtbij waar een weg te voet loopt, handel waar een boot gaat. Daarmee staat dit roadmappunt af.

Gevonden en hersteld: een verre plek en een wijk werden gecontroleerd tegen de basisinhoud van de wereld, zonder wat er eerder in het spel groeide. Een geschetste plek of een geschreven land faalde daardoor. Nu wordt tegen de hele inhoud van het spel gecontroleerd.

Bewust anders: de roadmap noemt een wereldbouw in het klein van twee tot vier dollar. Ik liet de ronde alleen de omtrek schrijven. De lagen die er al zijn, doen de rest op het moment dat je gaat. Dat is goedkoper, en er komt niets dat je nooit ziet.
## M10.24 deel: de kaders één keer, 29 september 2026

- **Eén scherm aan het begin van een spel.** Na het personage (of meteen, in een wereld zonder personage) staat alles bij elkaar waaronder je speelt. Bovenaan de wereld en waar je begint. Dan de andere landen en hoe goed ze elkaar kennen, met hun taal. Dan de grote lijnen en wat ze voedt. Daaronder drie draaiknoppen: hoeveel er vanzelf gebeurt (het tempo), hoe vaak een verhaallijn je komt zoeken, en hoeveel de wereld per seizoen groeit. Verder de speelstand, en wat het mag kosten: het budget per uur en vanaf welk bedrag het spel eerst vraagt. Met [Play] ben je weg, en het spel vraagt er niet meer om.
- **De draaiknoppen zijn knoppen van dit spel.** Ze liggen over die van de wereld (`state.knobs`) en staan in de save. Je zet ze met het commando `FRAMES`, dus de log houdt ze bij en een herhaling zet ze ook. "Vaak" verlaagt de drempel waarop nieuws de kroniekverteller overdag roept met één stap, en verdubbelt de haken van de polsslag per week. "Zelden" doet het omgekeerde. Groei "weinig" of "veel" halveert of verdubbelt de mensen die terloops ontstaan en de dingen die de kroniekverteller neerzet.
- **Later in de instellingen.** Onder AI staat nu de speelstand, met een knop naar hetzelfde kaderscherm. In de terminal typ je `FRAMES`.
- **In de editor** staan boven het bouwen van een wereld haar kaders: de landen met hun bereik, de grote lijnen en de knoppen die de wereld zelf zet.
- **Gevonden en hersteld:** nieuws riep de kroniekverteller overdag pas vanaf belang 4, ook als de wereld `story.urgent_belang` lager zette. Nu volgt het de knop.

Testen: begin een nieuw spel op Skerrow. Na het personage komt het kaderscherm, met de Western Isles, de grote storm en de draaiknoppen. Zet er een paar en druk op [Play]; open daarna Instellingen > AI > [The frames of this game]. In de terminal: `npm run play` en dan `frames`. Tests in `tests/m1024framescreen.test.ts`.

Wat de editor en de kroniekverteller leerden: de editor toont de kaders van een wereld boven de stappen. Een wereld kan er niets nieuws door bevatten: de draaiknoppen zijn van het spel, niet van de wereld. Het contract veranderde daarom niet.

Bewust anders: de knoppen zijn drie draaiknoppen met elk drie standen, geen vrije getallen. De kaders van de wereld zelf (het kader, de landen, de grote lijnen) toont het scherm maar verandert het niet; dat doe je in de editor.

## M10.24 deel: drie speelstanden, de polsslag, en de wereld blijft heel, 29 september 2026

- **Drie speelstanden, één instelling.** De stand geldt voor de kroniekverteller, de weefronde en de maandbeoordeling van de grote lijnen, nooit voor gesprekken of improvisatie. `Doorspelen` is de standaard en werkt zoals het al werkte. Bij `Meedenken` wacht wat een nacht nieuw begint (een verzoek, een brief of een bezoek) tot de ochtend. Dan krijg je het één keer als keuze in de wereld: je pakt er een of geen op, en de rest blijft een week liggen (`HOOKS` toont ze weer; knop `story.hook_days`). Bij `Regisseur` wordt wat de kroniekverteller, de weefronde of de beoordeling wil doen eerst een voorstel, met een lijst van wijzigingen (`PROPOSALS`). Neem je het aan, dan gebeurt het zoals voorgesteld. Wijs je het af, dan doen de regels het zoals zonder model. Het dagboek heeft onder You de pagina "What waits for you". De stand staat in de instellingen, en een lopend spel volgt hem bij de volgende modelronde; de log bewaart elke wissel. Het scherm om hem te kiezen komt van de andere sessie (M10.24 (1)).
- **De polsslag.** Terwijl je speelt, zoekt de wereld je op, ook als je niet reist. Elke paar dagen komt er minstens één haak bij je in de buurt (wereldknop `story.hooks_per_week`, standaard twee): een verzoek, een bezoeker, een tijding, een brief of een gebaar, nooit twee van dezelfde soort achter elkaar. Met een model vraagt de nachtronde erom, uit de open verhaallijnen bij jou in de buurt. Komt er niets, of is er geen model, dan zet de regel een polswachter uit de content in gang. In de Nethermarch zijn dat Kobus de marskramer, praat over het weer en een boodschap. Op Skerrow zijn het Tamsin, een zeil aan de horizon en een boodschap. Deepwell heeft er geen: daar blijft het stil, de neutrale standaard. Wie dagen wegwacht met `WAIT`, speelt niet en wordt niet opgezocht.
- **Binnen de kaders.** `npm run sim -- --model` speelt dertig dagen in `Doorspelen` met het mockmodel en controleert daarna vier dingen: wat groeide doorstaat dezelfde controles als geschreven content, het bleef binnen de seizoensgrenzen, het nam geen vastgelegd of begraven id, en het spel slaat nog op en laadt. Een test doet hetzelfde voor de Nethermarch en Skerrow.

Testen: kies in de instellingen (zodra het scherm er is) of met een test `Meedenken`. Laat in Veenhoek iemand verdrinken (in een ontwikkelversie met `@kill harmen drowned in the Blackmere`) en doe dan iets: de nieuwe vraag komt als keuze. Met `Regisseur` geeft `proposals` de lijst, en daarna `accept` of `reject`. De polsslag zie je door een week op één plek te blijven en elke dag iets te doen. Tests in `tests/m1024modes.test.ts`, `tests/m1024pulse.test.ts` en `tests/m1024frames.test.ts`.

Gevonden en voor iedereen hersteld: een gesprek dat iemand met jou begon en waarop je nooit antwoordde, hield die persoon vast tot hij verhongerde. Na een half uur gaat hij nu zijn gang. En wie uren van huis honger kreeg (de kluizenaar van het rietdoolhof bij de Goose), liep eerst naar huis; nu eet hij bij de dichtstbijzijnde open toonbank die hij kan betalen, en koopt genoeg voor onderweg.

Wat de editor en de kroniekverteller leerden: het contract kent `probe: { pulse: ... }`, de stap Signalen in de gids vraagt om polswachters, `docs/NEW-WORLD.md` noemt ze, en Check noemt een polswachter waar geen nasleep bij hoort.

Bewust anders: in `Meedenken` komen alleen de nieuwe haken van een nachtronde als keuze; de draad van de weefronde en de grote lijnen komen zoals ze komen, omdat ze volgen uit waar je zelf heen ging. De polsslag vraagt geen nieuwe soort modelaanroep: hij gaat mee in de nachtronde die er toch al is, zodat hij niets extra kost.

## M10.23 af: een land bouwen met dezelfde stappen, 29 september 2026

- **De wereldbouw loopt per land.** Boven de stappen in de editor kies je nu of je de wereld bouwt of een van haar landen. Een land krijgt elf stappen: Kalender en Landen horen bij de wereld. Het kader van de wereld staat in de vraag als achtergrond, met het `land.yaml` van het land waar anders `world.yaml` staat. Wat een stap in de wereld zou zetten (kader, geld, geloven, wet, namen, stand, palet, beeldstijl) komt in het `land.yaml` van het land. Bij het kader horen daar ook `crossing` en, als het land een eigen taal heeft, `language`. Bij het geld hoort een wisselkoers.
- **Wat nieuw is, komt in de map van het land.** Gebieden, plekken, mensen, beroepen, lijnen en de streek van het land gaan naar `lands/<land>/`. De stemkit gaat naar die van het land, ook als het model `data/voice.yaml` schreef. Beschermheiligen, volken, condities en reiszinnen blijven van de wereld.
- **Antwoorden, besluiten en open voorstellen staan per land** in het ontwerplogboek, onder de naam van het land. Een voorstel dat niet laadt, zet de kroniekverteller recht zonder dat het land verloren gaat.
- **Het vaste, gecachte deel van de vraag is hetzelfde als bij de wereld.** Na de wereld kost een land dus alleen het deel per stap.
- **De dekking is compleet**: van alle 23 soorten modelaanroepen staat een echt antwoord in `tests/fixtures/model/`, nu ook van `land` (Opus 5.5, $0,06, en het spel neemt het over).

Testen: open in de editor een wereld met een tweede land (Skerrow of Deepwell), tab New world, [Build further], kies het land boven de stappen en doe bijvoorbeeld Geld met een tabel van munten en "rate 3". Tests in `tests/m1023build.test.ts`.

Wat de editor en de kroniekverteller leerden: de keuze van het land en de elf stappen in de editor; de landgids (`landGuide`, `LAND_STEPS`, `landFills`, `LAND_NOTES` in `src/engine/worldguide.ts`) met per stap wat voor een land anders is; het mockmodel bouwt een land; en in `docs/NEW-WORLD.md` het deel "Een land bouwen". Het contract zelf veranderde niet.

Bewust anders: een land heeft geen eigen `CHRONICLER.md`. Wat de kroniekverteller over een land moet weten, voegt de stap Kader als eigen sectie toe aan die van de wereld, zodat alle modelaanroepen het blijven lezen.

## M10.23 deel: een eigen taal, en de oversteek met nieuws, 29 september 2026

- **Een land mag een eigen taal hebben** (`language` in land.yaml: `name`, `learn`, `speakers`). Wie de taal niet kent, krijgt van de mensen daar een groet, gebaren, en de namen en getallen uit wat hij zei. De regels schrijven dat, zonder model, dus een barrière kost niets. Elke uitwisseling leert je iets, en Lore helpt. Na genoeg gesprekken zegt het spel "You find you can follow the Old Tongue now". Wie de taal spreekt en met je meegaat, tolkt: iemand uit dat land of een van zijn `speakers`. Handel gaat gewoon door, met gebaren en getallen. Zonder `language` spreekt iedereen jouw taal, zoals voorheen.
- **De Western Isles spreken de Oude Taal.** Elowen van Skerrow spreekt haar ook. Deepwell's Kessler Claim heeft geen eigen taal; een test speelt die neutrale standaard.
- **De speeltest `crossing`** toont nu de hele oversteek. Eerst de witte boot en een groet in de Oude Taal zonder woorden gemeen. Dan de taal geleerd (het bouwcommando `@learn western_isles`) en het gesprek in de andere stem. Dan een gebeurtenis op Ynys Wen (`@fact 4 ...`, een nieuw bouwcommando voor speeltesten). Terug op Skerrow heeft Brannoc het nieuws na een week van horen zeggen.

Testen: speel Skerrow, neem de witte boot en praat met Eluned of Gwion. Of lees `docs/playtest/crossing.txt`. Tests in `tests/m1023language.test.ts`.

Wat de editor en de kroniekverteller leerden: `language` staat in het contract bij het land, in de stap Landen en in `docs/NEW-WORLD.md`. Een `speaker` die niet bestaat, weigert de lader.

Bewust anders: zolang je de taal niet kent, schrijven de regels wat je verstaat, niet de stem van een model. Dat kost niets en het leest altijd hetzelfde.

## M10.23 deel: landen kennen elkaar in graden, nieuws tussen landen, en de stap Landen, 29 september 2026

- **Hoe goed twee landen elkaar kennen, staat in de content.** In world.yaml staat `reach:` per paar landen, met none, rumour, trade of close. Het thuisland heet naar de id van de wereld. Staat er niets, dan leidt het spel het af: close waar een weg te voet de grens over gaat, trade langs een lijn of route, en anders none. Skerrow zet trade met de Western Isles (de witte boot). Deepwell zet niets en krijgt close, omdat je te voet naar de Kessler Claim loopt.
- **Het bereik stuurt het nieuws.** Bij none komt er nooit nieuws over de grens. Bij rumour komt alleen het grootste nieuws, na vier weken. Bij trade duurt het minstens een week, of de tijd van de lijn. Bij close gaat het als binnen één land. Over de grens hoor je de verre versie. De kroniek van het spel heeft een deel NEWS BETWEEN THE LANDS: wat het ene land van het andere hoorde, op welke dag en hoeveel dagen later.
- **Het bereik stuurt ook handel en familie.** Routes tussen landen vervoeren pas waren vanaf trade. De weefronde legt een band over de grens pas vanaf trade.
- **De grote lijnen per land.** De maandvraag noemt bij elke lijn de landen van haar gebieden, en één lijn mag er twee verbinden.
- **De stap Landen in de wereldgids**, na Kader en Stem. Welke landen er zijn, welke gebieden erbij horen, waar de grenzen liggen, en hoe goed de landen elkaar kennen. Een voorstel mag `lands/<id>/land.yaml` en `voice.yaml` heel schrijven. De bestanden van een nieuw land gaan erin vóór de wijzigingen die het noemen. Zonder deze stap is de wereld één land.

Testen: speel Skerrow, neem de witte boot naar Ynys Wen en kijk na een week in de kroniek van het spel. Of doe in de editor de stap Landen. Tests in `tests/m1023reach.test.ts` en `tests/m1023lands.test.ts`.

Wat de editor en de kroniekverteller leerden: `reach` staat in het contract. De stap Landen heeft zijn exacte velden, controles en een neutrale standaard, en het mockmodel beantwoordt hem. Check noemt een bereik none tussen twee landen waar een lijn tussen loopt. `docs/NEW-WORLD.md` heeft een rij voor Landen.

Bewust anders: de kroniekverteller krijgt alleen de namen die een verhaallijn hem aanbiedt. Hij verbindt twee landen dus alleen waar wat er gebeurde dat al deed, zonder eigen poort. De wereldbouw per land (dezelfde stappen, gescoped op een land) volgt apart.
## M10.23 deel: een ander land, met een grens en een eigen kader, 29 september 2026

- **Een land is een laag in de content.** Naast haar thuisland mag een wereld andere landen hebben, elk in `content/<wereld>/lands/<land>/`. Daarin staat een `land.yaml` met het kader dat elke modelaanroep daar krijgt, en eigen woorden, namen, geloven, munten tegen een koers, wet, stand, schets, beeldstijl en palet. Er kan een eigen `voice.yaml` naast staan, met de gebieden, plaatsen en mensen van het land. Wat een land weglaat, neemt het van de wereld; de kalender en de klok altijd.
- **Een grens is content, nooit afstand.** Elke weg van het ene land naar het andere, te voet of met een lijn, gaat door een gebied met `border: true`. Anders laadt de wereld niet. Bij de oversteek zie je de eigen regel van het land, je geld wordt gewisseld (de wisselaar houdt 2 procent, knop `lands.exchange_cut`), en de kroniek noteert het. Een gebied met `blend` mengt twee landen: gezegden uit beide kits, en er wordt niets gewisseld.
- **Wie in een land is, speelt onder zijn kader.** De stem, de kroniekverteller en de verteller krijgen het kader en de stemkit van het land. De bewaker leest de lijst van wat daar niet bestaat. Bedragen staan in de munten van dat land en de wet van dat land geldt, met een eigen dienaar en boetes. Wie thuis gezocht wordt, is dat daar niet, en je stand begint er opnieuw. Mensen die daar ontstaan, krijgen de namen en het geloof van het land, en de kaart van een streek krijgt het palet van zijn land.
- **Per wereld.** Skerrow heeft de Westelijke Eilanden van de elfen. De witte boot vaart op Restday naar Ynys Wen zodra de Lamp brandt. Daar heet je "child of the short years", betaal je in ringen en kralen, en is Eluned de wet. Deepwell heeft de Kessler Claim, een bedrijfsconcessie achter een luik oostelijk van de Ice Works, met scrip, "contractor" en een boete die zelfs een dode afkoopt. De Nethermarch heeft nog geen tweede land in de content. Het wereldboek in Claude Docs noemt nu wel Rijkland en Flemmark als landen (hoofdstuk 2, Landen).

- **Een land met alleen een kader schrijft de kroniekverteller zelf.** Een land zonder eigen stemkit en namen speelt meteen, met de stem, namen, munten en wet van de wereld. Kom je er voor het eerst binnen met een model, dan schrijft één aanroep van de nieuwe soort `land` wat het eigen maakt: hoe mensen spreken en je aanspreken, namen, munten met een koers, wie de wet houdt, en wat je bij de grens merkt. Dat gebeurt één keer, en boven je drempel eerst gevraagd. Het spel houdt per veld wat klopt: eden alleen bij de geloven van het land. Wat de ontwerper later schrijft, gaat voor. Kosten: ongeveer 3.900 tokens in en 800 uit met de kroniekverteller (Opus 5.5), zo'n 3 cent, één keer per land per spel. Dat model, omdat het blijvende content is die het hele land kleurt, met `maxTokens` 1500 als grens. Een echt antwoord wordt nog opgenomen.

Testen: `npm run playtest -- crossing` vaart met de witte boot heen en terug; het verslag staat in `docs/playtest/crossing.txt`. In de app op Skerrow: steek de Lamp aan, ga op Restday om negen uur naar de haven en neem `take the white boat`. In Deepwell loop je vanaf het perron van de Ice Works naar het oosten. In de editor staat het tabblad Landen. Tests in `tests/m1023lands.test.ts`, `tests/m1023borders.test.ts` en `tests/m1023frame.test.ts`.

Wat de editor en de kroniekverteller leerden: het tabblad Landen toont per land zijn YAML en een eigen stemkit, en een nieuw land begint met een sjabloon. Een nieuw gebied met `land:` komt in de map van dat land. Check noemt een land waar niemand kan komen of binnengaan. Het contract kent de soort `land` en de velden `land`, `border` en `blend`. Het wereldboek heeft een hoofdstuk Landen met per land de grens, de munten en de koers, de wet, de aanspreekvorm en het kader.

Nog niet af: de wereldbouw per land in de gids, en de kroniekverteller die een land schrijft dat de ontwerper alleen een kader gaf (beide nog in (1)). Het bereik tussen landen en het nieuws dat weken over de zee doet, komen van de andere sessie.

Bewust anders: prijzen blijven overal in de kleinste munt van de wereld. Een land noemt ze in zijn eigen munten tegen een hele koers, zodat elk bedrag precies uitkomt en niets in de content hoeft te worden omgerekend. Onderweg vond ik twee dingen die ook zonder landen fout waren: de vaarprijs werd genoemd in de munt van de aankomst, en de havenklok van Skerrow was de hele overtocht te horen.

## M10.22 af: de speler weegt mee, en de grote lijnen in zicht, 29 september 2026

- **Je daden duwen een grote lijn.** Dat regelt de content: een drijfveer met `by: player` telt wat jij doet, en je misdaden tellen mee. Per lijn en per dag gaat dat hooguit tien punten omhoog of omlaag, de bestaande regel voor een verschuiving. Wie een reeks misdaden tegen schout Everhard begaat, duwt de onrust van de veensteekers over de drempel, en de Broederschap legt het werk neer (plan `peat_strike`).
- **Wie aanzien heeft, brengt de twee kanten aan één tafel.** Een lijn kan `mediation` hebben: wie er aan tafel zitten, hoeveel het verlicht en wat de kroniek erover zegt. Staat de lijn op haar dreiging, zijn beiden aanwezig en ben je lid van een van hun facties of vertrouwen ze je allebei, dan doet MEDIATE BETWEEN het. Persuade en Insight beslissen; waar de wereld die vaardigheden niet kent, beslist het vertrouwen. De uitkomst verschuift de spanning. Bij de volgende beoordeling zegt de kroniek wat de doorslag gaf ("after the stranger brought Gerrit of the peat-cutters and Schout Everhard to one table").
- **In zicht.** Het dagboek heeft onder You de pagina "The great lines": per lijn de stand, wat hem bewoog en de laatste beoordelingen. De landkaart kleurt de rand van de streek als een lijn dreigt of gebroken is, met de naam erbij. De kroniek van het spel heeft een deel THE GREAT LINES met elke beoordeling, ook de maanden waarin er niets kwam.
- **Niet te vaak.** Een test laat dertig dagen zonder speler lopen in de Nethermarch, Skerrow en Deepwell: hooguit één dreiging en geen gebeurtenis.
- **Per wereld.** De Nethermarch kreeg een tweede lijn, de onrust van de veensteekers, want de Broederschap en de mannen van de Graaf zijn rivalen in de content. Skerrow kreeg een tafel voor Maren en Garrick over de olie van de Lamp, en een misdaad tegen de vuurtorenwachter scherpt de storm aan. Deepwell heeft geen van beide; een test speelt die neutrale standaard.

Testen: begaan een paar misdaden in Veenhoek en kijk in het dagboek onder You > The great lines. Of zet, met het dev-menu of een snelle klok, de onrust op haar dreiging en doe `mediate between gerrit and everhard` met beiden bij je. Tests in `tests/m1022weigh.test.ts`.

Wat de editor en de kroniekverteller leerden: `mediation` staat in het contract en in de stap Signalen, en Check noemt twee aan tafel die aan dezelfde kant staan. `docs/NEW-WORLD.md` zegt waar de vreemdeling meeweegt.

Bewust anders: de afspraak `meet` met beide partijen is de afspraak die er al was. De bemiddeling vraagt alleen dat beiden er zijn, hoe je dat ook regelt.

## M10.21 deel: de wenk bij het vertrek, 29 september 2026

- **Wie de streek verlaat met open draden, krijgt één wenk.** Het maakt niet uit of je over de rand van de kaart gaat of een lijn neemt. De wenk bestaat uit de twee zwaarste draden, met de naam en de stand erbij: een open quest (met "In 30 days it goes on without you" als hij verloopt), een verzoek ("Aaltje waits for you"), je woord ("You promised Mirte: ..., within 2 days", met "Away, you will miss it, and it will be remembered" als het onderweg vervalt) of een schuld. Een belofte die onderweg vervalt, weegt het zwaarst.
- **In de wereld, nooit een venster.** Reist er een metgezel mee, dan zegt die het ("Wouter, as you set off: "Before we go. ..."). Anders is het je eigen gedachte. Er komt geen vraag en niets houdt je tegen: één wenk per vertrek. De weg terug naar de streek geeft geen wenk.
- **Het dagboek toont hetzelfde** onder de landkaart als je een bestemming kiest: "What you leave open if you go now:".

Testen: neem een quest aan (bijvoorbeeld de grijze kat van Grietje) en loop vanaf Oude Zijl naar het westen tot de rand, en kies `1`. Of kijk in het dagboek onder You > The land map en kies een bestemming. Tests in `tests/m1021leaving.test.ts`. In de speeltest `faraway` staat de wenk nu bij het vertrek naar Graafhaven.

Bewust anders: de wenk komt uit de sjablonen en niet door de stem van een model, zodat hij altijd hetzelfde leest en niets kost. De waard of schipper zegt hem niet, omdat de vervoerder in de content een woord is en geen persoon die je kent. Een uitbreidingsronde bestaat nog niet (M10.24), dus die geeft ook geen wenk.

## M10.22 deel: één cadans, één wachtrij, met een rem in echte tijd, 29 september 2026

- **Eén nachtronde wacht tegelijk.** Wat later op de nacht binnenkomt, gaat in dezelfde ronde. Een nachtronde neemt de twaalf belangrijkste signalen (de wereldknop `story.signals_per_night`). De rest wacht één nacht en gaat daarna terug naar de regels, zodat niets eeuwig wacht.
- **Overdag hooguit één ronde per speldag.** Dat gebeurt alleen bij nieuws vanaf de wereldknop `story.urgent_belang`, standaard 4: een dood in het dorp. De rest wacht tot de nacht.
- **Een rem in echte tijd, hoe snel de klok ook loopt.** De nachtronde komt hooguit elke 20 minuten echte speeltijd. De eerste van een sessie wordt nooit tegengehouden. De grote lijnen worden hooguit elke 2 uur beoordeeld, en als de maanden van het spel uitblijven minstens eens per 10 sessies. Die drie getallen zijn knoppen onder Instellingen > Advanced. De app houdt in `pace.json` bij wanneer ze liepen. Het dev-menu (Chronicler) toont onder Cadence de wachtrij, of de ronde van vandaag al gebruikt is, en wanneer de volgende nachtronde en beoordeling mogen.
- **Een replay doet hetzelfde.** Een beoordeling die de app afdwingt, staat in het logboek.

Testen: speel met een snelle klok (`TEMPO`, of lang `wait`) en kijk in het dev-menu onder Chronicler, Cadence. Tests in `tests/m1022queue.test.ts` en `tests/m1022pace.test.ts`.

Bewust anders: de roadmap zegt "een signaal van belang 5" voor overdag. Ik hield 4 als standaard, als knop, omdat een dood in het dorp quests en mensen dezelfde dag verandert en 22 scenario's daarop rusten. De grens van één per dag geeft de rem die Bram vroeg, en een wereld mag 5 zetten. De weefronde blijft één aanroep per wijk, van ongeveer 2 cent. Twee wijken op één dag zijn zeldzaam, want een wijk komt pas als je er iets doet. De maandbeoordeling is een eigen aanroep op het moment van de nachtronde, onder dezelfde rem.

## M10.21 deel: een richtprijs per uur, 29 september 2026

- **Onder Instellingen > AI staat nu wat een uur spelen ongeveer kost met jouw modellen.** Het gaat om 40 regels gesprek, 25 keuzes van doelen en de ronde van één nacht. Een nieuwe plek in een verre stad staat er apart bij: de omtrek, de eerste wijk en de weefronde. De cijfers komen uit de tokens van de echte proeven van vandaag (`src/node/ai/measured.ts`, geschreven door `npm run coverage`) en de prijzen van de modellen die je koos. Met Haiku, Sonnet en Opus 5.5 is dat ongeveer $0,49 per uur, en $0,16 voor een nieuwe plek. Van een model zonder bekende prijs zegt de regel dat.

Testen: open Instellingen > AI en kijk onder het uurbudget. Test in `tests/m1021guide.test.ts`.
## M10.21 deel: de vraag voor een wijk, 29 september 2026

- **Boven jouw grens vraagt een wijk het eerst.** Kost het maken van een wijk meer dan je instelling "Ask first above" (standaard $1), dan vraagt het spel het één keer: "Making the Dyke Gate and the fish market of Graafhaven playable costs about $0.80", met 1 Go on, 2 Not now en 3 Always. "Not now" betekent de rest van die speldag geen wijk en geen vraag. "Always" vraagt het nooit meer. Een wijk kost met Opus ongeveer $0,08, dus bij $1 vraagt hij niet. Zet de grens op $0,05 om het te zien. De vraag zelf is gebouwd door de andere sessie (`asking.ts`).

## M10.21 deel: één vraag boven een grens, 29 september 2026

- **Kleine bedragen lopen gewoon.** Onder Instellingen > AI staat "Ask first above", standaard $1. Een aanroep die volgens de prijzen minder kost, loopt meteen en is zichtbaar in de lampjes van de statusbalk. Kost één aanroep meer, dan vraagt het spel het één keer, als keuze in het spel: "Making ... costs about $1.50 with the model you chose. 1. Go on 2. Not now 3. Always go on, and stop asking". Go on doet het meteen. Not now geldt voor de rest van de speldag. Always zet de instelling op nooit vragen; [Never ask] in de instellingen doet hetzelfde, en een bedrag zet het terug.
- **De prijs komt van de gateway**, die de modellen en hun prijzen kent. Hij rekent de invoer tegen de volle prijs, en de helft van wat de aanroep mag schrijven. Het mockmodel heeft geen prijs en vraagt dus nooit.
- **Een replay stelt dezelfde vraag.** Of er gevraagd is, staat in het logboek (`k: 'ask'`), net als de antwoorden van een model.

Testen: dit is het mechanisme. De eerste aanroep die het gebruikt, is een wijk van een verre stad; die sluit de andere sessie aan (`mustAsk` in `src/engine/asking.ts`). Zo'n wijk kost met Opus ongeveer $0,08, dus met de standaardgrens van $1 vraagt hij niet. Zet de grens op $0,05 om de vraag te zien. Tests in `tests/m1021ask.test.ts`.

Bewust anders: de roadmap noemt "$0,80 voor een wijk", maar de wijk van de andere sessie is één kleine aanroep. Een vraag komt dus pas bij iets groters, zoals de uitbreidingsronde van later.

## M10.20 af: de wereldbouw goedkoper, echte voorstellen in de tests, elke aanroep beproefd, 29 september 2026

- **Een bouw van twaalf stappen kost nu $2,84 in plaats van $10,09.** Gemeten op jouw hoofdstukken van The Quiet Reach, met jouw sleutel en modellen. Alle twaalf stappen laden; drie hadden één herstelronde nodig. Het vaste deel van een stap (gids, contract, `CHRONICLER.md`) gaat voorop en blijft een uur in de cache, zodat elke volgende stap het voor een twintigste van de prijs leest. Een stap ziet alleen de sleutels van `world.yaml` die hij nodig heeft. Hij krijgt een eigen maximum voor de lengte, dat meegroeit met je hoofdstuk, en een eigen denkinspanning: laag voor tabellen, midden voor verhalen. Stem, Kalender, Geld en Vervoer gaan naar het model dat je voor het brein koos (bij jou Sonnet 5, de helft van Opus). Ze laden daar even goed en zijn even trouw aan je tekst. Palet laadde op Sonnet niet en blijft bij de kroniekverteller. Alles staat in `docs/worldbuild/cost-measure.md`.
- **De tests spelen echte voorstellen.** De bouw is opgenomen in `tests/fixtures/worldbuild/quiet-reach/`, zonder sleutel of bedragen, en `tests/m1020fixtures.test.ts` speelt hem stap voor stap na tot een wereld die laadt en speelt. Een fuzztest zet willekeurige, volgens het schema geldige dingen van elke soort in Deepwell en Skerrow. Elk ding laadt, of de controle zegt precies waarom; hij crasht nooit. De smoke test van de editor doet één wereldstap via de echte IPC.
- **Elke soort modelaanroep is echt beproefd.** Het zijn er nu 21, met `district` en `weave` van de andere sessie. `npm run trial -- --kind <soort>` (na `npm run build`, met jouw sleutel, nooit in CI) speelt een vaste situatie, leest het antwoord zoals het spel het leest, en bewaart het met `--record`. `docs/COVERAGE.md` (`npm run coverage`) toont per soort de mocktest en het laatste echte antwoord. Een test faalt als de code een soort aanroep doet die er niet in staat. Het modeladvies probeert per rol nu ook de andere soorten van die rol.
- **Gevonden met een echt model, en gerepareerd.** Anthropic weigerde het schema van de nachtelijke ronde als te groot, dus die ronde liep bij jou nooit via Opus. Het weigerde ook de map van het palet in de editor, en een `maxItems` in de doelen van het brein; dat laatste staat ook in jouw AI-log. De providers passen het schema nu aan wat ze aankunnen. Lukt dat niet, dan vraagt de app één keer zonder grammatica, met het schema als tekst, en controleert het spel het antwoord zoals altijd. OpenAI vraagt alleen nog strikt waar dat mag; de wereldstap werd daar tot nu toe geweigerd. De stemkit kreeg objecten waar het spel tekst verwacht: het verzoek noemt nu de velden. Bij de bouw zelf: een stemkit zonder hoofdsleutel `voice:` krijgt die er vanzelf boven. Een herstelronde op een aanvulling (`merge: true`) blijft een aanvulling. Elke stap kent nu de verplichte velden van elke soort. En de melding over een mindere uitkomst zegt welk veld ontbreekt.

Testen: bouw een wereld in de editor zoals op 28 september. Onder elke stap staat wat hij kostte. Of speel met je sleutel een nacht om (`sleep`) en kijk in het AI-log of de ronde van de kroniekverteller nu antwoord geeft. Tests: `tests/m1020cost.test.ts`, `m1020fixtures`, `m1020schemas`, `m1020coverage` en `m1020providers`.

Bewust anders: het modeladvies laat de soorten van spel en nacht meedoen, niet die van de editor, want de wereldbouw meet die zelf. Haiku is voor de tabelstappen niet geprobeerd; het doel was al gehaald. Plekken is met 26.000 tokens uitvoer de duurste stap; denkinspanning laag is daar de volgende knop, maar niet gemeten. De vorm van het jaar per wereld wacht op jou, zoals afgesproken. De metingen kostten samen ongeveer $7,90.

Wat de editor en de kroniekverteller leerden: geen nieuwe soort of nieuw veld, dus het contract is hetzelfde. De kroniekverteller krijgt in elke wereldstap de verplichte velden van elke soort. Het verzoek voor de stemkit noemt de exacte velden. `docs/NEW-WORLD.md` zegt welk model welke stap schrijft en wat een bouw kost.
## M10.22 deel: de grote lijnen, 29 september 2026

- **Een wereld heeft grote lijnen: grote gevaren die op de achtergrond groeien.** Nieuw is de soort `tides` in de content. Een lijn heeft gebieden, drijfveren, een dreigingspunt, een drempel, wat een dreiging doet, en het plan dat de gebeurtenis speelt. Drijfveren zijn een seizoen, spanning tussen rijken, een tekort in het grootboek, een vlag of feiten van een soort; een negatief gewicht kalmeert. Elke dag telt de motor op wat de lijn voedt, en de druk zakt een beetje (knop `tides.decay`).
- **Op de eerste van elke maand wordt elke lijn één keer beoordeeld.** Onder het dreigingspunt: niets. Daarboven: een dreiging, met de stemming "threat" in de gebieden, nieuws en iets hogere prijzen. Vanaf de drempel: de gebeurtenis zelf. Met een model kiest de kroniekverteller (één aanroep `tides`, hooguit 600 tokens), maar alleen uit wat de regels toestaan. Zonder model beslist de regel. Hooguit één gebeurtenis per seizoen per lijn, daarna een afkoeling (knop `tides.cooldown_days`, standaard 91 dagen). Elke beoordeling staat met het waarom in de geschiedenis van de lijn en in de kroniek.
- **De gebeurtenis speelt de motor.** Het is een plan uit de content, met een feit van belang 5 dat de spoedronde van de kroniekverteller vanzelf oproept. Het plan zelf draait zonder model, tik voor tik.
- **Vluchtelingen eten mee.** Een groep die ergens terechtkomt (het werkwoord `crowd`) eet nu uit de voorraad van die nederzetting, naar rato van haar grootte.
- **Per wereld:**
  - **De Nethermarch** heeft de grote overstroming. De herfst duwt en de winter harder; een bemande dijk kalmeert. De gebeurtenis is het lek in de Grote Dijk (`dyke_leak`), en de doorbraak volgt als niemand de dijk op tijd stut.
  - **Skerrow** heeft de grote storm, met een eigen plan: de haven kapot, de strandbewoners in de Salt Kettle, zoute vis schaars.
  - **Deepwell** heeft de lange duisternis, gevoed door tekorten.
  - **The Quiet Reach** heeft bewust nog geen lijn; dat is jouw wereld, en een lijn kan erbij in de stap Signalen.
- **In dertig dagen zonder speler** komt er per wereld hooguit één dreiging en geen gebeurtenis. Een test bewijst dat.

Testen: `tests/m1022tides.test.ts` (7). In een spel duurt het maanden. Wil je het zien, dan kan dat met de test of met een snelle klok over de winter.

Kosten: één `tides`-aanroep per maand, hooguit 600 tokens, alleen als de wereld lijnen heeft. Er is nog geen opgenomen echt antwoord; dat neemt de andere sessie op met je sleutel, binnen je budget.

Wat de editor en de kroniekverteller leerden: de soort `tides` in het contract (met een noot over de drijfveren), de stap Signalen (die ook plannen voorstelt), een sjabloon in de editor, en een regel in Check voor een lijn die niets kan duwen. Een onbekend plan, gebied, rijk, seizoen of nederzetting, of een drempel die niet boven de dreiging ligt, houdt het laden tegen. Het wereldboek toont de lijnen bij de machten.

- **Een nieuwe factie ontstaat alleen uit een plan.** Dat kan een plan van een grote lijn zijn, of van een verhaallijn van de kroniekverteller: een opstand die een beweging wordt. Het gaat met het werkwoord `found_faction`, hooguit één per seizoen per wereld (knop `growth.new_faction_days`), en de factie komt als content in de save onder een id dat de wereld nooit had. Op Skerrow vormen de bootploegen van de Hythe zich na de grote storm om de havenmuur te herbouwen, met Brannoc als eerste lid.

Nog open in M10.22 (andere sessie): de cadans met een rem in echte tijd, één wachtrij, de pagina "De grote lijnen" in het dagboek en de kleur op de landkaart, en jouw invloed via bemiddeling.

## M10.22 deel: zetels van facties, 29 september 2026

- **Een factie zit op meer plekken, met wat ze daar wil.** Nieuw is `seats` in de content: een plek of gebied met een zin over wat de factie daar wil. De Nethermarch haalt ze uit zijn eigen zeteltekst. De Graaf zit in het schoutshuis ("the survey finished, the peat-cutters quiet"), de Lantaarn in de kapel van Veenhoek en in de priorij. Skerrow heeft er één: de zeelieden van de Oude Sterren bij de haven. Deepwell noemt er bewust geen; dat is de neutrale standaard.
- **Een wijk krijgt zetels van bestaande facties, nooit een nieuwe factie.** De wijk-aanroep mag hooguit twee zetels voorstellen op een van zijn eigen plekken, alleen voor facties die de wereld heeft. Een verzonnen factie valt weg.
- **Het dagboek** noemt op de pagina van een factie ook de andere zetels, maar alleen waar je geweest bent of van gehoord hebt. Het wereldboek toont ze in de tabel met machten.

Wat de editor en de kroniekverteller leerden: `seats` in het contract, in de stap Mensen en in het sjabloon voor een nieuwe factie. Een zetel op een plek die niet bestaat, houdt het laden tegen.

Nog niet: een nieuwe factie die uit een verhaallijn of een grote lijn ontstaat. Die komt met de grote lijnen.

## M10.22 deel: verhaallijnen over gebieden heen, 29 september 2026

- **Een lijn uit Veenhoek loopt door in Graafhaven.** Verhaallijnen volgen mensen en geen gebied, dus dat kon al in principe. Nieuw is dat de weefronde ook een echo mag geven: één nieuwe persoon van de wijk krijgt een rol in een open verhaallijn (een bode, iemand die ervan hoorde en je herkent). Dat feit komt op die lijn, die dan plekken heeft in Veenhoek én in de wijk.
- **Nieuws reist met het vervoer.** Een plek zonder positie op de kaart, zoals Havenmoor voor Skerrow, lag altijd buiten bereik van het nieuws. Nu komt groot nieuws er aan met het pakketschip, na de overtocht en niet eerder.
- **Een wijk die gemaakt wordt, is geen nieuws.** Het feit staat in het logboek en de kroniek, maar niemand vertelt het en het komt op geen verhaallijn. Eerst begon Hester op "What's new?" over "the Dyke Gate and the fish market".
- **Een nieuwe speeltest, `faraway`,** de eerste met het mockmodel: van Mirte en de molen via de westrand naar Graafhaven. Daar maak je de eerste wijk, Hester vraagt je Grietje thuis op te zoeken, en Joris kent een lijn uit Veenhoek. Het protocol in `docs/PLAYTEST.md` noemt hem.

Testen: `npm run playtest -- faraway` en lees `docs/playtest/faraway.txt`. Tests in `tests/m1022weave.test.ts` en `tests/m1022lines.test.ts`.

## M10.22 deel: de weefronde na een wijk, 29 september 2026

- **Na elke wijk weeft de kroniekverteller de nieuwe mensen in de wereld.** Eén aanroep (`weave`, hooguit 1.200 tokens, normale voorrang). Hij krijgt de nieuwe mensen van de wijk, de mensen die je kent (die van thuis eerst), waar je vandaan kwam en de open verhaallijnen. Hij stelt alleen verbindingen voor: hooguit vier banden tussen een nieuwe en een bestaande persoon, hooguit twee geheimen voor nieuwe mensen, en één draad terug naar huis.
- **De motor keurt alles.** Een band houdt hij alleen als het om een nieuwe en een bestaande, levende persoon gaat die nog geen band hebben, met een rol uit de lijst. Hij komt aan beide kanten, met het "waarom" als notitie en als feit in de kroniek. Een geheim komt als content op de nieuwe persoon (met een hint voor wie goed kijkt) en wordt eerst gecontroleerd. De draad is een verzoek van een nieuwe persoon om iemand thuis op te zoeken ("tell my cousin I am well"). Wat niet klopt, zoals een id die niet bestaat, valt weg.
- **Mensen die in een gesprek genoemd zijn en in de stad wonen, worden mensen van haar eerste wijk.** Dat gebeurt zonder model, met de band uit dat gesprek. Voorheen gebeurde dat alleen als de verre plek zelf gemaakt werd.
- **Zonder model** is er geen weefronde. Een verre plek waar je alleen doorheen loopt, krijgt er ook geen, volgens de regel van M10.21.

Testen: speel met een model naar Graafhaven, vraag in de markt iemand iets, en kijk daarna in je dagboek en bij de nieuwe mensen: een neef van iemand uit Veenhoek, een verzoek om iemand thuis op te zoeken. Tests in `tests/m1022weave.test.ts` (3).

Kosten: één `weave`-aanroep per wijk, alleen na een wijk die de kroniekverteller maakte of die nieuwe mensen heeft. De meting per model komt in de dekkingstabel van de andere sessie.

## M10.21 deel: een stad groeit per wijk, 29 september 2026

- **Een verre stad heeft wijken, uit het wereldboek (hoofdstuk 6).** Graafhaven heeft de Dijkpoort met de vismarkt, de gildehuizen, het Graafshof, de Brandaris en de haven met de verdronken klokken. Zwolderkamp heeft de markt, de pakhuizen aan de Yssel en de lijnbaan. Stavermouth heeft de dichtgeslibde haven en het Vrouwezand. Havenmoor (bij Skerrow) heeft de kaden en de bovenstad.
- **Een wijk komt pas als je er iets doet of erheen gaat.** Doorlopen maakt geen wijk. Doe je iets in de stad (iets kopen, iemand iets vragen, een bed huren, iets zeggen in een gesprek), dan komt de eerste wijk rond poort, markt en herberg. Vanaf de markt lopen dan straten naar de andere wijken. Loop je zo'n straat in, dan wordt die wijk gemaakt. Een wijk die er is, blijft.
- **De kroniekverteller schrijft de woorden, de motor de vorm.** Eén aanroep per wijk (`district`, hooguit 3.000 tokens uitvoer): hooguit zes plekken en zes mensen, met de regels van de stappen Plekken en Mensen (drie tot vijf zinnen, hooguit zeventig woorden, een ander zintuig, een wenk naar een uitgang). Alles wordt als content gecontroleerd voordat het in de save komt. Woorden die de regels breken vallen weg; blijft er niets over, dan doet het sjabloon het. Zonder model: de straat met de regel uit het wereldboek, en in een andere wijk één bewoner.
- **Gevonden en gerepareerd:** de weg naar Graafhaven vertrok uit Wouters palingweren in de Blackmere. Een randplek zonder eigen positie telde niet mee; nu telt de positie van zijn gebied, en vertrekt de weg bij de Oude Sluis in Oude Zijl.
- **Ontwerpwijziging.** De roadmap zei: "gemaakt met dezelfde stappen Plekken en Mensen als de wereldbouw". Het werd één kleinere aanroep met de regels van die stappen, waarbij de motor de vorm vastlegt, zoals bij verre plekken sinds M9.1. Dat is goedkoper, en een wijk sluit zo altijd aan op de stad.

Testen: speel de Nethermarch, ga naar Graafhaven (vanaf Oude Zijl naar het westen, bij de rand `1`), vraag in de markt iemand iets, en loop een van de nieuwe straten in. Tests in `tests/m1021districts.test.ts` (4).

Nog niet: de vraag "dit kost ongeveer $0,80" boven jouw grens; die sluit ik aan zodra de andere sessie `asking.ts` heeft. De markt van een stad die niet met de streek handelt, verkoopt nog niets. De weefronde na een wijk komt in M10.22.

Wat de editor en de kroniekverteller leerden: `districts` in het contract en in de stap Vervoer (met een controle); Check noemt een stad waarvan de wijken nooit te bereiken zijn, of een wijk die twee keer genoemd wordt. Het wereldboek heeft een tabel met verre plekken en hun wijken.

## M10.21 deel: de wereld groeit alleen waar jij iets doet, 29 september 2026

- **De regel staat in het contract.** Niets maakt zichzelf. De wereld groeit alleen op drie momenten: je komt aan bij iets dat alleen een schets was, een lijn brengt je voorbij de kaart, of de kroniekverteller heeft 's nachts binnen zijn budget één plek of persoon nodig. Nooit omdat je alleen in de buurt loopt.
- **Doorlopen kost niets.** Een verre plek wordt bij aankomst speelbaar uit sjablonen, ook als er een model is. Poort, markt en herberg, een koopman en een waard: zonder aanroep en zonder "de kroniekverteller werkt de weg nog uit". Pas als je er iemand aanspreekt of er een nacht blijft, werkt de kroniekverteller de plek uit tot een omtrek. Dat is één kleine aanroep (de outline, hooguit 1.400 tokens), één keer; een tweede bezoek kost niets.
- **Voorbij de laatste plek houdt de bekende wereld op.** Wie bij een verre plek verder loopt, leest: "North of Stavermouth, the world as far as anyone has told you runs out", met de weg terug. Er wordt niets gemaakt.
- **De doorrenner** heeft een test: dertig dagen elke dag naar het noorden. Resultaat: alleen Stavermouth, uit sjablonen, en geen enkele aanroep die iets maakt.
- **Ontwerpwijziging.** Het punt "drie lagen" zei nog dat de omtrek komt zodra je vertrekt, en de speelbare plek met een aanroep bij aankomst. Ik heb het latere punt over de doorrenner gevolgd, dat de lagen koppelt aan wat je er doet en niet aan aankomst. Het FO en het ontwerp voor lore zijn bijgewerkt. Met een model zijn verre plekken daardoor voorlopig sjablonen; de wijk met eigen plekken en mensen (het volgende punt) komt als je er iets doet. De woorden van de kroniekverteller voor een verre plek werken nog wel voor een oude save waarin een plek erop wacht.

Testen: speel de Nethermarch en loop een paar dagen naar het noorden (`head north`, bij de rand `1`). Of reis naar Zwolderkamp, slaap er en kijk in je dagboek. Tests in `tests/m1021runner.test.ts` (2); de far-place tests van M4 en M9.1 volgen de nieuwe regel.

Kosten: een omtrek is één `outline`-aanroep met hooguit 1.400 tokens uitvoer, alleen bij iemand aanspreken of overnachten, één keer per plek. De meting per model hoort bij de dekkingstabel van de andere sessie.

## M10.21 deel: de rand van de streek, 29 september 2026

- **Wie over de rand van de kaart loopt, hoort wat erachter ligt.** Aan elke rand van de Holleveen staat nu wat het wereldboek daar zegt (hoofdstukken 2 en 7). Je krijgt de keuze om verder te gaan of om te keren. In het westen ga je verder naar Graafhaven, twee dagen te voet dwars door het land of met de trekschuit vanuit Oude Zijl. In het noorden ligt Stavermouth, in het oosten Zwolderkamp en Hunnenloo. In het zuiden alleen de delta en het verdronken Saeftinge: "No road you know of goes that way". Verder gaan met de voet begint meteen vanaf de rand, niet eerst terug naar het dorp waar de weg vertrekt.
- **Niets wordt gemaakt door ernaar te kijken.** Aan de rand hoor je alleen de regel. Pas als je kiest om te gaan, wordt de verre plek uitgewerkt, zoals voorheen.
- **De kaart tekent de rand als rand**: een stippellijn langs de zijde die in beeld is, met erachter de verre plekken die je kent ("← Graafhaven"). Op de landkaart staat een verre plek met een vraagteken zolang hij alleen een naam en een regel is.
- **Skerrow** heeft vier randen in eigen woorden: in het oosten Havenmoor, twee dagen varen, met het pakketschip; in het westen de Glass Sea en de westelijke eilanden; in het zuiden het verdronken Aldmar.
- **Gevonden en gerepareerd:** een verre plek die alleen nog op de woorden van het model wachtte, telde niet mee als werk voor het model. Met een model aangesloten werd hij dus pas gemaakt als er toevallig ook iets anders wachtte.

Testen: speel de Nethermarch, ga naar Oude Zijl en typ een paar keer `head west`. Of kijk in de editor bij Palette naar de kaart van de Nethermarch: de noordrand met Stavermouth. Tests in `tests/m1021edge.test.ts` (7).

Wat de editor en de kroniekverteller leerden: `beyond` in het contract; de stap Palet vraagt en controleert het; er is een sjabloon voor een nieuwe streek; en Check noemt een rand die niets zegt over wat erachter ligt. Het wereldboek toont per rand de regel en waar hij heen leidt.

## M10.20 deel: een kaart uit de plekken, 29 september 2026

- **Een eerste streekkaart met één klik.** Een wereld zonder streekkaart speelde zonder kaart; geen stap maakte er een. Nu staat in de editor, tabblad Palette, onder de voorbeeldkaart "[Make a map from the places]". De editor legt de plekken neer zoals hun uitgangen zeggen: de windrichting, en zo ver als de minuten gaan in het tempo van de kaart (vier minuten per hex van 250 meter). Tussen de gebieden loopt een pad langs elke uitgang, en al het open land is één terrein van het palet. Het komt als voorstel met diff; pas bij [Accept and save] staat het erin. Daarbij zegt de editor wat je moet nakijken: een plek die alleen via in, uit, op of neer bereikbaar is, een lus waar de minuten en de kaart verschillen, en welke terreinen je nog moet schilderen.
- **Een streek heeft eigen terreinen.** Zwart basalt of open zee is geen veen. Onder `lands` loopt elk eigen terrein als een van de landen van de engine (bos, velden, veen, water, heide), met zijn minuten en zicht en wat een been opslokt. Het krijgt zijn kleur en naam uit het palet en een eigen regel die de vreemdeling leest. Paden krijgen ook een eigen regel. Zo komen er geen zinnen over zegge, veen of sloten in een andere wereld. Een kleine streek wordt per hex getekend (`zone: [0.25, 0.25]`), zodat je hem precies kunt schilderen. Wegzakken heet nu wat de grond daar is ("The salt marsh takes you to the waist").
- **De stap Palet schildert een bestaande streek**: land in de tekening waar jouw woorden het zetten, eigen terreinen met hun regel, en paden met een regel. De plekken, de maat en de oorsprong blijven staan.
- **Skerrow heeft nu een kaart**, eerst door de editor neergelegd en daarna geschilderd naar de eigen teksten van het eiland: kliffen in het westen en noorden, de Heights onder heide, zoutgras rond de Hythe, duinen bij de Wreck Strand, zoutmoeras bij de getijdepoelen, de kaap met aan drie kanten zee, en rondom de zee. Elk land en pad heeft een regel in Skerrows woorden, en het wereldboek toont de kaart met die regels. Een gevolg: nieuws gaat nu op het tempo van de kaart over het eiland, dus Brannoc hoort de dood van Pip in het tweede uur in plaats van het eerste.
- **The Quiet Reach** heb ik bewust niet zelf gedaan: het is jouw wereld. Open de editor, tabblad Palette, kies The Quiet Reach en druk op [Make a map from the places]. Daarna kun je de Palet-stap vragen om de zee, de getijdeplassen en het struikgewas te schilderen.

Testen: in de editor zoals hierboven, met The Quiet Reach. Of speel Skerrow en loop het eiland op (WALK, HEAD north). Tests in `tests/m1020regiondraft.test.ts` (7).

Wat de editor en de kroniekverteller leerden: de knop en het voorstel in Palette; `lands`, `zone` en `paths[].text` in het contract; de stap Palet vult ook `regions` en weet hoe hij een streek schildert; `docs/NEW-WORLD.md` noemt de streekkaart. Een teken in de tekening dat niemand benoemt, of een eigen terrein zonder kleur in het palet, houdt het laden tegen.

## M10.20 deel: tekens op het land per wereld, 28 september 2026

- **Een wereld noemt haar eigen tekens.** Tot nu toe had de kaart vijf vaste tekens, die van de Nethermarch: poel, veenput, wilg, oude muur en bult. Bij The Quiet Reach leende het model de veenput voor een mijnschacht. Nu heeft een palet `signs`, hooguit zeven, elk met een naam voor de legenda, een vorm (poel, put, boom, ruïne, bult, pluk, rots, waarschuwing, vraagteken), het land waarop het ligt met zijn aandeel (`fen: 0.1` is één vak op tien), de regel die de vreemdeling leest als hij erdoor loopt, en of het stevige grond is, water in de grond, of een plek waar een wandeling stilstaat om te kijken. De kleur per teken staat onder `glyph`, in beide stijlen.
- **Gevaar en onzeker zijn meer dan een kleur.** `means: danger` of `means: uncertain` zet een ! of ? naast het teken, en de legenda zegt het erbij ("old mine shaft, danger"). Precies waar het ontwerp van The Quiet Reach om vroeg.
- **De legenda toont de tekens** die op de kaart in beeld zijn, met hun vorm. Een wereld mag ook haar wegen een naam geven (`names.canal: tidal channel`).
- **Zonder eigen tekens** houdt een wereld die van de Nethermarch. De kaart van de Nethermarch is vak voor vak gelijk gebleven, en de speeltest-transcripties zijn ongewijzigd.
- **The Quiet Reach** heeft nu tide pool, old mine shaft (gevaar, koraal), native growth, abandoned structure (onzeker, violet) en basalt knoll, met je eigen kleuren. Het kanaal heet er tidal channel. **Skerrow** heeft tide pool, gorse, old cairn, wreck timbers (onzeker) en sheer drop (gevaar). Deepwell houdt bewust de standaard.

Testen: open de editor, tabblad Palette, en kies The Quiet Reach. Onder "Signs on the land" staan de tekens; voeg er een toe (bijvoorbeeld `steam_vent`, vorm warning, danger), dan toont de kaart erboven hem al vóór het opslaan. Beide werelden hebben nog geen streekkaart, dus in het spel zie je de tekens pas als de volgende stap (een kaart uit de plekken) er is. Tests in `tests/m1020signs.test.ts` (5).

Wat de editor en de kroniekverteller leerden: de editor heeft een tabel voor de tekens en namen voor de wegen. Het contract, de stap Palet in de wereldgids, `docs/NEW-WORLD.md` en het schema van het palet-voorstel kennen `signs`, met de regel dat een teken een eigen id krijgt en nooit de veenput van de Nethermarch leent. Een teken zonder kleur, een kleur zonder teken, een onbekend land of meer tekens dan een land vakken heeft, houdt het laden tegen.

Bewust niet: de kaart in de wereldatlas toont de tekens niet. Over de hele streek zouden ze ruis zijn; alleen gevaar en onzeker zouden er iets toevoegen, en die heeft nog geen wereld met een streekkaart.

## M10.20 deel: wat de editor toont, 28 september 2026

- **De uitleg van de kroniekverteller leest als tekst.** Wat het model onder een voorstel schrijft, staat nu in alinea's, met vet, schuin, `code` en lijsten (één niveau diep), in plaats van sterren en streepjes in één blok. Dat geldt voor de stappen, het tabblad Chronicler en de polijstronde; de vragen van het model tonen vet en code ook. De tekst wordt als React-elementen opgebouwd en nooit als HTML, dus niets uit een antwoord kan opmaak of script worden.

Testen: vraag in de editor een stap of iets op het tabblad Chronicler; een antwoord met `**vet**` en een lijst toont als opgemaakte tekst. Tests in `tests/prose.test.ts` (2).

## M10.20 deel: één laag voor knoppen, 28 september 2026

- **Knoppen van een wereld.** Elke spelregel die per wereld mag verschillen is een knop: 72 in totaal, met een omschrijving in gewone taal, een eenheid, een standaard en grenzen. Voorbeelden zijn de grenzen van een gesprek, de dagen van lenen en verzoeken, het ritme van mensen, de verhalen van de wereld en de spelregels voor personage en gevecht. Een wereld zet ze in `world.yaml` onder `knobs:`, bij een tabel alleen de rijen die anders zijn. De lader keurt een onbekende knop, een verkeerde vorm en een waarde buiten de grenzen af. De standaarden zijn de oude waarden: alle tests, de simulaties en de speeltest-transcripties zijn ongewijzigd.
- **Het tabblad Knobs in de editor.** Per knop de omschrijving, de standaard, de waarde van deze wereld en [Default]. Opslaan zet alleen wat afwijkt in `world.yaml`.
- **Knoppen van de app.** Onder Instellingen, Advanced: automatisch opslaan, opslaan na een lange tijdsprong, de pauze na stilte, het aantal regels van het AI-logboek, het aandeel van het uurbudget voor gesprekken, en hoe lang de editor, een persoon en de kroniekverteller op het model mogen wachten. Een waarde buiten de grenzen wordt teruggezet, en het scherm zegt dat. Ze staan in `knobs.json` en worden per sleutel geschreven.
- **Deepwell** houdt vijf dagen voorraad aan in plaats van drie, en een test laat zien dat het spel dat volgt. De smoketest zet één knop van de app anders.
- **Gevonden bij het nalopen:** het scherm voor een nieuw personage liep vast op de nieuwe knoppen. Het krijgt nu de knoppen van de wereld mee, zodat een eigen startgrens daar ook telt.

Testen: open de editor, tabblad Knobs, zet bijvoorbeeld `talk.max_turns` op 30 en sla op; kijk in Instellingen > Advanced. Tests in `tests/m1020knobs.test.ts` (7) en `tests/knobs.test.ts` (2), alle 836 groen, drie simulaties, speeltests, build en smoketests.

Wat de editor en de kroniekverteller leerden: het veld `knobs` in `world.yaml`, met het tabblad Knobs. Het contract noemt het, en de lijst staat in `docs/KNOBS.md`. `knobsSummary()` geeft de knoppen kort voor de prompt; die gaat er pas in als een antwoord om een spelregel vraagt.

Nog niet: de vorm van het jaar is geen knop. Daarvoor moet de kalender zelf anders; het staat als open punt in de roadmap en wacht op jouw besluit.

## M10.20 deel: The Quiet Reach in de app gebouwd, en wat de wereldbouw daarvan leerde, 28 september 2026

- **The Quiet Reach staat erin.** Je twaalf hoofdstukken zijn stap voor stap in de editor van de app ingevoerd, met jouw instellingen (Opus 5.5 als kroniekverteller), zonder je tekst te veranderen en zonder Enhance. Alle twaalf stappen zijn geaccepteerd; de wereld laadt, speelt en haalt zijn contract. Wat het model weg liet, zelf koos of vroeg, en wat je nog moet bekijken, staat per stap in `docs/worldbuild/quiet-reach-report.md`. Kosten: $10,25 in 28 aanroepen, waarvan ongeveer de helft op pogingen die op een fout van de app strandden.
- **Elke stap kent de precieze velden** van wat hij vult, uit de schema's: geneste velden, toegestane waarden, bereik van getallen en de vorm van teksten (openingstijden "07-12"), met korte noten waar een veld een id verwacht (een traject `van>naar`, een geheim over een persoon of plek).
- **Een stap ziet wat hij mag veranderen** (de YAML van de bestaande plekken, mensen enzovoort), en **mag een ding aanvullen met alleen de velden die hij zet** (`merge: true`): de economie geeft de plekken nu diensten en werkbanken zonder ze helemaal uit te schrijven.
- **Een voorstel dat niet laadt, kun je laten rechtzetten**: [Let the chronicler put it right] stuurt alleen de problemen terug, en alleen de verbeterde dingen komen terug. Bij Mensen kostte dat 8 seconden en $0,18 in plaats van een nieuw voorstel. Een herstelronde haalt nooit iets weg.
- **Een eerste voorstel met plekken laadt**: de weg terug komt er vanzelf bij, ook tussen nieuwe plekken, en een voorstel mag de start verplaatsen en de eerste plek weggooien.
- **Lange hoofdstukken worden niet meer afgekapt** (tot 48.000 tokens, tien minuten, via streaming), en een afgekapt antwoord telt mee in het AI-logboek en het budget; eerst stond het er als $0.
- **Het vervoer stuurt zijn reiszinnen mee** (`data/journey.yaml` mag in een voorstel), en **groepen sprekers hebben eigen uitroepen** naast die van hun geloof: technici zeggen "Hull and vacuum", het havenvolk van Skerrow "tar and twine".
- **Het ontwerplogboek** zet een beslist antwoord niet meer terug onder "Answers".
- **Je budget blijft je budget.** Het uurbudget nam stil hoogstens $5 over; nu blijft staan wat je instelt, met één vraag boven $20 per uur ("Are you sure? This lets the app spend up to $50 an hour.") en een grens van $1000 alleen tegen typfouten. Wordt een waarde toch aangepast (ook de antwoordtijd, 3 tot 60 seconden), dan zegt het scherm dat. "The hourly budget is used up" zegt nu over hoeveel minuten er weer ruimte is.
- **Een eigen budget per wereldbouw.** Boven de stappen staat "This build may spend up to $...", standaard je uurbudget, met wat de bouw tot nu toe kostte, en bij elke stap wat die stap kostte. De stappen tellen daar en niet in het uurbudget van het spel, dus een bouw wacht niet meer en je spel ook niet. [Count from zero] begint opnieuw te tellen met dezelfde grens.
- **Twee vensters van de app overschrijven elkaars instellingen niet meer.** Elke wijziging leest het bestand opnieuw en schrijft alleen zichzelf, en een venster ziet wat het andere veranderde. De geïnstalleerde app draait één keer: een tweede start haalt de eerste naar voren. In ontwikkeling mogen er twee draaien (de editor naast het spel).
- **Plekken lezen als die van de Nethermarch.** De plekregels staan letterlijk in de stap Plekken (hooguit 70 woorden, één hint naar een uitgang, onderwerpen tussen [haken], niet openen met de eigen naam), de Stem komt direct na het Kader, en Check heeft een kopje Descriptions dat ook bij een voorstel meekijkt vóór je aanneemt. Na de stappen is er een polijstronde voor de plekken die Check noemt: alleen beschrijvingen, per plek aannemen of laten, standaard met het lichtere model. Gedraaid op The Quiet Reach: van 88 naar 65 woorden gemiddeld, van 0 naar 6 plekken met [haken], voor $1,55 inclusief de meting.
- **Een open voorstel blijft bewaard.** Een voorstel dat je nog niet aannam of weggooide staat per stap in de map van de app en komt terug als je de stap opent, ook na een herstart of een nieuwe versie van de app.
- **De startuitrusting in de stap Geld.** Wat de vreemdeling bij zich heeft, stelt de stap Geld nu meteen voor als dingen in de inventaris, in plaats van het door te schuiven naar Economie. The Quiet Reach heeft haar uitrusting nu: chip, terminal, communicator, multitool, jas, laarzen, waterfles en onderzoekstas naast de rantsoenen.
- **Een voorstel kan de regels aanvullen.** Patrons, condities en afkomsten zijn eigen soorten in de regels, en de dood met eigen woorden gaat via `rules` in het voorstel. Een wereld zonder personages (zoals The Quiet Reach) mag ze toch hebben: pas met een klasse in de regels komen er personages en gevechten. The Quiet Reach heeft ze nu: de Remembered en de Witness bestaan, en de dood leest met Morrow en Holding the Name. Een voorstel dat je bewaarde, wordt opnieuw gecontroleerd als je de stap opent.

Testen: open de editor, kies The Quiet Reach en blader door de stappen: elk staat op "saved", en het ontwerplogboek (`content/quietreach/DESIGN.md`) toont per stap wat er gevraagd, gezegd en besloten is. Speel The Quiet Reach: je begint in de Arrival Lock, de Commons ligt oostelijk. Het rapport noemt per stap wat je moet bekijken.

Wat de editor en de kroniekverteller leerden: de precieze velden per stap (ook in het korte contract), `merge`, de herstelronde, `data/journey.yaml` als heel bestand, `oaths` op een stemgroep (in het contract, de stap Stem en `docs/NEW-WORLD.md`; Skerrow heeft er een, Deepwell houdt geen stemkit).

Nog niet, en open onder M10.20: de startuitrusting van The Quiet Reach (de geldstap maakt geen dingen), patrons en doodsteksten in de regels, een wet zonder boete, een kaart (geen stap maakt die), paletsymbolen met eigen namen per wereld, en een open voorstel dat een herstart overleeft.

## M10.20 deel: het wereldboek en de saves, 28 september 2026

- **"How this world was made" leesbaar.** Bij The Quiet Reach bleek het hoofdstuk een muur van tekst: je hele hoofdstuk per besluit, zonder alinea's en met tabellen als losse regels. Nu staat per besluit een kop (stap, besluit, tijd), wat je schreef als citaat met alinea's en echte tabellen, wat de kroniekverteller zei, wat hij terugvroeg en wat er veranderde. Een leeg kopje Notes valt weg.
- **Geen regel over saves na een nieuw spel.** Na [Begin here] of [New game] zei het spel nog "There is a saved game. Type CONTINUE ...", terwijl je net gekozen had. De wereldkeuze biedt doorgaan en laden al aan; de regel is weg, de commando's werken nog.
- **Overgeslagen stappen in het wereldboek.** "How this world was made" zegt welke stappen van de gids zijn overgeslagen, afgewezen of nooit opgepakt, met de neutrale standaard die de wereld daarvoor heeft. Een ontwerplogboek zonder stappen zegt daar niets over.
- **Het wereldboek als atlaspagina.** `npm run worldbook base --html` schrijft `out/worldbook/base.html`: dezelfde tekst als WORLDBOOK.md met een kopregel, een inhoudsopgave, de hele streek in het palet van de wereld, plaatjes bij de plekken, een portretgalerij, munten en kalender als kaartjes en het palet als kleurvakjes, licht en donker. Het boek neemt de nieuwste afbeelding van een plek, ook als die bij een oudere beschrijving hoort. Je keurde het voorbeeld goed. Na de import van The Quiet Reach geeft "[Save the world book as an atlas page]" onder Contract in de editor nu de hele wereld als atlas, geheimen en al: voor de ontwerper, niet voor spelers.
- **Een inventaris van harde getallen.** `npm run knobs` schrijft `docs/KNOBS.md`: alle 178 vaste getallen uit de code, elk met een plaats volgens je regel. 81 zijn spelregels die per wereld mogen verschillen (naar de content, met een neutrale standaard), 10 zijn gedrag van de app (naar de instellingen), 45 blijven code met een reden (veiligheid, de omvang van een save, snelheid) en 42 zijn eenheden van tijd. Het register staat in `docs/knobs.yaml`. Een test faalt bij een nieuw getal zonder plaats. Het verhuizen zelf is het volgende punt, "Eén laag voor knoppen".
- **Een wet zonder boete.** Bij The Quiet Reach schreef je bij moord "no fine that buys release", maar het spel vroeg een bedrag. Nu mag een moord of mishandeling in `law.fines` "hearing" zijn: PAY FINE weigert, en met GIVE YOURSELF UP (ook TURN YOURSELF IN of SURRENDER) bij de dienaar van de wet of op zijn kantoor zit je de uren van `law.hearing` uit in de cel, volgt de zitting met de tekst van de wereld, en is de zaak afgedaan. De dienaar van de wet zegt dan "You'll come with me and be heard" in plaats van een bedrag te vragen. The Quiet Reach heeft nu jouw wet: geen boete voor moord en ernstig geweld, 48 uur hechtenis en een zitting door drie buitenstaanders. Daarbij stond de plaats van de wet er als id in ("port_vesper"); dat is nu "in Port Vesper". Skerrow en Deepwell horen een dood op hun eigen manier; de Nethermarch houdt haar boetes.
- **Wat je hebt ontdekt.** In het menu "[What you found out]" en in het dagboek "[Save what you found out]": het dagboek van dit spel als atlaspagina. Deel voor deel staat er de pagina van elk onderwerp, het land zover je het zag, en portretten van wie je ontmoette. Alleen wat de vreemdeling zag, hoorde of verteld werd: geen onvertelde geheimen, geen stadia die je niet bereikte, en niet de kroniek van het spel. Het hele wereldboek blijft van de editor. Wat je nog niet ontdekte staat er als vraagteken, zonder namen (jouw idee): onder elk gebied dat je kent vakjes met een "?" en "Still to find here: 3 places", aan het eind de delen van het land waar je nog niet van hoorde, een "?" in de portretgalerij voor ieder die je nog niet kent, het aantal quests en verhalen dat nog op je wacht, en bij iemand die je kent "? Something not yet told." zolang die een geheim voor je heeft.
- **De ASCII-kaart in het wereldboek** staat nu in een vaste letterbreedte met krappe regels, zodat de kolommen kloppen (je opmerking bij de atlas).
- **Doorgaan en laden op het hoofdscherm.** Heeft een wereld een save, dan toont de wereldkeuze eerst "[Continue]" met wie, waar en de speldag van de laatste save, dan "[New game]", dat eerst vraagt of je echt opnieuw begint, en "[Load a save...]". Het laadscherm toont de saves die je zelf maakte en de laatste automatische, elk met die gegevens. Het menu in het spel heeft "[Continue]", "[New game]", "[Load a save...]" en "[Export this save...]". De commando's werken zoals eerst.
- **Een save als bestand.** "[Export...]" in het laadscherm en "[Export this save...]" in het menu schrijven een `.wisplight`-bestand, met wereld en contentversie, wie, waar en wanneer, de kroniek van het spel regel voor regel en de save zelf. "[Import a save...]" leest zo'n bestand, controleert het met zod en tegen de wereld, en zet het in de lijst onder de naam van het bestand.
- **Saves met een naam.** `save <naam>` (niet midden in een gesprek) of "[Name...]" in het laadscherm. Een save met een naam ruimt het spel nooit op. De terminalclient kent `save export <pad>` en `load <pad>`.
- **Een geheim over een persoon of een plek.** `about` en `teaches` van een geheim mogen nu ook een persoon, een plek of een gebied (`area_<id>`) zijn, zoals het spel ze al als onderwerp kent. Bij The Quiet Reach viel een voorstel om zo'n geheim. Het contract, de exacte velden van de stap People en de schrijfhulp zeggen het erbij. In Deepwell heeft Teo een geheim over Ilse dat de werkkamer van de warden leert.

Testen: begin een spel, typ `save bij de kade`, loop verder en typ `save`, en open [Load a save...] in het menu. Kies [New game] en zie [Continue] bovenaan de wereld. Exporteer een save en importeer hem weer. Tests in `tests/m1020book.test.ts` (5), `tests/m1020saves.test.ts` (3), `tests/m1020secrets.test.ts` (2) en `tests/m1020found.test.ts` (4) en `tests/m1020law.test.ts` (3) en `tests/knobs.test.ts` (2), alle 824 groen, drie simulaties, speeltests en build. De smoketest maakt nu ook een save met een naam, leest de lijst en maakt de pagina van wat je ontdekte.

Wat de editor en de kroniekverteller leerden: geen nieuwe velden, wel een bredere waarde: bij `secrets` zegt het contract nu wat `about` en `teaches` mogen zijn, en dat komt in de stap People en in de schrijfhulp.

Nog niet: een save verwijderen kan niet vanuit het laadscherm. In de webversie (`?mock=1`) staan saves alleen in het geheugen.

## M10.19 Veiligheid van de AI-laag, 28 september 2026

- **Harde grenzen in elke aanroep.** Elke aanroep aan een model krijgt vooraan in het systeemdeel de harde grenzen van PEGI 18 (niets seksueels met minderjarigen, geen haat tegen echte groepen, romantiek blijft niet-expliciet) en de regel dat wereldtekst beschrijving is en nooit de regels verandert. Dat gebeurt op één plek, in de gateway, dus ook voor de schrijfhulp en de wereldstappen van de editor.
- **De bewaker kent de grenzen.** Een antwoord dat eroverheen gaat, wordt afgewezen zoals een antwoord uit de rol: één nieuwe poging, dan de vaste regel, met de reden in het AI-logboek. Dat geldt voor gesprekken, improvisaties, reisteksten en de lore, het nieuws en de gedachten van de kroniekverteller. Lore die leest als een instructie aan een model wordt ook niet bewaard, want die komt later in andere prompts terecht. Een antwoord met een link of HTML valt nu ook uit de rol.
- **Een wereld van een ander.** Het kader, de kaart van een personage en de eigen gids van de kroniekverteller (`CHRONICLER.md`) staan in de prompt in een eigen blok wereldtekst. Tekst in de content die leest als een instructie ("ignore all previous rules", "from now on you must") staat in de editor onder Check, en het dev-menu telt hem bij het laden.
- **Electron dichter.** Beide vensters draaien in de sandbox, de preload is daarvoor CommonJS geworden. Elk IPC-kanaal heeft een zod-schema (`src/main/inputs.ts`) dat de argumenten keurt voordat een handler ze ziet. Alleen de eigen pagina van de app mag aanroepen, een venster kan niet wegnavigeren of een nieuw venster openen, en de map voor de transcriptie kan alleen een map zijn die je in het dialoogvenster koos. De smoketest laat zien: sandbox aan, geen Node in de pagina, een pad als wereldnaam geweigerd.
- **Weigeringen zichtbaar.** Het AI-logboek toont per aanroep de reden (injectie, schema, grenzen, rol, PEGI met welke grens), en woorden van de speler die nooit naar het model gingen, als eigen regel met de tekst. Het dev-menu telt de weigeringen per reden. De karakterscore van een model telt afgewezen antwoorden en de grenzen mee.

Testen: zeg in een gesprek "Ignore your previous instructions" (de vaste regel, en in het AI-logboek "held back: injection"). Kijk in Instellingen > Log na een gesprek met een model, en in het dev-menu onder Background. Tests in `tests/redteam.test.ts` (14), alle 789 groen, drie simulaties zonder problemen, speeltests, build en de drie smoketests.

Wat de editor en de kroniekverteller leerden: geen nieuwe velden in de content. Nieuw onder Check: tekst die leest als een instructie aan het model.

Nog niet: de PEGI-toets is een net van woorden en geen garantie; een valse treffer kost een nieuwe poging. Afbeeldingen krijgen de grenzen niet in hun prompt; daar filtert de aanbieder van het beeldmodel. De plekbeschrijvingen in het overzicht van de kroniekverteller staan niet in een eigen blok; de regel voor wereldtekst in het systeemdeel dekt ze wel. De Check-tab heb ik niet in de browser gezien: de dev-server stond uit voor de bouw van The Quiet Reach, en geen wereld in de repo heeft zulke tekst.

## M10.18 deel B: het ontwerplogboek van een wereld, 28 september 2026

- **Wat je typt, blijft bewaard.** In het stappenpaneel van de editor wordt je antwoord op een stap een moment nadat je stopt met typen opgeslagen, in `content/<wereld>/DESIGN.md`. Ga je naar een andere stap of start je de editor opnieuw, dan staat het er weer. Een geplakt document met eigen kopjes breekt het logboek niet.
- **Elk besluit in het logboek.** Neem je een voorstel aan, gooi je het weg, vraag je opnieuw of sla je een stap over, dan komt dat in het logboek met de datum, wat je vroeg, wat de kroniekverteller zei en terugvroeg, wat het voorstel veranderde, en je reden als je er een geeft (in het veld onder het voorstel).
- **Notities.** Onder de stappen schrijf je waarom de wereld is zoals hij is ("There is no faith here, because..."). De kroniekverteller leest de notities en de laatste besluiten mee bij elke stap, bij Enhance with AI en bij de schrijfhulp, zodat hij niet opnieuw voorstelt wat je afwees.
- **In het wereldboek.** Het logboek is het laatste hoofdstuk van het wereldboek van deel A ("How this world was made").

Testen: bouw verder aan een wereld in de editor, typ een antwoord, ga naar een andere stap en terug; gooi een voorstel weg met een reden; voeg een notitie toe; kijk in `content/<wereld>/DESIGN.md`. Tests in `tests/designlog.test.ts` en `tests/m1020.test.ts`.

## M10.18 deel A: het wereldboek en de kroniek per spel, 28 september 2026

- **Een wereldboek uit de content.** `npm run worldbook base` (of `isle`, of een andere wereld) schrijft `content/<wereld>/WORLDBOOK.md`: de wereld, de kaart, geschiedenis en lore, machten, geloven, dorpen, de startstreek, de plekken, de mensen met banden en beroepen, geheimen, bestiarium, munten en kalender, quests, namen en spraak, ambachten, vervoer, wat er gebeurt als (de wachters en nasleep in gewone taal), de regels in het kort, en hoe de wereld eruitziet en klinkt. De volgorde is die van het Nethermarch-wereldboek. Een soort die een wereld niet heeft, geeft geen hoofdstuk: Deepwell heeft geen Faith, Bestiary of regels.
- **Altijd bij.** De editor schrijft het boek opnieuw bij elke opslag. De Nethermarch en Skerrow hebben het in de repo, en een test faalt als het niet meer bij de content past; `npm run worldbook` maakt het weer gelijk.
- **Als webpagina.** In de editor onder Contract: "[Save the world book as a web page]". Dat geeft een HTML-bestand met de afbeeldingen die al gemaakt zijn (gebieden en portretten); wat nog geen afbeelding heeft, blijft tekst.
- **De kroniek van een spel.** In het menu "[Chronicle]" en in het dagboek "[Save what happened in this game]": een Markdown-bestand met de gebeurtenissen, de verre plekken, de mensen die terloops genoemd zijn, de improvisaties, de verhalen van de kroniekverteller en de verhaallijnen. De kroniek hoort bij het spel en komt nooit in de content; je kunt haar als los hoofdstuk achter het wereldboek plakken.
- **Hoe deze wereld gemaakt is.** Heeft een wereld een ontwerplogboek (`DESIGN.md`, het werk van de andere sessie), dan is dat het laatste hoofdstuk van het boek, zonder de antwoorden die nog getypt worden.

Testen: pas in de editor een plek aan, sla op en kijk in `content/base/WORLDBOOK.md`; de knop onder Contract; in een spel het menu of het dagboek. Tests in `tests/m1018.test.ts` (6), alle 772 groen, drie simulaties zonder problemen, speeltests, build en de drie smoketests.

Wat de editor en de kroniekverteller leerden: geen nieuwe velden in de content. Nieuw zijn het bestand `WORLDBOOK.md` naast de content, `npm run worldbook` en de kroniek per spel.

Nog niet: een test kan Claude Docs niet lezen. Voor de Nethermarch blijft het boek in Claude Docs de bron; wie de content daaraan gelijk trekt, maakt het boek opnieuw. De open verhaallijnen staan in de kroniek per spel en niet in het wereldboek, want een wereld zonder spel heeft ze niet.

Ontwerp: de alinea over het wereldboek en de kroniek staat in het FO (hoofdstuk 15, na improvisatie).

## M10.16 Improvisatie: als de regels geen weg weten, 28 september 2026

- **Waar het ertoe doet.** Een object, plek of gebied kan in de content `improvise` hebben: wat het kan betekenen (offer, vloek, geest, lore, ambacht), wat er hooguit mag gebeuren, en een eigen regel voor als er geen model is. In de Nethermarch: de Kabouterberg en de oude eik (melk voor de kabouters), de hondensteen op de kade, de Haaksteen in de Blackmere, en de Blackmere en de Kabouterberg als geheel met minder mogelijkheden. Op Skerrow: het zilveren bos en de waystone.
- **Alleen als de regels geen antwoord hebben.** Een bekend werkwoord, een eigen regel van een ding ("That milk is not yours to drink"), een affordance of een duidelijke fout gaan voor. Pas als een handeling iets hier raakt dat `improvise` heeft, gaat ze naar het model: POUR MILK ON THE OAK, BOW TO THE STONE, LAY BREAD ON THE STONE.
- **Het model vertelt, de motor beslist.** Twee tot vier zinnen in de stem van de wereld, en hooguit één effect uit wat de content toestaat: een voorwerp dat er al is, een toestand van het ding, een aandoening uit de regels, een beetje aanzien bij een geest, geloof of factie (hooguit drie), of een feit van weinig gewicht. Wat daarbuiten valt wordt geweigerd en alleen de zinnen blijven; de bewaker van M10.10 leest de tekst. Wat je aanbiedt verdwijnt alleen als het antwoord dat zegt en de content het toestaat. Een tweede handeling op hetzelfde ding gaat verder waar de vorige ophield.
- **Geen aantal per dag.** Een improvisatie loopt als een gesprek (de rol voice, hetzelfde lampje en dezelfde voorrang) binnen je uur- en maandbudget. Is het budget op of is er geen model, dan krijg je de eigen regel van het ding en zegt het spel waarom.
- **Een signaal als elk ander.** Elke improvisatie is het signaal `improvised`, met het ding als event. De kroniekverteller krijgt het in zijn nachtronde, met de lijn van het feit als dat er is, en beslist of er meer van komt; wat hij laat liggen, beantwoordt de content: bij de hondensteen blaft 's nachts een hond aan de overkant waar geen hond is, bij de Kabouterberg is de nap 's ochtends leeggelikt, in het zilveren bos zitten 's avonds zwijgende meeuwen in de berken.

Werkwoord of toestand: er kwam code voor een nieuw soort handeling, geen voor een geval. De reacties per ding zijn content (een nasleep met `event`).

Testen: ga met melk naar de Kabouterberg en POUR MILK ON THE OAK, daarna BOW TO THE OAK; bij de hondensteen op de kade POUR BEER ON THE STONE, en wacht een nacht. Zonder model krijg je de eigen regel. Tests in `tests/m1016.test.ts` (7), alle 758 groen (twee tests die de werelden tellen falen alleen door een nieuwe, nog niet vastgelegde wereld in `content/`), drie simulaties zonder problemen, speeltests en build. De test "de vierde improvisatie op een dag" is volgens het besluit over budgetten een test geworden dat vijf improvisaties op een dag alle vijf naar het model gaan, en dat een leeg budget de eigen regel geeft.

Wat de editor en de kroniekverteller leerden: `improvise` bij objecttypen, objecten, plekken en gebieden (domain, may, fallback, takes), en het signaal `improvised` met het ding als event; het contract is bijgewerkt. Deepwell heeft geen improvisatie en laat het vaste antwoord zien (een test).

Nog niet: een toestand als effect kan alleen op een object, niet op een plek. Een voorwerp dat verschijnt, komt in je hand; neerleggen op de plek kan nog niet.

## M10.15 Geluid, bescheiden, 28 september 2026

- **Een geluid per plek.** Elke plek of haar gebied zegt in de content wat je hoort (`sound:` wind, riet, regen, zee, branding, haardvuur, stemmen, werkplaats, water, vogels, gezoem of stilte). Buiten in de regen hoor je de regen, binnen de regen op het dak; 's nachts en in de mist is het zachter, en een plek kan 's nachts een ander geluid hebben (Veenhoek: vogels overdag, het riet 's nachts). De app maakt het geluid zelf uit ruis en toon; er is niets gedownload en er staan geen opnames in de repo.
- **De klok.** De kapel van Veenhoek luidt om zes, twaalf en zes uur: in het dorp gewoon, bij de molen, de Goose en op het veen van ver. Op Skerrow luidt de havenklok bij dageraad en schemer. Elke klokslag is ook een regel in de tekst ("The chapel bell rings for noon."), zodat wie zonder geluid speelt hetzelfde weet. De klokken staan in `world.yaml`.
- **Zacht en uit te zetten.** Onder Instellingen > Display: Sound aan of uit, en het volume, standaard zacht. Geen geluid in menu's, in het dagboek of als het spel wacht, niets tijdens het laden, en nooit meer dan één omgevingsgeluid plus de klok.

Testen: speel met geluid aan en loop van de Green naar de Goose en de smidse in Waagdam; wacht tot twaalf uur in Veenhoek. Tests in `tests/m1015.test.ts` (4), alle 753 groen (twee tests die de werelden tellen falen alleen door de nieuwe, nog niet vastgelegde wereld `content/thequietreach`), drie simulaties zonder problemen, speeltests (nu met de klokslagen), build.

Stemmen, een beoordeling voordat je beslist. Een stem per NPC voegt per antwoord een tweede rekenstap toe: bij een tekst-naar-spraakdienst meestal een tot drie seconden voordat je het eerste woord hoort, bovenop het wachten op het model; dat valt op in een gesprek dat nu vlot leest. Stemmen herhalen zich sneller dan tekst: dezelfde begroeting in dezelfde stem hoor je na een uur spelen, en dan klinkt de wereld kleiner. En een stem legt een personage vast: Mirte klinkt dan jong of oud, streng of warm, voor altijd, en wat de speler zich nu zelf voorstelt, verdwijnt. Mijn advies: geen stemmen voor gesprekken, hooguit later één verteller die een aankomst of een tijding voorleest, als proef die uit kan. Het kost per regel en loopt dan mee in het budget van de speler.

Wat de editor en de kroniekverteller leerden: `sound` bij plekken en gebieden en `bells` in `world.yaml`; het contract is bijgewerkt. Skerrow heeft de zee, de branding, de wind en de havenklok; Deepwell zoemt en heeft geen klok, en een nieuwe wereld zonder geluid is stil (een test laat beide zien).

Nog niet: de terminalclient heeft geen geluid, alleen de regel van de klok. Op de landkaart hoor je het geluid van het gebied dat voor het open land staat (in de Holleveen het riet); per terrein verschilt het nog niet, dat hoort bij het voorstel voor terrein als content.

## M10.14 Goede afloop en mislukking die verder speelt, 28 september 2026

- **Een mislukte poging laat iets achter.** Per ambacht zegt de content wat een mislukking oplevert: een minder product (verbrande broden, een stuk schroot, wat kleine vis, een dunne zalf: voorwerpen met `quality: poor`, bruikbaar voor iets anders en minder waard), een deel van het materiaal terug (malen, en in Deepwell het fabriceren), of een beschadigde werkplaats (een slechte misser aan de smidse of in de coracle). Is er een meester bij, dan zegt die wat er misging. Een beschadigde werkplaats kan niemand gebruiken tot hij hersteld is: REPAIR THE FORGE, of de eigenaar doet het de volgende ochtend en onthoudt wie het was. Hendrik koopt schroot voor zijn hoop.
- **In het veld zegt de tekst wat er nu is.** Een slot dat klemt (de sleutel, FORCE, of een smid), een slot dat het hield, een deur die het hield terwijl het lawaai droeg. Verdwaald in de mist heet waar je bent "Somewhere in the mist" tot de mist optrekt of een weg of plek je vertelt waar je bent, met WAIT, WALK TO en HEAD als uitweg. Wie zich uit het veen worstelt is nat en koud: -1 op proeven tot een uur onder een dak.
- **Een gebroken afspraak goedmaken.** Tegen wie je liet zitten kun je sorry zeggen (een proef tegen hoe die tegenover je staat en wie die is), uitleggen (kon je er niets aan doen en wist die dat niet, dan is het meteen begrepen) of aanbieden het alsnog te doen. Wie vijandig is, of opvliegend en voorgelogen, zegt nee tegen een tweede kans. Nagekomen, of met een geschenk dat waard is wat je beloofde, is het goedgemaakt; dat is een signaal met nasleep in beide werelden. Een belofte om iets te geven wordt nu ook gewoon ingelost door het te geven.
- **Goed nieuws heeft een nasleep.** De eerste markt nadat De Zwaan weer draait: een feest op de markt van Waagdam, prijzen die dag lager, en als de speler het zeildoek bracht zegt Harmen dat tegen iedereen en gaat er een lied rond. Na de dijk bij Oude Zijl een maal in de Drowned Goose, Sijbrand spreekt, en er staat een plek voor de speler klaar. Op Skerrow na het ontsteken van de Lamp: de hele Hythe in de Salt Kettle, een beker voor de speler, goederen even goedkoper, en een lied.
- **Een lied groeit.** Een feit kan versies hebben die bij elke verteller groter worden (`grows`); "the stranger carried the sails through the fen in one night, in the rain" komt drie vertellers later.
- **Wat de speler maakt, zie je terug.** Geef je een mes dat je zelf smeedde, dan snijdt Mirte er haar brood mee, een keer per dag in de plekbeschrijving en altijd in wat ze weet.
- **Leerlingen.** TEACH PIM SMITHING: een gezel of beter leert iemand zijn ambacht, twee uur per dag; na drie lessen op drie dagen kan de leerling het zelf, is er trots op, en het dorp hoort het.

Werkwoord: `feast` dekte feest en maal, zonder code. Nieuw is alleen `prices` (prijzen in een gebied een paar dagen lager of hoger), omdat geen bestaand werkwoord de prijzen raakte: `market` verandert alleen de voorraad. Code kwam er verder voor nieuwe soorten toestand die voor elke gebeurtenis bruikbaar zijn: een beschadigde werkplaats, verdwaald zijn, nat en koud, het goedmaken van een afspraak, een lied dat groeit, en een ambacht dat een NPC van de speler leerde.

Testen: smeed spijkers bij Hendrik tot er een mislukt (de speeltest "failure" doet het voor), geef Mirte een zelfgesmeed mes, beloof iemand iets en kom het niet na, zeg dan sorry of "I'll still do it". Tests in `tests/m1014.test.ts` (14), alle 749 groen, drie simulaties zonder problemen, speeltests (nieuw: "failure"; "cat" laat nu zien dat je verdwaald bent in de mist), rooktests van beide werelden.

Wat de editor en de kroniekverteller leerden: `failure` bij ambachten en recepten, `quality`, `of` en `used` bij voorwerpen, `repair` als herstel door de speler, het werkwoord `prices`, `grows` bij een feit, de signalen `made_good` en `pupil_learnt`, en de toestand `wet`; het contract is bijgewerkt. Skerrow heeft er zijn eigen versie van; Deepwell heeft falen bij het fabriceren en laat voor de rest de neutrale standaard zien.

Nog niet: een sprong als proef bestaat niet in het spel, dus die zit er niet in. Een leerling kan het ambacht zelf, maar werkt er nog niet vanzelf mee in de simulatie. Of de speler bij de dijk hielp weet het spel niet, dus de plek aan tafel staat er voor iedereen.

## Na M10.17: elke wereld haar eigen versie, de droge rug, en uitwerken met AI, 28 september 2026

- **Skerrow en Deepwell spelen alles wat M10.17 content maakte, in hun eigen woorden.**
  - Skerrow heeft nu slaapzinnen, eigen woorden voor zijn munten ("crowns", "shillings"), de boetes van de headwoman, en groepen: het volk van de Hythe, de gelovigen van de Tidemother, de zeelui van de Old Stars en de wreckers. Er is een eigen dood aan de kust van de Tidemother, met een rite bij de oude berk. Wenna verhuurt haar coracle, en een nachtelijke storm stuurt je terug van de Heights.
  - Deepwell heeft credits die men "creds" noemt, de koloniale raad en de ploeg van de ijssnijders (je tekent aan de ijswand voor een credit), een drukpak te huur bij Teo, en ijswerken die op Decday verzegeld zijn. Geloof, weer en wezens laat Deepwell bewust weg, zodat de tests de neutrale standaard blijven spelen.
- **De regel is strenger.** Skerrow krijgt voortaan altijd een eigen versie van iets nieuws; Deepwell ook, tenzij het bewust de standaard laat zien.
- **De droge rug.** Ken je hem, dan staat hij in de looptekst en in de keuzelijst van FOLLOW. FOLLOW THE RIDGE werkt ook vanaf de turfgraverij: je loopt er eerst naartoe. Splitst een weg of de rug, dan krijg je een keuzelijst met waar elke kant heen gaat ("2. south-east, towards the Kattenbroek"). Ken je hem niet, dan is het gewoon fen, zoals altijd.
- **Uitwerken met AI.** In de editor staat bij elke stap van het wereldgesprek een knop [Enhance with AI]. De kroniekverteller werkt je korte antwoord uit tot een bredere opzet met gemarkeerde suggesties en open punten, en slaat niets op. Jij past het aan en drukt dan op [Propose]. Met [Back to my words] ga je terug naar je eigen tekst.

Testen:
- **Skerrow:** HIRE CORACLE bij Wenna in de haven.
- **Deepwell:** JOIN THE CUTTERS CREW aan de ijswand.
- **De rug:** leer hem kennen en typ FOLLOW THE RIDGE bij de turfgraverij.
- **De editor:** schrijf bij een stap een halve zin en druk op [Enhance with AI].

Tests staan in `tests/ownworlds.test.ts`, `tests/enhance.test.ts` en `tests/m10play.test.ts`.

Nog niet: Skerrow heeft nog geen streekkaart, dus onderweg-gebeurtenissen en terreinnamen wachten daarop. Je eigen nieuwe werelden (`content/space` en `content/space2`, allebei "Planet Recon") staan niet in git. Twee oude tests rekenen alleen op de Nethermarch en Skerrow in `content/` en falen daardoor lokaal.

## M10.17 Elke wereld: het contract van de content, 28 september 2026

- **Het contract.** `npm run content:contract` schrijft `docs/CONTENT.md` uit de schema's: per bestand en soort wat verplicht is, wat optioneel is, de standaard bij ontbreken en wat het spel ermee doet. Een test faalt als het document niet meer bij de schema's past. De editor weigert een veld dat niet in het contract staat, met de velden die er wel zijn.
- **Neutrale standaarden.** Wat een wereld weglaat, werkt zonder Nethermarch. Zonder `words` heet het "the land", "the region" en "far away". Zonder kalender zijn het gewone maanden en weekdagen, en de week begint op de startdatum; wil een wereld een andere startdag, dan noemt de kalender die (`start_weekday`, de Nethermarch begint op Dinsdag). Zonder munten is er één munt ("c"). Zonder weerblok is er geen weer: geen lucht, geen wind, niets in de klok. Zonder stemkit is er geen lijst met anachronismen, alleen de vaste kern (een model dat over modellen praat); in Deepwell is een computer gewoon een woord. Zonder `journey` gebeurt er onderweg niets, zonder plaatjesstijl is het een neutrale tekening, en zonder regels over de dood gaat sterven in gewone woorden en zonder prijs.
- **Wat in code stond, is content.** De punt van Wouter is een `hires` op een persoon (naam, prijs, uren, wat je ermee oversteekt); HIRE werkt voor alles wat iemand verhuurt. Het stadsrecht aan de Waag, de novicen van de Lantaarn en het Oude Geloof zijn voorwaarden in `factions.yaml`. De weekdagen en maanden komen uit de kalender, de weerzinnen uit `weather.lines` (de Nethermarch houdt zijn riet en veen, Skerrow kreeg de zee), de slaapzinnen uit `words.sleep`, de Grijze Ruiter en de laatste schoof uit `rules.death`. Boetes volgen de munten van de wereld (in de Nethermarch dezelfde bedragen), ambten die status geven staan in `standing.offices`, en de naam van de terreinen op de kaart komt uit het palet (op Skerrow wordt veen "salt marsh", zodra het een streekkaart heeft). De vaste teksten zeggen geen duiten, fen, peat of schout meer.
- **De kroniekverteller als wereldbouwer.** De schrijfhulp krijgt het contract in het kort: per soort wat het is, wat de wereld heeft en wat leeg is. Onder "New world" bouw je een wereld in twaalf stappen met de kroniekverteller: kader, kalender en weer, munten, geloof, plekken, beroepen, mensen, economie, vervoer, signalen, stem en palet. Je zegt in een paar zinnen wat je wilt, hij stelt voor, de editor laat het als diff zien en bewaart alleen wat je aanneemt. Een voorstel mag nu ook sleutels van `world.yaml` zetten en `CHRONICLER.md` of de stemkit schrijven. Het nieuwe tabblad Contract toont per soort of de wereld hem heeft, met "Let the chronicler propose" bij wat leeg is. De stappen, vragen en lessen staan in `src/engine/worldguide.ts` en voor mensen in `docs/NEW-WORLD.md`.
- **Deepwell**, de tweede proefwereld in `tests/worlds/other`: sciencefiction onder het ijs, een week van tien dagen, credits en chits, geen geloof, geen weer en een magneettram. De architectuurtest speelt elke wereld een dag, de simulatie loopt erop (`npm run sim -- --world other`) en de speeltest heeft een lijn "deepwell". Drie bevindingen uit Deepwell zijn opgelost: de tram vindt "the Ice Works", met één andere halte gaat hij meteen, en DRINK FROM TAP gebruikt het werkwoord van het object.

Testen: open de editor, tabblad Contract, en kies bij een lege soort "Let the chronicler propose". Maak onder "New world" een nieuwe wereld en loop de stappen door (met een model; zonder model antwoordt de mock voor kader, kalender en munten). In de Nethermarch: HIRE PUNT bij Wouter, en JOIN THE BURGHERS OF WAAGDAM in de Waag. Tests in `tests/m1017.test.ts` (12) en `tests/worldguide.test.ts`, alle 720 groen, drie simulaties van 30 dagen zonder problemen, rooktests van beide werelden en de editor.

Wat de editor en de kroniekverteller leerden: het contract, het tabblad Contract, voorstellen met sleutels van `world.yaml` en hele bestanden, en de twaalf stappen. Alle nieuwe velden (`hires`, `join` met voorwaarden, `weather.lines`, `words.sleep`, `money.units[].aliases`, `law.fines`, `calendar.start_weekday`, `rules.death`) staan in het contract en in de wereldgids. Skerrow en Deepwell gebruiken ze of laten in een test de standaard zien.

Ook opgelost: op Skerrow onderzocht de hoofdvrouw nooit een diefstal, omdat alleen iemand met het beroep "schout" dat mocht. Nu doet de officier van de wet van elke wereld het; de speeltest "thief" laat het zien.

Aangepast in bestaande tests: waar een test de kalender of het geld zonder wereld gebruikte, geeft hij nu die van de Nethermarch mee. Een wereld zonder stemkit keurt "okay" niet meer af.

Nagekomen, dezelfde dag: ook de laatste Nethermarch-ids in de code zijn content. Een wezen in het bestiarium heeft een `faction` en per afloop extra reputatie (de Geitenrijders en Veenhoek na een gevecht; binden voor de officier van de wet, laten gaan, doden); een ontmoeting kan een ontrouwe metgezel `tempts`; een gebied kan versperd zijn (`barred`: de mist van de weduwe over de Kattenbroek); een heilige plek hoort bij een geloof en een geloof bij een factie (de bruiloft); een patroon heeft zijn eigen daad bij het zweren (`sworn`); een afkomst heeft eigen woorden en wie haar wantrouwt (`aliases`, `distrusted_by`); het geloof van een NPC mag elke patroon van de regels zijn, niet alleen de vijf van de Nethermarch; en een lamp is alles met de tag `light`. De Nethermarch doet precies wat hij deed: alle 723 tests, de drie simulaties en de speeltests zijn gelijk. Kleine verschillen: binden of laten gaan raakt alleen nog de factie van wie je bond (eerder altijd de Geitenrijders), een wegsluipende gevangene verdwijnt niet meer "into the reeds", en op Skerrow telt zweren aan een patroon niet meer als "old rite".

Nog niet: het terreinmodel van de landkaart (veen, vaart, veenputten) is nog dat van de Nethermarch; een wereld zonder kaart merkt daar niets van, en een voorstel om terrein generiek te maken ligt bij Bram. Het gesprek in stappen is met de mock getest; met een echt model nog niet. Bekende mechanieken die de code bij naam kent (zegeningen als Gold at the Well, de toestanden fen_fever en catform, de eigenaardigheden hates_the_count en counts_every_duit) blijven code: het zijn spelregels, zoals werkwoorden, die elke wereld met regels mag gebruiken.

## M10.13 Terugkomen en erbij horen, 28 september 2026

- **Terugkomen.** Kom je na een dag of langer terug op een plek die je kent, dan staan er na de beschrijving hooguit drie regels over wat er sindsdien veranderd is en hier te zien valt: een object in een andere toestand ("De Zwaan has been mended since you were here; the new work is still pale"), de plek zelf (de modderlijn na de overstroming), wie hier nu woont of werkt of er niet meer is ("Harmen is gone; people here speak of him quietly"), en een afspraak die hier speelt. Wat jij veroorzaakte komt eerst; wat je al als nieuws hoorde telt niet. De zinnen staan per wereld in `data/belonging.yaml`; met een model maakt de verteller er één alinea van.
- **Gebaren.** Kleine, praktische gevolgen van wat je met iemand deelde, als content: Mirte legt een brood voor je apart, Gerrit zegt waar hij morgen is, Trijntje schenkt de eerste in en vraagt waar je was als je je kamer twee dagen liet staan, Mirte vraagt of er nieuws is over Fenna, en op Skerrow zet Tamsin al water op als je komt. Alleen uit wat echt gedeeld is (een nagekomen afspraak, wat iemand onthield, nieuws over jou), nooit uit genegenheid alleen. Hooguit één per persoon per dag en één per plek per bezoek, en een gebaar dat je twee keer kreeg, maakt plaats.
- **Een plek om bij te horen.** RENT THE ROOM FOR A WEEK in de Drowned Goose (op Skerrow een bed op de zolder van de Salt Kettle), voor vijf nachten wat de herberg vraagt. De kamer heeft een kist die van jou is (PUT … IN THE CHEST, TAKE … FROM THE CHEST), wat je er neerlegt blijft liggen, de mensen van de plek kennen je bij je naam, en de kamer staat in het dagboek ("Your lodging") en met een dakje op de kaart. Een lange reis zegt dat je spullen er wachten en dat je kamer op je wacht als je terugkomt. Na een week vraagt de kamer om nieuwe huur.

Testen: loop naar Molenend, ga weg, en kom na een paar dagen terug. Huur een kamer in de Drowned Goose (ook als Trijntje in de keuken is), leg iets in de kist, en kom na twee dagen terug. Houd een afspraak met Mirte en koop brood. Tests in `tests/m1013.test.ts` (8), alle 702 groen, beide simulaties zonder problemen, rooktests van beide werelden. De speeltest "dyke" heeft nu de regel over de modderlijn als je na de overstroming terugkomt in Veenhoek.

Nog niet: het gebaar "een stoel vrijgehouden" bestaat niet als werkwoord, dus gebaren zijn een regel, iets klaargelegd, een waarschuwing of een vraag. Een werkbank bij een meester als verblijfplaats zit er niet in; een plek bij een huishouden na een huwelijk bestond al (M7.2) en blijft zoals het was.

## M10.12 Reizen over de landkaart, 28 september 2026

- **Vervoer is content.** In `data/passages.yaml` staat per lijn wat voor vervoer het is, de haltes (plekken in de streek of verre plekken), de dagen en uren of vaste vertrektijden, de prijs, de duur per traject en wat je onderweg ziet. De trekschuit op de Vaart is zo'n lijn geworden en doet binnen de streek precies wat hij deed; een test vergelijkt hem met de oude code. Nieuw is dat hij doorvaart naar Graafhaven. Er is een koets van de Oostpoort van Waagdam naar Zwolderkamp (dinsdag en vrijdag om acht uur, twintig uur in plaats van twee dagen lopen). Skerrow heeft de Havenmoor-packet, die pas vaart als de Lamp weer brandt.
- **Vertrektijden.** Wie te laat is, hoort wanneer de volgende gaat: "The next leaves on Vrijdag at 08:00: WAIT FOR THE COACH". WAIT FOR THE COACH wacht tot het vertrek, en vertrekt hij binnen het uur, dan wacht je vanzelf op de kade.
- **Een reis van dagen.** Een rit of een tocht te voet naar een verre plek laat de wereld dag voor dag doorspelen terwijl jij weg bent; voor iedereen thuis ben je ver weg. Elke dag kan er iets gebeuren: iets wat je ziet, het weer, een zwaar stuk waar een Survival-proef je doorheen helpt of een halve dag kost, of nieuws van een medereiziger. De reis komt als één alinea met de dagen erin, en onder de landkaart staat "YOUR JOURNEYS" met een regel per reis. Een verre plek over zee (Havenmoor) heeft een kade in plaats van een poort en geen weg terug te voet.
- **Kiezen.** TRAVEL TO ZWOLDERKAMP geeft de manieren: te voet, of de koets met het eerstvolgende vertrek, de duur en de prijs. TRAVEL TO ZWOLDERKAMP BY COACH of ON FOOT kiest meteen; WALK TO blijft te voet. Op de landkaart in het dagboek kies je een plek en zie je dezelfde manieren als knoppen.

Testen: begin als schipper (bargeman) en open het dagboek bij "The land map": kies Graafhaven. Op donderdag op de kade van Veenhoek: TAKE THE BARGE TO GRAAFHAVEN. In Waagdam bij de Oostpoort: TRAVEL TO ZWOLDERKAMP. Op Skerrow na het ontsteken van de Lamp: TAKE THE PACKET TO HAVENMOOR. Tests in `tests/m1012.test.ts` (13), alle 694 groen, beide simulaties zonder problemen, speeltests ongewijzigd, rooktests van beide werelden.

Aangepast in bestaande tests: de tests van M9.1 zeggen nu TRAVEL TO ZWOLDERKAMP ON FOOT, omdat TRAVEL TO zonder meer de keuze geeft tussen lopen en de koets. Een verre plek maakt nu een koopman van een beroep dat de wereld heeft (Skerrow heeft geen marskramers).

Nog niet: een reis naar een verre plek zonder landkaart (Skerrow) staat alleen in tekst, want Skerrow heeft geen landkaart. Onderweg kan er per dag hooguit één ding gebeuren; een ontmoeting met een wezen onderweg zit er nog niet in. Op de landkaart zelf staan de lijnen nog niet als getekende route.

## M10.11 Momenten: wat opvalt, opgelicht, 28 september 2026

- **Aankomst.** Een plek met een `arrival` in de content krijgt de eerste keer een kaart boven het logboek: het plaatje van de plek (of een vaste tekening), de naam en twee of drie zinnen, met een eigen versie bij mist, nacht of storm. Een landmark die je op de kaart ziet opdoemen, krijgt zijn kaart op dat moment ("The Mill De Zwaan, to the north-east"); kom je er later, dan staat de tekst gewoon in het logboek. De Nethermarch heeft er tien (de Kabouterberg, De Zwaan, de dijk bij Oude Zijl, de priorij, de haven en de Waag van Waagdam, het hunebed, de Blackmere, de Drowned Goose, de Kattenbroek), Skerrow drie (het wrak, de Lamp, de toren). Een nieuw spel op Skerrow begint met de kaart van het wrak.
- **De kaart onderbreekt niets.** De klok staat stil zolang hij open is, Enter of een klik sluit hem, en hij wacht tot het maakvenster dicht is. In de terminal is het een kader van tekst. Onder Instellingen > Display zet je kaarten uit; dan zijn het gewone regels.
- **Tijding.** Een feit van belang 4 of meer dat jou bereikt (gehoord of zelf gezien) krijgt een kaart met de titel, de versie zoals jij het hoorde, van wie, en een knop naar het dagboek. Het is hetzelfde feit dat het nieuws al verspreidde.
- **De tocht.** Een wandeling van meer dan drie stappen wordt één alinea uit zinnen in `data/journey.yaml`: het land, het weer, de nacht, een landmark in de verte, wie je onderweg passeerde, en hoe het eindigde. Met een model herschrijft de verteller die alinea in de stem van de wereld; wat iets verzint, blijft liggen. Snelreizen over bekend land haalt zijn voorvallen onderweg nu ook uit die content.
- **Stemming van een gebied**, een nieuw soort toestand voor elke gebeurtenis: het werkwoord `mood` (en een effect in een plan) geeft een gebied paniek, rouw, feest of dreiging voor een aantal dagen, met een regel onder de beschrijving van de plekken, een regel in de prompt van wie er is, en een gekleurde ring op de kaart. De dijkbreuk geeft Veenhoek drie dagen paniek en daarna een week rouw; een plek die afbrandt of verwoest raakt geeft paniek; dreiging uit het oosten zet Waagdam veertien dagen op scherp; een dood op Skerrow maakt de haven een paar dagen stil. De stem vertelt geen tijdingen die niet in zijn kennis staan.

Testen: begin op Skerrow en kijk naar de eerste kaart. In de Nethermarch: loop `ne` de kade af (De Zwaan doemt op), `head east` voor een tochtalinea, en `@plan dyke_breach` voor de stemming van Veenhoek. Zet onder Instellingen > Display de kaarten uit en weer aan. Tests in `tests/m1011.test.ts` (10), alle 681 groen, beide simulaties zonder problemen, rooktests van beide werelden. De speeltests tonen dezelfde feiten, nu met kaarten, alinea's en stemmingen erbij.

Aangepast in bestaande tests: de test van het eerste stapje het land op verwacht nu dat De Zwaan daarna als kaart opdoemt.

Nog niet: een wandeling had nooit een regel per stap, dus er staan ook geen stappen apart in het transcript; de alinea en de kamerbeschrijving staan erin. Skerrow heeft geen landkaart, dus geen tochtalinea en geen landmarks. De ring voor een stemming staat nog niet in de legenda van de kaart. Waarom een nieuw werkwoord en geen bestaand: een stemming geldt voor een heel gebied en heeft een eigen einde, en geen bestaande toestand of werkwoord deed dat.

## M10.10 In karakter: stem, gezegden en tijd, 28 september 2026

- **Een stemkit per wereld** in `data/voice.yaml`: vloeken per geloof, gezegden van de streek en per groep (veenvolk, Waagdam, het klooster, de mannen van de Graaf; op Skerrow de havenmensen en de ouden van de hoogte), hoe men de vreemdeling aanspreekt, hoe men tijd, afstand en maten noemt, en wat hier niet bestaat met wat men in plaats daarvan zegt. Iemand hoort bij een groep door zijn beroep, zijn dorp of een eigen `voice`; Kobus praat als Waagdam. De vloeken staan nu in de kit, niet meer in `world.yaml`.
- **Geen trucje (jouw opmerking).** Een gezegde gaat maar mee in ongeveer een op de drie gesprekken, als één zin "alleen als het past", en na een gezegde of vloek in een gesprek stuurt de motor er die keer geen meer mee. Vloeken is "als je al vloekt, en dat is zelden". De prompt zegt dat een kaal antwoord zoals "No, not today" vaak het beste is. Karakter komt uit wat iemand durft ("You say what you think, even to those above you") en uit wat anderen aan hem zien zonder dat hij het uitlegt: de hint van een geheim, nooit het geheim zelf.
- **De bewaker leest de wereld.** "Okay" wordt "aye", aardappelen worden rapen, Sunday wordt Rustdag (op Skerrow Restday), dollars worden gulden of zilverstukken. Een woord zonder alternatief (tobacco, phone) laat het spel het antwoord één keer opnieuw vragen, daarna staat de vaste regel er. Een wereld zonder kit houdt de oude vaste lijst. Het AI-logboek zet bij elk antwoord wat er is rechtgezet, en boven de tabel staat per model hoe vaak de bewaker ingreep en waarom. Het dev-menu telt live mee.
- **Getallen komen uit de motor.** De prompt zegt dat getallen, leeftijden, prijzen, data en afstanden alleen mogen zoals ze gegeven zijn, en anders "a few". Een getal dat nergens in de invoer stond, blijft staan maar komt in het logboek.
- **Een karakterscore.** Elk antwoord krijgt uit de regels een score op zes punten: geen vloek van onze wereld, geen woord dat hier niet bestaat, geen naam buiten de lijsten, eigen mensen als eigen mensen, getallen zoals gegeven, en terughoudendheid (hooguit één gezegde of vloek). Het modeladvies toont het percentage naast kosten en snelheid.
- **Editor en kroniekverteller.** De editor heeft een tabblad Voice om de kit te bekijken en te bewerken; bewaren schrijft alleen wat veranderde en laat het commentaar staan. De schrijfhulp kan een kit voorstellen. De kroniekverteller, de verre plekken en de schrijfhulp krijgen een korte samenvatting van de kit in hun prompt, net als het gezelschap en de gesprekjes tussen NPC's.

Testen: `npm run web` met ?editor=1, tabblad Voice. In het spel met een model: praat met Mirte en kijk in Instellingen > AI log wat er is rechtgezet. Het dev-menu onder Background toont de teller. Tests in `tests/m1010.test.ts` (16), alle 671 groen, beide simulaties zonder problemen, speeltests ongewijzigd, rooktests van beide werelden en van de editor.

Aangepast in bestaande tests: het mockmodel zegt in de stand "anachronism" nu "phone" in plaats van "Okay", omdat de bewaker "okay" nu zelf rechtzet. De kostengrens van het vaste deel van de kroniekverteller gaat naar 5300 tokens, voor de samenvatting van de kit.

Nog niet: of iemand "van stand" is voor de aanspreekvorm, meet de motor aan jouw geld tegenover de middelste beurs; een echte stand voor de speler is er nog niet. Waar de motor geen getal heeft (hoe lang geleden iets gebeurde, als het niet in het nieuws staat), zegt de prompt "a few" in plaats van een getal te geven. Het getal-signaal geldt alleen voor de stem, niet voor de kroniekverteller.

## M10, details voor alle plekken, 28 september 2026

- **Elke plek heeft zijn details.** De 71 plekken die de editorlijst noemde (60 in de Nethermarch, 11 op Skerrow) hebben nu een eigen tekst voor wat hun beschrijving noemt: de bank van planken bij de fuiken, het brood en de beker voor de Haakman, het uithangbord van The Drowned Goose, de muilezel, de kist met drie sloten van Mathijs, het boegbeeld in de Salt Kettle, en zo verder. Waar het past, heeft een ding een eigen regel voor pakken en voor een werkwoord: DRINK, EAT, CLIMB, DIG, PET, WARM, OPEN, RING of READ. Het offer aan de Haakman drink je niet, de muilezel laat zich niet aaien, en de pomp in de stalhof geeft water.
- **Werkwoorden van de engine zelf.** Een detail met een eigen regel voor een werkwoord gaat nu ook voor als de engine dat werkwoord zelf kent. READ SIGN leest het uithangbord in plaats van "Read whom?".
- **Een scherpere lijst in de editor.** "Named, but no detail" slaat vergelijkingen over ("like a hen on her nest", "taller than a man"). Bij "a tidy, narrow house" pakt hij het huis en niet "tidy". Mensen die hier wonen of werken tellen mee als "the woman" of "the man". Dingen die met de toestand van een plek veranderen, zoals de kat op de stoep die Grietje binnenhaalt, laat hij aan de beschrijving over: LOOK leest die zoals hij nu is. Beide werelden staan op nul.

Testen: LOOK, TAKE en een werkwoord op dingen uit de beschrijving, bijvoorbeeld DRINK PUMP en PET MULE in de stalhof van The Drowned Goose, READ SIGN op de kruising, EAT BREAD bij de haaksteen en OPEN CHEST bij de molenaar. Tests in `tests/m10play.test.ts` (15), alle 655 groen.

Nog niet: een werkwoord op een detail geeft alleen tekst, zonder gevolg in de wereld.

## M10.9 Een reden om hier te zijn, en wie er nog genoemd wordt, 28 september 2026

- **Waarom je hier bent.** Elke achtergrond heeft nu een reden, een contact en iets wat je hoorde. Na de openingstekst lees je waarom je kwam ("You ran goods past the Count's tolls ...") en bij wie je terecht kunt ("You were told to ask for Trijntje the innkeeper at the Drowned Goose"). Het contact en wat je hoorde staan vanaf het begin in je dagboek, en het contact weet in een gesprek dat je naar hem of haar gestuurd bent.
- **Nieuwe achtergronden.** De Nethermarch heeft de landmeter (Lore en Perception, door de Graaf gestuurd om de Holleveen op te meten, contact Meester Cornelis). Skerrow heeft de vluchteling, die onder een andere naam aanmonsterde op de Grey Gull, en de koopman, wiens waren op de bodem liggen; allebei met Maren als contact. De klerk en de novice van de Lantaarn komen op de geruchten over verdwijningen af.
- **Kiezen.** In het venster staat de reden onder de gekozen achtergrond, en CREATE zonder woorden geeft per achtergrond de eerste zin.
- **In de editor** is Backgrounds een eigen soort, met reden, contact en wat je hoorde. Een regel die in het bestand op één regel staat, opent per veld; het bestand houdt zijn eigen stijl. De ids van achtergronden staan nu in `ids.lock`, omdat een save de achtergrond noemt.
- **Iemand die in een gesprek genoemd wordt.** Met een model mag de stem in een gesprek over de familie, het werk of het verleden van de spreker één nieuw persoon noemen: een voornaam, een band uit de lijst van de wereld (neef, oude meester, handelspartner, schuldenaar; in `world.yaml` onder `sketch`) en een plek die bestaat. De motor keurt het: de naam is nog niemand, band en plek kloppen, het gesprek gaat erover, één per gesprek en een paar per spreker. In je dagboek staat hij direct onder de spreker ("Aldert (Gerrit's cousin)"), met een eigen pagina zonder achternaam of kaartje, en Gerrit rekent hem voortaan tot zijn mensen.
- **Van naam naar persoon.** Kom je in het dorp waar hij woont, dan is hij er: met een achternaam van de wereld, een beroep uit wat er gezegd werd en de band als relatie met de spreker. Op een verre plek maakt het spel hem mee, en schrijft de kroniekverteller zijn woorden. De kroniekverteller ziet deze mensen ook bij zijn verhaallijnen en mag er één een brief laten schrijven of laten logeren bij wie over hem sprak.
- Skerrow heeft een lijst met namen gekregen voor mensen die het spel maakt.

Testen: begin een nieuw spel en kijk na de opening in je dagboek. Kies in het venster de landmeter. Open `npm run web` met ?editor=1 en kies Backgrounds. Schetsfiguren alleen met een model: vraag Gerrit "Do you have family?", kijk in het dagboek en ga naar het dorp dat hij noemt. Tests in `tests/m109.test.ts` (14), alle 655 groen, beide simulaties zonder problemen, de speeltests beginnen nu met een reden, rooktests van beide werelden.

Aangepast in bestaande tests: de openingstest verwacht de reden en het contact, en de kostengrens van M3.1 voor het vaste deel van de kroniekverteller gaat van 5000 naar 5100 tokens, voor de zin in `CHRONICLER.md` over wie genoemd mag worden.

Nog niet: in de eigen streek maakt het sjabloon de persoon, zonder woorden van de kroniekverteller. Wie op bezoek komt, blijft voorlopig. Een brief staat alleen in het dagboek en in het hoofd van de spreker, niet als voorwerp. Ontwerp: FO en het ontwerp voor lore en wereldverandering zijn bijgewerkt, met die twee punten als afwijking.

## M10.8 Speeltest Veenhoek en Skerrow: fouten en interface, 28 september 2026

- **Het gesprekspaneel.** Jouw zinnen staan links, die van de ander rechts, elk op een eigen zachte achtergrond; wat verder gebeurt staat over de hele breedte. Het paneel leest zijn regels uit de motor, dus elke regel staat erin, ook als het venster geen focus had. Een naam die de ander noemt en die je kunt volgen, is een link; een klik opent de dagboekpagina bovenop het paneel, en anders gaat LOOK het gesprek in, niet de hoofdinvoer. Escape sluit dan eerst het dagboek, niet het gesprek. Pijl omhoog in het paneel geeft wat je in dit gesprek zei; in de hoofdinvoer staan alleen nog commando's.
- **Wat niet van de AI komt**, heeft met een model in het spel een warmere, gelere tint in het paneel en het logboek (Instellingen > Display, standaard aan). De terminal en het transcript zetten er een ~ voor.
- **Het kaartje** naast het gesprek blijft staan na "how old are you", ook als het gesprek daarna eindigt. Het beroep is wat je weet: eerst "?", het echte beroep als ze het zeggen, iemand het vertelt of je ze aan het werk ziet. Een verborgen beroep (`hidden`, `cover`, `short_public`) blijft een dekmantel: Tamsin is "an old woman who keeps goats" en heet "Old Tamsin" tot iemand anders het je vertelt of een geheim uitkomt. Wie geen portret heeft, krijgt een figuur in schaduw, voor een man of een vrouw.
- **Rechtsboven** staan weekdag, datum en uur met een zon, schemer of maan, en daaronder het weer met de wind.
- **Het weer heeft geheugen** en komt uit `world.yaml`: seizoenen per maand, kansen per seizoen, en een lucht die stapsgewijs verandert, zodat een storm opsteekt en wegtrekt. Er is wind met richting en kracht, en de volgende stap ligt al vast: LOOK SKY zegt wat er komt als je de lucht kunt lezen (Survival, of een buitenberoep), en NPC's met zo'n beroep weten het in een gesprek. Skerrow heeft zeeweer.
- **Gesprekken.** Een wens of mededeling krijgt een knik in plaats van "Can't say I know". Een gesprek gaat door zolang het ergens over gaat (een quest, een verzoek, iets wat de ander weet), en wie aan het werk is zegt een beurt van tevoren "I must get back to my work, but go on". Een quest die door een gesprek begint, wacht tot het onderwerp ter sprake komt, tenzij de gever het zelf vraagt. Wie beroemd is, daarvan kent iedereen de naam. Onder Mensen in het dagboek staat alleen wie je ontmoette, zag of over wie je hoorde, met de naam zoals je die hoorde. Jan zegt "my daughter Fenna", niet "the daughter of Jan and Grietje", en het model krijgt de leeftijden mee.
- **Eigen vloeken.** Elk geloof heeft zijn eigen uitroepen in `world.yaml`; de prompt zegt dat men alleen daarbij zweert, en de bewaker vervangt "Christ", "God" en "hell" door die van de spreker.
- **Als het model niet antwoordt**, zegt de melding wat er gebeurde ("The AI took too long; this is the game's own line from what Tamsin knows"), het dev-menu toont de laatste vaste regels met de reden, en het AI-logboek zet bij een weggegooid antwoord waarom. De tijd voor een antwoord is nu tien seconden en staat in de instellingen bij het model.
- **Een woord tussen haken** is alleen een link als het ergens heen leidt (een dagboekpagina, iets hier, een plek waarvan je hoorde); LOOK GRAAFHAVEN op het jaagpad zegt wat je ervan weet en welke kant het op ligt.

Testen: praat in `npm run web` met Mirte in de bakkerij (?mock=1), klik op een naam in het gesprek, druk Escape, en probeer de pijltjes in het paneel en in de hoofdinvoer. Kijk rechtsboven. Zet onder Instellingen > AI de antwoordtijd, en onder Display de tint. LOOK SKY als veensteker. Tests in `tests/m108.test.ts` (21), alle 639 groen, beide simulaties, de speeltests en de rooktests.

Aangepast in bestaande tests: een test van M10.3 en M9.4 verwacht nu haken rond namen, een test van M7 laat Gerrit eerst goed over je denken voor hij over zijn oorkonde begint, en de wandeltest van M4 kijkt of Gerrit aankomt in plaats van naar een moment. Ontwerp: het FO beschreef zes seconden voor een antwoord; dat is nu tien, instelbaar.

Nog niet: het portret van een figuur in schaduw zie je alleen als afbeeldingen uit staan of mislukken. Wie een bekend persoon is "voor iedereen", geldt alleen vanaf fame 3.

## M10.7 Skerrow rouwt, 28 september 2026

- **Een dood op het eiland.** Maren heeft de lege plek bij het vuur een week in haar hoofd (het model hoort dat), en in de Salt Kettle staat die week een lege kruk met een omgekeerd kopje voor de dode. Dezelfde dag gaat rond dat de dode morgenmiddag vanaf de landtong aan de Tidemother wordt teruggegeven. De dag erna om drie uur is daar de begrafenis: wie de dode kende gaat erheen, ook wie rouwt. Daarna staat er voorgoed een nieuwe steenhoop met de naam op een lei tussen de oude, en die avond zingen ze in de Kettle het ebbelied en giet Maren de eerste beker in het vuur.
- **Vermist zonder lichaam** (een feit van soort `missing`): een naam in de havenmuur en de lege kruk. **Vertrek** (iemand gaat een tijd weg): Maren noemt een week dat de Kettle stiller is.
- **Rouw** is dezelfde toestand als in de Nethermarch: een dag thuis, een week geen feesten, en in gesprekken "grieving for ...". Een begrafenis is de uitzondering: daar gaan rouwenden wel heen.
- **Algemene code, voor elke wereld.** Het werkwoord `feast` heeft een soort `burial`. Het nieuwe werkwoord `mark` zet een regel onder de beschrijving van een plek, voorgoed of voor een aantal dagen. En wat een plan vertelt waar jij staat, zie je nu gebeuren.

Testen: `npm run playtest -- drowned` gaat nu mee naar de landtong, de Kettle en een week later terug. Zelf: `@kill wenna drowned` op Skerrow en de volgende middag naar de landtong. Tests in `tests/m107.test.ts` (5). De M8.1-test somt nu ook de drie nieuwe wachters op; zonder dood blijft Skerrow zonder speler stil. Alle 618 tests groen, beide simulaties zonder problemen, "off" speelt door.

Nog niet: de Nethermarch heeft deze nasleep niet (een dood daar geeft rouw, maar geen begrafenis); met dezelfde werkwoorden is dat content, als je het wilt. Zonder model noemt Maren de lege plek niet in woorden; je ziet hem wel in de herberg.

## M10, bezochte plekken en je spoor op de kaart, 28 september 2026

- **Je spoor.** Beide kaarten tonen een heel dunne amberkleurige lijn langs de hexen die je echt gelopen hebt. Het is geen rechte lijn en geen berekende route. Een wandeling legt elke stap vast. Een tocht via uitgangen volgt de weg of het pad waar beide plekken aan liggen, en gaat recht als er zo'n weg niet is of als die een grote omweg maakt. TRAVEL legt zijn route ook neer. Een oude save begint met een leeg spoor.
- **Bezochte plekken.** Een plek waar je was, krijgt een eigen marker: het teken in een contrastkleur op een donker vlakje, zodat hij op elk terrein opvalt. Plekken die je alleen zag, houden het gewone teken, en waar je alleen van hoorde houdt het vraagteken. Wijs je een plek aan, dan staat de naam onderin ("the Kabouterberg, been there"), ook op de grote kaart.
- **Legenda en palet.** De legenda noemt "the way you walked", en de bezochte plekken tonen hun nieuwe marker. De twee kleuren zijn tokens in het palet (`visited` en `trail`, voor donker en papier) en staan in de palet-editor onder "you". Een palet zonder die tokens neemt de standaardkleuren.

Testen: loop van de kade naar de Kabouterberg, ga via de uitgang terug naar de kruising, en kijk naar de minimap en "The whole map". Wijs een plek aan. Tests in `tests/m10play.test.ts` (13), alle 613 groen.

## M10.6 Besluiten uit de speeltest, 28 september 2026

- **De dijk.** Een vreemdeling alleen wordt nog steeds niet geloofd, maar Sijbrand is nu op drie manieren te overtuigen. Neem Teunis mee: "Will you come with me to Sijbrand? He must hear it from you." Teunis gaat, ook al is hij aan het werk en is het drie uur over land, want hij gelooft in het lek. Hij loopt naast je mee waar geen weg is, zoekt Sijbrand als die even weg is ("There he goes. Come on.") en zegt het zelf: "I saw it with my own eyes." Of vraag Teunis het Sijbrand te laten weten, en PERSUADE SIJBRAND THAT THE DYKE IS LEAKING: de proef is makkelijker met zijn woord erachter. Of neem Sijbrand mee de dijk op ("Come with me to the dyke"): wie iets niet geloofde en het met eigen ogen ziet, gelooft het. Overtuigd roept Sijbrand de mannen van Veenhoek op (het plan `dyke_muster`): Gerrit, Jan, Wouter en Everhard staan uren op de dijk, het lek wordt gedicht en de doorbraak komt niet. Wie in Oude Zijl of Veenhoek is, hoort de oproep en de afloop.
- **Algemene regels daarachter**, voor elk gerucht en elke plek. Een ooggetuige die het je persoonlijk komt zeggen, weegt zwaarder. Wie ernaast staat en het gelooft, zegt het ook. Wie iets eerder verwierp, denkt opnieuw na bij een zwaarder woord, maar één keer per persoon, dus blijven herhalen helpt niet. Wie twijfelde en ter plekke staat, ziet het. Een afspraak om ergens heen te gaan telt ook de weg over land. Wie je naar iemand brengt, zoekt die eerst een plek verderop en daarna op het werk, en blijft even bij het gesprek.
- **Het verdwenen meisje zonder speler.** Een quest kan in de content een verloop zonder speler hebben (`lapses`). Na een maand, en alleen als jij ver weg bent, wacht de weduwe niet langer en haalt Grietje de kat binnen: een feit, nieuws in Veenhoek, een lege stoep en de kat bij de haard. Ben je in de buurt, dan wacht de quest op jou. Een quest die je nooit oppakte, kan ook zo aflopen en begint daarna niet meer.
- **Iemands dag kennen.** Wie iemand goed kent, weet waar die heen is: familie, vrienden, collega's, buren met een band, en in een dorp of gehucht iedereen. Op woensdag zegt een buur in Veenhoek over Mirte: "has gone to Waagdam today; it's Woensdag, market day there". Een gebied kan marktdagen hebben (`market_days`); Waagdam heeft woensdag.
- **De opening en de molen.** De openingstekst zegt nu dat de molen stilstaat met de wieken aan flarden. De molen en de laan van Molenend hebben een tweede beschrijving voor als De Zwaan gerepareerd is; locatievarianten kunnen daarvoor naast een vlag ook voorwaarden hebben (`when`). Het baken in de verte zegt niet meer dat de wieken draaien.

Testen: `npm run playtest -- dyke` redt de dijk nu met Teunis; de controle ziet hem breken. `npm run playtest -- cat`: de controlespeler gaat een maand weg en ziet bij terugkomst de afloop. Zelf proberen: de drie manieren bij Sijbrand, en op woensdag in Veenhoek "where is mirte". Tests in `tests/m106.test.ts` (10), alle 610 groen, beide simulaties van 30 dagen zonder problemen.

Nog niet: de mannen staan op de dijk met de activiteit "keeping watch", omdat er geen doel voor dijkwerk is. Twijfel gaat naar het brein en leidt zonder model niet altijd tot gaan kijken; daarom zijn de drie manieren sterk genoeg om Sijbrand direct te overtuigen. Het ontwerp beschrijft nu hoe geloof, steun en zelf zien werken.

## M10, tweede speeltestronde, 28 september 2026

- **Kiezen in plaats van raden.** Een commando dat hier maar één ding kan betekenen, doet dat meteen: TALK met één persoon erbij, USE bij één voorwerp, TAKE bij één ding op de grond. Noem je iets wat er niet is, of niets, dan krijg je een genummerde lijst ("Talk to whom? 1. Mirte 2. Saartje"). Je antwoordt met het cijfer of de naam, of klikt op een knop boven de invoer. Zijn er geen opties, dan krijg je een melding ("There is nobody here but you"). Dit werkt voor TALK, FOLLOW, LOOK, TAKE, DROP, USE en WALK TO.
- **FOLLOW is vergevingsgezind.** De wegen heten naar waar ze vanaf hier heen gaan. Op de Kabouterberg is het nu "the path to Veenhoek", niet meer "the path to the Kabouterberg", en "follow path to kabouterberg" brengt je daar ook gewoon terug. Een weg met twee kanten vraagt welke kant: "1. the tow path west to Oude Zijl 2. the tow path east to Waagdam".
- **Alles wat een beschrijving noemt, kun je aanraken.** LOOK HOLLOW of L MILK geeft altijd iets. Heeft het ding een eigen detail, dan krijg je die tekst, en anders de zin uit de beschrijving waarin het staat. Een ander werkwoord (DRINK MILK, KICK OAK) geeft nooit meer "You can't": een detail kan per werkwoord een eigen regel hebben, en anders laat je het ding met rust. Plekken hebben daarvoor nu `details` met `look`, `take` en `verbs`. De drie plekken van de Kabouterberg hebben ze: de holte, de eik, de melk, de steen en het kaboutergereedschap, trouw aan de lore (niet graven, niet stelen, de melk is niet voor jou).
- **Afdwingen in de editor.** Onder Check staat een nieuwe lijst "Named, but no detail": per plek de dingen die de beschrijving met "a" of "an" invoert en waar niets op antwoordt. Nu zijn dat er 68 in de Nethermarch. Het is een lijst om af te werken, geen fout: LOOK vindt de zin toch al.
- **De minimap met fog of war.** Ook overdag is alleen helder wat je nu ziet. Wat je pas zag, ligt onder een dunne nevel, en wat je lang geleden zag onder een dikkere. De minimap is ook om snel te reizen: onder de muis staat waar een klik heen gaat ("Walk to Veenhoek"), en een klik loopt erheen, ook vanuit volledig scherm. Voor een los vak is het commando `walk to 42,17`, alleen naar land dat je gezien hebt. De kaart in het dagboek toont alles helder, zoals eerst.
- **De afbeelding van waar je bent.** Boven de minimap staat de afbeelding van het gebied waar je bent, als afbeeldingen aan staan. In de wildernis is dat die van de streek.

Testen: loop naar de Kabouterberg en probeer LOOK HOLLOW, L MILK, DRINK MILK, TAKE MILK, DIG HILL en KICK OAK. Typ FOLLOW op de kade en kies met een cijfer of de knop. Typ TALK, LOOK XYZ of DROP zonder meer. Speel overdag en klik op de minimap. Open de editor onder Check. Tests in `tests/m10play.test.ts` (10), alle 605 groen.

Nog niet: alleen de Kabouterberg heeft details. De rest van de 68 uit de editorlijst schrijf ik als je dat wilt, of je doet ze zelf in de editor. Een werkwoord op een detail geeft nu alleen tekst, zonder gevolg: DRINK MILK kan later een daad worden waar de kabouters op reageren (een standaardnasleep), als je dat wilt.

## M10.3, de restpunten, 28 september 2026

- **Meelopen op verzoek.** Een plan, een wachter of de kroniekschrijver kan zeggen: deze persoon vraagt de vreemdeling mee (het nieuwe werkwoord `invite`). Die zoekt je op en vraagt het zelf, bijvoorbeeld "Will you walk up to the mill with me?". Ja is de gewone afspraak `lead`. Nee, of geen antwoord als het gesprek voorbij is, en de persoon gaat alleen of wacht, zoals de stap zegt. Een kind vraagt het alleen thuis of met een ouder erbij, en niet verder dan een kind mag.
- **Een gevecht tussen twee mensen van de wereld.** De afspraak `attack` mag nu ook iemand anders dan jou als doel hebben (het werkwoord `fight` voor plannen). Buiten beeld spelen de regels het in één keer uit met dezelfde vechters als het gevechtssysteem: de verliezer raakt gewond, geeft op of rent weg, maar niemand sterft eraan. Sta je erbij, dan is het een scène. Met PERSUADE of INTIMIDATE haal je ze uit elkaar (een proef), met ATTACK op een van de twee begint je eigen gevecht, en anders loopt het af. Omstanders zijn getuige, het is een feit over allebei, de verliezer houdt er een wrok aan over, en ziet de schout het of hoort hij het van een getuige, dan beboet hij wie begon.
- **Beweringen die de stem leest.** Leest de regel geen bewering en is je zin geen vraag, dan mag de stem in dezelfde aanroep een bewering teruggeven: onderwerp, sleutel en waarde, alleen in de woorden van de wereld. De motor keurt die, boekt hem als gehoord "van de vreemdeling", en de houding (gelooft, twijfelt, verwerpt) klinkt in de volgende beurt door. Er komt geen tweede aanroep, en de grens per gesprek blijft.

Testen: met een plan of het dev-menu iemand je laten meevragen, of twee mensen laten vechten waar je bij staat. Tests in `tests/m103later.test.ts` (13). De test uit M10.2 die een aanval op iemand anders weigerde, toetst nu de nieuwe regel.

## M10 De kaart in kleur en lagen, 28 september 2026

Gebouwd na de goedkeuring van de voorstelpagina (28 september 2026, via de ontwerpsessie), met de aanpassingen die daarbij hoorden.

Nieuw:
- **De kaart in kleur.** Het zijpaneel en de pagina "The whole map" in het dagboek tekenen de streek per hex, in de gedempte tinten van de voorstelpagina. Elk terrein heeft drie of vier tinten en de seed van een hex kiest er een. Drassig veen is donkerder, bulten en de droge rug zijn lichter, water heeft twee tonen (open water en geul), en wegen en paden zijn warm perkament. Poel, petgat, wilg, ruïne en bult hebben een eigen teken.
- **Geheugen en zicht.** Wat je nu ziet, is helder. Overdag is ook helder wat je de afgelopen dagen zag; wat je lang geleden zag, is vager. 's Nachts en in mist is alleen je directe omgeving helder en de rest herinnering, zonder waas over het hele paneel. Een oude save telt alles als lang geleden gezien.
- **Plekken en legenda.** Een plek heeft een icoon naar soort (stad, dorp, gehucht, herberg, wildernis) en status: gevuld als je er was, open als je hem zag, een stippelcirkel met vraagteken als je er alleen van hoorde. Onder de kaart op de dagboekpagina staat een legendastrook met per terrein een vakje, het teken en de naam, de wegen en de soorten plekken. Een klik licht dat terrein even op.
- **Stijl.** Onder Instellingen > Display kies je donker (standaard), papier of zwart-wit.
- **Het palet is content.** De kleurtokens staan per wereld in `world.yaml` (`map.palette`, voor donker en papier; zwart-wit is papier in grijs). De Nethermarch heeft het palet van de voorstelpagina. Skerrow heeft een eigen, koeler palet: zeewater, zout gras, heide, kliffen en duin.
- **Het palet in de editor.** Het nieuwe tabblad Palette heeft een kleurvakje per token, namen voor de legenda en een voorbeeldkaart in drie stijlen. Voor een wereld zonder streekkaart is dat een staal met een band per terrein. De schrijfhulp stelt op verzoek een palet voor uit het wereldframe; bewaard wordt pas als jij opslaat.
- **Niveaus.** `world.yaml` noemt de niveaus van onder naar boven. Voor de Nethermarch zijn dat onder de grond, maaiveld en de kruinen, voor Skerrow de grotten, maaiveld en de kliftoppen. Een weg in de streek kan een niveau hebben: hij verandert dan het maaiveld niet, en zijn uiteinden zijn trappen. De dagboekkaart toont één niveau tegelijk, met een keuze zodra je een weg op een ander niveau kent. Een tunnel die je niet kent, staat niet op je kaart, net als de droge rug.
- **De landkaart.** "The land map" is een eigen pagina in het dagboek: de streek als vlak, jij erin, de verre plekken die je kent en de routes erheen.
- De terminal houdt zijn tekstkaart, en onder de dagboekkaart staat die ook ("The map as text").

Testen: speel even het land in en kijk naar het zijpaneel; open "The whole map" en klik in de legenda; zet 's avonds de kaart open. Wissel onder Instellingen > Display naar papier en zwart-wit. Open in de editor het tabblad Palette in beide werelden en vraag om een voorstel. Controles: `npm test` (574 tests), beide simulaties van 30 dagen, de uitspeelscripts (ongewijzigd), de rooktests en de editor.

Nog niet:
- Geen van beide werelden heeft al een weg op een ander niveau. Het wereldboek noemt geen tunnels of boomwegen, dus ik heb ze niet verzonnen. De kaart en de regels zijn er, en een test gebruikt een proeftunnel.
- Lopen door een tunnel kan nog niet: reizen blijft op het maaiveld, tot de content zo'n weg heeft.
- Skerrow heeft nog geen streekkaart. Het palet en de niveaus wachten daarop, en de editor toont ze op een staal.
- De kleine kaart op de dagboekpagina van een plek is nog tekst.

Na Brams speeltest, dezelfde dag:
- **Twee kaarten.** De minimap in het zijpaneel toont je omgeving van dichtbij. Daar zie je dag, nacht en mist: 's nachts is alleen een kleine cirkel om je heen helder en is de rest donkere herinnering, in mist grijs. Wat je lang geleden zag, is vager. De kaart in het dagboek toont alles wat je kent altijd helder: het land, de plekken en de geheimen die je kent, zoals de droge rug.
- **Zoomen en volledig scherm.** Beide kaarten hebben knoppen voor in- en uitzoomen, en zoomen ook met het muiswiel en een dubbelklik. De grote kaart kun je verslepen. De knop ◎ zet je terug op waar je bent (minimap) of op alles wat je kent (kaart). Met ⛶ gaat een kaart volledig scherm, en Escape sluit dat weer.
- **Het pad onderweg.** Loop je via een uitgang van plek naar plek, dan komt de weg ertussen nu op de kaart. Voorheen kwam alleen de plek van aankomst erop, zodat de weg naar The Drowned Goose ontbrak.
- **Alleen plekken.** De Haakman stond als zone op de kaart omdat je de naam al kende. Nu staan alleen plekken op de kaart, geen verhalen of wezens.

Uit M10.8 alvast meegenomen: het kaartpaneel op Skerrow zegt nu "Skerrow has no map; you get about by the exits between places." in plaats van een kaart te beloven. Of Skerrow alsnog een kleine hexkaart krijgt, kies jij. Het leeftijdskaartje dat na "ask their age" verdween, kon ik met het mockmodel niet naspelen (daar blijft het staan en toont het de leeftijd); dat zoek ik uit in M10.8.

Ontwerp: "Stand na M10" in het FO, hoofdstuk 4. Tests in `tests/m10.test.ts` (18).

## M10.5 Ambacht en vaardigheid, 28 september 2026

Deel A, ambachten en handelingen:
- **Ambachten.** Zeven in de Nethermarch (bakken, smeden, malen, turfsteken, palingvissen, kuipen, stenen bakken) en twee op Skerrow (vissen, zalf maken). Bakken en smeden zijn helemaal uitgewerkt. Een recept noemt ambacht, techniek en moeilijkheid. USE OVEN BAKE is een proef: brood bij succes, het meel weg bij een misser.
- **Groeien door te doen.** Novice, gezel, expert, meester. Een recept telt tot je het vijf keer goed deed, of zolang het moeilijker is dan je rang; hooguit vijf oefening per dag, en een flinke misser is ook een les. Gezel bij 10, expert bij 30 met een tweede techniek of een moeilijker recept, meester bij 100 met een meesterwerk: het feestbrood, of iets moeilijks van eigen hand voor iemand die erom vroeg.
- **De werkplaats.** De oven is van Mirte. Zonder haar geen brood; met haar toestemming voor 2 duiten, vrienden gratis. Werk stopt als er iets tussenkomt, en over de helft is het materiaal bedorven.
- **Een leermeester.** Een vakman die je vertrouwt, leert je zijn ambacht: een paar uur, vier oefening en een nieuwe techniek. Je bent daarna zijn leerling en mag die dag zijn werkplaats gebruiken, ook als hij er niet is.
- **Een rang is meer dan een bonus.** Feestbrood en een slot smeden vragen expert, eigen werk verkoopt een tiende per rang beter, en het dorp hoort ervan (signaal craft_rank: de bakker denkt beter over je en heeft het in gedachten).
- **De andere vaardigheden.** PICK (Thievery) op een slot, met een spijker of een mespunt; een slot is zo moeilijk als het gemaakt is, en donker en regen maken het erger. TREAT (Medicine) voor jezelf of een zieke. GATHER (Survival) waar de grond het geeft, en TRACK wie hier langskwam. SEARCH (Perception) vindt het begin van de droge rug bij de turfputten, of een vaatje olie op het strand van Skerrow. READ (Lore) leest het altaar, de waag, de put en de runen van de waystone.
- **Busy Hands** werkt nu op ambachtswerk.

Deel B, de kroniekschrijver:
- Hij krijgt een kaart van de speler in woorden (klasse, vaardigheden vanaf getraind, ambachten) en de kansen die er al zijn in de plekken van de verhaallijn: een zieke, een kist op slot, oude letters, iets verborgens. Die maakt hij eerst zichtbaar.
- Pas daarna plaatst hij met place_prop een gesloten kist, in het huis van iemand uit de verhaallijn. Het slot volgt het sjabloon, de inhoud komt uit een vaste lijst (dagboek, brieven) en een deel van de beurs van de eigenaar, en de hints zijn feiten in zijn woorden. Eén per verhaallijn, hooguit drie per speelweek.
- Drie wegen naar de inhoud: zelf openen (stil, maar wie het ziet weet het), de smid laten komen (een afspraak; hij weet het en vertelt het verder), of de eigenaar overhalen (hij opent zelf en vertelt waarom, en jij belooft een wederdienst).
- De kist is blijvende wereld: ze verhuist met de eigenaar en gaat naar een erfgenaam. Om negen uur 's avonds kijkt de eigenaar erin. Wat weg is merkt hij; wie het was weet hij alleen als iemand het zag. Een hint die niet meer klopt, krijgt in het dagboek "So it was then."
- Zonder model zet de motor om de dag een kans in het nieuws van het gebied, als daar geen ander nieuws staat, en plaatst hij soms een kist bij een verhaallijn zonder kansen.

Testen: in de bakkerstuin met Mirte erbij `use oven bake`, en SHEET toont je ambachten. Vraag Mirte "Could you teach me to bake?" als ze je mag. SEARCH bij de turfputten, READ ALTAR in de kapel, op Skerrow SEARCH op het strand en GATHER KELP bij de getijdenpoelen. PICK STRONGBOX bij Lubbert met een spijker op zak. Deel B zie je het best met een model; het scenario met Lubberts kist staat in de tests. Controles: `npm test` (566 tests), beide simulaties van 30 dagen, de uitspeelscripts, de rooktests en de editor (met de nieuwe lijsten Crafts en Props).

Nog niet, en keuzes:
- Kuipen heeft nog geen recept: er is geen werkbank en er zijn geen duigen.
- Zelf openen is een daad en geen afspraak; de smid en de eigenaar zijn afspraken in het register.
- Zonder model komen kansen alleen via het nieuws van het gebied, niet via een gedachte of een verzoek, en ze duwen ander nieuws niet weg.
- Geld in een kist komt alleen uit de beurs van de eigenaar, niet van de nederzetting.
- Een les duurt een paar uur, geen hele dag.

Ontwerp: "Stand na M10.5" in het FO, hoofdstuk 11, met deze afwijkingen. Tests in `tests/m105.test.ts` (28).

## M10.4 Kleine verbeteringen, 28 september 2026

Nieuw:
- **Meer dingen tegelijk.** GET ALL pakt alles wat hier ligt, GET CASK, SAILCLOTH AND ROPE meerdere dingen. DROP, BUY en SELL werken ook met lijstjes; DROP ALL legt neer wat je draagt maar niet wat je vasthoudt of aanhebt, SELL ALL verkoopt wat iemand hier inkoopt.
- **Jezelf bekijken.** LOOK ME (of LOOK AT ME, L ME) vertelt hoe je eruitziet, wat je vasthoudt en draagt, en hoe je eraan toe bent: gewond, moe na achttien uur op, koortsig, doorweekt in de regen. Hoe je eruitziet geef je bij het maken op (CREATE ... look=...); anders zegt het spel het van je volk. Het personageblad zegt het ook.
- **Rondkijken.** LOOK SOUTH en LOOK AT THE TIDEPOOLS zeggen wat die kant op ligt en hoe ver. LOOK <ding> zegt waar het is (in je rugzak, in je hand, hier), en wat bij een object hoort komt eerst: de appel op de oude steen aan de kade is niet de appel in je zak, en pakken kan niet.
- **Familie op de kaart.** Iemands familie staat er pas als je het hoorde of zag: gevraagd, verteld, of een kind naast een ouder. Anders "Family: unknown".
- **Klikken op woorden.** Een linkerklik op een opgelicht woord opent de dagboekpagina als je die kent, en kijkt er anders naar. Een rechterklik opent een klein menu: bekijken, vragen, waar is, ga naar.
- **Het gespreksvenster.** Het houdt de focus, ook na elk antwoord. Na afloop blijft het staan met het laatste antwoord en "The conversation is over."; Escape of [Close] sluit het.
- **Lampjes per AI-rol.** Rechtsonder vijf lampjes (stem, brein, kroniekschrijver, illustrator, bouwer) die groen oplichten tijdens een aanroep; wijs je er een aan, dan zie je de laatste kosten en tijd.
- **Editormelding.** Een bestand dat buiten het spel verandert wordt bij naam gemeld ("... changed on disk"). Opslaan in de editor zelf laat alleen de plek opnieuw zien. De knop [Editor] staat er in een ontwikkelbuild.
- **Transcript.** Instellingen > Transcript: aan of uit, en een map. Alles wat je ziet gaat als Markdown naar `<wereld>-<spel>-<datum>.md`: jouw invoer als `> ...`, spraak als citaat, de regels van het spel cursief, een kop per speeldag en per plek. Een bestand per spel en per dag, alleen bijschrijvend, in de achtergrond; boven drie megabyte gaat het verder in `-2.md`. Lukt schrijven niet, dan gaat het transcript uit met een melding.

Testen: `get all` op het strand van Skerrow; `look me`; `look east`; aan de kade in Veenhoek `look apple` met een appel op zak. Rechtsklik op een woord tussen haken. Instellingen > Transcript aanzetten en een tijdje spelen. Controles: `npm test` (538 tests), de rooktests van beide werelden en de editor, en de lampjes, het menu en het gespreksvenster in de browser bekeken.

Nog niet: het lampje van de bouwer gaat alleen aan voor de schrijfhulp in de editor.

Ontwerp: "Stand na M10.4" in het FO, met één afwijking van de roadmap: het transcript heeft een eigen gebufferde schrijver in de achtergrond in plaats van die van het spellogboek. Tests in `tests/m104.test.ts`.

## M10.3 Levende gesprekken, 28 september 2026

Nieuw:
- **Aanbiedingen.** Voor elke beurt rekent het spel uit wat iemand nu voor je kan doen: voorgaan, iemand halen, wachten, afspreken op een tijd, iets geven, lenen of verkopen, een boodschap overbrengen, je iets leren, je binnenlaten. Elk met een besluit en de redenen in gewone woorden. De stem kiest er een, of stelt er een voor; zo'n voorstel staat met [Yes] en [No] in de gespreksbalk en gaat pas door als jij ja zegt. Zonder model kiezen dezelfde regels. Belooft een antwoord iets wat niet is aangeboden, dan vraagt het spel opnieuw.
- **Pip loopt voorop.** Vraag Pip naar zijn vader en hij biedt aan je naar de haven te brengen, waar hij denkt dat Brannoc is. Hij loopt telkens een plek vooruit en wacht, roept welke kant op als je verkeerd gaat, en geeft het na vier beurten op.
- **Voorwerpen.** Geven, lenen en verkopen hebben elk een eigen besluit. Harmen leent je de zaag van de molen voor een dag; breng je hem terug, dan houdt hij je voor iemand van je woord, anders niet. ASK <iemand> FOR <ding> vraagt erom.
- **Wat jij zegt, telt.** "Tell Mirte that the mill turns again" is een bewering. Gelooft ze je, dan loopt ze naar Molenend, ziet dat de molen stilstaat, en weet daarna wat je woord waard is. DECEIVE is echt liegen; een leugen die uitkomt gaat rond.
- **Een gesprek werkt door.** Vraag Pip naar zijn vader en dat is nieuws; Pip vertelt het 's avonds thuis, en Brannoc komt je de volgende ochtend opzoeken en vraagt om touw. Zeg je ja, dan is dat je woord; breng je het niet, dan weet de Hythe het. Wie iets nodig heeft en je goed gezind is, zoekt je ook op.
- **Reacties.** Beledig de bakker en ze verkoopt je die dag niets meer; iemand anders loopt weg, een bange roept om hulp, en een heethoofd gaat op je af.
- **Leren, vrienden, flirten.** Een vakman leert je zijn vak voor geld of een wederdienst. Wie een paar dagen Warm is en iets met je deelde, wordt een vriend, groet je anders en helpt eerder. Flirten in gewone zinnen werkt zoals FLIRT.
- **Eigendom.** TAKE in iemands huis pakt niets meer ongevraagd; je kunt vragen of stelen. Kisten en deuren kunnen op slot (de geldkist van Lubbert, die van Maren), met een sleutel of met FORCE, wat lawaai maakt. Binnenlopen waar je niet welkom bent, merkt wie er is. Betrapt reageert iemand naar zijn aard, en de schout grijpt in als hij erbij is. Gezien in de buurt maakt je verdacht, maar pas een spoor (je draagt het gestolene, of je biedt het te koop aan wie het kent) is bewijs. Teruggeven of PAY maakt het goed, uit jezelf meer dan na betrapping.

Testen: op Skerrow `talk pip`, "where is your father?", YES, en volg hem oostwaarts; wacht daarna een dag in de Salt Kettle. In de Nethermarch: `tell mirte that the mill turns again`, `ask harmen for the saw`, of zeg iets onaardigs tegen Mirte en probeer daarna brood te kopen. `promises` en de dagboekpagina "Your word and theirs" laten je afspraken zien. Controles: `npm test` (531 tests), de 30-dagensimulatie van beide werelden zonder meldingen, alle zes speellijnen als voorheen, en `npm run longrun`: 384 kB na 300 dagen.

Nog niet: een NPC die vraagt of je met hem meeloopt (daar is geen soort verzoek voor). Het model levert zelf geen bewering; de regels lezen ze, zodat het besluit al in de prompt staat. PICK voor sloten komt in M10.5. Het tweede deel van M10 wacht nog op jouw oordeel over de voorstelpagina: https://claude.ai/artifact/JH6AD1zCBy6F36LaiAcMDF.

Ontwerpbesluit dat anders uitpakt: gezien in de buurt geeft geen boete meer (was zo sinds M7.2); de M7.2-test is daarop aangepast. Skerrow heeft zijn eerste wachters en nasleep, voor wat gesprekken nodig hebben; de M8.1-test die zei dat Skerrow er geen had, bewaakt nu dat Skerrow zonder speler geen signalen geeft.

Ontwerp en tests: "Zo is het in M10.3 gebouwd" in het ontwerp voor signalen en nasleep, "Stand na M10.3" in het FO. Nieuwe werkwoorden en toestand, elk voor elke gebeurtenis bruikbaar: seek_player, de voorwaarden needs_from en same, de probe befriended, de soorten afspraken lend en errand, sloten en inhoud in de content. Tests in `tests/m103.test.ts`.

## M10.2 Het verhaal- en afsprakenregister, 28 september 2026

Nieuw:
- **Verhalen die sluimeren en weer wakker worden.** Een verhaallijn is actief, sluimerend of afgerond. Ze sluit alleen nog door een afloop: de fase closed van de kroniekschrijver, of geen open vraag meer. Na twee weken zonder nieuws wordt een lijn met een open vraag sluimerend in plaats van dicht. Komen twee van haar mensen samen in een nieuw feit, of keert er een terug, sterft er een, trouwt of erft er een, dan wordt ze wakker, met haar oorzaak en haar vragen erbij, zonder dat er intussen een model voor draait.
- **Een archief dat terug te lezen is.** Alleen een afgeronde lijn gaat naar het archief. Van een sluimerende lijn mogen oude feiten die niemand meer kent weg; de lijn zelf, en waar ze uit voortkwam, blijft. Vraagt de kroniekschrijver waarom een lijn loopt zoals ze loopt, dan vindt hij de oorzaak ook als die al in het archief staat.
- **Het afsprakenregister.** Wie iets heeft toegezegd, aan wie, wat, wanneer, onder welke voorwaarden, en hoe het afliep: een afspraak heeft een vaste id en een status (open, nagekomen, gemist, afgezegd, onmogelijk). Werven, een bevel aan een metgezel om te wachten of af te spreken, lenen, een boodschap die iemand overbrengt (de dijk) en een aanval uit een grief staan er nu in. Voorgaan en een voornemen na een gesprek zijn er als soort; de stem gaat ze maken in M10.3. In het dagboek staat een pagina "Your word and theirs", en PROMISES laat hetzelfde zien.
- **Gemist is geen verraad.** Een afspraak die niet doorging krijgt een uitkomst met de echte reden: wie niet kwam, of die ziek of gewond was, en het nieuws dat erover gaat. De ander oordeelt naar wat hij daarvan weet. Hoorde Sijbrand dat Teunis gewond was, dan begrijpt hij het; wist hij het niet, dan voelt hij zich in de steek gelaten. Waar iemand denkt dat een ander is, staat los van waar die werkelijk is: "ik breng je naar haar huis" mag ook als ze niet thuis is, en wie je willens naar de verkeerde plek brengt, staat als leugen in het register.
- **Metgezellen met een afloop.** Een metgezel loopt niet mee een plek in die hij uitsloot of die te gevaarlijk is voor zijn trouw; hij wacht aan de rand en komt terug als jij terugkomt. Rent de groep uit een gevecht, dan rent wie bang van aard is of weinig trouw heeft door naar huis. Zwaargewond gaat een metgezel naar huis om te herstellen en vindt je na twee dagen terug, tenzij zijn trouw te laag is.
- **Een aanval loopt door het gevecht.** Wie met een grief op je afkomt en de poort doorkomt, heeft een aanvalsintentie in het register; het gevechtssysteem beslist de rest, en de afloop is de uitkomst. Een gesprek kan nooit een dood afspreken.

Ook:
- **De kaart (M10, eerste deel).** De trekking per hex was scheef: 59 procent van het veen had een poel, nu ongeveer een op tien. Wie de droge rug kent, ziet hem op de kaart als pad. TALK TO AALTJE ABOUT THE GREY CAT werkt, @who-knows en @where tonen korte namen en vinden iemand op id, en `npm run sim` meldt wezens en afwezigen niet meer als vastgelopen.
- **Mist.** Na die reparatie haalde de speeltest het Kattenbroek niet meer: in de mist was er een proef per stap, zodat je na een stap of twee steeds de weg kwijt was. Nu is het een proef per wandeling, zoals het FO het bedoelt. Op de plek die de vertellers noemden zei het spel "You are already at the Kattenbroek" terwijl er niets te zien was; nu loop je op een herkenningspunt af als je dat ziet. En in het transcript van de meellijn kocht de speler niets, omdat de winkel om kwart voor zeven nog dicht was; het script wacht nu. Alle zes lijnen spelen weer zoals `docs/PLAYTEST.md` ze beschrijft.

Testen: werf Wouter (`recruit wouter`, als hij je mag) en loop met hem het Kattenbroek in; is het hem te gevaarlijk, dan blijft hij aan de rand staan tot je terugkomt. Leen geld van iemand die je goed kent (`borrow 5 stuivers from mirte`) en kijk in het dagboek onder "Your word and theirs"; betaal niet terug en kijk na een week wat Mirte ervan vindt. `npm run playtest -- dyke` laat de boodschap van Teunis aan Sijbrand lopen. Controles: `npm test` (498 tests), de 30-dagensimulatie van beide werelden zonder meldingen, en `npm run longrun`: 376 kB na 300 dagen, net als voorheen.

Nog niet: een aanval op een ander dan de speler, want het gevechtssysteem kent alleen gevechten met de speler. Voorgaan en voornemens na een gesprek maakt in het spel nog niemand; dat doet M10.3. Het tweede deel van M10 (de kaart in kleur en lagen) wacht op jouw oordeel over de voorstelpagina: https://claude.ai/artifact/JH6AD1zCBy6F36LaiAcMDF.

Ontwerp en tests: "Zo is het in M10.2 gebouwd" in het ontwerp voor signalen en nasleep, "Stand na M10.2" in het FO en de mist in hoofdstuk 4. Nieuwe toestand: een status op een verhaallijn en het register `state.agreements`, geen nieuwe werkwoorden. Het register is code omdat afspraken een nieuwe soort toestand zijn, voor elke gebeurtenis bruikbaar. Tests in `tests/m102.test.ts` en `tests/m10.test.ts`.

## M9.4 Afwerking en release, 27 september 2026

Nieuw:
- **Installers.** `npm run dist:mac` maakt schijfkopieën voor Apple Silicon en Intel, `npm run dist:win` een installer voor Windows. Ongetekend, zoals besloten: macOS vraagt bij de eerste start om bevestiging (Systeeminstellingen > Privacy en beveiliging > Toch openen), Windows ook (Meer info > Toch uitvoeren). Ondertekenen vraagt later alleen omgevingsvariabelen, geen code. De workflow Installers op GitHub bouwt ze op een schone Mac en een schone Windows-machine, installeert ze en start het spel in beide werelden; de bestanden staan veertien dagen bij de run. Eerste kamer na 0,4 s op een Mac, 0,6 s op Windows. De Intel-versie draaide onder Rosetta (de eerste start duurt daar een halve minuut, omdat hij vertaald wordt); een echte Intel-Mac heb ik niet gehad. De geïnstalleerde app kon eerst zijn werelden niet lezen; dat is gerepareerd.
- **Weergave.** Instellingen > Display: lettergrootte in vijf stappen en hoog contrast, bewaard op deze computer. Beschrijvingen en verhalen lopen nu als gewone tekst door, in plaats van met de regeleinden uit de YAML.
- **De interface in tekstbestanden.** Alle woorden van de interface staan in `src/renderer/src/locales/en/` (393 sleutels in tien bestanden), met Engels als terugval. Een test bewaakt dat er geen Engels meer in die onderdelen staat. De editor en het dev-menu blijven zoals ze zijn; de meldingen van de motor volgen later, zoals afgesproken.
- **Een antwoord binnen zes seconden.** De stem krijgt zes seconden voor beide pogingen samen, dan een vaste zin. De regel "X thinks it over." staat er meteen, als eerste tekst.
- **Opslaan na een reis.** Een commando dat een uur of meer laat verstrijken, slaat meteen op.
- **Het speeltestprotocol.** `npm run playtest` speelt een verhaallijn als nieuwe speler, met en zonder ingrijpen; het protocol en de uitkomsten staan in `docs/PLAYTEST.md`, de transcripten in `docs/playtest/`.
- **Wat de speeltest repareerde.** Mensen en plaatsen die een quest noemt komen in het dagboek. In een gesprek bereikt "ask about the cat" de quest van wie je spreekt. WAIT stopt als iemand komt die een quest nodig heeft, en WAIT FOR wacht op iemand. De speler kan doorgeven wat hij hoorde ("tell sijbrand about the dyke"), en de ander gelooft het naar zijn vertrouwen in de vreemdeling. Nieuws voor een streek werd opgeschreven maar nooit getoond; nu hoort de speler het, en ziet hij het water komen waar hij staat. Het lek bij Oude Zijl had geen vinder, dus niemand wist ervan; nu vindt Teunis het. Verder: TAKE ALL, "What's new" zonder de eigen komst van de speler, de dood eerst als je naar een dode vraagt, gestolen goed dat herkend wordt, en "I am sorry" als zin in plaats van inventaris.

De speeltest per lijn (herkennen, invloed, afloop):
- Meel voor Veenhoek: ja, ja met wrijving, ja.
- Het verdwenen meisje: ja, ja (na reparaties), ja; zonder speler blijft de lijn staan.
- De dijk bij Oude Zijl: met moeite, beperkt, ja. Een vreemdeling wordt niet geloofd; zie de vragen hieronder.
- Weg van Skerrow: ja, ja, ja.
- Een verdrinking op Skerrow: ja, nee, nee. Skerrow heeft geen nasleep.
- De speler als dief op Skerrow: ja, ja, klein.

De eisen uit FO hoofdstuk 18, gemeten (`npm run stutter`, `npm run longrun`, op een Mac met M3 Max):
- Commando onder 50 ms: gehaald, hoogste 4,4 ms.
- Antwoord van een NPC: eerste tekst meteen, terugval na 6 s: gehaald. Volledig binnen 4 s hangt af van het model; de modelproef keurt een stem af die gemiddeld trager is.
- 100 NPC's op 60 keer speelsnelheid: gehaald, 131 mensen, een minuut p99 2,6 ms en hoogste 20 ms. Een laptop van vijf jaar oud heb ik niet gehad; er is ruim marge. De rest van het land zit als inwonertallen in de grootboeken (zo'n 1.700 in de Nethermarch), en dat kost per uur hetzelfde, hoeveel mensen het ook zijn.
- Opslaan elke 10 spelminuten en bij reizen, onder 1 s: gehaald, een autosave kost 1 tot 5 ms.
- Offline, privacy, reproduceerbaar, testbaar: gehaald; de hele speeltest liep zonder model.
- Platforms: macOS 13 of nieuwer en Windows 10 en 11, gebouwd en getest; ongetekend en niet genotariseerd, zoals besloten.
- Toegankelijkheid: lettergrootte en contrast instelbaar, alles met het toetsenbord, de klok staat stil tijdens typen, gevechten en vensters. De tekst wordt voorgelezen via live-regio's; met VoiceOver zelf heb ik niet getest.
- Vertaalbaar: de interface wel, de meldingen van de motor nog niet (later, zoals afgesproken).

Testen: Instellingen > Display voor lettergrootte en contrast. `npm run playtest` voor de zes lijnen, `docs/PLAYTEST.md` voor het protocol om zelf met een model te spelen. De installers: op GitHub bij Actions > Installers > Run workflow, en dan de bestanden onderaan de run. Controles: `npm test` (475 tests).

Vragen voor jou:
- De dijk: moet een vreemdeling met een waarschuwing iemand kunnen overtuigen, met een worp, door de getuige mee te nemen of door het lek te laten zien? Nu kan een nieuwe speler de dijk niet redden.
- Skerrow heeft geen nasleep: na een verdrinking gebeurt er niets meer. Een eigen mijlpaal met nasleep voor Skerrow?
- Moet het verdwenen meisje zonder speler verder gaan (de weduwe geeft het op, Grietje haalt de kat binnen)?
- De opening noemt "A windmill turning slowly", terwijl De Zwaan stilstaat. Een andere molen, of aanpassen?
- Ondertekenen: met een Apple Developer-account blijft "Toch openen" en de sleutelbosvraag na een update weg. Wil je dat voor een release?

Ontwerp en tests: het FO is bijgewerkt (stand na M9.4, hoofdstuk 18 met de besluiten over ondertekenen en vertalen), en het ontwerp voor signalen en nasleep heeft "Zo is het in M9.4 gebouwd". Nieuw in content: `witnesses` bij `tell`, bruikbaar voor elke gebeurtenis; Garrick heeft een tweede antwoord met olie in de lamp, de landtong een beschrijving met brandende lamp. Een M5-test sprak per ongeluk de enige persoon op het Green aan toen hij iemand noemde die er niet was; die spreekt nu iemand aan die er is.

## M9.3 Maat: geschiedenis, opslag, prompts en kosten, 27 september 2026

Nieuw:
- **Een kostenregister.** Het uurbudget telt elke aanroep van het laatste uur, ook na een herstart (een bestand naast de instellingen, niet meer de laatste 200 logregels). Voor een aanroep vertrekt, houdt de gateway vast wat hij hooguit kan kosten, zodat aanroepen tegelijk samen binnen het budget blijven. Een model zonder bekende prijs telt tokens en mag hooguit 40 keer per uur vanzelf; de instellingen laten dat zien. Schrijven naar de cache wordt apart geteld en geprijsd, en het overzicht laat per rol zien hoeveel van de prompt uit de cache kwam.
- **Minder context, en bijvragen.** Het brein krijgt bij een keuze alleen de mensen en plekken die bij het signaal horen, de stem alleen de bekenden die bij het gesprek horen; met duizend bekenden groeit de prompt niet mee. Een model mag eerst begrensd iets vragen: wat iemand over een onderwerp weet, waarom een lijn loopt zoals ze loopt, hoe twee mensen tegenover elkaar staan, wat er rond een plek gebeurde. Een NPC krijgt daarbij alleen wat in zijn eigen hoofd zit. Een kroniekrun heeft een totaalbudget over al zijn opzoekrondes.
- **Indexen.** Een feit, de lijn van een feit en wat iemand over zijn eigen mensen hoorde, zoekt het spel niet meer door alle feiten heen. In een menigte vertelt iemand het nieuws aan hooguit twaalf mensen en ziet hij er hooguit 24, gekozen met een eigen seed. Wie tot later bezig is en een plan zonder werk worden overgeslagen. Honderdduizend feiten zijn nu ongeveer even snel als duizend, en zes speluren met duizend extra mensen duren 0,4 seconde in plaats van 70.
- **Checkpoints.** Een save is het laatste checkpoint plus wat het logboek sindsdien vastlegde. Toestand en log worden een keer tekst, als een checkpoint genomen wordt (bij de eerste save, na 400 regels of een speldag, of als de content veranderde); een autosave ertussen schrijft alleen de regels sindsdien. Laden speelt die regels na op het checkpoint, met de opgenomen modelantwoorden, dus de wereld is precies waar hij was. Na 300 speldagen kost een checkpoint zo'n 1 ms en een autosave ertussen minder dan een honderdste milliseconde. Saves bewaren de contentversie, de seed en hun plek in de takken van het spellogboek. Oude saves en een savebestand van voor M9.3 laden zoals altijd.
- **Haperen gemeten.** `npm run stutter` speelt dagen zoals de app dat doet en meet de langste wachttijden. Niets komt boven de 50 ms, dus de motor blijft in het hoofdproces. De enige uitschieter was het eerste commando met een plaatsnaam: elke naam van een onderwerp is een regex die pas bij het eerste gebruik gecompileerd wordt. Nu draait een regex alleen als alle woorden van de naam in de zin staan. De eerste reis ging daardoor van 131 naar 1,5 ms, en elke zin die je in een gesprek typt wordt er ook sneller door.
- **De modelproef speelt het spel.** Een proef speelt de testset via het spel zelf: gesprekken met hun tweede poging en de vaste zin als die ook mislukt, de doelkeuzes van het brein, en een kroniekrun met zijn controles. Hij telt bruikbare antwoorden, herhalingen, terugval, kennislekken, onjuiste feiten, uit de rol vallen en reactietijd, en rekent de kosten per bruikbaar antwoord, herhalingen en mislukte antwoorden meegerekend. Na het advies staat per rol een knop [Try the advice and choose]: die probeert de geadviseerde modellen en kiest het goedkoopste bruikbare antwoord van de modellen die slagen. Opslaan doe je zelf.
- **Twee fouten die de proef vond.** Een antwoord dat uit de wereld stapt (over modellen of rollenspel, met opmaak of emoji) vraagt het spel nu opnieuw. En namen die in de kennis staan die een NPC mag vertellen, mag hij ook zeggen: Aaltjes verhaal over de Haakman noemt de Blackmere, en werd tot nu toe twee keer afgekeurd.

Testen: Instellingen > AI, [Ask for advice], dan per rol [Try the advice and choose]. Dat kost een paar cent per rol, voor de kroniekschrijver wat meer (twee volledige runs per model). In de browser kan het met `http://localhost:5199/?mock=1` en een verzonnen sleutel. Opslaan: SAVE, speel even door, sluit af en typ CONTINUE of LOAD. Metingen: `npm run stutter` (ook met `-- --extra 100`, `-- --model` of `-- --world isle`) en `npm run longrun`. Controles: `npm test` (459 tests); de rooktest slaat nu ook op en laadt in een eigen bestand, en meldt `save and load exact`.

Nog niet: `npcsAt` loopt per aanroep nog alle mensen langs, en de "wachtrij" is een controle op het volgende moment per persoon en per plan, geen gesorteerde lijst. Beide zijn gemeten en niet nodig bij deze aantallen. Laden speelt de staart na met de content van nu: is de content sinds de save veranderd, dan kan dat iets afwijken, net als bij CONTINUE; de contentversie wordt bewaard maar nog niet getoond. De proef met echte modellen heb ik niet gedraaid; de tests gebruiken het nepmodel. Skerrow krijgt in de proef eenvoudige vragen aan zijn dorpelingen in plaats van de vaste situaties van de Nethermarch.

Ontwerp en tests: afwijkingen staan onder "Zo is het in M9.3 gebouwd" in het ontwerp voor signalen en nasleep, en het FO is bijgewerkt (stand na M9.3, de controle op uit de rol vallen in hoofdstuk 10, de proef in hoofdstuk 16). Geen nieuwe werkwoorden of toestand in de wereld; de save kreeg een staart en een contentversie. Een M3-test hing aan de volgorde van het nieuws en slaagt met twaalf contacten in een menigte; met acht niet, daarom twaalf. De 30-dagensimulatie geeft dezelfde zeven meldingen als voor M9.1, Skerrow geen.

## M10.1 Onder de motorkap, 27 september 2026

Nieuw:
- **Een dev-menu in het spel**, alleen in een ontwikkelbuild (`npm run dev`, of `npm run web`). Open het met `@dev` in de invoerregel of Ctrl+Shift+D. De klok staat stil zolang het open is, en kijken verandert niets aan het spel.
- **Mensen:** per persoon behoeften, doelen, plan, de plannen waar ze in zitten, geloof, wat ze weten en geloven, herinneringen en wat ze bezighoudt, en wat hen stuurt met waar het vandaan komt: hun stand (huishoudbeurs tegen het midden), hun houding tegenover de speler (de optelsom), band en vertrouwdheid, en hun banden met anderen. Het is hetzelfde paneel als de NPC-inspecteur in de speeltest van de editor.
- **Achtergrond:** de signalen die wachten en die net liepen (welke wachter, wie het oppakte, uit hoeveel feiten), de lopende plannen met hun stappen en welke voorwaarde een stap tegenhoudt, en het grootboek per nederzetting.
- **Kroniekschrijver:** per run wat hij kreeg (de feiten, hoeveel namen hij mocht gebruiken), wat hij teruggaf (lore, notities, plannen) en wat geweigerd werd en waarom, plus de open verhaallijnen met fase, voorganger en volgende stap.
- **AI:** het logboek van aanroepen met rol, model, tokens, cachedeel, kosten en reactietijd; een klik toont prompt en antwoord.
- **Sturen:** knoppen voor een dag overslaan, een plan starten, spanning en markt zetten, een signaal afvuren en het uurbudget zetten. Elke knop is een `@`-commando (`@skip`, `@plan`, `@tension`, `@market`, `@signal`, `@budget`), dus het staat in het spellogboek en naspelen klopt.

Testen: `npm run dev`, begin een spel en typ `@dev`. In de browser: `npm run web`, open `http://localhost:5199/?mock=1`, kies een wereld en typ `@dev`. Controles: `npm test` (439 tests). Dat de productiebuild geen menu heeft: `npm run build` en dan `WISPLIGHT_SMOKE=1 npx electron .`, die meldt `dev menu absent`.

Nog niet: runs zonder model (de sjablonen schrijven dan meteen) staan niet in de lijst van runs.

## M9.2 Waarheid en samenhang, 27 september 2026

Nieuw:
- **Lore zegt alleen wat een feit draagt.** De kroniekschrijver levert bij elk lore-item zijn beweringen als structuur (onderwerp, sleutel, waarde, en de gebeurtenis waar het op rust). Een bewering die op geen feit van de lijn rust, of die de wereld tegenspreekt (een levende dood, een huis dat niet het zijne is, iets wat iemand niet heeft), en lore zonder beweringen worden niet bewaard; het sjabloon vertelt het dan. Ook de tekst zelf wordt gefilterd: "Gerrit is dead" bij een levende Gerrit valt terug op het sjabloon.
- **Een tweede blik bij grote lore.** Bij belang 4 of hoger leest een klein model de feiten en de lore en noemt wat de lore zegt dat geen feit zegt. Vindt het iets, dan vertelt het sjabloon het.
- **Standaardvoorwaarden per werkwoord.** Terugkeren kan alleen als iemand weet dat wat hem verdreef voorbij is, gelooft dat zijn huis staat, en het niet onder water staat, verwoest of bezet is. Een feest, verhuizen en blijven wonen alleen op een veilige plek. Dat geldt voor content, brein en kroniekschrijver, en wordt gecontroleerd als de stap echt gebeurt. Content kan het bewust uitzetten (`unguarded`), een model niet. De naslag noemt de voorwaarden.
- **Een run onthoudt wat hij aanbood.** Alleen die feiten gelden daarna als verwerkt; wat tijdens de aanroep gebeurde, wacht op de volgende run. De namencontrole kijkt naar wat het model zag, niet naar de wereld van later. Het spellogboek bewaart die momentopname, zodat naspelen hetzelfde controleert.
- **Oorzaak en gevolg.** Een feit draagt zijn oorzaak: wat een plan, een fase of een nasleep veroorzaakt, wijst naar het feit waar die vandaan kwam. Een tekort wijst naar de gesloten route, een blijvend tekort ook naar het eerdere tekort, wrijving naar wat de nieuwkomers deed vluchten, en een vlucht is nu zelf een feit. Een lijn volgt de lijn van haar oorzaak, en een volle lijn (twaalf feiten) gaat verder als een nieuwe met haar samenvatting, open vragen en oorzaak. De kroniekschrijver ziet per lijn de boog van voorgangers en per gebeurtenis waar ze uit kwam: oorlog, Oostweg dicht, lampolie kort, onrust in Waagdam en de vlucht uit Veenhoek zijn een boog.

Testen: `npm run dev` met een model. `@tension rijkland 30` en een paar dagen wachten: in de editor bij Playtest (of straks het dev-menu uit M10.1) zie je de lijnen elkaar volgen. De controles zelf zie je vooral in de tests: `npm test` (435 tests), `tests/m92.test.ts` speelt elk scenario uit de review na.

Nog niet: of een fase ook een begrijpelijk verhaal voor de speler was, bewijst geen code; dat is het speeltestprotocol in M9.4. Het tekstfilter kent alleen de drie toetsbare soorten zinnen (dood, woonplaats, bezit van een plek of voorwerp).

Ontwerp en tests: afwijkingen staan onder "Zo is het in M9.2 gebouwd". Een M8.3-test is aangepast: na de oorlog gingen vluchtelingen op het woord van de kroniekschrijver naar huis, ook als ze nog niet wisten dat het vrede was. Dat was de fout uit de review; nu wachten ze tot ze het horen, en de test controleert dat wie nog niet thuis is het ook nog niet weet.

## M9.1 Vaste ids en de open punten, 27 september 2026

Nieuw:
- **Ids zijn sleutels.** Elke wereld heeft een register (`ids.lock`). Een naam of beschrijving mag altijd veranderen; een id niet. Wat weggaat of opgaat in iets anders, krijgt een grafsteen, en oude saves en het spellogboek volgen die. De editor weigert een id te veranderen en maakt de grafsteen zelf. `npm run ids` schrijft het register.
- **Seizoenen.** Turf wordt van Zomermaand tot Herfstmaand gestoken, rogge in de Oogstmaand geoogst. Is twee derde van de voorraad van het seizoen op, dan krijgen de toonbanken minder en stijgt de prijs. `work` bij de turfwand kan alleen in het seizoen.
- **Alle toonbanken uit het grootboek**, in beide werelden, en eten gaat voor. Skerrow heeft een brouwerij, strandjutters en de Heights als nederzetting.
- **Geloof per persoon.** In de wrijving telt een ander geloof mee, en de warme harten van een dorp vormen ook zonder AI een groep voor de nieuwkomers (de Lantaarn met liefdadigheid).
- **Ver weg geen simulatie:** een feest, vertrek of terugkeer ver van de speler is een feit en een toestandswijziging. Wie lang blijft luisteren bij een praatje, hoort met een model soms een zin van de luisteraar zelf. Busy Hands maakt ambachtswerk een kwart korter.
- **Het archief.** Wat een maand voorbij is, gaat van de save naar het spellogboek. Na 300 speldagen is de save 361 kB in plaats van 1272 kB, opslaan duurt 3 ms en laden 16 ms, net als na 30 dagen (`npm run longrun`).
- **Vervoeren.** `loads` op het plein, `haul peat to waagdam`, en `deliver` daar: je wordt betaald uit de beurs van die nederzetting. Op het jaagpad komen de Bokkenrijders met een lading vaker, en wie zich overgeeft is de helft kwijt; aan de oostpoort heft de graaf tol.
- **Zwolderkamp speelbaar.** Ga naar de oostpoort van Waagdam en `travel to zwolderkamp`: twee dagen lopen naar een poort, een markt en een herberg, met een koopman en een waard. Zwolderkamp heeft nu een eigen grootboek; de Oostweg houdt zijn naam en id.
- **Stadsrechten.** Staat de muur van Waagdam, dan gaat burgemeester Aleid naar Graafhaven. De graaf beslist (meestal ja, als de stad 200 duiten voor het charter heeft). Een stad is opener voor vreemden en het charter hangt aan de Waag.
- **Naamlozen.** Werkers aan de muur, vluchtelingen in de kerk bij onrust in het oosten: een aantal, geen mensen. `talk to a refugee` geeft er een een naam en een kaart.
- **Jaren later.** `years later` (of `jaren later`) in de desktopapp begint een nieuw spel met de lore van het vorige als legendes over de vreemdeling, zonder namen van mensen die nog leven. Ouderen kennen ze het best.
- **Skerrow heeft regels.** Een eigen personage (eilander, vastelander, elf; schildhand, harpoenier, schelm, heks, runenwerper, getijroeper), de Tidemother en de Old Stars, en 's nachts wreckers op het klifpad, verdronkenen op het wrakstrand en een barrow-wight bij de toren.
- **Editor:** een tab Map per gebied: sleep een plek om haar te verplaatsen, shift-sleep naar een andere plek voor een weg (de weg terug komt vanzelf). Een plek die een project bouwde, neem je met [Adopt] over, met hetzelfde id.

Testen: `npm run dev`. Seizoenen: wacht tot Wijnmaand en kijk bij Gerrit in de turfschuren (`list`). Vervoeren: `loads` op de brink van Veenhoek, `haul peat to waagdam`, over het jaagpad naar Waagdam en `deliver` op de markt. Zwolderkamp: `@goto loc_waagdam_east_gate`, dan `travel to zwolderkamp` (vraag eerst iemand naar Zwolderkamp, anders kent je dagboek het niet). Stadsrechten en vluchtelingen: `@tension rijkland 30` en een paar weken wachten, of kijk na een paar dagen in de kerk van Waagdam. Skerrow: start een nieuw spel op Skerrow en maak een personage. Editor: `npm run editor`, tab Map. Controles: `npm test` (424 tests), `npm run balance` voor de Nethermarch; Skerrow heeft zijn eigen balanstest in de suite.

Nog niet: een speelbare streek heeft altijd dezelfde vorm (poort, markt, herberg); alleen de woorden verschillen. Alleen Zwolderkamp heeft een tolhek. De legende neemt alleen lore uit de kroniek mee, geen losse grote feiten, en `years later` zit niet in de browserversie. Het [Adopt] voor plekken heb ik niet in de browser kunnen zien: een speeltest van dertig dagen bouwt geen steenbakkerij zonder oplopende spanning; de test dekt het.

Ontwerp en tests: afwijkingen staan onder "Zo is het in M9.1 gebouwd" in het ontwerp voor signalen en nasleep; het lore-ontwerp en het FO (stand na M9.1) zijn bijgewerkt. Nieuwe toestand: `ranks`, `crowds`, `growth.far`, de lading van de speler. Nieuwe werkwoorden: `rank` en `crowd`, bruikbaar voor elke nederzetting en elk plan. Wat in de code Nethermarch was (de kant-en-klare reiziger, de afkomst bij een voorgesteld personage, welke klassen afstand houden), staat nu in de regels van elke wereld. Twee M8-tests zijn aangepast omdat Skerrow regels kreeg: de wereld zonder regels is nu Skerrow met de regels eraf, en de barrowproef zoekt een seed waarop de schipbreukeling faalt. De 30-dagensimulatie geeft dezelfde zeven meldingen als voor M9.1 (geesten, een kind, de opgesloten Gerrit).

## M8.5 Nasleep: groei, 27 september 2026

Nieuw:
- **Nieuwkomers.** Ligt een ambacht twee weken stil, dan kan er een huishouden uit een sjabloon komen wonen: in de Nethermarch een kuipersgezin uit Zwolderkamp, in de oude kuiperij aan de kade van Veenhoek, op een dag dat de trekschuit vaart. Namen uit de naamtabel van de wereld, niemand kent ze en zij kennen niemand, en ze worden als content gecontroleerd voordat ze de wereld in komen. Hooguit zes nieuwkomers per seizoen. Komt er niemand, dan hangt er na drie dagen een briefje op het prikbord.
- **Projecten.** Een nederzetting kan bouwen met materiaal uit haar grootboek, werkdagen en geld. Loopt de spanning met Rijkland op, dan wil Waagdam een muur: eerst een steenbakkerij aan de Vaart (turf uit de voorraad), die klei tot baksteen bakt, en daarna de muur van driehonderd stenen. De nieuwe plek komt erbij, en de poorten zien er anders uit als de muur staat.
- **Een tekort dat blijft.** In een handelsstad gaan bij een tekort eerst de prijzen omhoog; houdt het een week aan, dan stuurt de winkelier zelf een kar ver weg. In een dorp komen er nieuwkomers als die het goed maken.
- **Werken voor loon.** `work` bij de turfwand of later bij de steenoven: een dag werk voor loon, met een proef (gaat het slecht, dan half werk en half loon) en ervaring als het goed gaat. Wat je maakt, gaat in de voorraad van de nederzetting.
- **Investeren.** `invest 20` in een nederzetting waar gebouwd wordt: als het af is, krijg je het terug met een vijfde erbij.
- **Editor:** nieuwkomers en projecten zijn lijsten. De speeltest toont wie er kwam en wat er gebouwd werd, en met [Adopt] schrijf je een huishouden in de wereld.

Testen: `npm run dev`. Speel ruim twee weken (of wacht) en ga naar de kade van Veenhoek: in de oude kuiperij woont een nieuw gezin. Voor de muur: `@tension rijkland 30` zet de spanning met Rijkland op 60; Waagdam begint dan aan de steenbakkerij, en ruim drie weken later staat de muur (kijk bij de West Gate). Met `invest 20` in Waagdam leg je geld in. In de editor bij Playtest laat dertig dagen draaien de nieuwkomers zien. `work` bij de turfwand (`@goto loc_peat_cuttings`). Controles: `npm test` (395 tests).

Nog niet: groepen met naamlozen die pas een naam krijgen als je iemand aanspreekt, vervoeren als eigen handeling (nu via verzoeken om iets te halen), en een rangwissel van een nederzetting. Busy Hands en wat verder openstaat, staat in M9.1.

Ontwerp en tests: afwijkingen staan onder "Zo is het in M8.5 gebouwd". Twee oude tests zochten een NPC op in de content van de wereld in plaats van die van het spel; die kijken nu naar `engine.content`, zodat ze de nieuwkomers meetellen. Een ambacht zonder handen is nu na veertien dagen een signaal (was drie), zodat een dorp het eerst zelf merkt. Het FO heeft een stand na M8.5.

## M8.4 Economie, 27 september 2026

Nieuw:
- **Een grootboek per nederzetting.** Elke nederzetting van beide werelden rekent eens per speldag, om vijf uur: de werkplaatsen maken wat hun handen en grondstoffen toelaten, de naamlozen gebruiken wat ze nodig hebben, en wat overblijft gaat over de routes. De toonbanken vullen uit die voorraad; voor wat het grootboek niet kent, blijft de vaste bevoorrading. Alles staat in `content/<wereld>/data/economy.yaml`.
- **Lampolie en spijkers komen alleen uit Zwolderkamp**, over de Oostweg. Breekt er oorlog uit, dan sluit het oorlogsplan die weg; binnen een paar dagen is er een tekort in Waagdam, wordt de kruik bij Hendrik duurder en klinkt het signaal. Niemand heeft dat tekort geschreven.
- **De molen en het meel.** Na de storm staat De Zwaan stil: het meel in Veenhoek raakt op en Lubbert vraagt het driedubbele. Draait de molen weer, dan komt er meel over de karren naar Waagdam en Veenhoek en zakt de prijs.
- **Signalen uit het grootboek.** Een tekort van twee dagen gaat naar het brein van wie het verkoopt (bijvoorbeeld Lubbert: zelf meer laten halen, de rest achterhouden of de vreemde vragen). Een tekort van een week, een overschot, een prijs die verdubbelt, een ambacht dat niemand meer uitoefent en een gesloten route zijn wachters in de content.
- **Karakter per nederzetting.** Uit het grootboek volgt waar een plek van leeft (Veenhoek turf, Molenend meel, Waagdam handel), plus tags. Een handelsstad is opener voor vreemden en laat bij een tekort goederen halen; een turfdorp behelpt zich en moppert, en kijkt bij voedseltekort strenger naar een vreemde.
- **Streken buiten de kaart als stomp.** Zwolderkamp en Hunnenloo hebben alleen wat ze sturen en vragen, prijspeil, drager en hoe vaak. De kroniekschrijver krijgt dat in zijn vaste deel en bij het uitwerken van zo'n plek, zodat wat hij vertelt klopt.
- **Geld dat niet meer uit het niets komt:** naamloze klanten betalen uit de beurs van hun nederzetting, een winkelier betaalt wie hem iets verkoopt (en koopt niet meer dan de kas toelaat), en het loon en eten van een gezel gaan naar iemand toe.
- **Editor:** nederzettingen, routes, streken buiten de kaart en grond zijn lijsten. Onder Check staat per nederzetting waar ze van leeft, haar karakter en haar routes; onder "Worth a look" een waarschuwing voor een goed dat gebruikt wordt maar nergens gemaakt of aangevoerd.

Testen: `npm run dev` of `npm run editor`. In de editor onder Check zie je de nederzettingen. In het spel: wacht een paar dagen en vraag bij Lubbert naar meel (`list` in de graanhandel); repareer de molen met zeildoek en kijk de prijs zakken. `@plan war` sluit de Oostweg: wacht een paar dagen en kijk naar de lampolie bij Hendrik (`list` in de smidse). Controles: `npm test` (390 tests), met een oude save die zijn grootboeken start waar hij staat.

Nog niet: nieuwe mensen rond het gemiddelde van een nederzetting (M8.5). Een streek die de kroniekschrijver uitwerkt, krijgt nog geen eigen grootboek. Warme maaltijden, melk, bier op Skerrow en scheepsbeschuit houden hun vaste bevoorrading. Grond die opraakt en seizoenen kan de content zetten, maar de Nethermarch gebruikt ze nog niet.

Ontwerp: afwijkingen staan onder "Zo is het in M8.4 gebouwd". Let op: het wereldboek zegt niet wat Zwolderkamp en Hunnenloo sturen. Lampolie en spijkers komen uit het ontwerp; zeildoek, touw (Zwolderkamp) en wol (Hunnenloo, de schaapherders) heb ik toegevoegd zodat elke keten sluit. Wil je dat anders, dan is het alleen content. Skerrow heeft geen route naar buiten, omdat een pakketboot de hoofdquest ondergraaft. Het FO heeft een stand na M8.4.

## M8.3 Nasleep: de kroniekschrijver plant, 27 september 2026

Nieuw:
- **De kroniekschrijver plant voor signalen.** Wat meer huishoudens raakt, belang 3 of meer heeft, iemand met een rol in een quest betreft of waar geen voornemen bij past, gaat naar hem. Hij schrijft stappen in dezelfde werkwoordentaal als de content, voor een groep persoon voor persoon: na de oorlog gaat de ene helft van de vluchtelingen naar huis en blijft de andere in Waagdam wonen. Wat hij niet mag, wordt geweigerd; zonder geldige stap doet de standaardnasleep het, helemaal.
- **Botsende plannen worden één verhaal.** Kiest Gerrit ervoor het uit te praten en Jan om hem te ontlopen, dan maakt de kroniekschrijver er in de nacht één verhaal van. Bij een ruzie ziet hij wie ze allebei vertrouwen, als bemiddelaar.
- **Wrijving in een dorp.** Te veel nieuwkomers tegen hoe open een dorp is, zwaarder bij voedseltekort of als ze van ver komen, en er ontstaat een groep tegen hen. Je kunt kant kiezen (`side with aaltje`) of bemiddelen (`mediate between cornelis and aaltje`).
- **Een waarschuwing die uitkomt.** Breekt de dijk toch, dan schaamt wie de vreemde wegjoeg zich en denkt beter over hem.
- **Opbouw per verhaallijn.** Een lijn krijgt een fase (opzet, stijgend, crisis, afloop, gesloten) en hooguit één geplande beat. Hooguit twee lijnen komen per week in crisis. Lopen er twee naar een crisis in een dorp, dan begint de verhalenmotor daar niets nieuws, en elders wat minder.
- **Kleinere lijnen.** Hooguit twaalf feiten per lijn, en een druk persoon trekt niet meer elk klein ding naar één lijn: dezelfde soort of hetzelfde tweetal wel, groot nieuws ook.
- **De tegenspelers als content.** Cornelis die meet, Gerrit die palen trekt, de Geitenrijders, de schout en de Haakman zijn drie plannen in `plans.yaml`, gestart vanuit `world.yaml`. Een test legt ze dag voor dag naast het oude script.
- **Opgelost:** de verhalenmotor liet ook geesten ziek worden of iets verliezen ("the's fever"); nu alleen gewone mensen.
- **Editor:** een tab Reference met alle voorwaarden, werkwoorden (en wie ze mag gebruiken), selectors en bindingen, uit de schema's. Dezelfde tekst staat in `content/CHRONICLER.md` (`npm run reference`). De speeltest toont de verhaallijnen met fase en notitie.

Testen: `npm run dev`. `@plan dyke_breach` en twee dagen wachten geeft wrijving in Waagdam; ga naar de kerk daar en probeer `side with` en `mediate between`. Met een model gekoppeld zie je in de editor bij Playtest de fases van de lijnen. De tegenspelers doen wat ze deden: Cornelis meet op werkdagen, Gerrit trekt 's nachts palen, de schout grijpt in. Controles: `npm test` (381 tests).

Nog niet: verschil in geloof telt niet mee in de wrijving (er is geen geloof per persoon). De ontvangstgroep (de Lantaarn met liefdadigheid) kan de kroniekschrijver maken, de standaardnasleep maakt alleen de groep tegen.

Ontwerp: afwijkingen staan onder "Zo is het in M8.3 gebouwd". De belangrijkste: een stap kan zich herhalen (`every`), er zijn voorwaarden `around` en `carries`, en `world.yaml` kent `plans`. De kans op een stap wordt pas gegooid als de voorwaarden gelden. Een gearresteerde zit precies twee dagen vast, ook als de dijk intussen breekt (in het script bleef de vlag staan zolang hij ergens verbleef). Het FO heeft een stand na M8.3.

## M8.2 Nasleep: het brein plant, 27 september 2026

Nieuw:
- **Vijf standen.** Arm, gewoon, burger, welgesteld, notabel: de kas van het huishouden tegen het midden van de streek, een stap hoger voor een ambt. Het staat op de kaart van de stem, mensen twee standen uit elkaar praten minder met elkaar, en wie welgesteld is, zit niet meer in de herberg maar in de kerk. Stijgt een huishouden twee standen, dan hoort het dorp het en worden de buren jaloers.
- **Geloven, twijfelen, verwerpen.** Wie een bewering hoort, gelooft die of niet naar vertrouwen in de bron, of anderen hetzelfde zeggen, of het past bij wat hij weet, en hoe open zijn dorp is voor vreemden (een stad meer dan een gehucht). Wie twijfelt terwijl er iets van afhangt, vraagt het na bij een handelaar of gaat zelf kijken.
- **Een vreemde met een waarschuwing.** Een lekkende dijk heeft een eigen klok. Wie de vreemde gelooft, loopt naar de dijkgraaf; wie hem niet gelooft en driftig is, jaagt hem weg. Of de dijk op tijd gestut wordt, volgt uit wie wie gelooft en de wandeling.
- **Ruzie, vete en verzoening.** Een ruzie laat wrok na. Bemiddelt iemand die ze allebei vertrouwen, dan maken ze het goed; anders wordt het na een week een vete. Je kunt ook zelf bemiddelen: `mediate between gerrit and jan`.
- **Vergeten en herkennen.** Wie elkaar lang niet ziet, raakt elkaar kwijt tot een herinnering. Wie na lange tijd terugkomt, wordt herkend door wie hem goed kende, en die komt hem opzoeken.
- **Groeten en praatjes waar jij bent.** Mensen die elkaar tegenkomen, groeten naar hun band. Hebben ze tijd en nieuws, dan blijven ze staan praten; met `listen` vang je de strekking op. Gaat het over jou of een geheim, dan dempen ze hun stem of beginnen ze over iets anders.
- **Het brein kiest een voornemen.** Een signaal over iemand zelf (rijk geworden, een ruzie, twijfel, een waarschuwing, herkend, vluchtelingen die blijven) gaat met een model naar zijn brein. Dat kiest een voornemen uit de content (`intentions.yaml`), zoals geld uitlenen aan iemand, iemand vragen om te bemiddelen, of liegen dat de oorlog voorbij is, en vult in wie of waar. Zonder model, zonder budget of met een foute keuze doet de standaardnasleep het.
- **Na de review:** één werkwoordentaal met een tabel wie welk werkwoord mag gebruiken, een kans op een planstap, de breinprompt kleiner (vaste catalogus in het gecachte deel, korte sleutels, geen ochtendkeuze zonder aanleiding, geen model voor wie ver weg is), en de Nethermarch uit de motor: wet en stadsrechten in `world.yaml`, bid- en speelplekken als tags, het geneesmiddel als het voorwerp met `remedy`.
- **Editor:** voornemens als lijst, en in de NPC-inspecteur stand, wat iemand gelooft en aan welk voornemen hij bezig is.

Testen: `npm run dev`. Ga naar de brink van Veenhoek en wacht: wie binnenkomt, groet; staan er twee te praten, typ `listen`. `@plan dyke_leak` start een lekkende dijk; kijk wie het gelooft. Harmen die rijk wordt en zich anders gaat gedragen, zie je in de tests (`tests/m82.test.ts`) of na een lange speeltest in de editor, als de molen goed verdient. Met een model gekoppeld kiezen mensen hun eigen voornemen; in de editor bij Playtest zie je per persoon wat hij gelooft en van plan is. Controles: `npm test` (369 tests).

Nog niet: de optionele zin van de stem voor wie lang blijft luisteren, en geheimen herkent het praatje alleen als leugen of verzwegen feit. Het brein plant alleen voor zichzelf; groepen en botsende plannen zijn voor de kroniekschrijver (M8.3).

Ontwerp: gebouwd volgens de bijsturing na de review van 27 september (voornemens als sjablonen in de content in plaats van stappen van het model). Keuzes die ik maakte staan in het ontwerp onder "Zo is het in M8.2 gebouwd"; de review staat nu ook op main in `docs/`.

## M8.1 Nasleep: fundament, 27 september 2026

Nieuw:
- **Een gebeurtenis heeft gevolgen.** Wachters in de content maken van een verandering een signaal (een bruiloft, vrede, een huis waar niemand meer woont), en de standaardnasleep zegt welk plan volgt: stappen over dagen, met een voorwaarde op wat iemand weet of wat waar is. Alles zonder extra AI. De code kent geen bruiloft; een nieuwe soort gebeurtenis is een wachter en een nasleep in `content/<wereld>/data/`.
- **Wouter en Geesje trouwen.** Geeft Trijntje haar zegen, dan volgt op de eerste rustdag minstens een week later een feest in de Goose, met beide families. Daarna zijn ze man en vrouw, trekt Geesje bij Wouter in, en stopt ze na een nacht bij de Goose omdat het een half uur lopen is. Trijntje hangt een briefje op het prikbord in de stalhof (`examine board`) en iemand zonder werk die ervan hoort, neemt de plek. Lopen ze weg, dan zijn ze drie weken in Graafhaven en komen ze getrouwd terug.
- **Jouw huwelijk loopt via dezelfde nasleep.** Zelfde uitkomst als in M7.2 (huis, schoonfamilie, een partner die je thuis verwacht), en je partner ziet je nu ook echt als echtgenoot.
- **Terugkeer volgens wat mensen weten.** Laat de kroniekschrijver mensen vluchten voor een oorlog, dan gaan ze terug zodra ze horen dat het vrede is en denken dat hun huis nog staat. Wie hoorde dat hun dorp afbrandde, blijft weg.
- **Nieuws voor wie weg is.** Wie op reis of gevlucht is, hoort het nieuws waar hij nu is, en groot nieuws (belang 4 en 5) komt overal in de streek aan. Wie ver weg is, is geen getuige meer op zijn oude plek.
- **Een feit bij elke questuitkomst**, ook als de gever sterft, zodat het dorp hoort hoe het afliep.
- **Editor:** wachters, nasleep en het nieuws per werkwoord zijn lijsten met controle. De speeltest toont signalen en plannen, de NPC-inspecteur waar iemand nu woont en werkt en welke banden veranderden.

Testen: `npm run dev`, nieuw spel in de Nethermarch. Met de bouwcommando's: `@quest a_boat_and_a_bride`, `@flag trijntje_blesses`, dan wachten tot Rustdag 26 Herfstmaand rond vier uur en naar de Goose gaan voor het feest. Een dag later staat het briefje op het prikbord in de stalhof, en praat met Geesje of Wouter over hun huis. Of trouw zelf (zoals in M7.2) en kijk in de editor bij Playtest. Controles: `npm test` (350 tests), met drie saves van vóór M8.1 die laden en doorspelen, de dertig dagen en de uitspeelscripts van beide werelden.

Nog niet: het brein plant nog niets zelf (M8.2). In de Nethermarch heeft iedereen werk, dus de plek bij Trijntje blijft voorlopig open; de kroniekschrijver en nieuwkomers vullen dat in M8.3 en M8.5 in (tot 27 september 2026 M8.4). Zonder AI vlucht er in een oorlog niemand.

Ontwerp: je besluiten van vandaag zitten erin (de kroniekschrijver beslist wie vlucht, het feest op een rustdag na een week, het prikbord). Afwijkingen en aanvullingen staan in het ontwerp onder "Zo is het in M8.1 gebouwd": alleen een vast plan met een vlucht blokkeert de kroniekschrijver nog (het oorlogsplan niet), de terugkeer zit in de vlucht zelf, er zijn werkwoorden bij (hire, post, thought, expect_home, regard, leave, tell, end_tie), en een open plek is belang 2 zodat het dorp hem twee weken onthoudt. Het FO heeft een stand na M8.1 in hoofdstuk 15 en de regel voor tegenstrijdige versies in hoofdstuk 5.
## Na je speeltest van M8, 27 september 2026

Nieuw:
- **Gesprekken die niets zeiden.** De stem kreeg voor een kort antwoord maar 120 tokens, terwijl de hele JSON meetelt (sinds M7.2 ook `quest_action`). Het antwoord werd afgekapt en het spel viel terug op een standaardzin ("Wendela nods. 'Evening.'"). Nu is er ruimte genoeg, en als de AI toch geen antwoord geeft, zie je dat in het gesprek: *(No answer from the AI: ... A stock line stands in.)*
- **Welke kant op.** Wie doorloopt, zegt nu waarheen: "Gerrit walks on to the north."
- **Wat je van iemand weet.** Naast het gesprek staat een kaartje: plaatje (of een lege plek met waar je plaatjes aanzet), beroep, leeftijd, houding, waar je iemand het laatst zag en waar vaak, uiterlijk en woonplaats. De leeftijd is eerst een schatting met een vraagteken ("about 35 to 45?"); vraag ernaar ([ask], of "how old are you?") en hij staat vast, en groeit mee met de jaren. Het dagboek toont hetzelfde.
- **Iemand vinden.** Het spel onthoudt waar je iemand zag (de laatste keer en de vijf plekken waar het vaakst), dus je hoeft het niet op te schrijven. Klein genoeg om altijd bij te houden.
- **De tijd wacht terwijl je typt.** Zolang er tekst in de invoer staat, staat de klok stil.
- **Personagepagina.** [Sheet] is opgemaakt: niveau, levenspunten en ervaring als balk, verdediging, initiatief en klasse-DC, attributen en saves als tegels, wapen en harnas, vaardigheden met rang en oefening, talenten. De tekstversie blijft voor de terminal.

Testen: `npm run dev`, nieuw spel, loop n en `talk mirte`. Zeg iets in gewone woorden, klik [ask] bij de leeftijd, en kijk rechts. Open [Sheet]. Typ iets in de invoer en wacht: de klok loopt niet. Controles: `npm test`, met `tests/playtest-m8.test.ts`.

Nog niet: een [Look at] in het gesprek (het kaartje toont het uiterlijk al), en herkennen van iemands leeftijd uit wat de stem zegt; de leeftijd staat vast zodra de stem een antwoord gaf op een leeftijdsvraag.

Ontwerp: FO hoofdstuk 2 (gespreksvenster, personagepagina, klok) en 5 (wat de speler van iemand weet) zijn bijgewerkt.

## M8 Editor en meerdere werelden, 27 september 2026

Nieuw:
- **Een tweede wereld.** Naast de Nethermarch staat Skerrow, een klein high-fantasy-eiland waarop je strandt na het vergaan van de Grey Gull. Zeven bewoners (onder wie een elf in een verwoeste magiërstoren en een hedge-witch), twaalf plekken en een hoofdquest met drie oplossingen: Brannocs boot repareren, het baken weer laten branden zodat er een schip komt, of met de sleutel uit de grafheuvel van de wyrm door de waystone. Doe je niets, dan sluit na veertig dagen de winter de zee. Het eiland heeft een eigen kalender (Windsday 3 Leaffall 412 SF), eigen munten (gp, sp, cp), eigen wet en een eigen deel van de werkinstructie van de kroniekschrijver, en er zit geen regel code voor in. Het heeft geen regelbestand, dus je speelt de kant-en-klare reiziger zonder gevechten.
- **Wereld kiezen.** Een nieuw spel vraagt in welke wereld je begint. CONTINUE, LOAD en NEW STRANGER openen de wereld van de save.
- **De editor in een eigen venster.** `npm run editor`, of [Editor] in het spel als je `npm run dev` gebruikt. Kies een wereld en bewerk alles: plekken en mensen met een formulier, de rest als YAML. Opslaan controleert eerst de hele wereld en schrijft alleen het ding dat verandert, dus commentaar en indeling blijven staan. Een uitgang krijgt aan de andere kant vanzelf de weg terug. [Check and show the change] toont de wijziging als diff. Een lopend spel in dezelfde wereld gaat er meteen mee verder.
- **Controle, speeltest en NPC-inspecteur.** Fouten en aandachtspunten met een link, per quest het aantal oplossingen, en een speeltest die de wereld 1 tot 30 dagen zonder jou laat draaien, met per persoon wat die wil, van plan is, onthoudt en deed.
- **Sparren met de kroniekschrijver.** Vraag iets, bijvoorbeeld "een gehucht bij deze plek met drie mensen en een verhaal". Het voorstel verschijnt als diff, wordt gecontroleerd en komt pas in de bestanden na [Accept and save]. Dit gebruikt het model dat je voor de kroniekschrijver koos.
- **Nieuwe wereld.** Onder New world maak je een lege wereld met een gebied en een plek, die meteen in de wereldkeuze staat.
- Kleine dingen: `wait 3 hours` wacht nu uren, mensen stellen zich voor met het werkwoord in de ik-vorm, en de oude builder-overlay uit M4 is vervangen door de editor.

Testen: `npm run dev` en kies Skerrow. Pak de zeildoek, loop oost, oost, noord, oost en koop pitch (`buy pitch`), ga terug naar de haven en `mend the boat`, dan `ask brannoc to sail me`. Of vraag Tamsin in het berkenbos naar de grafheuvel. Daarna `npm run editor`: open een plek, voeg een uitgang toe en bekijk de diff; vraag onder Chronicler om een gehucht met een plek open (met een model gekoppeld, of in de browser-preview `npm run web` met `?editor=1&mock=1`); draai onder Playtest een week. Controles: `npm test` (335 tests), waarin elke entiteit van beide werelden zonder verlies opent en opslaat, het gehucht van de kroniekschrijver speelbaar is en alle oplossingen van Skerrow worden uitgespeeld; na `npm run build` de rooktest voor beide werelden (`WISPLIGHT_SMOKE=isle`) en voor de editor (`--editor`).

Nog niet: een kaart waarop je plekken sleept (uitgangen staan in het formulier), de bouwcommando's @dig, @desc, @spawn, @tag en @link (de editor doet dat werk), en een regelset voor Skerrow (elfen, tovenaars). Bewaarplekken zijn nog gedeeld over werelden: een SAVE in Skerrow vervangt de laatste handmatige save.

Ontwerp: FO hoofdstuk 15 heeft een stand na M8 met de afwijkingen, het ontwerpdocument "Zo is het in M8 gebouwd". Afwijking: de kroniekschrijver levert hele entiteiten in YAML en de editor maakt de diff, omdat een model een diff vaak net verkeerd schrijft. Skerrow staat niet in het wereldboek, dat over de Nethermarch gaat; de namen staan in `content/isle`, en in CLAUDE.md staat nu dat een andere wereld haar namen in haar eigen map houdt.

## M7.2 Open punten uit M1 tot en met M7, 27 september 2026

Nieuw, alles wat eerder onder "Nog niet" bleef staan:
- **NPC-doelen:** de hele doelcatalogus uit het FO, met de poorten. NPC's verkopen, bezorgen, helpen, volgen, bewaken, mijden, verspreiden nieuws, maken het hof, vieren, onderzoeken, geven aan, confronteren, vragen hulp, stelen, saboteren, doen iemand iets aan of vluchten. Een dorpeling die steelt kan gezien, besproken, aangegeven en een dag opgesloten worden.
- **Diefstal die niemand zag:** wordt later ontdekt. Het gerucht noemt een verdachte (wie er gezien werd, of iemand die het slachtoffer niet mag) en kan dus fout zijn. De schout gaat kijken.
- **Gevaren buiten gevechten:** wegzakken in het veen (`struggle`), Veenkoorts na een nacht buiten (`use herbs`), een vloek (weg met een `rite` op een heilige plek), even een kat zijn (de weduwe kan dat), een punter huren bij Wouter (`hire punt`).
- **Zegeningen** die alleen tekst waren, werken nu, en de Grijze Ruiter vraagt zijn prijs: de laatste schoof op een kruispunt (`leave the rye`).
- **Gezellen:** vanaf band 1 een gezamenlijke slag (`together wouter`).
- **Huwelijk:** een huis (dat van je partner), schoonfamilie en verwachtingen.
- **Kroniekschrijver:** stelt na grote gebeurtenissen een kleine verschuiving tussen landen voor en schrijft een effectplan als er geen vast plan is, beide begrensd en gecontroleerd.
- **Quest-acties in gewone woorden:** in het gespreksvenster herkent de stem wat je bedoelt, dus je hoeft de vaste zin niet meer te kennen.
- **Lore meenemen:** `new stranger` begint in de desktopapp een nieuw personage in de wereld van de laatste save. Grote gebeurtenissen blijven, klein nieuws is vergeten, en de mensen herinneren zich de vreemdeling van vóór jou.
- **Kleine dingen:** De Schaal heeft een waardin (Neeltje Kuiper), en het tempo kies je bij een nieuw personage.

Testen: `npm run dev`, nieuw spel, kies een tempo. Loop 's nachts het veen in en blijf buiten slapen; loop over slappe grond. Praat met Aaltje in gewone woorden over de kat. Steel brood als niemand kijkt en wacht een paar uur. Huur een punter bij Wouter. Bewaar, sluit af en typ bij de start `new stranger`. Controles: `npm test` (309 tests).

Nog niet: genereren tot speelbaar (komt met de eerste nieuwe streek), Busy Hands (wacht op ambachtswerk), de legende-variant van lore meenemen.

Ontwerp: FO hoofdstuk 7, 8, 12, 13 en 14 hebben een stand na M7.2, het ontwerpdocument "Zo is het in M7.2 gebouwd". In het wereldboek staan de waardin van De Schaal, de punters en de prijs van de Ruiter bij de ingevulde details. Keuzes die ik maakte: Veenkoorts neemt elke dag een punt Might, een vloek kost 2 op elke worp, de gezamenlijke slag kost twee acties met +2 voor beiden, en de kroniekschrijver mag de spanning hooguit 5 punten verschuiven.

## M7.1 Moderne interface, 27 september 2026

Nieuw na je playtest:
- **Gesprekken in een eigen venster.** Het gesprek begint met `talk grietje` en gaat verder in een venster waar je gewoon typt wat je zegt, zonder `say`. De snelle keuzes zijn knoppen. Rechts staan de onderwerpen die je kent, het dichtstbij eerst, met "where?" bij mensen en plekken; wat verder dan 15 km ligt, zoek je of klap je open.
- **Het dagboek** opent vanuit een gesprek eerst op wat binnen 15 km ligt, toont bij elke regel de afstand, en zet plekken, mensen en gebeurtenissen op een kaartje met een ster.
- **NPC's weten waar hun bekenden zijn.** Wat ze zelf zagen gaat voor, anders het dagschema: familie, vrienden en collega's weten de plek op dit uur, een kennis gokt, en wie iemand alleen van naam kent, noemt het dorp. Wie iemand kent, weet ook hoe die eruitziet.
- **Plaatjes (optioneel).** Onder Settings > AI > Pictures kies je een beeldmodel van OpenAI (Claude maakt geen plaatjes). Elk gebied krijgt één plaatje voor al zijn plekken en elke benoemde persoon een portret; wie `portrait: generic` heeft, krijgt een egale figuur. Een plaatje kost op lage kwaliteit een halve tot een hele cent, wordt één keer gemaakt en bewaard, en telt mee in het budget.

Testen: `npm run dev`, nieuw spel, loop n, w en `talk grietje`. Typ iets gewoons, klik een onderwerp rechts of "where?", en open [Journal] in het venster. Voor plaatjes: Settings > AI, OpenAI-sleutel, Pictures, [Try] en [Save]; praat daarna met iemand of open een plek in het dagboek. In de browser-preview zie je met `npm run web` en `?mock=1` placeholders in plaats van echte plaatjes. Controles: `npm test` (290 tests).

Nog niet: de open punten uit M1 tot en met M7 (M7.2) en de aparte editor met een tweede wereld (M8).

Ontwerp: FO hoofdstuk 2 (gespreksvenster en dagboek), 5 (waar iemand is) en 16 (plaatjes) zijn bijgewerkt. Afwijking van je voorstel: alle benoemde personen krijgen een portret en alleen "generieke" mensen een egale figuur, zodat het plaatje niet verraadt wie belangrijk is voor een quest. Per NPC om te zetten met `portrait: generic`.

## M7 Quests en de volledige Holleveen, 27 september 2026

Nieuw: de hele Holleveen staat erin, met 86 locaties, 30 NPC's en de 22 verhalen uit het wereldboek. Nieuwe mensen zijn onder meer Klaas, landmeter Cornelis, burgemeester Aleid Vos, notaris Pen, prior Ansfried, heemraad Sijbrand, de weduwe Kaatje, Zwarte Mathijs, Ouwe Knoert, de Haakman en de witte wieven; Fenna en Jacob van Dam zijn er als kat. De tien quests en de vijf persoonlijke quests zijn uitgeschreven met stadia, eigen acties en minstens drie oplossingen elk. Je speelt ze met gewone zinnen, zoals `ask aaltje about the cat`, `fill a flask with moon water`, `pour the moon water on the cat`, `confront kobus`, `pull up the stakes` of `offer bread and beer`. Het dagboek toont per quest alleen wat je al weet.

De wereld wacht niet. Cornelis meet elke werkdag, Gerrit trekt 's nachts palen uit, Cornelis huurt dan de Bokkenrijders in en de schout sluit een turfsteker op. Doe je niets, dan gaat na ongeveer twee weken het rapport naar Graafhaven. De weduwe heeft zes dagen geduld nadat je weet wie de kat is, en pompt de molen, dan neemt de Haakman wraak en breekt de dijk bij Oude Zijl. Veenhoek loopt dan onder: wie bij je in de buurt is, pakt in en loopt echt naar Waagdam, wie ver weg is wordt een notitie, en de Vissers blijven achter, wat een nieuwe quest oplevert. Verder zijn er effectplannen voor mist over de Kattenbroek, soldaten van de graaf en oorlog, en plekken kunnen overstroomd, beschadigd, verwoest, verlaten of bezet zijn.

Testen: `npm run dev`, nieuw spel. Loop n, w naar de Vissers: daar begint de hoofdquest. Vraag Aaltje naar de kat (brink, n, w) en kies een van de vier wegen. Met bouwcommando's gaat het sneller: `@goto <plek>`, `@bring <persoon>`, `@give <voorwerp>`, `@time 23`, `@quest <id>`. Probeer op de brink `@plan dyke_breach` en `wait 60`, of loop naar de turfputten (`@goto loc_route_peat_pits`) en wacht een paar dagen. Controles: `npm test` (280 tests), waarin elke oplossing van elke quest als script wordt uitgespeeld, plus 30 speldagen simulatie.

Nog niet: genereren tot speelbaar (niveau 3), want wegen de streek uit gaan pas open als er streken bijkomen. De kroniekschrijver kiest en schrijft nog geen effectplannen; die staan vast in `content/base/data/plans.yaml`. Een quest-actie is een vaste zin, dus een andere formulering valt terug op het gewone gesprek. Lore meenemen naar een nieuw spel komt na M7.

Ontwerp: in het FO hebben hoofdstuk 14 en 15 een stand na M7, in het ontwerpdocument staat "Zo is het in M7 gebouwd". Details die ik moest invullen, zoals de ware naam van de Haakman (Haak Aukes), Fenna's leugen, waar de meetkist van Jacob staat en het raadsel van de witte wieven, staan in het wereldboek onder hoofdstuk 14; pas ze gerust aan. Afwijkingen: het geduld van de weduwe staat stil zolang de meting stilligt, anders kan die prijs nooit betaald worden. De Vissers vluchten niet zelf. Zeildoek kost nu 25 stuivers per rol en Harmen heeft 30 stuivers, zodat hij de molen niet zelf kan maken, zoals het nieuws zegt.

## M6 Relaties, facties en gezellen, 27 september 2026

Nieuw: je kunt mensen meenemen. Vijf NPC's kunnen gezel worden: Gerrit (Warden), Wouter (Poacher), Geesje (Rascal), Wendela (Lanternbearer) en Aaltje (Herbalist). Met `recruit wouter` of "Will you come with me?" beslist een formule of ze meegaan: hoe ze over je denken, of de tocht bij hun doelen past, het gevaar, hun werk en familie, en of je het loon kunt betalen. Sommigen gaan mee op voorwaarden, voor een aantal dagen of niet naar spookplekken. Ze volgen je, vechten mee en zeggen wat ze van je daden vinden ("Gerrit nods slowly."). Je geeft bevelen (`order wouter to scout the kattenbroek`, `order geesje to distract lubbert`, `wait here`), en een gevaarlijk bevel weigeren ze bij lage loyaliteit. `talk party` vraagt iedereen tegelijk, `camp` laat 's avonds iemand iets vertellen, en de band groeit tot hun persoonlijke quest opengaat. Onder loyaliteit 20, zonder loon of na slecht nieuws van thuis gaan ze naar huis.

Relaties zijn nu het hele model uit het FO: de houding rekent stemming en situatie mee, en de poorten beslissen wat iemand doet. Gerrit die je met de meetkettingen van de landmeter ziet, wordt boos, zoekt je op en spreekt je aan, maar slaat niet zolang hij je nog Vriendelijk vindt. Cadeaus, beloftes, lenen en terugbetalen (`borrow`, `repay`) tellen mee. Er zijn dertien facties met reputatie die doorwerkt bij bondgenoten en rivalen, en je kunt bij sommige lid worden (`join`). Stelen (`steal bread`, `steal money from kobus`) en aanvallen (`attack <naam>`) zijn misdaden als iemand het ziet; dan gaat het rond, en wie je aangeeft, zet de schout op je af (`pay fine`). Een getuige kun je omkopen of bang maken. Romance kan met wie ervoor openstaat (`flirt`), met jaloezie. De landen hebben een spanning die tot oorlog kan oplopen (`lands`), en de motor merkt op als twee oude vijanden elkaar onderweg tegenkomen.

Testen: `npm run dev`, nieuw spel. Maak iemand te vriend, of typ `@like wouter 60 40` (bouwcommando), loop naar Wouters hut (vanaf de kade s, w, s) en `recruit wouter`. Probeer `order wouter to scout the kattenbroek`, dan `@like wouter 90 60` en nog eens na een paar dagen samen. Neem `@fight goat_riders_toll` samen. Steel brood in de lege bakkerij en daarna waar Mirte bij is. Geef jezelf de meetkettingen niet: die krijg je pas in M7 van de landmeter; in de tests is het scenario van Gerrit nagespeeld. Controles: `npm test` (197 tests).

Nog niet: het onderzoek door de schout en verdachten in geruchten (M7), gezamenlijke acties per band, het uitspelen van de persoonlijke quests (M7), een huis en familie na een huwelijk. De kroniekschrijver kan nog geen verschuiving in de spanning tussen landen voorstellen.

Ontwerp: in het FO hebben hoofdstuk 8 en 13 een stand na M6, in het ontwerpdocument staat "Zo is het in M6 gebouwd". De beginwaarden van de spanning tussen landen staan niet in het wereldboek; ik heb ze voorgesteld in `content/base/data/factions.yaml`. Het personage heeft een voornaamwoord gekregen, omdat sommige NPC's in het wereldboek alleen voor vrouwen of mannen openstaan. Gerrit en de schout hebben gevechtswaarden (Warden 3), de andere gezellen level 2 of 3.

## M5 Personage, regels en gevecht, 27 september 2026

Nieuw: je maakt een personage. Bij een nieuw spel kies je een klasse (Warden, Poacher, Rascal, Herbalist, Conjurer of Lanternbearer), een afkomst, een achtergrond, drie plussen op je attributen, extra vaardigheden en een eerste talent. Alles begint bij een voorstel, dus een naam typen en [Begin] is genoeg. Wie het scherm wegklikt, speelt de kant-en-klare reiziger. Je achtergrond zet mensen die je al kennen en onderwerpen meteen in het dagboek. De regels staan als YAML in `content/base/rules`: per klasse drie bomen van vier talenten, de vijf beschermgoden uit het Wereldboek en het bestiarium.

Proeven gebruiken nu je echte vaardigheden, met oefenstreepjes na een geslaagde proef. Ervaring komt uit ontdekkingen, lore, geheimen, verzoeken en gevechten; bij 1.000 punten typ je `level up` (of `level up auto`). `sheet` of [Sheet] toont je personageblad, `train <skill>` besteedt vaardigheidspunten, en `devote to the lantern` in de kapel maakt de Lantaarn je beschermgod. Rust geneest, een nacht slapen alles. Verdwalen in de mist is nu een Survival-proef.

Gevechten gaan in beurten van drie acties, met afstanden, Momentum vanaf ronde 2, moreel, overgave en niet-dodelijk vechten (`subdue`). Rechts verschijnt een gevechtspaneel met levensbalken en een knop voor elke actie; typen kan ook. Ga je neer, dan loop je een stuk met de Grijze Ruiter en word je een dag later wakker in de kapel, met de helft van je geld waar je viel en het Teken van de Ruiter tot je een `rite` doet. De eerste ontmoeting zijn de Bokkenrijders halverwege het jaagpad naar Waagdam: ze vragen twee stuivers tol. Je kunt betalen, je eruit praten, weigeren, vluchten of je overgeven, en wie zich aan jou overgeeft, kun je laten gaan, vastbinden voor de schout (met touw) of doden. Het dorp hoort ervan.

Testen: `npm run dev`, nieuw spel, en maak je personage. Loop vanaf de kade drie keer `east` naar het jaagpad halverwege Waagdam, en loop heen en weer (`west`, `east`) tot ze je aanspreken; sneller is `@fight goat_riders_toll`. Probeer ook een zwakke klasse tegen `@fight haakman` voor de Grijze Ruiter, en `@xp 2000` met `level up`. `npm run balance` speelt 1.000 gevechten per klasse en toont de tabel. Controles: `npm test` (174 tests), en na `npm run build` de rooktest en de logcontrole.

Nog niet: gezellen, bevelen en Aid (M6), gevaren buiten gevechten zoals wegzakken en ijs (M7), en de zegeningen die geen bonus zijn. Fen Fever, Mired, Cursed en Catform bestaan in de regels maar komen nog nergens vandaan. Je kunt nog geen dorpelingen aanvallen; dat hoort bij de houdingspoorten in M6.

Ontwerp: in het FO hebben hoofdstuk 11 en 12 een stand na M5. Wat het FO openliet, is ingevuld: rangen voor aanval, klasse-DC en verdediging per klasse, een extra dobbelsteen voor wapens op level 4 en 8, groeiende dobbelstenen voor vermogens, de kosten van vaardigheidspunten, de ervaring per bron, en wat een geslaagde proef bij Dying doet. De afgesproken marges voor de balans staan er ook: elke klasse wint 75 tot 100% van de standaardgevechten, sterft in hooguit 8%, en zit hooguit 12 punten van het gemiddelde. De uitslag is 83% (Conjurer) tot 99% (Warden). De hond en de snoek uit het Wereldboek hebben eigen getallen gekregen.

## M4 Reizen, kaart en eerste wereldbouwer, 27 september 2026

Nieuw: de Holleveen is een kaart. De zonetekening uit het Wereldboek wordt 120 bij 80 hexen van 250 meter: veen, akkers, bos, heide en water, met poelen, petgaten en slappe grond, het jaagpad, de wegen en het veenpad. Vanaf de rand van een plek (de kade, de brink, een weg, een veld) loop je het land in: `head south-east`, `walk to the kattenbroek`, `follow the fen path east`, of gewoon een richting. Je loopt door tot er iets te beslissen valt: een splitsing, diep water, slappe grond, mist, de nacht, een plek. Het weer wisselt elke drie uur, en in de herfst hangt vaak mist. Nieuwe plekken aan de rand van de kaart: de Blackmere met de weren van Wouter, de Kattenbroek met de hut op palen, Kloosterveen, Oude Zijl, de Kabouterberg, het Rietdoolhof en Reuzenrust.

De droge rug naar de Kattenbroek vind je alleen via Wouter of Pim: vraag ze naar de Kattenbroek als ze je vertrouwen, of overtuig ze. Rechts staat nu een kaart met alleen wat je zag; `map` of [Whole map] toont de hele streek. Een plek waarvan je alleen hoorde, is een zone, en die wordt kleiner naarmate meer mensen erover vertellen. Met `travel to Waagdam` reis je snel over grond die je kent, en op Maandag en Donderdag vaart de trekschuit (`take the barge to waagdam`).

Verder weg van jou denken NPC's minder vaak, en wie ver weg is of over land reist, is een notitie die weer een persoon wordt als je in de buurt komt. NPC's kunnen nu ook naar plekken zonder weg. Wil je naar een verre stad zoals Graafhaven, dan werkt de kroniekschrijver die stad eenmalig uit tot omtrek in je dagboek; de wegen de streek uit gaan pas open als er streken bijkomen.

Wereldbouwer: in `npm run dev` staat [Builder] onder in het zijpaneel. Je past plekken en mensen aan, of de zonetekening van de streek, en na [Save] zie je het meteen in het spel. Het gaat terug in de YAML-bestanden, maar alleen als de hele content nog laadt; het tabblad Check toont fouten en aandachtspunten. Ook bestanden die je buiten de app wijzigt, worden direct geladen.

Settings > AI is omgebouwd na jouw test: per rol kies je zelf een model, [Try] en [Ask for advice] zijn los, en [Save] doet alleen een korte testaanroep. De modellenlijst wordt bewaard en bij de start opnieuw gecontroleerd.

Testen: `npm run dev`, nieuw spel. Loop s, w naar de turfsteken en `follow the fen path south-east`, dan verder tot de weren en de Kattenbroek; kijk naar de kaart. Maak Wouter of Pim te vriend en vraag naar de Kattenbroek, dan `follow the ridge`. Probeer `@send wouter kattenbroek 2` en loop erheen. Open [Builder], pas de kade aan en kijk. Controles: `npm test` (151 tests); na `npm run build` doet `WISPLIGHT_BUILDER_CHECK=1 npx electron .` de wereldbouwer na in de echte app, op een kopie van de content.

Nog niet: Survival en andere vaardigheden (M5), dus verdwalen in de mist is nu een kale worp. Punters, ijs op de Blackmere (alleen bij vorst) en ontmoetingen met gevaar komen later. De wereldbouwer heeft nog geen kaart om plekken op te slepen en nog geen @dig en @desc (M8).

Ontwerp: FO hoofdstukken 4, 15 en 16 hebben een stand na M4, en het ontwerpdocument "Zo is het in M4 gebouwd". Afwijkingen: wegen staan als lijnen in het streekbestand; verder weg denken NPC's elk kwartier mét plannen in plaats van elk uur zonder; de landkaart is een lijst.

## M3.1 De kroniekschrijver, 27 september 2026

Nieuw: de kroniekschrijver. Gebeurt er iets van belang 3 of meer, dan schrijft hij er om 04:00 speltijd lore van, met een versie voor dichtbij en een voor ver weg; bij belang 4 of 5, of als iemand met een questrol sterft, meteen. Een getuige vertelt het verhaal als het zijne. Hij houdt per verhaallijn een notitie bij, schrijft het nieuws van de dag ("What's new around here?") en kan iemand iets laten meedragen, zoals Mirte die Harmen nog geld schuldig was. Zonder AI komt de lore uit sjablonen. Hij is een losse module in de code, zodat andere applicaties hem ook kunnen aanroepen, en een derde rol onder Settings > AI met advies en proefrit. Een gewone run kost met Sonnet 5 een tot twee dollarcent.

Quests komen op uit wat er gebeurt. Raakt iemand iets kwijt, ligt iemand met koorts in bed of mist de molenaar zeildoek, dan vraagt die je bij het volgende gesprek om hulp. Het staat daarna in het dagboek onder Quests, en wie het ding krijgt of de persoon bezoekt, betaalt. De kroniekschrijver werkt die verzoeken uit en maakt nieuwe van open draden.

Relaties: iedereen weet wie wie is. Familie, liefde, werk, schuld en oude wrok staan in de content, uit het Wereldboek. Een NPC praat over zijn eigen mensen met gevoel, tegen een vreemde zegt hij weinig over rouw, en voor een vermist kind vraagt iedereen hulp. Slecht nieuws bereikt de familie eerst. Een NPC kan sterven; wie hem na stond, rouwt, blijft een dag thuis en gaat een week niet naar feesten.

De NPC's kiezen hun doelen met de AI, twee tot vier keer per speldag: bij het opstaan, als nieuws hen raakt en na een afgerond doel. Wat niet in de catalogus staat of wat de NPC niet kent, wordt geweigerd, en dan gaat het dagschema gewoon door. `tempo calm`, `tempo normal` en `tempo dramatic` bepalen hoeveel er gebeurt.

Testen: `npm run dev`, nieuw spel. Kies onder Settings > AI een model voor de kroniekschrijver (Ask for advice, dan Save choice). Loop naar de bakkerij (n, e) en typ `@kill harmen drowned in the Blackmere` (bouwcommando, werkt alleen in npm run dev). Wacht even en kijk in het dagboek onder Lore; praat daarna met Mirte en vraag naar Harmen. Speel een paar dagen met `tempo dramatic` en `wait 600`, en praat met wie iets kwijt is of ziek is. Controles: `npm test` (128 tests); `WISPLIGHT_AI_CHECK=anthropic npx electron .` na `npm run build` doet ook een echte run van de kroniekschrijver.

Nog niet: de rest van de doelcatalogus (verkopen, afleveren, volgen, onderzoeken, aangeven, confronteren en de duistere doelen) komt met M5 tot en met M7, net als effectplannen, geschreven quests met stadia en lore meenemen naar een nieuw spel (na M7). De vier getallen per relatie tussen NPC's komen in M6. Het tempo is een commando, geen keuzescherm.

Ontwerp: "Zo is het in M3.1 gebouwd" in het ontwerpdocument, en in het FO de hoofdstukken 7 (doelkeuze), 8 (relaties), 14 (verzoeken uit situaties), 16 (derde rol) en 17 (commando's). Het begrensde effect van de kroniekschrijver is voorlopig een gedachte bij een persoon; opzoeken gaat met een lijst sleutels in plaats van met toolfuncties. De drie open vragen en je opmerking over lore meenemen zijn verwerkt: zelfde wereld met een nieuw personage, na M7.

## M3 Kennis, geruchten en het dagboek, 27 september 2026

Nieuw: wat een NPC weet, hangt nu af van bekendheid en afstand, met een vaste worp per persoon en onderwerp zoals in het Wereldboek (hoofdstuk 11). Een dorpeling kent de Haakman bijna altijd en de Wenende Steen nooit; wie ver weg iets kent, weet hooguit de richting en hoeveel dagen lopen het is. Beroep, leeftijd en eigenaardigheden tellen mee: de waard hoort meer, de bakker weet alles van meel.

Nieuws gaat van mens tot mens. Wie iets ziet, weet het meteen; daarna gaat het mee naar huis, naar de herberg en over de toonbank. Elke keer dat het wordt doorverteld, gaat er precisie af. Klein nieuws wordt vergeten, de speler vergeet niets. Bij de start gaat er al een gerucht rond: Lubbert betaalt Kobus de marskramer om te vertellen dat de molen voor de winter niet meer draait. Dat is niet waar. Kobus is nieuw en loopt een vaste weekronde langs de dorpen.

Er gebeuren kleine dingen: iemand raakt een mes of lantaarn kwijt, twee dorpelingen krijgen ruzie, er wordt 's nachts gestolen, iemand ligt met koorts in bed, en op 10 Wijnmaand is het Appeldag op de kade. Een verhalenmotor bepaalt hoeveel er per dag gebeurt. Vind je iets wat iemand kwijt is, dan geef je het terug met `give`.

Het dagboek is een naslagwerk geworden. Klik op een persoon, plek, gebeurtenis of verhaal en je krijgt een pagina met wat je weet, van wie je het hebt en links naar wat ermee samenhangt. Hoorde je twee versies, dan staan ze naast elkaar. Met [Look back] zie je je eigen logboek en de echte kroniek: wat er werkelijk gebeurde, wat niet waar was en wie het nog weet. Allebei kun je downloaden.

Testen: `npm run dev`, begin een nieuw spel (niet LOAD). Vraag in de Drowned Goose en in Waagdam "What's new around here?", een dag en na twee dagen (`wait 600` schuift tien uur op). Vraag Harmen daarna naar de molen. Vraag een paar mensen naar Hunnenloo en Graafhaven. Speel een paar dagen door en kijk in het dagboek onder Events, en open aan het eind [Look back]. Controles: `npm test` (96 tests); `WISPLIGHT_LOG_CHECK=1 npm start` opent nu ook een dagboekpagina en het eindscherm via de echte app.

Nog niet: het tempo kiezen bij een nieuw spel (het staat op gewoon), en de kroniekschrijver zelf (M3.1). Tot die er is, vertellen NPC's nieuws met vaste zinnen uit de patronen. Nieuws gaat nog niet naar andere streken; dat komt met M4.

Ontwerp: het hoofdstuk "Zo is het in M3 gebouwd" in "Ontwerp: lore en wereldverandering" beschrijft wat anders loopt dan gepland: nieuws gaat per kwartier samen op een plek in plaats van per ontmoeting, een aankoop telt als ontmoeting, er staan startgeruchten in de content, en de patronen zijn nog vijf vaste soorten. De werkinstructie voor de kroniekschrijver staat in `content/CHRONICLER.md`.

## M2.1 Samenhang, 27 september 2026

Nieuw, na de eerste speeltest. NPC's weten wat ze net deden: een gesprek krijgt een regel met wat de NPC de laatste twee uur deed, dus Wouter die net thuiskomt zegt niet meer dat hij de hele nacht in bed lag. Naar bed gaan duurt tien minuten, een slapende NPC moet je eerst wekken (`wake`, kost houding, 's nachts meer) en is daarna een uur chagrijnig. Van 22:00 tot 6:00 zit de deur van een woonhuis dicht; met `knock` komt de bewoner in de deuropening staan.

Wie langs de speler komt, weegt af of hij blijft staan: nieuwsgierigheid, gezelschap, iets te verkopen of een open verzoek. Gerrit blijft aan het begin nu een kwartier op de kade staan in plaats van meteen door te lopen, en een passant krijgt één regel ("comes from the east, on his way to..."). De klok start pas bij je eerste invoer, zodat je de opening rustig leest.

Het model moet elke naam in zijn antwoord opgeven. Het mag één nieuwe verre plaats per antwoord noemen (een stad, land, zee, rivier of meer buiten de Nethermarch); die komt in de lore van de savegame, in je dagboek als "heard of", en wie hem niet kent, mag er niet over praten alsof hij hem kent.

Het spellogboek: alles wat je typt en ziet, elke gebeurtenis en elk AI-antwoord wordt direct weggeschreven. `log` leest het terug, `log export` bewaart het als tekstbestand. `continue` gaat precies verder waar het spel stopte, ook na een crash. `load` van een oudere save begint een nieuwe tak; wat daarna gebeurde blijft in het logboek staan. SAVE, LOAD, CONTINUE en LOG werken alleen als los commando, dus "Save me!" in een gesprek is gewoon een zin.

Testen: `npm run dev`, begin een nieuw spel (niet LOAD, de oude save kent deze regels nog niet). Kijk op de kade naar Gerrit, loop na tienen van de kade naar de turfsteken (s, w) en probeer `south` (Wouters hut), `knock` en daarna `talk wouter`. Speel even, sluit de app af zonder op te slaan en typ na het starten `continue`. Controles: `npm test` (72 tests), `WISPLIGHT_LOG_CHECK=1 npm start` speelt save, load, continue en log na in een wegwerpmap.

Ontwerp: het nieuwe document "Ontwerp: lore en wereldverandering" beschrijft hoe gebeurtenissen lore worden, met de kroniekschrijver; dat is de basis voor M3. Ontwerpwijzigingen in het FO: de klok start bij de eerste invoer (hoofdstuk 3), CONTINUE en het spellogboek (hoofdstuk 3), aandacht, slaap en de nacht (hoofdstuk 6), het `names`-veld (hoofdstuk 10) en de commando's `continue`, `log`, `knock` en `wake` (hoofdstuk 17).

## M2 Praten met NPC's, 26 september 2026

Nieuw: je kunt met iedereen praten. `talk mirte` opent een gesprek met snelvragen (klikbaar of met een cijfer), `ask about`, `tell`, `where is` en vrije tekst in het Engels of Nederlands. Overtuigen, misleiden, intimideren, omkopen en `insight` gaan via een proef voordat de NPC iets zegt. Een NPC weet alleen wat hij kan weten: zijn eigen streek goed, verre plaatsen alleen als ze beroemd zijn, en voor de rest verwijst hij door. Onderwerpen die je hoort komen in het dagboek rechts en zijn klikbaar. Tijdens een gesprek staat de klok stil en blijft de NPC staan.

Achter de schermen gaat elke zin eerst langs vaste controles: een injectiepoging of meta-vraag krijgt een sjabloon zonder AI-aanroep, en een antwoord met ongeldige JSON, een woord van buiten de wereld of een naam die de NPC niet kent wordt weggegooid en opnieuw gevraagd. Lukt dat niet of is er geen verbinding, dan antwoordt de NPC met een vaste tekst en blijft het spel speelbaar.

Settings > AI koppelt OpenAI en Anthropic met je eigen sleutel. De sleutel wordt versleuteld met de sleutelbos van het besturingssysteem en staat daarna alleen gemaskeerd in beeld. Na het koppelen adviseert een model van die aanbieder per rol een model uit de lijst die jouw sleutel mag gebruiken, het spel test het advies op situaties uit de testset en slaat na je keuze de exacte model-id op. Settings > Usage toont kosten en tokens per sessie, dag, maand en model, met een uur- en maandbudget en een tegoed dat je zelf overneemt uit de console, omdat geen van beide aanbieders het saldo teruggeeft. De statusbalk toont de kosten van de sessie. Settings > AI log toont elke aanroep met prompt en antwoord.

Testen: `npm run dev`, dan Settings (rechts onder het dagboek) > AI, sleutel invoeren, [Ask for advice] en [Save choice]. Loop naar de bakkerij (n, e) en typ `talk mirte`, dan bijvoorbeeld "What happened to the mill?", "Tell me the story of the Haakman." of "Waar kan ik hier brood kopen?". Zonder sleutel kan het ook: de NPC's antwoorden dan met vaste teksten. In de browser laat `npm run web` met `?mock=1` achter het adres het hele scherm werken met een oefenmodel en verzonnen cijfers. Controles: `npm test` draait de 50 gesprekssituaties met het oefenmodel; `WISPLIGHT_KEY_CHECK=1 npm start` zoekt met een verzonnen sleutel of er ergens een leesbare sleutel op schijf komt; `WISPLIGHT_AI_CHECK=1 npm start` doet met jouw sleutel het modeladvies, de proefrit, het opslaan van de id en drie gesprekken.

Controle met een echte sleutel (Anthropic): het advies noemt alleen model-id's uit de lijst van de sleutel, de gekozen id wordt exact opgeslagen, en drie gesprekken met Sonnet 5 en Haiku 4.5 blijven binnen de wereld. De OpenAI-sleutel werkt, maar het account heeft geen tegoed ("You have no credits remaining"); dat meldt Settings nu ook zo.

Na de eerste speeltest: Wendela wilde zomaar mee het moeras in en liet een verzonnen "Father Oswin" op de kapel passen. Nu beslist het spel of iemand meegaat en geeft het model dat besluit met redenen mee (tot M6 altijd nee). Elke NPC krijgt de lijst mensen die hij bij naam kent, en een naam die nergens in de wereld voorkomt wordt afgekeurd, ook in wat de NPC onthoudt. Wendela weet nu dat Veenhoek geen eigen priester heeft, en haar geheim uit het wereldboek (haar verdronken broertje) staat in de data. Het Haakman-verhaal is Wouters vertelling over zijn oma; anderen vertellen het na als zijn verhaal. Een rate limit of storing bij de ene aanbieder legt de andere niet meer stil.

Nog niet: doelkeuze door de AI (de brain-rol) wordt pas in M3 gebruikt; het advies en de proefrit testen hem al wel. De wereldbouwer komt in M4 (eerste versie) en M8 (volledig).

Ontwerpwijzigingen: het advies komt van een sterk en snel model uit de lijst (bij Anthropic Sonnet, bij OpenAI GPT-5.4) in plaats van het allerduurste. De proefrit gebruikt 6 gesprekssituaties en 3 doelkeuzes. Een zin die met een commandowoord begint maar als zin leest ("Tell me the story...", "Waar kan ik...?", "Wait, what?") telt als gesproken tekst. Hunnenloo is als plaats toegevoegd aan de onderwerpen, en Lubbert kent Molenend. Kostenoverzicht en resterend tegoed staan nu in FO hoofdstuk 16.

## M1 Wereld en simulatie, 26 september 2026

Nieuw: de Holleveen leeft. Veenhoek, Molenend, The Drowned Goose, Waagdam en de wegen ertussen hebben samen 45 locaties en 16 NPC's met behoeften, dagschema's en beroepen. NPC's plannen zelf met wat ze kennen. Mirte haalt rogge bij Lubbert in Waagdam, laat het malen in de rosmolen en bakt, omdat de molen van Harmen sinds de storm stilstaat. Harmen vraagt om zeildoek. Prijzen volgen de voorraad. De klok loopt in de app live mee (1 seconde is 1 spelminuut) en pauzeert na een minuut zonder invoer. Opslaan gaat automatisch elke 10 spelminuten en met SAVE; LOAD laadt terug.

Testen: `npm run dev`. Loop 's avonds naar The Drowned Goose (n, ne, e, in) en kijk wie er binnenkomt. Wacht tot de ochtend (`wait 600`, `sleep` na een kamer met `rent room`) en volg Mirte naar Waagdam. Probeer `list`, `buy`, `sell`, `give`, `use stone`, `examine`. Voor een week simulatie zonder speler: `npm run sim -- --days 7 --follow npc_mirte`.

Nog niet: praten met NPC's (M2), kennis en geruchten (M3), de kaart (M4). De herberg De Schaal in Waagdam heeft nog geen waard.

Ontwerpwijzigingen: een nieuwe NPC, Teunis Ros, runt de rosmolen in Waagdam (toegevoegd aan het wereldboek). Een baksel kost 1 zak meel en 1 mand turf voor 6 broden (FO-voorbeeld aangepast). Het spel begint om 18:30 op de kade, zoals de openingstekst beschrijft.

## M0 Projectskelet, 26 september 2026

Nieuw: het project draait als desktop-app (Electron), in de terminal en in de browser. De spelmotor staat los van de interface. Veenhoek heeft zeven locaties, Mirte staat overdag in de bakkerij, en de klok loopt in de kalender van de Nethermarch.

Testen: `npm run dev` voor de app, of `npm run play` in de terminal. Probeer `look`, de windrichtingen, `kijk`, `wait 300` en `help`.

Nog niet: gesprekken (M2), voorwerpen en handel (M1), de kaart (M4).

# The Quiet Reach: de bouw in de app zelf

Verslag van 28 september 2026. Bram's twaalf hoofdstukken (`quiet-reach-prompts.md`) zijn stap voor stap ingevoerd in de editor van de app, met Bram's eigen instellingen: Claude Opus 5.5 als kroniekverteller en een uurbudget van $5. Per stap ging het hele hoofdstuk in het antwoordveld, daarna [Propose]. Het voorstel werd gelezen en geaccepteerd als het laadde en trouw was aan de tekst. Bram's tekst is nergens veranderd en [Enhance with AI] is niet gebruikt. De invoer liep via de knoppen en velden van het editorvenster (aangestuurd over het DevTools-protocol), dus dezelfde weg die een mens neemt.

Afgesproken was: laat het model iets weg of verzint het iets, probeer de stap dan één keer opnieuw met dezelfde tekst en noteer het verschil. Liep een stap vast op een fout in de app zelf, dan heb ik die fout eerst gerepareerd (met test, op main) en de stap daarna opnieuw gedaan. Dat gebeurde elf keer; zie "Gerepareerd tijdens de bouw".

Uitkomst: alle twaalf stappen zijn geaccepteerd, de wereld laadt, speelt en haalt zijn contract (`tests/quietreach.test.ts`), en de smoke test met `WISPLIGHT_SMOKE=quietreach` slaagt. Hoofdstuk 4 bleek er wel te zijn, als "4. Faith and belief"; alleen mijn eigen inleesscript miste de kop door de punt na het cijfer. Stap 4 is dus gewoon ingevoerd.

## Kosten

Uit het AI-log van de app, per aanroep bijgehouden in een eigen grootboek, omdat het log in het geheugen staat en na een herstart leeg begint. Eén bedrag is een schatting: het eerste afgekapte antwoord bij Plekken logde de app als $0 (dat was een van de fouten).

| Stap | Aanroepen | Kosten |
|---|---|---|
| 1 Kader | 1 | $0,19 |
| 2 Kalender en weer | 2 | $0,35 |
| 3 Geld (twee keer, zie onder) | 2 | $0,36 |
| 4 Geloof | 1 | $0,26 |
| 5 Plekken | 4 | $2,03 |
| 6 Beroepen | 1 | $0,35 |
| 7 Mensen (met een herstelronde) | 4 | $1,38 |
| 8 Economie (met een herstelronde) | 5 | $3,33 |
| 9 Vervoer | 2 | $0,65 |
| 10 Signalen en gevaren (met een herstelronde) | 2 | $0,68 |
| 11 Stem | 2 | $0,42 |
| 12 Palet | 1 | $0,22 |
| Verschil met de uurteller van de app bij de eerste herstart | | $0,03 |
| Totaal | 28 | $10,25 |

De eerste poging per stap kostte samen ongeveer $4. De rest ging op aan pogingen die op een fout van de app strandden. Met de reparaties van vandaag zou dezelfde bouw rond de $5 kosten.

Het uurbudget hield de bouw vier keer een kwartier tot twintig minuten op ("the hourly budget is used up"). Bram zette het op $50, maar de app kapt het zonder melding af op $5 (`setBudget` in `settings.ts`). Ik heb gewacht tot er weer ruimte was en de instelling niet aangepast. Dit staat open op de roadmap: Bram kiest of de wereldbouw buiten het uurbudget valt, een eigen grens krijgt, of de grens omhoog gaat.

## Per stap

### 1 Kader
Laadde meteen. Trouw: The Quiet Reach, de Lantern Belt, Meridian, Nacre, de Vesper Coast, Port Vesper, Orison Ridge, Harrow Station, de Peregrine en Echo Nine, met de grenzen van de wereld (geen magie, geen telepathie, geen kunstmatige zwaartekracht, geen contact sneller dan het licht, AI als gereedschap). Het kader zei nog "Money and faith are still to be set"; dat is in stap 3 en 4 bijgewerkt.

### 2 Kalender en weer
Poging 1 laadde niet: weersoorten die de motor niet kent ("cloudy"), een kans boven 1 en een onbekend veld "wind". De stap noemde de velden van het weer niet. Gerepareerd; poging 2 laadde. Trouw: CR, dertien maanden met Intercalary als vijfdaagse slotmaand, de vijfdaagse week, start op 18 Rainfall 186 om 08:00, de vier seizoenen per maand, herfst naar regen en storm, winter naar sneeuw en vorst. Zelf gekozen: de overheersende wind uit het westen en de zinnen per weersoort. Weggelaten en gemeld: het weer bij aankomst en het stormfront binnen twee dagen (geen veld; voorgesteld als nieuws of als plan in stap 10), en de startweekdag (nu Primeday).
Bekijken: de wind uit het westen; de startweekdag; of het stormfront een signaal moet worden.

### 3 Geld
Kreeg door mijn inleesscript hoofdstuk 3 en 4 samen. Het model hield zich aan geld en bewaarde het geloof voor stap 4. Laadde meteen. Trouw: de credit van 100 bits, geen grotere munt, 120 credits bij aankomst, de chip, de waardetokens, gratis lucht, het contract van 280 credits, de afspraak over de Peregrine, de richtlijn voor de kroniekverteller. De startuitrusting en de drie betaalde nachten schoof het door naar Economie, omdat er nog geen dingen bestonden.
Aan het eind heb ik stap 3 nog één keer gedaan met dezelfde tekst. Het model voegde de twee dagrantsoenen toe (het enige ding uit de lijst dat inmiddels bestaat), maar maakte de rest van de uitrusting niet aan, omdat de geldstap alleen geld en speler vult; het vroeg of het dat in een volgend voorstel mocht doen. Dat antwoord heb ik niet gegeven, want dat zou mijn tekst zijn geweest.
Bekijken: de startuitrusting (chip, terminal, communicator, multitool, jas, laarzen, waterfles, onderzoekstas) ontbreekt nog; waardetokens als ding of alleen als sfeer; de drie betaalde nachten.

### 4 Geloof
Laadde meteen. Trouw: The Keeping met de Remembered, The Open Sky met de Witness, "geen geloof" als geen geloof, de gebruiken (de lege stoel, het Harbour Record, de wake bij het raam, "Let us return with better questions"), het implantaat en de herstelwieg, en dat volledige vernietiging definitief is. Gat in de app: de stap vraagt om patrons en doodsteksten in de regels, maar een voorstel kan de regels niet aanvullen. De geloven noemen nu patrons (`the_remembered`, `the_witness`) die nergens bestaan, en de doodsteksten rond Morrow staan alleen in de uitleg van het voorstel (in `DESIGN.md`). Open op de roadmap.
Bekijken: geen patron bij de dood (Morrow is medisch, geen god); of de geloven ook facties moeten zijn.

### 5 Plekken
Vier pogingen. De eerste werd afgekapt (het antwoord was langer dan 12.000 tokens), de tweede schreef de details in een verkeerde vorm, de derde laadde niet omdat de app de weg terug niet toevoegde en de start niet verplaatste. Alle drie gerepareerd. De vierde laadde. Trouw: vier gebieden en tien plekken uit de tabellen, alle tien verbindingen met precies Bram's minuten, de start in de Arrival Lock, de Common Deck in Vesper Works, de Medical Bay met een balie waar je niet voorbij mag, vaste aanwijzingen in de relaiskast, het onderhoudslog en de verzegelde datakernen. Zelf gekozen: de windrichtingen (Bram's kaart is schematisch), Orison Ridge dicht bij storm met de Ridge Shelter als wachtplek, improvisatie op de luisterkamer en de werkplaats.
Bekijken: hangar en schip staan nog open, terwijl Bram schrijft "Access requires permission" (het model stelt een toegangspas voor); of vorst de Ridge ook sluit.

### 6 Beroepen
Laadde meteen. Trouw: de acht rollen met Bram's uren, het gewone dagritme en Restday. Zelf toegevoegd: drie wachtberoepen voor het naamloze ondersteuningsteam (06-14, 14-22, 22-06, bij de Arrival Lock), en de velddagen (Primeday en Relay). Weggelaten en gemeld: wekken bij nood, compenserende rust en rust voor vertrek; dat zijn voornemens, geen uren.
Bekijken: de velddagen; of het oude beroep `villager` weg mag.

### 7 Mensen
Drie voorstellen, alle drie goed, en alle drie vielen om op één klein ding: een geheim over een persoon in plaats van een onderwerp, een regel YAML met een dubbele punt, en een factie met een zin waar een verwijzing hoort. De herstelronde (nieuw vandaag) loste het derde op in 8 seconden voor $0,18. Trouw: de zes mensen met rol, herkomst en geloof (Tessa en Niko zonder), Mara's eerste zin letterlijk, "Count the people, not the lights", het wantrouwen tussen hen, Niko's antenne-omleiding en Sorell's aanvraag als geheimen, de drie verhalen, het Compact, het Harbour Record, de drie groepen met hun toetredingsvoorwaarden en Mara als Settlement Marshal. Zelf gekozen: leeftijden, tien namen per soort voor later, Mara's kantoor in de Arrival Lock (Bram: administratie in de Commons), Sorell's "sympathetic to The Open Sky" als geloof. Gat in de app: de wet vraagt een bedrag voor moord, Bram schrijft "no fine that buys release"; het model zette 200 en 60 credits als interne getallen.
Bekijken: de boetes; de leeftijden; Mara's kantoor; Sorell's geloof; de gemeenschappen als lore of als achtergrond.

### 8 Economie
Vijf aanroepen. De eerste liet de diensten op de plekken weg (het model zag de plekken niet en vroeg Bram de YAML te plakken), de tweede werd afgekapt bij 36.000 tokens, de derde schreef alle openingstijden in een verkeerde vorm, en de herstelronde daarop gooide ongemerkt de diensten van de Commons weg. Alle vier gerepareerd. De vijfde laadde. Trouw: Sana's maaltijden, rantsoenen, thee en koffie met Bram's prijzen, gratis water uit de kranen, de keuken, kweekmodules en waterzuivering als werkplaatsen zonder extra plekken, de werkbanken met het bordje dat er niets voor druk, medisch of aandrijving gemaakt wordt, de kustbedden via een zijpad, Field Electronics bij Tessa (drie uur, 15 credits, de lamp blijft van de werkplaats, Niko's kabel), en reserve naast handelsvoorraad. Zelf gekozen: prijzen die Bram niet gaf (filter 9 cr, lamp 35 cr, verband 3 cr, een extra nacht 10 cr), dertig inwoners.
Bekijken: de prijzen; het aantal inwoners; de expeditievoorraad (nog niet).

### 9 Vervoer
Poging 1 kreeg geen antwoord (uurbudget). Poging 2 laadde niet: de trajecten stonden als "a-b" waar de motor "a>b" leest, en de reiszinnen konden niet mee (`data/journey.yaml` mocht niet in een voorstel). Gerepareerd; poging 3 laadde. Trouw: de Ridge Crawler (07:30 heen, 17:00 terug, Primeday tot Anchor, 20 minuten, 3 credits), de Coast Runner naar Kestrel Landing (Primeday en Anchor om 09:00, 90 minuten, 25 credits, terug om 15:00 in de tekst), de Belt Tender en de Peregrine niet als lijn, vier verre plekken, de Trail Cart via Mara (12 credits voor 8 uur), Bram's vier gebeurtenissen onderweg. Geen veld voor: de borg, gratis dienstreizen, reserveringen.
Bekijken: de borg en gratis dienstreizen; of de Crawler bij storm stilstaat.

### 10 Signalen en gevaren
Laadde na een herstelronde (een dubbele punt in één onderwerp). Trouw: wachters op een dode, een gemiste check-in, zwaar letsel, vermiste spullen, een tekort, vertrek, een reparatie en een nieuwe afwijking in het signaal; de Return Check (een half uur, dan zoeken, een markering "pending return", nooit een overlijdensbericht), Holding the Name (de lege stoel, herinneringen, het Harbour Record, een plaquette), Open Stores, eerst tellen bij diefstal, goed nieuws; de sailback zonder factie en de onderhoudsdrone die de Cooperative raakt. Zelf gekozen: drie dagen rouw, iets hogere prijzen bij een tekort. Niet gedaan: "a dangerous malfunction" (afzetten) heeft geen wachter. Het model waarschuwt dat een gevecht zonder regels misschien niet loopt, en dat de soorten feiten die het koos (death, missing, injury, theft, signal_anomaly) nog door niets worden vastgelegd.
Bekijken: gevechten zonder regels; de soorten; de storing.

### 11 Stem
Poging 1 laadde niet: Bram geeft uitroepen per groep (technici, kust, Port Vesper), maar de stem kende uitroepen alleen per geloof. Gerepareerd (groepen hebben nu eigen uitroepen); poging 2 laadde. Trouw: de uitroepen per geloof, drie groepen met eigen uitroepen en gezegden, aanspreekvormen, tijd en maat, en Bram's tabel van wat hier niet bestaat. Het model meldt zelf: de kustbewoners zijn nu de Coastal Traverse en Orison Ridge, waar niemand woont, dus niemand zegt "Salt in the seals". Bram's "Residents of the Vesper Coast" zijn misschien de Nacreans (Mara, Niko, Sana).
Bekijken: wie de kustbewoners zijn; een stukje Stem in CHRONICLER.md; de spreekstijl van de zes uit Bram's tabel.

### 12 Palet
Laadde meteen. Trouw: Bram's twaalf kleuren precies, een lichte stijl ernaast, en de beeldstijl uit zijn tekst. Gaten in de app: de symbolen van het palet hebben Nethermarch-namen (`peat_pit`, `willow`, `canal`) en het model heeft ze geleend voor een mijnschacht, begroeiing en een getijdegeul; en geen enkele stap maakt de kaart zelf, dus The Quiet Reach heeft kleuren maar nog geen kaart.
Bekijken: de zes terreinnamen; de mijnschacht in koraal en de ruïne in violet.

## Bij het spelen

LOOK, WAIT, een gesprek met Mara, lopen naar de Commons, de inventaris en de tijd werken, in de woorden van deze wereld ("Primeday 18 Rainfall 186 CR"). De controle meldt negen geïmporteerde goederen zonder aanvoer (de bevoorradingsvlucht is nog geen lijn) en vier verre plekken zonder herkomst. Twee dingen om te weten: Mara staat niet bij de sluis als je om 08:00 binnenkomt (ze komt om 08:10 binnenlopen, terwijl de tekst zegt "Mara waits at Arrival Lock"), en er is geen kaart.

## Wat Bram nog moet bekijken, kort

De startuitrusting ontbreekt. Hangar en schip staan open. De geloven noemen patrons die niet bestaan. De boete voor moord. De kustbewoners zonder bewoners. Geen kaart. Daarnaast de vragen per stap hierboven; ze staan ook in het ontwerplogboek (`content/quietreach/DESIGN.md`), met per stap wat gevraagd, gezegd en besloten is.

## Polijstronde van de plekken (28 september 2026, later op de avond)

Op verzoek van de ontwerpsessie namens Bram: de plekken lazen goed, maar gemiddeld 88 woorden tegen 56 in de Nethermarch, zonder een enkel onderwerp tussen [haken], met twee plekken die elke uitgang opsomden en zeven die met hun eigen naam openden. De plekregels staan nu letterlijk in de stap Plekken, de Stem komt direct na het Kader, Check meet de beschrijvingen, en na de stappen is er een polijstronde die alleen beschrijvingen herschrijft (b5e40b4, 614a06f, b1522e3).

**De meting.** De stap Plekken met de aangescherpte prompt, op Brams hoofdstuk 5 (Opus 5.5, 137 seconden, $0,53): gemiddeld 67 woorden, 4 plekken met [haken], geen enkele die alle uitgangen noemt of met zijn naam opent. Dat voorstel voegde ook zelf iets toe (een stormvariant, een improvisatie bij het raam), dus het is als meting weggegooid; de plekken die er stonden bleven staan.

**De ronde.** Per model, op dezelfde tien plekken:

| Poging | Model | Tijd | Kosten | Uitkomst |
|---|---|---|---|---|
| 1 | Sonnet 5 (het lichte model: Brams keuze voor het brein) | 32 s | $0,08 | Openingen goed, [haken] erbij, maar de lengte bleef: gemiddeld 86 woorden |
| 2 | Opus 5.5 | 77 s | $0,27 | Afgekapt: 400 tokens per plek was te krap voor een model dat eerst denkt |
| 3 | Sonnet 5, na "lengte eerst" in de prompt | 23 s | $0,08 | Gemiddeld 70 woorden, 4 plekken nog net te lang |
| 4 | Opus 5.5, met meer ruimte | 98 s | $0,34 | Weer afgekapt: 12.000 tokens, vrijwel alles aan denken |
| 5 | Sonnet 5 | 23 s | $0,04 | 7 van de 10 aangenomen |
| 6 | Sonnet 5, de drie die over waren | 11 s | $0,02 | Workshop aangenomen |
| 7 | Sonnet 5, de laatste twee | 11 s | $0,02 | Niets aangenomen: de Commons somde weer alle uitgangen op |
| 8 | Opus 5.5, met 16.000 tokens denkruimte, Arrival Lock en Commons | 38 s | $0,17 | Beide aangenomen |

Samen $1,55 inclusief de meting; wat werd aangenomen kostte ongeveer $0,23. Uitkomst voor de standaard: het lichte model is de juiste keuze voor deze ronde (vier keer goedkoper en meestal binnen de regels), met Opus als tweede keus voor de plekken die het lichte model niet rond krijgt, en dan met genoeg denkruimte.

**Aangenomen** (per plek beoordeeld tegen Brams tabel en de plekregels): alle tien. Wat ik liet liggen en waarom: de Arrival Lock verloor eerst Brams feit dat de terminal daar de kaart binnenkrijgt, de Commons somde de uitgangen op of werd te lang, de Workshop was eerst 73 woorden. Die kwamen in latere pogingen goed. In de Workshop staat de soldeerbout alleen nog in de nachtbeschrijving; het detail om naar te kijken is gebleven.

**Na de ronde:** 10 plekken, gemiddeld 65 woorden (geen boven de 70), 6 met een onderwerp tussen [haken], geen twee die hetzelfde openen, geen die met zijn eigen naam opent. Check noemt nog één plek die alle uitgangen noemt: de Workshop, waar "de verzegelde hangardeur" de hangar noemt; dat lees ik als een hint, niet als een opsomming. `tests/quietreach.test.ts` houdt dit vast.

## theouterreach

Eerder vandaag stond er een `content/theouterreach`. Die bestond alleen uit de startbestanden van een nieuwe wereld (hij laadde, met één plek), omdat de app toen met een verouderd hoofdproces draaide en [Propose] weigerde (`No handler registered for 'editor:world-step'`). Hij is op Bram's verzoek naar de prullenbak gegaan. Sinds 672be88 zegt de app bij het opstarten meteen als het hoofdproces ouder is dan de interface.

## Gerepareerd tijdens de bouw

Elk met een test in `tests/m1020run.test.ts`, en op main:

- 09dd08f: elke stap krijgt de precieze velden van wat hij vult, uit de schema's (weer, details); lange antwoorden tot 32.000 tokens en tien minuten, via streaming; een afgekapt antwoord telt mee in log en budget.
- f46b6a8: een voorstel krijgt de weg terug voor elke uitgang, ook tussen nieuwe plekken, en verplaatst de start vóór het laden.
- d256527: [Let the chronicler put it right] onder een voorstel dat niet laadt: alleen de verbeterde dingen komen terug.
- 942e983: een stap ziet de YAML van wat hij mag veranderen.
- b9d9e38: een wijziging mag alleen de velden zetten die ze geeft (`merge: true`); tot 48.000 tokens; het ontwerplogboek zet een beslist antwoord niet meer terug onder "Answers".
- 383c5ed: de velden noemen de vaste vorm van een tekst (openingstijden "07-12").
- b1056cd: een herstelronde haalt nooit iets weg.
- eed5413: een voorstel mag `data/journey.yaml` meesturen; een traject heet `van>naar`.
- 88e3b42: groepen sprekers hebben eigen uitroepen (Skerrow's havenvolk zegt "tar and twine"); de herstelknop ook bij een voorstel van alleen hele bestanden.

## Nog open (op de roadmap onder M10.20)

Een voorstel kan de regels aanvullen (patrons, doodsteksten, condities, afkomsten). Een wet zonder boete. Een open voorstel overleeft een herstart. Het uurbudget en de wereldbouw. De uitleg van de kroniekverteller als opgemaakte tekst. Prompt caching bij de wereldstappen. En uit de laatste stappen: de geldstap mag de startuitrusting als dingen voorstellen, de paletsymbolen per wereld in plaats van Nethermarch-namen, en een stap die de kaart zelf maakt.

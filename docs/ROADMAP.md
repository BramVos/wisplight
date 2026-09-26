# Roadmap Wisplight versie 1

Elke mijlpaal eindigt met een speelbare versie, een blok in `docs/CHANGELOG.md` en een speeltest door Bram. Een mijlpaal is af als alle criteria zijn afgevinkt. Hoofdstukken verwijzen naar het functioneel ontwerp (FO) en het wereldboek (WB).

## M0 Projectskelet (af)

- [x] Electron, TypeScript en React; spelmotor los van de interface
- [x] Content in YAML met validatie; klok met de kalender van de Nethermarch
- [x] Commando's met Nederlandse aliassen; Veenhoek met zeven locaties en Mirte
- [x] Terminalclient, browserversie, unittests en rooktest

## M1 Wereld en simulatie (af)

Scope: FO 3, 4, 6 en 7. Objecten met affordances, voorwerpen en inventaris, handel en prijzen, hybride klok, NPC-kaarten met behoeften, schema's en stemming, nutsfunctie, planner (HTN met GOAP-terugval) die alleen met eigen kennis plant, savegame in SQLite met gebeurtenissenlog. Content: Veenhoek, Molenend, The Drowned Goose en Waagdam met 12 NPC's.

- [x] De streek draait 7 speldagen zonder speler zonder fouten of vastgelopen NPC's
- [x] Staat de molen stil, dan koopt Mirte graan bij Lubbert, laat het malen in de rosmolen en bakt; zonder bekende bron wordt het doel Ask_help
- [x] Prijzen reageren op voorraad (meel wordt duurder na de storm)
- [x] Opslaan en laden geven exact dezelfde staat; een savegame is na te spelen met het log
- [x] Commando's take, drop, give, use, examine, buy, sell, eat, wait en sleep werken

## M2 Praten met NPC's (af)

Scope: FO 9, 10 en 16. LLM-gateway met OpenAI, Anthropic en een mock; instellingen met versleutelde sleutel, modellenlijst, adviesprompt, proefrit en exacte model-id; gespreksmodus met snelvragen, ask en tell, vrije tekst, gespreksacts, proeven voor woorden, lengteniveaus, guardrails, terugvalteksten en Nederlands typen; dagboek met klikbare onderwerpen; kostenteller in de statusbalk en verbruiksoverzicht per sessie, dag, maand en model met uur- en maandbudget en een zelf opgegeven tegoed; AI-log in de ontwikkelmodus.

- [x] Met de mock slaagt een testset van 50 gesprekssituaties: geldig schema, geen kennislek, juiste lengte
- [x] Met een echte sleutel geeft het modeladvies alleen bestaande model-id's, en de gekozen id wordt exact opgeslagen
- [x] Een injectiepoging krijgt een sjabloonantwoord zonder AI-aanroep
- [x] Zonder verbinding blijft het spel speelbaar met terugvalteksten
- [x] De sleutel staat nergens leesbaar op schijf of in logs
- [x] De kosten per sessie, dag en maand kloppen met de tokens uit de antwoorden en de prijstabel, en het percentage van het maandbudget en het opgegeven tegoed telt mee af

## M2.1 Samenhang (af)

Scope: bevindingen uit de eerste speeltest. FO 3 (spellogboek), FO 10 (names-veld), ontwerp lore en wereldverandering (verre namen), FO 6 en 7 (bewustzijn, aandacht en blijftijd van NPC's).

- [x] Het spellogboek wordt na elke beurt weggeschreven, loopt door na SAVE, en na LOAD van een oudere save blijft de latere geschiedenis bewaard als tak; `log` toont het terug en het is te exporteren
- [x] Elk antwoord geeft zijn eigennamen op in `names`; een niet opgegeven of onbekende naam wordt afgekeurd, een verre nieuwe naam wordt vastgelegd in de savegame-lore en daarna door iedereen hetzelfde gebruikt
- [x] Een NPC weet wat hij net deed: de prompt bevat een RECENTLY-regel, en een NPC die net thuiskwam zegt niet dat hij er de hele nacht was
- [x] Een slapende NPC moet eerst gewekt worden, wat houding kost; 's nachts zit de deur van een huis dicht
- [x] Een NPC die langs de speler komt, blijft staan als hij nieuwsgierig is of iets met de speler te doen heeft; wie ergens aankomt blijft er een tijdje; een passant geeft één regel

## M3 Kennis, geruchten en het dagboek

Scope: FO 5 en het ontwerp lore en wereldverandering (zonder AI). Vaste kansworp, kennisniveaus, richting en afstand, lore met vertellingen per niveau, doorverwijzen; belang, feiten, getuigen, kanalen, vervagen en vergeten; versies en nieuws van de dag uit sjablonen; kleine verhaalpatronen (verlies, ruzie, diefstal, levensloop, feest) met een verhalenmotor voor het tempo; het dagboek als naslagwerk met links en bronnen; de eindweergave met logboek en kroniek; de werkinstructie `content/CHRONICLER.md`.

- [x] De kans dat iemand een verhaal kent, komt overeen met de tabel in WB 11; Mirte kent Lubbert via haar werk, en verre plaatsen hooguit als richting en reistijd
- [x] Een getuige weet een gebeurtenis direct; via huishouden, buren, roddel en herberg weet het dorp het binnen een dag, met vervagende details
- [x] Een gerucht uit Veenhoek bereikt Waagdam meestal binnen 2 speldagen, via de toonbank, de markt of Kobus de marskramer, met afnemende betrouwbaarheid
- [x] Klein nieuws wordt vergeten: belang 1 na twee dagen, belang 2 na twee weken
- [x] Vraagt de speler iets wat een NPC niet weet, dan volgt een verwijzing naar iemand binnen 5 km die het wel kan weten
- [x] Kleine verhaalpatronen gebeuren vanzelf in een simulatie van 14 dagen, in het tempo van de instelling, en naspelen geeft hetzelfde
- [ ] Het dagboek toont personen, plaatsen, gebeurtenissen en lore met links en bronnen; tegenstrijdige versies staan naast elkaar
- [ ] Aan het eind kan de speler zijn logboek en de echte kroniek bekijken en downloaden

## M3.1 De kroniekschrijver

Scope: ontwerp lore en wereldverandering, FO 7 en 16. De kroniekschrijver als derde AI-rol met advies en proefrit; het schrift met verhaallijnen; het overzicht in vaste notatie; opzoeken met gereedschappen; de nachtelijke run en directe runs; lore met versies per afstand; nieuws van de dag; AI-doelkeuze van het brein met catalogus, validator, triggers en budget.

- [ ] Een gebeurtenis met belang 3 of meer wordt 's nachts lore met versies per afstand, zonder feiten buiten de gebeurtenissen
- [ ] Een gewone nachtelijke run kost minder dan 3 dollarcent en valt zonder AI terug op sjablonen
- [ ] De dood van iemand met een questrol leidt direct tot een run
- [ ] Ongeldige AI-doelen worden geweigerd en vallen terug op de nutsfunctie

## M4 Reizen, kaart en eerste wereldbouwer

Scope: FO 4 en 15. Zonetekening naar hexkaart met generatorregels, hexbeschrijvingen uit sjablonen, lopen met automatisch doorlopen, zicht en mist, snelreizen, kaartpaneel met bezocht, gezien, gehoord en kaart, landkaart als kennis. Eerste versie van de wereldbouwer: kaart, locaties, uitgangen, zones, NPC-formulier en validatiepaneel. Uit het ontwerp lore en wereldverandering: detail naar afstand (volledig, grof, notitie) met materialiseren, de kaart in het dagboek, en genereren tot omtrek voor streken buiten de kaart.

- [ ] De route van Veenhoek naar de Kattenbroek is te vinden; de verborgen droge rug alleen met Wouter of Pim
- [ ] Gehoorde zones worden kleiner naarmate meer NPC's over dezelfde plek vertellen
- [ ] Een locatie of NPC aanpassen in de wereldbouwer is direct zichtbaar in het spel
- [ ] Een NPC ver weg is een notitie en wordt op die plek weer volledig zodra de speler in de buurt komt

## M5 Personage, regels en gevecht

Scope: FO 11 en 12, WB 5 en 12. Personage maken, vaardigheden en proeven met vier slagingsgraden, levels en talentbomen voor zes klassen, beschermgoden met gunst, aandoeningen, klokken, gevecht in beurten met afstanden en Momentum, moreel, niet-dodelijk vechten, dood en de Weg van de Grijze Ruiter, het bestiarium.

- [ ] Alle zes klassen zijn te maken en te spelen van level 1 tot 10
- [ ] Het gevecht met de Bokkenrijders op het jaagpad is speelbaar, met vlucht en overgave
- [ ] Een gesimuleerde balanstest van 1.000 gevechten per klasse blijft binnen de afgesproken marges

## M6 Relaties, facties en gezellen

Scope: FO 8 en 13. Relaties met vier waarden, houding en gedragspoorten, gebeurtenisregels, facties en reputatie, getuigen en misdaad, rekruteren met voorwaarden, loyaliteit, band, goedkeuring, bevelen, tactiek in gevecht, groepsgesprek, kampvuur, vertrek en verraad, romance. Uit het ontwerp lore en wereldverandering: staatkunde en spanning tussen landen, misdaad en intrige met het herkennen van een opvallende samenloop.

- [ ] Gerrit valt niet als eerste aan zolang hij Vriendelijk is, ook als hij boos is
- [ ] Wouter weigert een gevaarlijke opdracht bij lage loyaliteit en voert hem uit bij hoge
- [ ] Een misdaad zonder getuigen heeft geen gevolgen; met getuigen verspreidt hij zich als gerucht

## M7 Quests en de volledige Holleveen

Scope: FO 14, WB 7 tot en met 15. Questsysteem met stadia, voorwaarden, effecten, klokken, verzoeken uit NPC-doelen en tegenspelers. Alle content: 86 locaties, 29 NPC's, 22 verhalen, 10 quests en 5 persoonlijke quests. Uit het ontwerp lore en wereldverandering: rampen en oorlog met effectplannen, groepen, toestand van plekken, genereren tot speelbaar, en quests die op de wereld reageren, ook op de dood van iemand met een questrol.

- [ ] Elke quest is via al zijn oplossingen uit te spelen in een geautomatiseerd script
- [ ] 30 speldagen simulatie zonder vastlopers of onoplosbare quests
- [ ] De drooglegging loopt door als de speler niets doet
- [ ] Een dijkdoorbraak laat Veenhoek vluchten: wie dichtbij is loopt echt weg, verder weg worden het notities, en lopende quests reageren

## M8 Volledige wereldbouwer

Scope: FO 15. Lore-, quest-, object- en beroepseditors, speeltestgereedschap (tijd, teleport, NPC-inspecteur, AI-log, simulatie zonder speler), bouwcommando's in het spel, AI-schrijfhulp, live herladen, en sparren met de kroniekschrijver volgens de werkinstructie.

- [ ] Een nieuw gehucht met drie NPC's en een verhaal is zonder code toe te voegen en direct speelbaar
- [ ] Alle bestaande content opent en slaat op zonder verlies
- [ ] Een voorstel van de kroniekschrijver in de wereldbouwer is eerst als wijziging te zien, wordt gevalideerd en pas na akkoord opgeslagen

## M9 Afwerking en release

Scope: FO 18. Balans, toegankelijkheid, prestaties, installers voor Mac en Windows.

- [ ] Alle niet-functionele eisen uit FO 18 zijn gemeten en gehaald
- [ ] Installers voor Mac en Windows werken op een schone machine

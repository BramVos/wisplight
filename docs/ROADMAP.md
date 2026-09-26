# Roadmap Wisplight versie 1

Elke mijlpaal eindigt met een speelbare versie, een blok in `docs/CHANGELOG.md` en een speeltest door Bram. Een mijlpaal is af als alle criteria zijn afgevinkt. Hoofdstukken verwijzen naar het functioneel ontwerp (FO) en het wereldboek (WB).

## M0 Projectskelet (af)

- [x] Electron, TypeScript en React; spelmotor los van de interface
- [x] Content in YAML met validatie; klok met de kalender van de Nethermarch
- [x] Commando's met Nederlandse aliassen; Veenhoek met zeven locaties en Mirte
- [x] Terminalclient, browserversie, unittests en rooktest

## M1 Wereld en simulatie

Scope: FO 3, 4, 6 en 7. Objecten met affordances, voorwerpen en inventaris, handel en prijzen, hybride klok, NPC-kaarten met behoeften, schema's en stemming, nutsfunctie, planner (HTN met GOAP-terugval) die alleen met eigen kennis plant, savegame in SQLite met gebeurtenissenlog. Content: Veenhoek, Molenend, The Drowned Goose en Waagdam met 12 NPC's.

- [ ] De streek draait 7 speldagen zonder speler zonder fouten of vastgelopen NPC's
- [ ] Staat de molen stil, dan koopt Mirte graan bij Lubbert, laat het malen in de rosmolen en bakt; zonder bekende bron wordt het doel Ask_help
- [ ] Prijzen reageren op voorraad (meel wordt duurder na de storm)
- [ ] Opslaan en laden geven exact dezelfde staat; een savegame is na te spelen met het log
- [ ] Commando's take, drop, give, use, examine, buy, sell, eat, wait en sleep werken

## M2 Praten met NPC's

Scope: FO 9, 10 en 16. LLM-gateway met OpenAI, Anthropic en een mock; instellingen met versleutelde sleutel, modellenlijst, adviesprompt, proefrit en exacte model-id; gespreksmodus met snelvragen, ask en tell, vrije tekst, gespreksacts, proeven voor woorden, lengteniveaus, guardrails, terugvalteksten en Nederlands typen; dagboek met klikbare onderwerpen; AI-log in de ontwikkelmodus.

- [ ] Met de mock slaagt een testset van 50 gesprekssituaties: geldig schema, geen kennislek, juiste lengte
- [ ] Met een echte sleutel geeft het modeladvies alleen bestaande model-id's, en de gekozen id wordt exact opgeslagen
- [ ] Een injectiepoging krijgt een sjabloonantwoord zonder AI-aanroep
- [ ] Zonder verbinding blijft het spel speelbaar met terugvalteksten
- [ ] De sleutel staat nergens leesbaar op schijf of in logs

## M3 Kennis, geruchten en doelen

Scope: FO 5 en 7. Vaste kansworp, kennisniveaus, richting en afstand, lore met vertellingen per niveau, geruchten die reizen met marskramers, doorverwijzen, AI-doelkeuze met catalogus, validator, triggers en budget.

- [ ] Mirte kent Lubbert en Stavermouth alleen bij richting; de kansen per verhaal komen overeen met de tabel in WB 11
- [ ] Een gerucht uit Veenhoek bereikt Waagdam binnen 2 speldagen via Kobus, met afnemende betrouwbaarheid
- [ ] Vraagt de speler iets wat een NPC niet weet, dan volgt een verwijzing naar iemand die het wel kan weten
- [ ] Ongeldige AI-doelen worden geweigerd en vallen terug op de nutsfunctie

## M4 Reizen, kaart en eerste wereldbouwer

Scope: FO 4 en 15. Zonetekening naar hexkaart met generatorregels, hexbeschrijvingen uit sjablonen, lopen met automatisch doorlopen, zicht en mist, snelreizen, kaartpaneel met bezocht, gezien, gehoord en kaart, landkaart als kennis. Eerste versie van de wereldbouwer: kaart, locaties, uitgangen, zones, NPC-formulier en validatiepaneel.

- [ ] De route van Veenhoek naar de Kattenbroek is te vinden; de verborgen droge rug alleen met Wouter of Pim
- [ ] Gehoorde zones worden kleiner naarmate meer NPC's over dezelfde plek vertellen
- [ ] Een locatie of NPC aanpassen in de wereldbouwer is direct zichtbaar in het spel

## M5 Personage, regels en gevecht

Scope: FO 11 en 12, WB 5 en 12. Personage maken, vaardigheden en proeven met vier slagingsgraden, levels en talentbomen voor zes klassen, beschermgoden met gunst, aandoeningen, klokken, gevecht in beurten met afstanden en Momentum, moreel, niet-dodelijk vechten, dood en de Weg van de Grijze Ruiter, het bestiarium.

- [ ] Alle zes klassen zijn te maken en te spelen van level 1 tot 10
- [ ] Het gevecht met de Bokkenrijders op het jaagpad is speelbaar, met vlucht en overgave
- [ ] Een gesimuleerde balanstest van 1.000 gevechten per klasse blijft binnen de afgesproken marges

## M6 Relaties, facties en gezellen

Scope: FO 8 en 13. Relaties met vier waarden, houding en gedragspoorten, gebeurtenisregels, facties en reputatie, getuigen en misdaad, rekruteren met voorwaarden, loyaliteit, band, goedkeuring, bevelen, tactiek in gevecht, groepsgesprek, kampvuur, vertrek en verraad, romance.

- [ ] Gerrit valt niet als eerste aan zolang hij Vriendelijk is, ook als hij boos is
- [ ] Wouter weigert een gevaarlijke opdracht bij lage loyaliteit en voert hem uit bij hoge
- [ ] Een misdaad zonder getuigen heeft geen gevolgen; met getuigen verspreidt hij zich als gerucht

## M7 Quests en de volledige Holleveen

Scope: FO 14, WB 7 tot en met 15. Questsysteem met stadia, voorwaarden, effecten, klokken, verzoeken uit NPC-doelen en tegenspelers. Alle content: 86 locaties, 29 NPC's, 22 verhalen, 10 quests en 5 persoonlijke quests.

- [ ] Elke quest is via al zijn oplossingen uit te spelen in een geautomatiseerd script
- [ ] 30 speldagen simulatie zonder vastlopers of onoplosbare quests
- [ ] De drooglegging loopt door als de speler niets doet

## M8 Volledige wereldbouwer

Scope: FO 15. Lore-, quest-, object- en beroepseditors, speeltestgereedschap (tijd, teleport, NPC-inspecteur, AI-log, simulatie zonder speler), bouwcommando's in het spel, AI-schrijfhulp, live herladen.

- [ ] Een nieuw gehucht met drie NPC's en een verhaal is zonder code toe te voegen en direct speelbaar
- [ ] Alle bestaande content opent en slaat op zonder verlies

## M9 Afwerking en release

Scope: FO 18. Balans, toegankelijkheid, prestaties, installers voor Mac en Windows.

- [ ] Alle niet-functionele eisen uit FO 18 zijn gemeten en gehaald
- [ ] Installers voor Mac en Windows werken op een schone machine

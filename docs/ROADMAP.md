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

## M3 Kennis, geruchten en het dagboek (af)

Scope: FO 5 en het ontwerp lore en wereldverandering (zonder AI). Vaste kansworp, kennisniveaus, richting en afstand, lore met vertellingen per niveau, doorverwijzen; belang, feiten, getuigen, kanalen, vervagen en vergeten; versies en nieuws van de dag uit sjablonen; kleine verhaalpatronen (verlies, ruzie, diefstal, levensloop, feest) met een verhalenmotor voor het tempo; het dagboek als naslagwerk met links en bronnen; de eindweergave met logboek en kroniek; de werkinstructie `content/CHRONICLER.md`.

- [x] De kans dat iemand een verhaal kent, komt overeen met de tabel in WB 11; Mirte kent Lubbert via haar werk, en verre plaatsen hooguit als richting en reistijd
- [x] Een getuige weet een gebeurtenis direct; via huishouden, buren, roddel en herberg weet het dorp het binnen een dag, met vervagende details
- [x] Een gerucht uit Veenhoek bereikt Waagdam meestal binnen 2 speldagen, via de toonbank, de markt of Kobus de marskramer, met afnemende betrouwbaarheid
- [x] Klein nieuws wordt vergeten: belang 1 na twee dagen, belang 2 na twee weken
- [x] Vraagt de speler iets wat een NPC niet weet, dan volgt een verwijzing naar iemand binnen 5 km die het wel kan weten
- [x] Kleine verhaalpatronen gebeuren vanzelf in een simulatie van 14 dagen, in het tempo van de instelling, en naspelen geeft hetzelfde
- [x] Het dagboek toont personen, plaatsen, gebeurtenissen en lore met links en bronnen; tegenstrijdige versies staan naast elkaar
- [x] Aan het eind kan de speler zijn logboek en de echte kroniek bekijken en downloaden

## M3.1 De kroniekschrijver (af)

Scope: ontwerp lore en wereldverandering, FO 7, 8 en 16. De kroniekschrijver als derde AI-rol met advies en proefrit; het schrift met verhaallijnen; het overzicht in vaste notatie; opzoeken met gereedschappen; de nachtelijke run en directe runs; lore met versies per afstand; nieuws van de dag; AI-doelkeuze van het brein met catalogus, validator, triggers en budget. Op verzoek van Bram naar voren gehaald uit M6: wie mensen voor elkaar zijn (familie, liefde, werk, schuld, dorp), de dood van een NPC en rouw; en uit het ontwerp het tempo kiezen.

- [x] Familie en dorp: een NPC spreekt over zijn eigen mensen anders dan over anderen, en tegen een vreemde anders dan tegen iemand die hij kent en vertrouwt; slecht nieuws over iemand bereikt zijn familie eerst, en wie rouwt, blijft thuis en gaat niet naar het feest
- [x] De speler kiest het tempo (rustig, gewoon, dramatisch); standaard gewoon

- [x] Een gebeurtenis met belang 3 of meer wordt 's nachts lore met versies per afstand, zonder feiten buiten de gebeurtenissen
- [x] Een gewone nachtelijke run kost minder dan 3 dollarcent en valt zonder AI terug op sjablonen
- [x] De dood van iemand met een questrol leidt direct tot een run
- [x] Verzoeken ontstaan uit wat er gebeurt (iets kwijt, koorts, gebrek aan iets); de kroniekschrijver werkt ze uit of maakt er een van een open draad; de gever vraagt het de speler, het staat in het dagboek en wordt beloond
- [x] De kroniekschrijver is een losse module (`src/chronicler`) zonder afhankelijkheden van het spel, zodat andere applicaties hem kunnen aanroepen
- [x] Ongeldige AI-doelen worden geweigerd en vallen terug op de nutsfunctie

## M4 Reizen, kaart en eerste wereldbouwer (af)

Scope: FO 4 en 15. Zonetekening naar hexkaart met generatorregels, hexbeschrijvingen uit sjablonen, lopen met automatisch doorlopen, zicht en mist, snelreizen, kaartpaneel met bezocht, gezien, gehoord en kaart, landkaart als kennis. Eerste versie van de wereldbouwer: kaart, locaties, uitgangen, zones, NPC-formulier en validatiepaneel. Uit het ontwerp lore en wereldverandering: detail naar afstand (volledig, grof, notitie) met materialiseren, de kaart in het dagboek, en genereren tot omtrek voor streken buiten de kaart.

- [x] De route van Veenhoek naar de Kattenbroek is te vinden; de verborgen droge rug alleen met Wouter of Pim
- [x] Gehoorde zones worden kleiner naarmate meer NPC's over dezelfde plek vertellen
- [x] Een locatie of NPC aanpassen in de wereldbouwer is direct zichtbaar in het spel
- [x] Een NPC ver weg is een notitie en wordt op die plek weer volledig zodra de speler in de buurt komt

## M5 Personage, regels en gevecht (af)

Scope: FO 11 en 12, WB 5 en 12. Personage maken, vaardigheden en proeven met vier slagingsgraden, levels en talentbomen voor zes klassen, beschermgoden met gunst, aandoeningen, klokken, gevecht in beurten met afstanden en Momentum, moreel, niet-dodelijk vechten, dood en de Weg van de Grijze Ruiter, het bestiarium.

- [x] Alle zes klassen zijn te maken en te spelen van level 1 tot 10
- [x] Het gevecht met de Bokkenrijders op het jaagpad is speelbaar, met vlucht en overgave
- [x] Een gesimuleerde balanstest van 1.000 gevechten per klasse blijft binnen de afgesproken marges

## M6 Relaties, facties en gezellen (af)

Scope: FO 8 en 13. Relaties met vier waarden, houding en gedragspoorten, gebeurtenisregels, facties en reputatie, getuigen en misdaad, rekruteren met voorwaarden, loyaliteit, band, goedkeuring, bevelen, tactiek in gevecht, groepsgesprek, kampvuur, vertrek en verraad, romance. Uit het ontwerp lore en wereldverandering: staatkunde en spanning tussen landen, misdaad en intrige met het herkennen van een opvallende samenloop.

- [x] Gerrit valt niet als eerste aan zolang hij Vriendelijk is, ook als hij boos is
- [x] Wouter weigert een gevaarlijke opdracht bij lage loyaliteit en voert hem uit bij hoge
- [x] Een misdaad zonder getuigen heeft geen gevolgen; met getuigen verspreidt hij zich als gerucht

## M7 Quests en de volledige Holleveen (af)

Scope: FO 14, WB 7 tot en met 15. Questsysteem met stadia, voorwaarden, effecten, klokken, verzoeken uit NPC-doelen en tegenspelers. Alle content: 86 locaties, 29 NPC's, 22 verhalen, 10 quests en 5 persoonlijke quests. Uit het ontwerp lore en wereldverandering: rampen en oorlog met effectplannen, groepen, toestand van plekken, genereren tot speelbaar, en quests die op de wereld reageren, ook op de dood van iemand met een questrol.

- [x] Elke quest is via al zijn oplossingen uit te spelen in een geautomatiseerd script
- [x] 30 speldagen simulatie zonder vastlopers of onoplosbare quests
- [x] De drooglegging loopt door als de speler niets doet
- [x] Een dijkdoorbraak laat Veenhoek vluchten: wie dichtbij is loopt echt weg, verder weg worden het notities, en lopende quests reageren

## M7.1 Moderne interface (na de playtest van M7) (af)

Scope: Brams bevindingen van 27 september. Gesprekken in een eigen venster, het dagboek per omgeving en met een kaartje, wie-weet-waar-iemand-is, en plaatjes van plekken en mensen.

- [x] Een gesprek begint in de gewone interface en gaat verder in een eigen venster met vrije tekst; onderwerpen kies je uit het dagboek
- [x] Het dagboek toont in een gesprek eerst wat binnen 15 km ligt; de rest is te zoeken of uit te klappen; plekken en mensen staan op een kaartje
- [x] Een NPC weet waar een bekende rond deze tijd meestal is, met een foutmarge naar hoe goed hij die kent, en hoe die eruitziet; iets dat hij zelf zag, gaat voor
- [x] Plaatjes van plekken en mensen zijn optioneel (een beeldmodel van OpenAI), worden eenmalig gemaakt en bewaard, en tellen mee in het AI-budget

## M7.2 Open punten uit M1 tot en met M7 (af)

Scope: wat in de milestone-rapporten onder "Nog niet" bleef staan en niet bij M8 of M9 hoort.

- [x] Elk punt uit de lijst in de changelog is gebouwd, of staat met reden bij een latere milestone

Blijft liggen, met reden: genereren tot speelbaar (niveau 3) komt met de eerste nieuwe streek, want pas dan gaan er wegen de streek uit; Busy Hands wacht op ambachtswerk voor de speler; de legende-variant van lore meenemen is een latere extra keuze (besluit 27 september).

## M8 Volledige wereldbouwer (af)

Scope: FO 15. Lore-, quest-, object- en beroepseditors, speeltestgereedschap (tijd, teleport, NPC-inspecteur, AI-log, simulatie zonder speler), bouwcommando's in het spel, AI-schrijfhulp, live herladen, en sparren met de kroniekschrijver volgens de werkinstructie. Op verzoek van Bram (27 september) is de wereldbouwer een aparte editor, en kan hij meerdere werelden onderhouden; als bewijs komt er een tweede, heel kleine high-fantasywereld bij.

- [x] Een nieuw gehucht met drie NPC's en een verhaal is zonder code toe te voegen en direct speelbaar
- [x] Alle bestaande content opent en slaat op zonder verlies
- [x] Een voorstel van de kroniekschrijver in de wereldbouwer is eerst als wijziging te zien, wordt gevalideerd en pas na akkoord opgeslagen
- [x] De editor is een eigen venster met een eigen startcommando, en opent en bewaart elke wereld in `content/`
- [x] Een tweede wereld (een klein eiland waarop je strandt) is speelbaar naast de Nethermarch, en bij een nieuw spel kies je de wereld

Afwijkingen, met reden in FO hoofdstuk 15: geen kaart waarop je plekken sleept (uitgangen in het formulier), de kroniekschrijver levert hele entiteiten en de editor maakt de diff, en @dig, @desc, @spawn, @tag en @link zijn niet gebouwd omdat de editor dat werk doet.

## M8.1 Nasleep: fundament (af)

Scope: ontwerp "Signalen en nasleep" (Claude Docs), FO 7, 8 en 15; de taken staan in het werkpakket van dat ontwerp. De impactanalyse is gedaan; eerst komen een vastgelegde oude save per wereld en de gouden scenario's als falende tests. Signalen en wachters in de content (per wereld; een gedeelde basis pas bij een derde wereld), een feit bij elke questuitkomst, banden en huis en werk als laag in de spelstand, standaardnasleep in de content (ook voor het huwelijk van de speler), feiten met een gestructureerde bewering, nieuws voor wie ver weg is, en de effectplannen als algemene planuitvoerder met voorwaarden op wat iemand weet en wat waar is. Wachters en nasleep in de editor. Nog zonder extra AI.

- [x] De bruiloft van Wouter en Geesje geeft een feest, een verhuizing en een vacature bij Trijntje, en het dorp hoort ervan
- [x] Trouwt de speler, dan loopt dat via dezelfde nasleep, met dezelfde uitkomst als nu (huis, schoonfamilie, verwachtingen)
- [x] Na een oorlog gaan vluchtelingen terug als ze weten dat het vrede is en denken dat hun huis staat; wie een foute versie hoorde, blijft weg
- [x] Een nieuwe soort gebeurtenis is toe te voegen met alleen content (een wachter en een nasleep), in de editor
- [x] Alles wat er al was, speelt hetzelfde: het hele testpakket, 30 speldagen simulatie, de uitspeelscripts van beide werelden, en een oude save laadt en speelt verder

## M8.2 Nasleep: het brein plant (af)

Scope: voornemens over meerdere dagen, liegen met een motief en navragen bij een reiziger of handelaar, openheid van een plek naar vreemden, geloven of twijfelen aan een bewering, vergeten en herkennen, groeten en praatjes waar de speler bij is, voornemens als sjablonen in de content waaruit het brein kiest en de open bindingen invult, alleen voor zichzelf en het eigen huishouden (klein model, validator, budget, terugval op de standaardnasleep; gewijzigd na de review van 27 september, zie `docs/review-opzet-2026-09-27.md` en het ontwerp onder "Bijsturing na de review"), vijf standen (arm, gewoon, burger, welgesteld, notabel), voornemens zichtbaar in de speeltest en de NPC-inspecteur. Vooraf, uit de review: de Nethermarch-ids uit de motor, de breinprompt op orde (catalogus gecacht, korte sleutels, gesloten poorten weglaten, geen ochtendkeuze zonder delta, geen model buiten de volledige laag), één werkwoordentaal met het werkwoord `goal` en een permissietabel, en `chance` op een planstap.

- [x] Harmen gedraagt zich binnen een week anders als zijn huishouden twee standen stijgt, en het dorp merkt het
- [x] Een ruzie die een week blijft, wordt bijgelegd of wordt een vete, afhankelijk van wie er bemiddelt
- [x] Een gerucht dat de oorlog voorbij is, van iemand die de vluchtelingen weg wil, laat een deel vertrekken; wie het eerst navraagt bij een handelaar, blijft
- [x] Een vreemde met een waarschuwing wordt in Waagdam gehoord en in Molenend gewantrouwd; een enkeling jaagt hem weg, iemand die hem gelooft meldt het, en of de hulp op tijd komt volgt uit de klokken
- [x] Wie elkaar lang niet ziet, vergeet elkaar tot een herinnering; een vluchteling die na een jaar terugkomt, wordt door wie hem goed kende herkend en daarop aangesproken
- [x] Waar de speler is, groeten mensen elkaar naar hun band en blijven ze staan voor een praatje als ze tijd en nieuws hebben; wie erbij komt, kan met LISTEN de strekking opvangen, en over de speler of een geheim zwijgen ze
- [x] Zonder AI of met het budget op loopt alles door op de standaardnasleep

## M8.3 Nasleep: de kroniekschrijver plant

Scope: de plannen van de kroniekschrijver krijgen de hele werkwoordentaal (permissietabel in `verbs.ts`), escalatie als geen voornemen past of het meer huishoudens raakt, botsende plannen, plannen voor groepen, wrijving in een dorp en een waarschuwing die uitkomt. Uit de review van 27 september (`docs/review-opzet-2026-09-27.md`): opbouw per verhaallijn (fase, tempo dat lijnen in crisis meeweegt, hooguit één geplande beat per lijn), kleinere lijnen, de tegenspelers van de Holleveen als plan in de content, een naslag van voorwaarden en werkwoorden uit de schema's voor editor en `CHRONICLER.md`, en de verhaallijnen in de speeltest. De taken staan in het werkpakket van het ontwerp.

- [x] De vluchtelingen in Waagdam krijgen samen één plan waarin sommigen terugkeren en anderen blijven
- [x] Twee breinen met plannen die elkaar kruisen, worden één verhaal met een uitkomst
- [x] Ongeldige stappen worden geweigerd en vallen terug op de standaardnasleep
- [x] Bij te veel nieuwkomers en te weinig eten ontstaat een groep tegen de vluchtelingen, en de speler kan kant kiezen of bemiddelen
- [x] Een verhaallijn loopt van opzet via crisis naar afloop: de kroniekschrijver zet per lijn een fase en hooguit één geplande beat, en in een dorp met twee lijnen in crisis begint de verhalenmotor niets nieuws
- [x] De tegenspelers van de Holleveen spelen als plan in de content, met hetzelfde gedrag als de gescripte versie
- [x] De editor en `CHRONICLER.md` tonen dezelfde naslag van voorwaarden en werkwoorden, gegenereerd uit de schema's, en de speeltest toont de verhaallijnen met hun fase

## M8.4 Economie

Scope: ontwerp "Signalen en nasleep", hoofdstuk Economie (besluit 27 september 2026). Vraag en aanbod per nederzetting in plaats van per toonbank: een grootboek per nederzetting (werkplaatsen met benoemde en naamloze werkers, bevolking, verbruik, productie en aanvoer, eens per speldag), hulpbronnen per zone uit het wereldboek (turf, klei, hout, rogge, paling; in een andere wereld ook erts of steen), handelsroutes met aanvoer van binnen en buiten de kaart, ketens die sluiten (een goed dat verbruikt wordt, wordt ergens gemaakt of aangevoerd, en de editor waarschuwt waar niet), een karakter per nederzetting (waar ze van leeft, plus tags uit de content) dat openheid, generieke mensen en wachters kleurt, en de signalen tekort, overschot, prijs verdubbeld, ambacht zonder beoefenaar en route gesloten als wachters in de content. Winkels vullen uit het grootboek; de vaste `supply`-regels blijven de terugval, zodat bestaande content en oude saves blijven werken. Echte productie stap voor stap alleen door benoemde NPC's in beeld. De bekende geldlekken (naamloze klanten, de verkoopact van een NPC, loon van gezellen) sluiten waar het grootboek ze raakt.

Let op, voor de bouwer: dit werkpakket is op 27 september 2026 uit "Nasleep: groei" gehaald en ervoor gezet; groei is nu M8.5. Een streek buiten de kaart (Zwolderkamp, de Cog League) is alleen een stomp in de content: naam, wat ze stuurt en vraagt, prijspeil, drager en hoe vaak. Werk haar niet verder uit. Pas als de kroniekschrijver de streek uitwerkt, krijgt ze een eigen grootboek, en de route houdt dan haar id. Wat de kroniekschrijver intussen over de streek vertelt, moet kloppen met de stomp.

- [x] Elke nederzetting van beide werelden heeft een grootboek dat eens per speldag rekent, en de toonbanken vullen eruit; zonder grootboek werkt de oude bevoorrading zoals nu
- [x] Lampolie en spijkers komen de Nethermarch alleen binnen over de route uit Zwolderkamp; sluit de oorlog die route, dan is er binnen een week een tekort, stijgt de prijs bij Hendrik en klinkt het signaal, zonder dat iemand dat schreef
- [x] Na de storm staat de molen stil: de meelvoorraad in Veenhoek daalt en de prijs bij Lubbert in Waagdam stijgt; draait de molen weer, dan zakt hij
- [x] Een tekort dat een week blijft, een overschot en een ambacht dat niemand uitoefent zijn signalen die het brein of de kroniekschrijver oppakt, met de wachters in de content
- [x] Waagdam (handelsstad) en Veenhoek (turfdorp) reageren anders op dezelfde vreemde en hetzelfde tekort, uit karakter en grootboek, zonder code per plek
- [x] Een streek buiten de kaart bestaat als stomp; de kroniekschrijver praat erover in lijn met wat ze stuurt en vraagt, en werkt haar pas uit als het verhaal daarom vraagt
- [x] De editor toont per nederzetting waar ze van leeft, haar karakter en haar routes, en waarschuwt bij een goed dat verbruikt wordt maar nergens gemaakt of aangevoerd
- [x] Alles wat er al was, speelt hetzelfde: het hele testpakket, 30 speldagen simulatie, de uitspeelscripts van beide werelden, en een oude save laadt en speelt verder

## M8.5 Nasleep: groei

Scope: nieuwe mensen uit sjablonen (gevalideerd, met een maximum per seizoen), projecten en bouwwerken met materiaal uit het grootboek van M8.4, de speler die werkt voor loon, investeert en vervoert (een affordance kan een proef en ervaring hebben, zodat werk ambacht met oefening is), gegenereerde mensen en plekken in de editor. Een rangwissel van een nederzetting pas als dat speelt. Tot 27 september 2026 was dit M8.4; het grootboek en de hulpbronnen zijn naar M8.4 Economie verhuisd.

- [x] Een kuiper vestigt zich met zijn gezin in een leeg huis in Veenhoek omdat niemand tonnen maakt
- [x] Waagdam bouwt eerst een steenbakkerij en daarna een muur, met materiaal uit de economie
- [x] Een tekort dat blijft, leidt tot een besluit van een handelaar of een nieuwkomer

## M9.1 Vaste ids en de open punten

Scope: alles wat na M8.5 nog openstaat (besluit van Bram, 27 september 2026), en ids die nooit veranderen.

Ids in de kern: een id is de sleutel en verandert nooit; een naam, label of beschrijving kan altijd veranderen zonder dat een save of log breekt. Elke wereld houdt een register van alle ids die ooit zijn vastgelegd (`content/<wereld>/ids.lock`, door het spel bijgehouden). Het laden weigert content waarin een vastgelegde id ontbreekt zonder grafsteen; een grafsteen zegt wat er van een verwijderd ding overblijft (weg, of opgegaan in een ander id). Oude saves, het spellogboek en de kroniek volgen de grafstenen bij het laden. De editor laat een id alleen invullen bij iets nieuws, ook in YAML, en maakt bij verwijderen een grafsteen. Ids die tijdens een spel ontstaan (mensen die aankomen, sinds M8.5 in `state.growth`) volgen dezelfde regel binnen hun save: eenmaal gegeven veranderen ze niet, ook niet als de naam verandert, en ze kunnen nooit samenvallen met een id uit de content. Neemt de editor zo iemand over in de wereld ([Adopt]), dan houdt hij zijn id, zodat de save en de content naar dezelfde persoon wijzen; valt dat id al samen met iets in de content, dan weigert de editor en zegt waarom.

Verder, uit "Later" in het ontwerp "Signalen en nasleep" en uit eerdere mijlpalen:
- een archief voor oude feiten die niemand meer kent en die niet in een lijn of lore zitten
- de afstandsregel voor `feast`, `leave` en `return`: ver weg alleen een feit en een toestandswijziging
- een optionele zin van de stem voor wie lang blijft luisteren bij een praatje
- genereren tot speelbaar (niveau 3) voor een streek buiten de kaart
- de legende-variant van lore meenemen naar een volgend spel
- een kaart in de editor waarop je plekken versleept
- een regelset voor Skerrow
- Busy Hands, voor zover het na werken voor loon in M8.5 nog openstaat

Uit de mijlpaalverslagen van M8.2 tot en met M8.5 (verwerkt 27 september 2026):
- een streek buiten de kaart die de kroniekschrijver uitwerkt, krijgt een eigen grootboek en de route houdt haar id (M8.4)
- seizoenen en uitputbare grond in de Nethermarch: de content kan ze al zetten, de wereld gebruikt ze nog niet (M8.4)
- de laatste toonbanken met vaste bevoorrading (warme maaltijd, melk, bier op Skerrow, scheepsbeschuit) naar het grootboek, met "eten gaat voor alles" als vangnet (M8.4)
- het wereldboek zegt niet wat Zwolderkamp en Hunnenloo sturen en vragen; de bouwer koos lampolie, spijkers, zeildoek en touw uit Zwolderkamp en wol uit Hunnenloo (M8.4)
- groepen met naamlozen die pas een naam en een kaart krijgen als de speler iemand aanspreekt (M8.5)
- vervoeren als eigen handeling: een lading van A naar B voor loon, met de risico's van de weg (M8.5)
- een rangwissel van een nederzetting, als plan met de graaf als beslisser (M8.5, scenario 7 in het ontwerp)
- een plek die door een project ontstond met [Adopt] overnemen in de content (M8.5)
- geloof per persoon, zodat wrijving verschil in geloof meeweegt (M8.3)
- een groep vóór nieuwkomers (de Lantaarn met liefdadigheid) ook als standaardnasleep, niet alleen via de kroniekschrijver (M8.3)

- [x] Een naam of beschrijving wijzigen in de editor laat elke oude save en elk spellogboek laden en precies naspelen
- [x] Een id verwijderen of veranderen kan niet zonder grafsteen: het laden noemt de id en de plek, en de editor maakt de grafsteen zelf
- [x] Een save met iets wat later verwijderd of samengevoegd is, laadt en speelt verder volgens de grafsteen
- [x] Een nieuwkomer die in een save ontstond en later met [Adopt] in de wereld kwam, is in die save en in een nieuw spel dezelfde persoon met hetzelfde id
- [x] Na 300 speldagen blijven laden, opslaan en het doorvertellen van nieuws even snel als na 30, dankzij het archief
- [x] Een feest, vertrek of terugkeer ver van de speler kost geen simulatie van mensen, alleen een feit en een toestandswijziging
- [x] Een streek buiten de kaart wordt speelbaar als de speler erheen gaat, gevalideerd als content, en ligt daarna vast in de savegame; ze krijgt dan een eigen grootboek en de route houdt haar id
- [x] De Nethermarch gebruikt seizoenen en uitputbare grond: turf wordt in de zomer gestoken, rogge in de Oogstmaand geoogst, en in de winter loopt de voorraad terug en stijgt de prijs, alleen uit content
- [x] Elke toonbank van beide werelden vult uit het grootboek; de vaste bevoorrading blijft alleen als terugval voor nieuwe content, en niemand krijgt honger door een rekenfout
- [x] Het wereldboek noemt wat Zwolderkamp en Hunnenloo sturen en vragen, en de content van de Nethermarch volgt het wereldboek
- [x] Een groep naamlozen (vluchtelingen, werkers aan de muur) krijgt pas een naam en een kaart als de speler iemand aanspreekt, en kost tot dan geen simulatie per persoon
- [x] De speler kan een lading vervoeren van de ene nederzetting naar de andere voor loon, met tol en roof als risico onderweg
- [x] Staat de muur van Waagdam, dan vraagt de burgemeester de graaf om stadsrechten; een rangwissel is een plan waarin de graaf beslist, en de wereld merkt het verschil
- [x] Een plek die door een project ontstond, is met [Adopt] in de content over te nemen met hetzelfde id, net als een nieuwkomer
- [x] Ieder mens heeft een geloof uit de content van de wereld, en wrijving met nieuwkomers weegt verschil in geloof mee
- [x] Een groep vóór nieuwkomers ontstaat ook zonder AI, als standaardnasleep in de content, naast de groep tegen
- [x] Een nieuw spel kan de wereld van een oud spel als legende meenemen, zonder namen van mensen die nog leven
- [x] Skerrow heeft een eigen regelset en is met personage en gevecht te spelen
- [x] Alles wat er al was, speelt hetzelfde: het hele testpakket, de simulaties, de uitspeelscripts van beide werelden, en oude saves

## M9.2 Waarheid en samenhang

Scope: de review van 27 september 2026 op de kroniekschrijver en de verhaalopbouw (na M8.5). De kroniekschrijver mag niets beweren dat niet uit een feit volgt; vrije planstappen dragen dezelfde voorwaarden als vaste; wat tijdens een aanroep gebeurt, gaat niet verloren; oorzaak en gevolg staan op feiten en lijnen. Kleine ingrepen in `chronicler.ts`, `planning.ts`, `quests/verbs.ts` en `storylines.ts`, elk met een test die het scenario van de review naspeelt. Vastgelegd na M9.1 omdat M9.1 al in aanbouw was.

- [x] Lore noemt geen levende als dood, geen ander huis dan het echte en geen bezit dat iemand niet heeft: een regelfilter op toetsbare uitspraken (dood, plaats, bezit, betrokkenen) tegen de wereldtoestand; "Gerrit is dead" bij een levende Gerrit valt terug op het sjabloon
- [x] De kroniekschrijver levert zijn beweringen ook als structuur (onderwerp, sleutel, waarde), elk terug te voeren op een feit van de lijn; anders wordt het lore-item niet opgeslagen
- [x] Bij belang 4 of hoger beoordeelt een kleine tweede aanroep of de tekst iets zegt wat niet in de feiten staat; in de tests met de mock
- [x] Elk werkwoord heeft standaardvoorwaarden (`return`: weet dat het gevaar voorbij is, gelooft dat het huis staat, de plek is veilig) die gelden voor content, brein en kroniekschrijver; content mag ze bewust overschrijven, een model niet, en ze worden bij uitvoering opnieuw gecontroleerd
- [x] Een run legt vast welke feiten hij aanbood; alleen die worden na afloop als verwerkt gemarkeerd, en een feit dat tijdens de aanroep ontstond wacht op de volgende run (test: A aangeboden, B intussen, B blijft onverwerkt)
- [x] De namencontrole bij het verwerken kijkt naar de invoer die het model zag, niet naar de wereld van dat moment
- [x] Feiten dragen hun oorzaak (`cause`) en lijnen hun voorganger (`follows`); een lijn die na twaalf feiten splitst, draagt samenvatting, open vragen en oorzaak over, en de kroniekschrijver ziet oorlog, route dicht, tekort, onrust, vertrek als één boog
- [x] Alles wat er al was, speelt hetzelfde: het hele testpakket, de simulaties, de uitspeelscripts van beide werelden, en oude saves

## M9.3 Maat: geschiedenis, opslag, prompts en kosten

Scope: de review van 27 september 2026 op prestaties en kosten (na M8.5), in deze volgorde: kostenregister, contextselectie, feiten indexeren, checkpoints, modellen vergelijken. Het archief voor oude feiten en "300 dagen even snel" zitten al in M9.1; hier komen de indexen, het opslagpatroon, de prompts en de kosten. Niet meegenomen, met reden: SQLite (de motor is headless en draait ook in de browser, een native module bemoeilijkt de installers, en het spellogboek is al append-only en geïndexeerd; de drie lagen en de indexen komen er wel, in geheugen en in het archief); een eigen proces voor de motor (pas als de meting na de andere stappen nog haperingen laat zien); semantisch zoeken (exacte ids en onderwerpen volstaan, lore is kort); de rolverdeling van modellen (dat is al de opzet sinds M8.2: de motor bepaalt wat kan, het model kiest en formuleert).

- [x] Het uurbudget telt alle aanroepen van het laatste uur, ook na een herstart: een duurzaam kostenregister in plaats van de laatste 200 logregels (test: 250 aanroepen van 0,01 tellen als 2,50)
- [x] Vóór verzending reserveert de gateway een geschatte bovengrens en verrekent daarna het werkelijke verbruik, zodat gelijktijdige aanvragen niet samen over het budget gaan
- [x] Een onbekend tarief is een eigen status: tokens geteld, automatische besteding begrensd, zichtbaar in de instellingen
- [x] Cachewrites worden apart geteld en apart geprijsd, en het spel meet per rol hoeveel van een prompt werkelijk uit de cache kwam
- [x] Het brein krijgt niet alles wat iemand kent, maar wat bij het signaal hoort: karakter, het probleem, de eigen middelen, de haalbare opties en alleen de bijbehorende mensen en plekken; de stem krijgt alleen de bekenden die bij het gesprek horen (test: met duizend bekenden groeit de prompt niet mee)
- [x] Het model kan begrensd bijvragen: wat iemand over een onderwerp weet, de oorzaken en open vragen van een lijn, de band tussen twee mensen, recente gebeurtenissen rond een plek; elke functie begrenst kennisrecht, tijd, aantal en omvang, en een NPC wordt er niet alwetend van
- [x] Een verhaalbewerking heeft een totaalbudget over al haar opzoekrondes, naast de grens per aanroep
- [x] Feiten, mensen, plekken, onderwerpen en open lijnen hebben een index; `factById` en de nieuwsverspreiding zoeken niet meer lineair (test: honderdduizend feiten, opzoeken in constante tijd)
- [x] De simulatie kiest werk voordat ze mensen doorloopt: een index van mensen per plek, een wachtrij met het volgende moment per persoon en plan, begrensde en geseede gesprekscontacten, en verspreiding per gebied voor wie ver weg is; naspelen geeft dezelfde wereld
- [x] Opslaan kopieert niet meer twee keer: een save is een checkpoint plus de gebeurtenissen sindsdien, met contentversie, seed, modelantwoorden en vertakkingen, en naspelen blijft exact
- [x] De interface hapert niet bij een autosave, een reis of een dagwissel (gemeten); pas als dat na de andere stappen nog zo is, draait de motor in een eigen proces
- [x] De modelproef beoordeelt op kosten per bruikbaar, gevalideerd antwoord (inclusief herhalingen en terugval), kennislekken, feitelijke fouten, karaktervastheid en reactietijd, en het advies kiest daarop
- [x] Alles wat er al was, speelt hetzelfde: het hele testpakket, de simulaties, de uitspeelscripts van beide werelden, en oude saves

## M9.4 Afwerking en release

Scope: FO 18. Balans, toegankelijkheid, prestaties, installers voor Mac en Windows. Tot 27 september 2026 was dit M9, daarna kort M9.2.

- [x] Een speeltestprotocol per verhaallijn: kon de speler het probleem herkennen, er invloed op uitoefenen en de afloop begrijpen; drie lijnen per wereld getest, met de uitkomst in de changelog

- [x] Alle niet-functionele eisen uit FO 18 zijn gemeten en gehaald
- [x] Installers voor Mac en Windows werken op een schone machine

## M10 De kaart in kleur en lagen

Scope: FO 4 "Weergave" (besluit 27 september 2026). De streekkaart en de landkaart mogen mooi zijn: een gedempt palet in de geest van Dwarf Fortress en Brogue, met schaduw per kleur, en een kaart met lagen. Eerst een voorstelpagina met palet, de echte Holleveen geshaded, een niveauwissel en de legendastrook, ter goedkeuring; dan bouwen. De tekst blijft leidend; de kaart is een zijpaneel en een journaalpagina.

Eerst rechtzetten (bevindingen van de kaartreview, 27 september 2026): de hash per hex mengt kleine invoer slecht, waardoor 59 procent van de veenhexen een poel heeft waar de code 10 procent bedoelt (nagemeten op de Holleveen: 4.915 veenhexen, poel 59, bult 12, petgat 7, wilg 5, ruïne 1, niets 16 procent); en de verborgen rug wordt nooit getekend, ook niet voor wie hem kent, omdat de kaartweergave het veld `hidden` niet leest.
- [x] De trekking per hex is gelijkmatig (een test meet de verdeling), het veen heeft ongeveer een poel op de tien hexen, en een oude save speelt door: gezien is gezien, ook waar de grond nu anders ligt
- [x] Wie de droge rug kent, ziet hem op de kaart als pad; wie hem niet kent, ziet veen

Ook in M10, de vier fouten uit de tests van de ontwikkelaarskit (27 september 2026), in de code bevestigd:
- [x] `talk to aaltje about the grey cat` werkt: `talk` splitst op about, over en naar zoals `ask`, en de quest gaat verder (nu leest de motor alles na "to" als naam)
- [x] `@who-knows` toont de korte naam in plaats van het eerste woord van de volledige naam (nu "the" voor de Haakman en "Black" en "Ouwe" voor bijnamen)
- [x] `@where` en de andere bouwcommando's vinden een NPC ook op id (nu alleen op naam, roepnaam, beroep of alias)
- [x] `npm run sim` meldt geen mens als vastgelopen die dat niet is: wezens zonder schema (de kat, de Haakman, de witte wieven) en wie ver weg is tellen niet mee, met dezelfde regel als de speeltest in de editor, en de exitcode is alleen 1 bij een echte fout
Ook in M10, uit de speeltest van 28 september 2026, in de code bevestigd: in mist gooide het spel bij elke stap een proef tegen 15, zodat een speler zonder Survival een plek in de mist niet haalde; en wie op de plek stond die de vertellers noemden, hoorde "You are already at" terwijl er niets te zien was.
- [x] In mist is er één Survival-proef per wandeling om je richting te houden; bij falen dwaal je binnen de eerste stappen één stap af en stop je (FO hoofdstuk 12), en een plek in de mist is door door te lopen te bereiken (een test)
- [x] Wie staat waar men zei dat een plek lag en een herkenningspunt ervan ziet, loopt erop af; ziet hij niets, dan zegt het spel dat, in plaats van dat hij er al is
- [ ] Een voorstelpagina toont palet, de geshade Holleveen, dag, nacht en mist, een lichte papierversie en de zwart-witoptie, en Bram keurt hem goed voordat er gebouwd wordt
- [ ] Elk terrein heeft drie tot vier gedempte tinten uit een geseede variatie per hex, drassige grond donkerder, droge ruggen lichter, water in twee tonen (open water en geul), wegen en paden in warm perkament
- [ ] Kenmerken (poel, petgat, wilg, ruïne, bult) hebben een eigen glyph en tint; wat je lang geleden zag is vager dan wat je pas zag; nacht en mist leggen een waas over het paneel
- [ ] Een hex heeft een niveau (onder de grond, maaiveld, kruin), wegen dragen hun niveau mee, en je ziet één niveau tegelijk met een glyph waar een trap, put, ladder of stam naar een ander niveau gaat; welke niveaus een wereld heeft en hoe ze heten staat in `world.yaml`
- [ ] Een tunnel of boomweg die je niet kent, staat niet op je kaart, ook al loop je erboven of eronder: dezelfde regel als de verborgen rug
- [ ] Een legendastrook onder de kaart met per terrein een gekleurd vakje, de glyph en de naam, en per plek een icoon naar soort en status; een klik licht dat terrein even op; dezelfde kleurtokens als de kaart
- [ ] De landkaart (streken en trajecten uit het wereldboek) is een eigen journaalpagina met dezelfde stijl
- [ ] Alles wat er al was, speelt hetzelfde, en de terminalclient houdt zijn tekstkaart

## M10.1 Onder de motorkap

Scope: een dev-menu in het spel zelf (besluit 27 september 2026), alleen in een ontwikkelbuild (`app.isPackaged` is uit, dezelfde vlag als de bouwmodus en de editor) en pas zichtbaar na een code in de invoerregel. Niet in de productiebuild. Wat de editor al toont in de speeltest (NPC-inspecteur, verhaallijnen met fase) hergebruikt het menu voor het lopende spel, zodat er één stel panelen is.

- [x] Het menu verschijnt met `@dev` (of een toetscombinatie) in een ontwikkelbuild en bestaat niet in een productiebuild: de code wordt niet meegebouwd, en `npm run build` plus de rooktest bewijzen dat
- [x] Mensen: per NPC behoeften, doelen, plan, voornemen, geloof, kennis en herinneringen van het lopende spel, live, met de waarde van elke slider (stand, band, houding, vertrouwdheid) en waar die vandaan komt
- [x] Achtergrond: de signaalwachtrij met wachters die vuurden, lopende plannen met hun stappen en voorwaarden (welke voorwaarde hield een stap tegen), de standaardnasleep die het overnam, en het grootboek per nederzetting
- [x] Kroniekschrijver: per run wat hij kreeg (feiten, kaarten), wat hij teruggaf, wat is geweigerd en waarom, en de verhaallijnen met fase en volgende beat
- [x] AI: het logboek van aanroepen met rol, model, tokens, cachedeel, kosten en reactietijd, en de prompt en het antwoord uitklapbaar
- [x] Knoppen om te sturen zonder te typen: een dag overslaan, een plan starten, spanning en markt zetten, een signaal afvuren, het budget zetten, en alles wat je zo doet komt als `@`-commando in het spellogboek zodat naspelen klopt
- [x] Het menu leest alleen; elke ingreep loopt via de motor en het logboek, en de speelstand verandert niet door het openen van het menu

## M10.2 Het verhaal- en afsprakenregister

Scope: besluit 27 september 2026, na een review van dezelfde dag; eerst dit, dan de gesprekken van M10.3 erop. Verhaallijnen die alleen door een afloop sluiten, een compacte registratie van wat sluimert, een archief dat gericht terug te halen is, en afspraken als gestructureerde registratie in één actielaag voor dialoog, brein en kroniekschrijver: aanbod, instemming waar nodig, vastgelegde afspraak of voornemen, uitvoering, uitkomst, gevolgen. Zie het ontwerp "Signalen en nasleep", "Het verhaal- en afsprakenregister". Raakt `storylines.ts`, `archive.ts` en `lookups.ts` uit M9.1 en M9.2 opnieuw.

Wat er nu mis is, in de code bevestigd: een verhaallijn sluit na veertien dagen zonder wijziging, ook met een open vraag (`storylines.ts`); het archief kijkt naar ouderdom, bekendheid en verwijzingen, maar niet naar open kwesties of status, en beschermt wat `follows` en `cause` aanwijzen bewust niet (`archive.ts`); de opzoekfuncties lezen alleen de actieve feiten en `archivedFact` is nergens aangesloten (`lookups.ts`, `gamelog.ts`). Bewaard blijven is daardoor nog niet hetzelfde als later weer invloed hebben.

- [x] Een verhaallijn is actief, sluimerend of afgerond; ze sluit alleen door een inhoudelijke afloop (een uitkomst, de fase closed van de kroniekschrijver, of geen open kwestie meer), nooit doordat een termijn verstrijkt; zonder verandering wordt ze sluimerend en houdt ze een compacte registratie: betrokkenen, open kwesties, oorzaken en voorwaarden voor hervatting
- [x] Een sluimerend verhaal (een familieruzie) wordt na honderd dagen door een passende gebeurtenis hervat (een terugkeer, een erfenis, een ontmoeting), met de oorspronkelijke oorzaak erbij, zonder dat er dagelijks een model voor draait
- [x] Archiveren is een aparte opslagkeuze: het weegt open kwesties en status mee, `follows` en `cause` beschermen wat ze aanwijzen, en wat naar het archief gaat is gericht terug te halen langs de opzoekfuncties (`archivedFact` sluit aan op de opzoekroute), binnen de kennisrechten van wie vraagt
- [x] Afspraken staan gestructureerd in het register: een vaste id, betrokkenen, wat, wanneer, voorwaarden, status (open, nagekomen, gemist, afgezegd, onmogelijk) en uitkomst; een aanbieding die doorgaat (M10.2), een voornemen na een gesprek en een belofte van de speler zijn alle drie zo'n afspraak, nooit alleen een memory_note of een verhaalsamenvatting
- [x] Per soort uitspraak legt de motor het juiste vast: voorgaan (wie, waar het personage die persoon denkt te vinden, bestemming, wachtgedrag, wat als zij er niet is), meegaan (duur of bestemming, vergoeding, grenzen aan gevaar, reden om te vertrekken), een boodschap (welke, aan wie, wanneer, onder welke voorwaarden; pas na bezorging weet de ander het), een aanval (een intentie met doelwit; het gevechtssysteem bepaalt bereik, reactie, treffen en gevolgen)
- [x] Wereldwaarheid, eigen kennis en verwachting blijven uit elkaar: "ik breng je naar haar huis" mag ook als moeder er nu niet is, en bluffen of liegen is een vastgelegde misleiding, geen toevallig verschil tussen tekst en gedrag
- [x] Een gemiste afspraak is geen verraad: de motor legt de feitelijke uitkomst vast (de brug weg, de NPC gewond, op tijd afgezegd) en het oordeel volgt uit wat de ander ervan weet
- [x] Een belofte vervalt niet stilzwijgend: een gespreksdoel vervalt na een dag, een aanvaarde afspraak voor volgende week overleeft opslaan, herstarten en archiveren
- [x] Onderbreking heeft een expliciete afloop: vluchten voor gevaar pauzeert, verlegt of beëindigt een begeleiding, en daarna staat vast of het personage terugkomt
- [x] Eén gekozen actie mag meerdere noodzakelijke gevolgen hebben (plan, dagboekaantekening, verwachting): de grens van één nawerking geldt voor het aantal keuzes per gesprek, niet voor wat een keuze vastlegt
- [x] Aanvallen is een eigen criterium: een gevalideerde aanvalsintentie gaat door het gevechtssysteem, en "geen dood" betekent dat een gesprek nooit rechtstreeks een dood voorschrijft
- [x] Zuinig: bij een gesprek haalt de motor eerst de relevante afspraken, banden en lijnen uit het register, alleen ontbrekende details komen gericht uit het archief, bewaken en vervaltermijnen en gevolgen lopen zonder AI, en bij een op budget voeren mensen hun afspraken uit langs de sjabloonroute

- [x] Een afspraak voor volgende week overleeft opslaan, herstarten en archiveren, en dezelfde afspraken en gevolgen werken zonder model en worden bij naspelen niet dubbel uitgevoerd
- [x] Alles wat er al was, speelt hetzelfde: het hele testpakket, de simulaties, de uitspeelscripts van beide werelden, en oude saves

## M10.3 Levende gesprekken

Scope: de speeltest van Skerrow en de reviews van 27 september 2026, op het register van M10.2. Het spel rekent vóór elke aanroep uit wat de NPC nu kan (aanbiedingen met besluit en redenen), de stem kiest hooguit één sleutel, de motor voert uit en legt de afspraak vast; daarna werkt een gesprek door in de tijd en in andere mensen, langs de validators en de werkwoordentabel van brein en kroniekschrijver. De AI stelt nooit een wereldverandering voor die de motor niet heeft bevestigd: het handelende deel van een antwoord hangt aan een gevalideerde keuze, en bij afwijzing herstelt de motor de tekst of gebruikt hij een sjabloon. Zie FO hoofdstuk 10, "Gepland (M10.3)".

Aanbiedingen in een gesprek:
- [x] Vraagt de speler Pip naar zijn vader, dan biedt het spel de stem "voorgaan naar het strand" en "wachten tot de vloed keert" aan met een besluit; kiest de stem er een, dan loopt Pip voorop, wacht bij de uitgang, zegt welke kant op als je verkeerd gaat, en geeft na een paar beurten op
- [x] Een NPC belooft in zijn tekst nooit iets wat niet in de aanbiedingen staat: het besluit staat in de prompt, en een voorstel van de NPC zelf ("kom mee naar het strand") verschijnt als klikbare optie die pas doorgaat als de speler instemt
- [x] Iemand halen, ergens afspreken op een tijd (met aantekening in het dagboek), hier wachten, iets geven uit eigen zak en een boodschap overbrengen zijn aanbiedingen met een eigen formule (houding, vertrouwen, werk en schema, gevaar, afstand, leeftijd), en de redenen staan in gewone woorden in de prompt
- [x] Voorwerpen via een gesprek in drie smaken, elk met een eigen besluit: geven (weinig waarde of over), lenen (de zaag, de sleutel van de schuur: de NPC blijft eigenaar, jij krijgt hem op een termijn, en dat is een afspraak in het register; niet terugbrengen is `broken_promise`, wel terugbrengen bouwt vertrouwen) en verkopen buiten de toonbank (uit een beurs); het besluit weegt houding, vertrouwen, of de NPC het ding zelf nodig heeft (het brein weet dat), waarde tegenover wat je voor hem deed, en karakter, en de stem noemt alleen voorwaarden die uit de formule komen. Toets: Wouter mist een zaag, je leent die van Harmen, brengt hem naar Wouter, en Harmen verwacht hem terug
- [x] Zonder model kiest de motor uit dezelfde aanbiedingen met sjabloonregels, zodat het spel zonder AI hetzelfde kan
- [x] Een aanbieding die doorgaat wordt een afspraak in het register van M10.2 (id, betrokkenen, wat, wanneer, voorwaarden, status, uitkomst), zodat M10.2 en M10.3 één systeem zijn; wie M10.2 bouwt, legt daarmee de eerste vorm van dat register
- [x] Wat een NPC uit zichzelf noemt en zelf kent (de Heights, Old Tamsin), komt in je dagboek als "van Pip gehoord" en op de kaart als zone; nu telt alleen wat in het kennispakket van je eigen vraag zat

Gesprekken die de wereld raken:
- [x] Wat de speler zegt wordt een bewering (onderwerp, sleutel, waarde, alleen uit de woordenschat van de wereld) die de NPC hoort "van de vreemde": hij gelooft, twijfelt of verwerpt naar vertrouwen en wat hij al weet, vraagt na bij een handelaar, en vertelt door. Vertel Mirte dat de molen weer draait terwijl dat niet zo is, en zij loopt voor niets naar Molenend; wie het navraagt, weet daarna wat jouw woord waard is
- [x] `Deceive` is echt liegen: een bewering die niet klopt, met de speler als bron; komt het uit, dan zakt het vertrouwen en gaat het rond
- [x] Een gesprek met een onderwerp van belang is een feit van belang 1 of 2 met getuigen ("de vreemde vroeg Pip naar zijn vader"), dat door het nieuws loopt; hooguit een paar per dag. Brannoc weet de volgende dag dat je naar hem vroeg
- [x] Na het gesprek doet de NPC zelf iets: de stem geeft één doel uit de catalogus met een doelwit terug, gecontroleerd met dezelfde validator als de keuzes van het brein, hooguit één per gesprek, vervalt na een dag, in het logboek voor naspelen. "Ik vertel het vanavond mijn vader" wordt `carry_word`; "ik ga kijken bij de dijk" wordt Investigate
- [x] Een afspraak van de NPC is een planstap met een tijd en een voorwaarde, en een belofte van de speler een verwachting bij de NPC (zoals `expect_home`); een wachter `broken_promise` laat vertrouwen zakken, zet een herinnering en een feit dat rondgaat, en een gehouden belofte doet het omgekeerde
- [x] Wie nieuws, een verzoek, dank of een grief over de speler heeft en binnen bereik is, zoekt de speler op (voornemen `seek_player` in de content, met Visit en Talk) en opent het gesprek met een regel die de stem verwoordt
- [x] Wat een NPC tekortkomt (brein, grootboek, open verzoek) wordt een aanbieding waarin hij de speler iets vraagt: halen, brengen, meelopen; de aanvaarding is een verzoek in het dagboek
- [x] De scène krijgt tijdsfeiten uit de schema's mee (Brannoc is om zes uur terug), zodat een afspraak klopt; een stemming uit een gesprek werkt een dag door (beledigd: geen dienst vandaag); een vakman kan leren tegen een prijs of een gunst (`teach`)
- [x] Reacties na een beurt: de motor beoordeelt wat de act (belediging, dreigement, een betrapte leugen) met houding en karakter oplevert: weglopen (het gesprek stopt en de NPC gaat echt weg), een dag geen dienst, hulp roepen, of aanvallen door dezelfde poort als bij een grief; de stem krijgt het als besluit en verwoordt het, en een belediging is een daad die doortelt in grieven en roddel
- [x] Een wachter `befriended`: wie een tijd Warm is en iets met de speler heeft gedeeld, wordt als band vriend, met anders groeten, eerder helpen en roddel over de vriend van de vreemde; flirten in vrije tekst loopt door dezelfde formule als het commando `flirt`
- [x] De grenzen: geen dood, geen geld uit het niets, hooguit één nawerking en een paar feiten per gesprek, alles in het logboek; zonder model kiezen de regels
- [x] De scène in één stuk speelt: je vraagt Pip naar zijn vader, hij loopt mee naar het strand, vertelt het 's avonds thuis, Brannoc zoekt je de volgende ochtend op, je belooft hem touw, en breng je dat niet, dan weet de Hythe het
- [x] Alles wat er al was, speelt hetzelfde: het hele testpakket, de simulaties, de uitspeelscripts van beide werelden, en oude saves

Eigendom en betrapt worden (besluit 27 september 2026; nu: eigendom afgeleid per object, huis en winkel, drie vormen van stelen met getuigen, boete en schout, teruggeven; geen sleutels, geen vragen als weg, een vaste regel bij betrapping, en overdag binnenlopen is geen vergrijp):
- [x] Eén eigenaarsfunctie: elk ding heeft een eigenaar (persoon, huishouden, nederzetting of niemand), afgeleid zoals nu maar op één plek, zodat pakken, gebruiken, verkopen en teruggeven dezelfde vraag stellen
- [x] Toegang als recht: een deur of kist kan een slot met een sleutel-id hebben (open met de sleutel, met `pick` uit M10.5, of met geweld en dus getuigen); wie je binnenlaat geeft toestemming met een grens, en binnen zijn zonder toestemming is het vergrijp `trespass` dat wie je ziet onthoudt
- [x] `take` van iets met een eigenaar in diens bijzijn vraagt: pakken (stelen, met proef) of vragen; vragen loopt via de aanbiedingen (geven, lenen op termijn, een wederdienst als afspraak in het register)
- [x] Betrapt: de motor beslist uit karakter, houding en wie er is (terugeisen, je pols grijpen via de gevechtspoort, schreeuwen zodat omstanders getuigen worden, iemand sturen om de schout te halen met het doel Report), en staat de wacht of de schout ernaast, dan grijpt die meteen in; de stem verwoordt het besluit in eigen woorden
- [x] Verdenking is geen bewijs: ongezien gestolen weet de eigenaar alleen dát er iets weg is; verdacht word je door sporen (binnen gezien, het ding verkocht aan iemand die het herkent, het openlijk gedragen); bewijs geeft een boete en een naam, verdenking alleen een kouder dorp
- [x] Herstel als standaardnasleep in de content: teruggeven, betalen of een wederdienst, waarbij teruggeven na betrapping minder goedmaakt dan uit jezelf

Scenario's die slagen vóór M10.3 af is (de eerste, derde en zesde al in M10.2):
- [x] Een sluimerend verhaal wordt na honderd dagen door een passende gebeurtenis hervat, met de oorspronkelijke oorzaak
- [x] Een begeleiding wordt onderbroken door gevaar en krijgt een begrijpelijke voortzetting of beëindiging
- [x] Een afspraak voor volgende week overleeft opslaan, herstarten en archiveren
- [x] Een onmogelijke belofte verschijnt niet als toegezegde actie in de tekst
- [x] Een aanval doorloopt werkelijk de gevechtsregels
- [x] Dezelfde afspraken en gevolgen werken zonder model en worden bij naspelen niet dubbel uitgevoerd

## M10.4 Kleine verbeteringen

Scope: de speeltest van Skerrow op 27 september 2026: commando's, interface en instellingen. Los van M10.2 en M10.3 te bouwen.

Commando's en interface:
- [x] `get all` pakt alles wat hier ligt en `get cask, sailcloth and rope` meerdere dingen; hetzelfde voor drop, buy en sell (nu werkt alleen `take all rope` voor één ding)
- [x] `look me`, `look at me` en `l me` geven een beschrijving van jezelf: uiterlijk uit de personage-aanmaak, wat je draagt, en hoe je eraan toe bent (gewond, moe, doorweekt), ook in het personageblad
- [x] `look south` en `look at tidepools` geven de korte omschrijving van wat die kant op ligt en de weg erheen; een plek die in de beschrijving oplicht, is dus altijd te bekijken
- [x] `look <ding>` zegt waar het is ("in your pack") en kijkt ook naar objecten hier: `look apple` bij de hondensteen beschrijft de appel op de steen, niet de appel in je zak; `get` op iets wat bij een object hoort (een offer op de steen) geeft een zinnige regel uit de content in plaats van "er is geen appel hier"
- [x] Rechtermuisknop op een opgelicht woord opent een klein menu (bekijken, vragen, waar is, ga naar); linkermuisknop opent de dagboekpagina als je die kent, en anders bekijken als het iets hier is (nu: in een gesprek altijd "ask about", daarbuiten de dagboekpagina of het invoerveld)
- [x] Het gespreksvenster houdt de focus (Escape sluit), en het antwoord verschijnt waar je typte; eindigt het gesprek, dan blijft het laatste antwoord in beeld met een regel dat het gesprek voorbij is
- [x] Familie op een personagekaart staat er pas als je het gehoord of gezien hebt (gevraagd, verteld, of kind naast ouder), anders "familie: onbekend"; nu is elke niet-privéband dorpskennis zodra je iemand hebt ontmoet
- [x] De melding "The world was changed in the editor" noemt het bestand en zegt "op schijf gewijzigd"; ze komt van de bestandswachter en niet van je eigen spel
- [x] Rechtsonder een rij lampjes per AI-rol (stem, brein, kroniekschrijver, illustrator, bouwer) die groen oplichten tijdens een aanroep, met de laatste kosten en tijd bij aanwijzen; nu is er één "AI busy"
- [x] In een ontwikkelbuild opent een menu-item of knop de editor vanuit het spel; nu alleen `npm run editor` of `--editor`
- [x] Een tab Transcript in de instellingen: aan of uit, en een map. Staat hij aan, dan schrijft het spel alles wat je op het scherm ziet (jouw invoer als `> ...`, spraak als citaat, systeemregels cursief, een kop per speeldag en per plek) als Markdown naar `<wereld>-<spel>-<datum>.md`, één bestand per spel en per echte dag, alleen bijschrijvend
- [x] Het transcript vertraagt het spel niet: de regels gaan gebufferd en asynchroon naar schijf via de schrijver van het spellogboek, met een flush aan het eind van elke beurt; boven een paar megabyte gaat het verder in een vervolgbestand (`-2.md`), en een fout bij het schrijven zet het transcript uit met één melding
- [x] Alles wat er al was, speelt hetzelfde: het hele testpakket, de simulaties, de uitspeelscripts van beide werelden, en oude saves

## M10.5 Ambacht en vaardigheid

Scope: besluit 27 september 2026, na een analyse van levelen, ervaring en vaardigheden (FO hoofdstuk 11) en een review van dezelfde dag. Wat er is, blijft: tien levels van duizend ervaring, dertien vaardigheden met vier rangen, punten en oefenstreepjes, talenten. Nu: één vaardigheid Crafting voor alles, de speler mag bijna niets maken (de oven is alleen voor NPC's), Thievery kent geen sloten, Medicine geen behandeling, Survival geen verzamelen, en niemand wordt beter door alleen te doen. In twee afzonderlijk speelbare delen: eerst ambachten en handelingen, daarna de kroniekschrijver. Zonder model mag het vaardigheidsspel niet armer zijn: beide werelden hebben genoeg vaste toepassingen in de content, een regelgestuurde keuze uit dezelfde sjablonen zorgt voor variatie, en de AI verfijnt alleen de aansluiting op verhalen. De speeltestvraag die telt: kiest iemand uit zichzelf voor een ambacht omdat het mogelijkheden en contacten oplevert, ook als de ervaringsbeloning klein is?

A. Ambachten en handelingen (eerst twee ambachten helemaal: leren, werkplaats, materiaal, onderbreking, resultaat, erkenning):
- [x] Ambachten zijn content: per werkplaats en beroep uit het grootboek (bakker, molenaar, turfsteker, palingvisser, kuiper, steenbakker, smid) een ambacht met vier rangen, en elk recept op een object noemt zijn ambacht, moeilijkheid en techniek; `USE OVEN BAKE` is een proef op bakken, met brood en oefening bij succes en verloren meel bij een misser; de dertien vaardigheden blijven wat ze zijn en een ambacht leunt op één ervan voor de start
- [x] Een ambacht groeit door te doen en te leren, niet door punten, en meesterschap vraagt meer dan tellen: routinewerk leert de basis en levert daarna steeds minder oefening op (alleen recepten die je nog niet beheerst of die moeilijker zijn dan je rang tellen); expert vraagt verschillende technieken of moeilijker recepten; meester vraagt één betekenisvol werkstuk of een moeilijke opdracht; een serieuze mislukking is ook een les. Tien, dertig en honderd geslaagde proeven zijn alleen eerste balanswaarden, met een grens per dag; routinewerk blijft nuttig voor inkomen en bevoorrading
- [x] Leermeesters: de band "teaching" krijgt betekenis; een dag leren bij een vakman die je vertrouwt (aanbieding `teach` uit M10.3, tegen geld of een gunst) telt als oefening in technieken die je nog niet kent, en gaat sneller dan het zelf uitvogelen
- [x] Effectvaardigheden krijgen een handeling: `pick` op een slot (Thievery; sloten met een sleutel-id op deuren en kisten, uit M10.3), `treat <persoon>` bij ziekte en wonden (Medicine), verzamelen op de kaart uit de hulpbronnen per zone en sporen lezen (Survival), een oud opschrift lezen (Lore), iets verborgens vinden op een plek (Perception); elk met een proef, oefening en waar het past ervaring, en met genoeg vaste toepassingen in de content van beide werelden
- [x] De moeilijkheid hoort bij de wereld, niet bij de speler: een slot volgt materiaal, vakwerk en omstandigheden, een recept zijn ingrediënten en techniek; een eenvoudig slot blijft eenvoudig voor een ervaren schelm en een koopmanskist moeilijk voor een beginner
- [x] Een rang levert meer op dan de bonus: een hogere rang opent recepten (het feestbrood voor de meesterbakker), betere prijzen voor eigen werk, en een reputatie in het dorp die een signaal is voor het brein
- [x] Busy Hands werkt: de zegening die op ambachtswerk voor de speler wachtte sinds M7.2

B. De kroniekschrijver (eerst bestaande kansen, dan één soort nieuw object):
- [ ] De kroniekschrijver krijgt een kaart van de speler in zijn overzicht: klasse, vaardigheden met een rang van getraind of hoger, en ambachten; geen getallen
- [ ] Hij maakt eerst bestaande kansen zichtbaar: hij zoekt een situatie die er al is waarin een vaardigheid telt (een zieke die er ligt, een kist die er staat, een pad dat verzakt is) en maakt die zichtbaar via een aanwijzing, een gesprek of een verzoek; niet elke situatie past bij de sterke kanten van de speler, want wat je niet zelf kunt geeft gezellen, leermeesters en dorpsbewoners betekenis
- [ ] Pas daarna, en alleen als het past bij plek, eigenaar en voorgeschiedenis, plaatst hij met `place_prop` één soort nieuw object uit een sjabloon in de content (eerst de gesloten kist; later een opschrift, een verzakt pad, een zwijgende wacht, een nis): de motor zet het neer met een eigenaar, en de moeilijkheid volgt het object
- [ ] Elke weg naar de inhoud heeft een eigen voordeel en gevolg, en wordt een afspraak in het register van M10.2: zelf het slot openen is stil maar riskant, een smid inschakelen is betrouwbaar maar dan weet een ander ervan, de eigenaar overtuigen geeft toestemming en uitleg maar je moet iets terugdoen; een vaardigheid geeft vrijheid zonder de andere wegen overbodig te maken
- [ ] Een geplaatst object is blijvende wereld, in het register van M10.2: vaste id, eigenaar, inhoud, plek, toestand (dicht, open, beschadigd) en verhaallijn; het overleeft sluimeren en archiveren; verhuist of sterft de eigenaar, dan gaat het mee of vererft het; hints kunnen achterhaald raken als de wereld verandert, en dan zegt het dagboek wat toen waar was
- [ ] Hints zijn feiten van die verhaallijn in de woorden van de eigenaar, nooit vrije tekst; inhoud komt uit bestaande voorraad of een begrensde generatieregel per sjabloon, geld uit de beurs van de eigenaar of de nederzetting; eruit nemen is diefstal langs het systeem dat er al is
- [ ] De eigenaar ontdekt een verlies door zijn eigen gedrag (hij pakt de kist op zijn vaste moment) of een controle, en weet dan alleen dát er iets weg is; wie het deed weet hij alleen door getuigen of sporen
- [ ] Een prop staat nooit op het kritieke pad van een quest, hooguit één per verhaallijn en een paar per speelweek; zonder model kiest de motor met regels uit dezelfde sjablonen en bestaande kansen
- [ ] De toets: in een lopende verhaallijn wijst de kroniekschrijver op de kist van Lubbert met zijn dagboek; een schelm opent hem stil, een boer haalt de smid erbij, een prater krijgt toestemming en meer uitleg; de hints kloppen met wat er gebeurde; Lubbert merkt op zijn vaste moment dat er iets weg is en weet pas wie het was als iemand het zag
- [ ] Alles wat er al was, speelt hetzelfde: het hele testpakket, de simulaties, de uitspeelscripts van beide werelden, en oude saves

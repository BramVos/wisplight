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
- [ ] Een groep naamlozen (vluchtelingen, werkers aan de muur) krijgt pas een naam en een kaart als de speler iemand aanspreekt, en kost tot dan geen simulatie per persoon
- [x] De speler kan een lading vervoeren van de ene nederzetting naar de andere voor loon, met tol en roof als risico onderweg
- [ ] Staat de muur van Waagdam, dan vraagt de burgemeester de graaf om stadsrechten; een rangwissel is een plan waarin de graaf beslist, en de wereld merkt het verschil
- [ ] Een plek die door een project ontstond, is met [Adopt] in de content over te nemen met hetzelfde id, net als een nieuwkomer
- [x] Ieder mens heeft een geloof uit de content van de wereld, en wrijving met nieuwkomers weegt verschil in geloof mee
- [x] Een groep vóór nieuwkomers ontstaat ook zonder AI, als standaardnasleep in de content, naast de groep tegen
- [ ] Een nieuw spel kan de wereld van een oud spel als legende meenemen, zonder namen van mensen die nog leven
- [ ] Skerrow heeft een eigen regelset en is met personage en gevecht te spelen
- [ ] Alles wat er al was, speelt hetzelfde: het hele testpakket, de simulaties, de uitspeelscripts van beide werelden, en oude saves

## M9.2 Waarheid en samenhang

Scope: de review van 27 september 2026 op de kroniekschrijver en de verhaalopbouw (na M8.5). De kroniekschrijver mag niets beweren dat niet uit een feit volgt; vrije planstappen dragen dezelfde voorwaarden als vaste; wat tijdens een aanroep gebeurt, gaat niet verloren; oorzaak en gevolg staan op feiten en lijnen. Kleine ingrepen in `chronicler.ts`, `planning.ts`, `quests/verbs.ts` en `storylines.ts`, elk met een test die het scenario van de review naspeelt. Vastgelegd na M9.1 omdat M9.1 al in aanbouw was.

- [ ] Lore noemt geen levende als dood, geen ander huis dan het echte en geen bezit dat iemand niet heeft: een regelfilter op toetsbare uitspraken (dood, plaats, bezit, betrokkenen) tegen de wereldtoestand; "Gerrit is dead" bij een levende Gerrit valt terug op het sjabloon
- [ ] De kroniekschrijver levert zijn beweringen ook als structuur (onderwerp, sleutel, waarde), elk terug te voeren op een feit van de lijn; anders wordt het lore-item niet opgeslagen
- [ ] Bij belang 4 of hoger beoordeelt een kleine tweede aanroep of de tekst iets zegt wat niet in de feiten staat; in de tests met de mock
- [ ] Elk werkwoord heeft standaardvoorwaarden (`return`: weet dat het gevaar voorbij is, gelooft dat het huis staat, de plek is veilig) die gelden voor content, brein en kroniekschrijver; content mag ze bewust overschrijven, een model niet, en ze worden bij uitvoering opnieuw gecontroleerd
- [ ] Een run legt vast welke feiten hij aanbood; alleen die worden na afloop als verwerkt gemarkeerd, en een feit dat tijdens de aanroep ontstond wacht op de volgende run (test: A aangeboden, B intussen, B blijft onverwerkt)
- [ ] De namencontrole bij het verwerken kijkt naar de invoer die het model zag, niet naar de wereld van dat moment
- [ ] Feiten dragen hun oorzaak (`cause`) en lijnen hun voorganger (`follows`); een lijn die na twaalf feiten splitst, draagt samenvatting, open vragen en oorzaak over, en de kroniekschrijver ziet oorlog, route dicht, tekort, onrust, vertrek als één boog
- [ ] Alles wat er al was, speelt hetzelfde: het hele testpakket, de simulaties, de uitspeelscripts van beide werelden, en oude saves

## M9.3 Maat: geschiedenis, opslag, prompts en kosten

Scope: de review van 27 september 2026 op prestaties en kosten (na M8.5), in deze volgorde: kostenregister, contextselectie, feiten indexeren, checkpoints, modellen vergelijken. Het archief voor oude feiten en "300 dagen even snel" zitten al in M9.1; hier komen de indexen, het opslagpatroon, de prompts en de kosten. Niet meegenomen, met reden: SQLite (de motor is headless en draait ook in de browser, een native module bemoeilijkt de installers, en het spellogboek is al append-only en geïndexeerd; de drie lagen en de indexen komen er wel, in geheugen en in het archief); een eigen proces voor de motor (pas als de meting na de andere stappen nog haperingen laat zien); semantisch zoeken (exacte ids en onderwerpen volstaan, lore is kort); de rolverdeling van modellen (dat is al de opzet sinds M8.2: de motor bepaalt wat kan, het model kiest en formuleert).

- [ ] Het uurbudget telt alle aanroepen van het laatste uur, ook na een herstart: een duurzaam kostenregister in plaats van de laatste 200 logregels (test: 250 aanroepen van 0,01 tellen als 2,50)
- [ ] Vóór verzending reserveert de gateway een geschatte bovengrens en verrekent daarna het werkelijke verbruik, zodat gelijktijdige aanvragen niet samen over het budget gaan
- [ ] Een onbekend tarief is een eigen status: tokens geteld, automatische besteding begrensd, zichtbaar in de instellingen
- [ ] Cachewrites worden apart geteld en apart geprijsd, en het spel meet per rol hoeveel van een prompt werkelijk uit de cache kwam
- [ ] Het brein krijgt niet alles wat iemand kent, maar wat bij het signaal hoort: karakter, het probleem, de eigen middelen, de haalbare opties en alleen de bijbehorende mensen en plekken; de stem krijgt alleen de bekenden die bij het gesprek horen (test: met duizend bekenden groeit de prompt niet mee)
- [ ] Het model kan begrensd bijvragen: wat iemand over een onderwerp weet, de oorzaken en open vragen van een lijn, de band tussen twee mensen, recente gebeurtenissen rond een plek; elke functie begrenst kennisrecht, tijd, aantal en omvang, en een NPC wordt er niet alwetend van
- [ ] Een verhaalbewerking heeft een totaalbudget over al haar opzoekrondes, naast de grens per aanroep
- [ ] Feiten, mensen, plekken, onderwerpen en open lijnen hebben een index; `factById` en de nieuwsverspreiding zoeken niet meer lineair (test: honderdduizend feiten, opzoeken in constante tijd)
- [ ] De simulatie kiest werk voordat ze mensen doorloopt: een index van mensen per plek, een wachtrij met het volgende moment per persoon en plan, begrensde en geseede gesprekscontacten, en verspreiding per gebied voor wie ver weg is; naspelen geeft dezelfde wereld
- [ ] Opslaan kopieert niet meer twee keer: een save is een checkpoint plus de gebeurtenissen sindsdien, met contentversie, seed, modelantwoorden en vertakkingen, en naspelen blijft exact
- [ ] De interface hapert niet bij een autosave, een reis of een dagwissel (gemeten); pas als dat na de andere stappen nog zo is, draait de motor in een eigen proces
- [ ] De modelproef beoordeelt op kosten per bruikbaar, gevalideerd antwoord (inclusief herhalingen en terugval), kennislekken, feitelijke fouten, karaktervastheid en reactietijd, en het advies kiest daarop
- [ ] Alles wat er al was, speelt hetzelfde: het hele testpakket, de simulaties, de uitspeelscripts van beide werelden, en oude saves

## M9.4 Afwerking en release

Scope: FO 18. Balans, toegankelijkheid, prestaties, installers voor Mac en Windows. Tot 27 september 2026 was dit M9, daarna kort M9.2.

- [ ] Een speeltestprotocol per verhaallijn: kon de speler het probleem herkennen, er invloed op uitoefenen en de afloop begrijpen; drie lijnen per wereld getest, met de uitkomst in de changelog

- [ ] Alle niet-functionele eisen uit FO 18 zijn gemeten en gehaald
- [ ] Installers voor Mac en Windows werken op een schone machine

# Ontwerpersreview van een gespeeld spel

Stand van 30 september 2026, na M10.30. Gespeeld als functioneel ontwerper, niet als ontwikkelaar: een ontwikkelaar kijkt tegelijk naar de code. Waar ik een bestand noem, is dat om te wijzen, niet om voor te schrijven.

**Hoe gespeeld.** De interface in de browser (`npm run web` met `?mock=1`, dus met het oefenmodel: de regels zijn dan stoplappen en ik beoordeel de bouw, niet het proza), op 1400×900 en op 1000×700, in The Quiet Reach (Brams wereld van 29 september) en in de Nethermarch: begin, rondkijken, twee gesprekken, kopen, lezen, zoeken, het dagboek, het plan en de kaart. Daarnaast de terminalclient in de Nethermarch, Brams eigen speellog van 29 september en de stemtranscripten in `docs/playtest/`.

## 1. Oordeel in het kort

De botten staan goed: het gesprekvenster, het dagboek met tabbladen, de kaart, het plan, de kaartjes bij een moment en de statusbalk zijn de juiste onderdelen op de juiste plek. Wat ontbreekt is **geleiding**: de eerste tien minuten laten de speler raden wat hij kan typen en waarom. En de **vensterlaag is niet waterdicht**: schermen liggen over elkaar en de commandobalk werkt door terwijl een scherm open staat.

Drie dingen eerst:

1. **Vensters modaal maken** (R1, R2): één stapel, de commandobalk uit zolang een venster open is, Esc sluit alleen het bovenste, en een scherm dat af moet (personage, raamwerk) heeft één hoofdknop die Enter neemt.
2. **De eerste tien minuten** (S1, S2, U9): het doel op het scherm in plaats van in het dagboek, en na elk antwoord drie voorgestelde vervolgstappen uit de motor.
3. **Het gesprek** (U3, S3): de persoon begint met wat hij zelf wil, de keuzelijst toont alleen wat van toepassing is, en vragen en zetten worden uit elkaar gehaald.

Alles hieronder is klein tot middelgroot werk. Niets vraagt een herbouw.

## 2. Robuustheid

**R1. Schermen zijn niet modaal.** In de Nethermarch-run lagen het personagescherm en het raamwerkscherm over elkaar, en `look`, `n`, `talk mirte` en `buy bread` werden er gewoon achter uitgevoerd; het gesprekvenster opende bovenop het personagescherm. Enter in de commandobalk sluit het raamwerkscherm niet. Esc sloot in mijn runs geen van beide, hoewel er in de code een Esc-afhandeling voor het raamwerk staat (`FramesView.tsx`): vermoedelijk vangt een ander venster de toets. De commandobalk is niet uitgeschakeld als er een venster open is, alleen niet gefocust (`App.tsx`, `covered`).
*Voorstel:* één vensterstapel in de app. De commandobalk grijs met de tekst "sluit eerst het venster" zolang de stapel niet leeg is. Esc sluit het bovenste venster, nooit meer dan één. Een scherm dat af moet (personage bij een nieuw spel, raamwerk bij de eerste start) zegt dat en heeft één gefocuste hoofdknop, zodat Enter Play is. Een kaartje verschijnt nooit boven een gesprek: het wacht tot het gesprek dicht is. Omvang: M.

**R2. Twee volle schermen voor de eerste regel.** Een nieuw spel geeft eerst het personagescherm (klasse, afkomst, achtergrond, eigenschappen, vaardigheden) en dan het raamwerkscherm (grote lijnen, vier keuzes over de wereld, snelheid, speelwijze, kosten). Beide zijn goed, maar samen zijn ze voor een nieuwe speler te veel, en het raamwerk staat al in Instellingen.
*Voorstel:* bij een nieuw spel alleen het personagescherm, met onderaan één regel "De wereld draait op normaal, in speelwijze Play on: [aanpassen]" die het raamwerk uitklapt. Het raamwerkscherm zelf komt alleen op verzoek. Omvang: S.

**R3. Genummerde keuzes die een woord nodig hebben.** In de log staan de acht gespreksopties op omlopende regels ("4 What do you know about ... 5 Where can I find ..."). Wie `4` typt, krijgt niets: alleen een klik in het venster zet "ask about " in de balk. `1` of `2` buiten een keuze geeft netjes "There is nothing to choose from just now."
*Voorstel:* een genummerde keuze die een onderwerp nodig heeft, vraagt erom: `4` geeft "Waarover?" met de onderwerpen die de speler kent, `5` "Wie of wat?" met de namen die hij heeft gehoord. In de app de genummerde regel uit de log laten (de chips in het venster zijn er al); in de terminal blijft hij. Omvang: S.

**R4. Zonder model belooft het gesprek meer dan het kan.** Het raamwerkscherm zegt "No model is connected", maar het gesprekvenster nodigt uit tot vrij typen ("Type what you want to say") en antwoordt dan met een stoplap ("Mm. That so?").
*Voorstel:* zonder model het vrije tekstvak grijs met "verbind een model in Settings > AI om vrij te praten"; de genummerde vragen blijven. Omvang: S.

**R5. Een geslaagde worp die niets vindt.** `search` in de luisterkamer gaf "(Perception 15 vs DC 15: success)" en daarna "You search again, but there is nothing more to find here."
*Voorstel:* geen worp als er niets verborgen meer is: "Je hebt hier al gezocht." De worpregel tussen haakjes alleen tonen als de speler dat in Instellingen aanzet (hij is nuttig voor Bram, storend voor een speler). Omvang: S.

**R6. Uit het spel gegooid.** Bram meldt dat de app hem geregeld uit het spel gooit. De laatste regels komen sinds M10.29 S terug bij hervatten, maar de speler ziet niet dat er iets is hersteld.
*Voorstel:* na een onverwachte herstart één regel bovenaan de log: "Het spel is hersteld tot Dinsdag 14 Herfstmaand, 18:34." En één zichtbare afspraak: elke opdracht is opgeslagen zodra het antwoord op het scherm staat. Of dat nu al zo is, moet de ontwikkelaar bevestigen. Omvang: S.

**R7. Namen die de speler wel kent, maar de motor niet.** `go inn` geeft "Go where? Try a direction such as north, or the name of a place you can see" terwijl de beschrijving de herberg net noemde; `recall haakman` geeft bij de start "You know nothing of that" terwijl de achtergrondtekst de Haakman noemt. Het eerste is M10.31 D; het tweede staat bij S1. Omvang: in die punten.

## 3. UI en UX

**U1. De zijbalk doet te veel.** Datum en weer, plaatje, reiziger, plan, kaart, gezelschap, dagboek en dan tien knoppen in drie rijen (Continue, New game, Load, Export, Settings, Look back, Export log, Chronicle, What you found out, Editor). Bestandsfuncties, speelfuncties en ontwikkelfuncties staan door elkaar.
*Voorstel:* een menuknop (≡ of "Menu") met Continue, New game, Load, Export, Export log en Settings; in de zijbalk blijven Journal, Chronicle en Look back; Editor en What you found out achter het menu onder "Voor de bouwer". Omvang: S.

**U2. Kaartjes onderbreken te vaak.** Bij aankomst op elke plek, ook binnen een dorp, komt een kaartje met een grote letter als plaatje en [Go on].
*Voorstel:* een kaartje alleen bij de eerste aankomst in een nederzetting en bij een moment dat ertoe doet (een signaal, nieuws van de nacht, een einde). Een plek binnen een nederzetting krijgt een regel in de log met de naam vet. Zonder plaatje geen grote letter maar een kleine tekening of alleen de titel; met een regel "nog geen plaatje" als de speler plaatjes aan heeft. Omvang: S.

**U3. Het gesprekvenster: vragen, zetten en het paneel.** De optierij mengt vragen ("Who are you? What's new? Your work? Can you help me?") met "Come with me?" en "Trade", die voor een seintechnicus of een bakker zonder waar niet gelden, en daarna "or try: persuade deceive intimidate bribe insight", wat als commando's leest maar zetten zijn die een onderwerp vragen. In het paneel staat "Work ?" bij Mirte, terwijl de kop "Mirte the baker" zegt. De plekkenlijst herhaalt "where? < 1 km" acht keer.
*Voorstel:* twee rijen chips: vragen en zetten, elk met een korte hulptekst bij zweven ("een zet: probeer haar te overtuigen van ..."). "Trade" alleen bij iemand met een winkel of waar, "Come with me?" alleen bij iemand die mee kan. Het beroep in het paneel volgt de kop zodra het bekend is. Afstand één keer per groep, of alleen bij zweven. De stemming laat zien wanneer hij verandert (een kleine pijl bij "Neutral → Warm"). Omvang: S.

**U4. Het dagboek.** De tabbladen (All, Quests, People, Places, Events, Lore, You), de questpagina met "Now: ..." en de persoonspagina met About en History (M10.29 R) zijn goed. Wat ontbreekt: op de questpagina de nederzetting en wie erbij hoort; in de zijbalk "19 entries" zegt niets.
*Voorstel:* de questpagina toont plek, betrokkenen en de stadia die af zijn; de zijbalk toont "2 nieuw" in plaats van het totaal, en de open quest met zijn "Now"-regel (nu alleen de titel). Omvang: S.

**U5. De statusbalk.** "Orison Listening Room | Primeday 18 Rainfall 186 CR, 09:00 (morning) | 120 cr | time paused" en rechts "AI $0.0028 73% of month left" en vijf bolletjes zonder naam.
*Voorstel:* "time paused" zegt waarom ("tijd stil: venster open"); de bolletjes krijgen een tooltip (gezondheid? vermoeidheid?) of worden een woord; het AI-bedrag toont bij zweven de uurprijs en de rest van het budget. Omvang: S.

**U6. Het plan van hier.** Wordt een venster met scrollen in M10.31 A.
*Aanvulling:* een klik op een plek in het plan is "ga erheen" als hij aangrenzend is en anders "where is". Omvang: in M10.31 A.

**U7. Smal venster.** Op 1000×700 verdwijnt de zijbalk en vult het raamwerkscherm de breedte; dat werkt, maar de commandobalk zit onder het scherm. Met R1 is dat geen probleem meer. Omvang: in R1.

**U8. Voorgestelde vervolgstappen.** Dit is de grootste enkele verbetering voor een nieuwe speler. Na elk antwoord staan onder de commandobalk drie chips uit de motor met wat hier kan: `talk mirte`, `go east`, `read logs`, `buy bread`. Ze komen uit wat de plek biedt (mensen, uitgangen, voorwerpen met werkwoorden, waar te koop) en uit de open quest ("ask niko about the listening station"). Een klik typt ze in de balk; de speler blijft vrij. In de terminal komt dezelfde regel als "You could: ...". Omvang: M.

**U9. Het personagescherm.** Goed en compleet, maar de vier eigenschappen met [-] en [+] en de vinkjes staan onderaan buiten beeld op 900 pixels hoog, en een nieuwe speler weet niet wat "3 of 3 boosts" betekent.
*Voorstel:* de knop "Play the ready-made traveller" bovenaan groter en als hoofdknop; de rest onder "Or make your own". Omvang: S.

## 4. Spelbeleving

**S1. Het doel staat in het dagboek, niet op het scherm.** De Nethermarch begint met de schuit, "Type LOOK to look around", "You were told to ask for ... is in your journal" en "Why you are here is in your journal". Wie `recall haakman` typt, weet niets, terwijl zijn eigen achtergrond de Haakman noemt.
*Voorstel:* het eerste kaartje eindigt met het doel in één zin en de eerste stap ("Zoek Wouter bij de Drowned Goose"); de zijbalk toont vanaf de eerste minuut "Now: ..."; alles wat de achtergrondtekst noemt (namen, plekken, de Haakman) staat vanaf minuut één als lore in het dagboek. Omvang: S.

**S2. Een nieuwe wereld begint leeg.** In The Quiet Reach was er bij de start geen quest en een kaart met één plek; het aankomstkaartje gaf een plek maar geen richting. M10.30 lost de quests op.
*Aanvulling:* het aankomstkaartje van de eerste nederzetting eindigt met één haakje uit het regioverhaal ("Men zegt dat de zender op de rug al weken hetzelfde herhaalt."). Omvang: S, in M10.30 als de zichtbare opdracht.

**S3. De persoon wil zelf niets.** Een gesprek begint met "Niko nods. 'Morning.'" en dan acht vragen van de speler. De speler vraagt, de persoon vraagt nooit. Het aanbod-mechanisme bestaat (`dialogue/offers.ts`), maar staat achter de vragen.
*Voorstel:* iemand met een haakje, een open quest of een verzoek opent daar één keer zelf mee, direct na de groet ("Nu je er toch bent: ..."), met een chip "Vertel". Wie niets heeft, laat het bij de groet. Omvang: S.

**S4. Reden om te bewegen.** Met vier seconden per minuut is het tempo goed, en tijdens een venster staat de tijd stil. Maar de speler heeft geen reden om te wachten of te vertrekken: hij ziet niet wat er straks verandert.
*Voorstel:* de klok in de zijbalk toont wat het eerstvolgende is uit de roosters: "markt om 9", "Mirte sluit om 18", "de schuit vertrekt om 7". Omvang: M.

**S5. Gevolgen zichtbaar maken.** "+10 experience: you found Veenhoek, the Green" staat als gedempte regel in de log; geld verandert stil in de statusbalk, een quest die vordert staat alleen in het dagboek, een stemming die omslaat zie je niet.
*Voorstel:* één stijl van gedempte "boekhoudregels" voor alles wat verandert: munten, ervaring, quest-stadium, stemming, reputatie, iets in het dagboek. Kort, altijd dezelfde vorm, uit te zetten in Instellingen. Omvang: S.

**S6. Lezen en zoeken lonen niet zichtbaar.** `read logs` geeft een mooie alinea, maar niets gaat het dagboek in; `search` slaagt en vindt niets.
*Voorstel:* een lezing die een feit draagt, geeft een boekhoudregel "Genoteerd: ..." en een dagboekregel (M10.28 doet dit voor een quest via de leesscore; trek het door naar lore). Omvang: S.

**S7. Doodlopende plekken.** Een kamer met "Exits: down", één persoon en na twee vragen niets meer.
*Voorstel:* de controle "oplosbaar" van M10.30 telt ook of elke plek in een verhaalregio ten minste één ding te doen heeft (een werkwoord, iets te lezen, iemand die iets wil). Omvang: in M10.30.

**S8. Herhaalde gebaren.** In de transcripten en in Brams log komen "looks up", "nods" en "lifts a hand" vaak terug, ook bij het echte model.
*Voorstel:* de speeltest meet gebaren per gesprek en de stem krijgt de laatste drie gebaren mee als "niet opnieuw". Omvang: S.

**S9. De grote lijnen zijn onzichtbaar.** Het raamwerk noemt "the great flood" en "the peat-cutters' unrest", maar in het spel ziet de speler ze nergens.
*Voorstel:* het tabblad You van het dagboek krijgt een regel per grote lijn met zijn stand ("De onrust onder de turfstekers: kalm") en wat de speler ervan heeft gehoord. Omvang: S.

## 5. Voorgestelde volgorde

Twee mijlpalen, na M10.31:

- **M10.32 "Speelbaar zonder handleiding"**: R1, R2, U8, S1, S3, U3, R3, R4, U9. Dit is wat een nieuwe speler in de eerste tien minuten merkt.
- **M10.33 "Afwerking"**: U1, U2, U4, U5, S5, S6, S9, R5, R6, S8.
- **Later of bij een andere mijlpaal**: S4 (roosterklok), U6 (in M10.31 A), S2 en S7 (in M10.30).

Wat Bram kiest, komt als criteria in `docs/ROADMAP.md`; niets hiervan is al opgenomen.

## 6. Reactie op de twintig voorstellen van de bouwer

De bouwsessie schreef op dezelfde dag "Voorstellen na een speelronde" (Claude Docs, twintig voorstellen met bewijs uit Brams spel van 29 en 30 september). De overlap met dit verslag is groot: vensters die niet sluiten (#11 en R1), het begin in één keer (#6 en R2), het doel in beeld (#2, #13 en S1), de gever die zegt wat hij wil (#14 en S3), dingen uit een beschrijving die er zijn (#16 en S7), niets kwijt bij herladen (#10 en R6), het smalle venster (#15 en U7).

**Brams vraag: wat had de wereldmaker moeten voorkomen?** Dat vraagt aanwijzingen in de wereldgids, CHRONICLER.md of de stapregels, en geen motorwerk. Mijn sortering, tegen het ontwerp gehouden:

| # | Voorstel | Wereldmaker of motor | Waarom |
|---|---|---|---|
| 16 | Dingen uit een beschrijving zijn er | **Wereldmaker.** | De controle "Named, but no detail" bestaat al (`builder.ts`) en de stap Test in de wereldgids eist dat hij leeg is. De stap Plekken en het contract van de schrijfhulp krijgen de regel: een zelfstandig naamwoord waar een speler naar kan kijken of aan kan zitten, krijgt een detail of blijft uit de tekst. Voor The Quiet Reach: afwerken wat de controle noemt. |
| 7 | Bij aankomst is er iemand | **Wereldmaker, met een controle.** | Roosters zijn content. De stap Mensen zegt: de ontmoetingsplek van elke nederzetting heeft op elk uur iemand, en op het startuur is er iemand op de startplek; de controle meldt het als dat niet zo is. Mensen het eerste uur vastzetten in de motor is een lapmiddel dat de wereld onecht maakt. De stap Verhalen mag de gever van de hoofdlijn bij de aankomst zetten. |
| 17 | Geen verzonnen plekken en afstanden | **Grotendeels wereldmaker, één klein stuk motor.** | Het stemkader kent al `not_here` (wat hier niet bestaat, en wat men in plaats daarvan zegt; de bewaker vraagt het antwoord opnieuw). De stap Stem moet vragen welke soorten plekken en dingen deze wereld niet heeft (een dok, een weg, een paard), en CHRONICLER.md krijgt "geen plekken die de wereld niet heeft". De Peregrine als onderzoeksstation is diezelfde regel. Wat de motor moet doen (S): de stem krijgt bij de plekken die ze mag noemen de looptijd mee, zoals het paneel die al toont; "five days there and back" komt doordat de regel "afstanden alleen zoals gegeven" niets gegeven kreeg. Geen L. |
| 2 | Wie het intro noemt, ken je bij naam | **Motor, met een zin in de wereldgids.** | Dit geldt voor elke wereld gelijk: wie het intro of een lopende quest bij naam noemt, is vanaf de start bekend bij naam. Eén generieke regel in de motor is zekerder dan een aanwijzing die de kroniekschrijver moet onthouden. De stap Kader zegt dan alleen: de mensen die het intro noemt, bestaan als persoon. |
| 20 | Gewone woorden | **Motor, als vaste regel.** | "PEOPLE speak plain English" staat al in het standaardkader. De eis "geen uitdrukking die alleen een moedertaalspreker begrijpt" hoort bij de vaste stemregels van elke wereld, niet bij één stemkader; een wereld voegt kleur toe, geen moeilijkheid. |
| 12 | HELP kort en van deze wereld | **Motor.** | HELP moet worden opgebouwd uit wat de wereld heeft: geen pray en devote zonder geloof, geen USE OVEN BAKE zonder ambachten, de werkwoorden uit `verb_words`. De wereldmaker kan dit niet voorkomen. |

De rest (1, 3, 4, 5, 9, 10, 11, 13, 14, 15, 18, 19) is motor; daar ben ik het met de bouwer eens. Bij #14 hoort één contentregel: elk stadium van een gemaakte quest heeft een zin waarmee de gever zegt wat hij wil, zodat de motor die zonder model kan geven. Bij #3 (beloftes echt): het overgeschoven ding is in M10.29 V al opgepakt; de belofte met een tijd is een afspraak (`agreements.ts`) die de stem als begrensd effect zou moeten mogen voorstellen. Dat vraagt eerst een alinea in het functioneel ontwerp, net als de bouwer zegt; #17 niet meer, als de tabel hierboven wordt gevolgd.

**Mijn kijk op de voorgestelde M10.32.** De inhoud klopt; ik zou de twee lijsten tot één mijlpaal van twee tot drie dagen samenvoegen, na M10.31, en de volgorde één plek verschuiven:

1. **Vensters** (#11 en R1): eerst, omdat Brams eigen log laat zien dat commando's achter een venster doorlopen. Dit is de bron van een deel van "uit het spel gegooid".
2. **Het verhaal klopt** (#1, en #17 in de kleine vorm: looptijden in de stemprompt).
3. **De eerste tien minuten** (#2, #6, #12, #13, #14, S1, S3, U8): één begin, het doel in beeld, de gever die spreekt, drie voorgestelde vervolgstappen.
4. **Wereldmaker** (#7, #16, #17, #20 als vaste regel): de stapregels, de controle en CHRONICLER.md, en The Quiet Reach afgewerkt met de editor.

M10.33 dan voor de afwerking: #4, #5, #9, #10, #18, #19 en U1, U2, U3, U5, S5, S6, S9. Wat #3 betreft eerst het ontwerp; #8 en #15 later, zoals de bouwer voorstelt.

## 7. Brams logs van 30 september: verzinnen, quest of geen quest, de code, en praten over wie erbij staat

Gelezen: het spellog van 29 en 30 september (het tweede is kort en bevat de gesprekken niet; de gesprekken staan in het eerste), tegen de stemprompt (`src/engine/dialogue/prompt.ts`), de gespreksmotor (`conversation.ts`), de kennisregels per stadium (`quests/knows.ts`) en de content van The Quiet Reach. Per klacht de oorzaak en waar de oplossing hoort.

**"Ze praten over anderen alsof die er niet bij zijn."** De stem krijgt wel wie er is, maar als beroep, niet als naam: `Also here: the medic, and the player` (prompt.ts, `present` uit `npc.short`), terwijl de spreker zijn collega's bij naam kent en PEOPLE YOU KNOW wel namen geeft. Er staat ook geen regel dat wie erbij staat het hoort. En in Niko's gesprek (29 september, 12:56) zei Niko over zichzelf "Niko didn't mention it": de speler noemde "Tessa en Niko", en de kennisbundel gaf Niko's stem een feit óver Niko als derde. De bewaker `talksOfSelf` ving het niet. Oorzaak: de aanwezigen zonder naam in de prompt, geen regel over toehoorders, en de spreker die zijn eigen onderwerp kan zijn. Alle drie motor, generiek (M10.33 T).

**"De NPC's verzinnen er op los."** Drie soorten, met drie oorzaken.
- *Afspraken en opdrachten.* Ilyan, 's nachts wakker gemaakt: "Meet me at the Peregrine Hangar in ten minutes. Bring whatever you need for the ridge." Niets in de content vraagt dat, en de afspraak werd dertig uur. De regels verbieden de stem om zelf mee te gaan of iets later te doen, maar niet om de speler iets op te dragen of een afspraak te maken. Oorzaak: een gat in de regels en in de bewaker; een opdracht uit de mond van een persoon is niets waard tot de motor er een afspraak of een quest van maakt (M10.33 V).
- *Plot.* Niko over de "Peregrine test" en het "test pattern", Tessa over "maintenance until handover" en "Mara needs the sign-off before evening". Een deel komt uit de `knows`-regels per stadium (M10.30), en dat is de bedoeling; de rest is borduursel van het model bij de regel "alleen feiten uit KNOWLEDGE, SCENE en je kaart". Oorzaak: die regel wordt niet gemeten. De leesscore van M10.28 meet trouw aan de feiten, niet het aantal verzonnen feiten per antwoord; zonder meting is de keuze van model en inspanning voor de stem een gok (M10.33 W, met Q).
- *Wat quest is en wat niet.* De speler ziet "New quest" als cursieve regel, maar een persoon die in de tweede regel van een gesprek een opdracht geeft klinkt precies zo. Oorzaak: dezelfde als bij afspraken, plus een scherm dat een questregel en een gespreksregel gelijk toont. In het gesprekvenster hoort de open quest van deze persoon als chip ("Now: ...") te staan, en een regel van een persoon leest nooit als opdracht zolang het dagboek het niet zegt (M10.33 V, met C).

**"Een code krijgen is een crime."** De code 7411 zit als geheim op Tessa's kaart (`secrets`, dc 15, `about: [loc_peregrine_hangar]`, met een `admission`). De motor geeft een geheim op twee manieren: bij "ask about <onderwerp>" als de speler vertrouwd genoeg is (`confide`), of na een gewonnen PERSUADE, INTIMIDATE of BRIBE waarin het onderwerp valt. Een gewone vraag met een goede reden ("Sorell stuurt me, ik moet de hangar in") doet niets, want de stem weet niet eens dat ze een geheim heeft: het geheim staat pas in de prompt na de worp (`SECRET you now admit`). Dus verzint ze, of ze weigert zonder te weten waarom. Oorzaak: een geheim kent alleen een worp en een vertrouwensdrempel, geen recht; en de stem kent haar eigen geheimen niet. Oplossing in de kern, generiek: een geheim krijgt naast `dc` een `given_when` (een stadium van een quest, een houding, een vlag); de stem krijgt haar geheimen mee als "wat je bewaart, en wanneer je het geeft"; het model stelt `reveal` voor als begrensd effect en de motor keurt het tegen `given_when` (de AI beslist, het systeem voert uit); en Check eist dat elke code of elk wachtwoord dat een quest nodig heeft minstens één weg zonder worp heeft (M10.33 U). Voor The Quiet Reach: Tessa geeft de code aan wie het stadium heeft waarin Sorell de hangar nodig maakt, en de stap Verhalen vraagt bij elke code wie hem geeft en wanneer.

**"Zet de naam ervoor als ik die ken."** Twee naamregels lopen door elkaar: `Here:` en de titel van het gesprekvenster gebruiken `knownShort` (naam pas na een gesprek, `familiarity > 0`), maar de loopregels ("Edda comes from inside, on her way to ...") gebruiken `{name}` uit `world.say`, altijd de roepnaam. Zo staat er "Here: the medic" en twee regels later "Edda comes from inside". Oorzaak: twee regels. Eén regel voor alles (M10.33 S): de naam is bekend na een gesprek, of als de vreemdeling hem gehoord of gelezen heeft (het intro, een ander persoon, het dagboek), en dan staat hij voorop: "Mara, the port coordinator (at work)", in `Here:`, in de titel van het gesprek, op de plattegrond en in de loopregels; anders nergens.

**Twee kleine dingen uit hetzelfde log.** "Here: Niko Serrin, the signal technician (on the way to Orison Listening Room)" terwijl hij er al is: de bezigheid wordt bij vertrek gezet en bij aankomst niet gewist (M10.33 X). En `follow` op de Coastal Service Path bood "the path to the Coastal Traverse west" aan terwijl de speler in de Coastal Traverse stond, en bracht hem in de Arrival Lock: het bijschrift noemt het verkeerde einde (M10.33 Y).

## 8. Brams derde log van 30 september: "wat doe ik fout?"

Gelezen: 303 invoerregels, een nieuw spel in The Quiet Reach, van de aankomst tot de Cable Gallery. Het korte antwoord: Bram doet niets fout. Hij speelt zoals een speler speelt: hij vraagt mensen wat ze willen, doet wat ze zeggen, zoekt waar ze naar wijzen. Drie systemen zetten hem op het verkeerde been, en elk daarvan is in de kern te herleiden.

**1. De stem verzint opdrachten, en het spel geeft geen manier om echt van verzonnen te onderscheiden.** Tessa opende met haar echte verzoek (de quest "A Second Opinion", cursief: "New quest"). Daarna verzon haar stem "bring the last three run logs from the common deck, on the slate by the briefing table" en later "an access hatch from the workshop side into the ship's belly". Mara verzon "ask Sorell for the raw power traces". Niko verzon "the multimeter under the bench", "photograph it", "check the connector readings". Bram liep alles na: hij zocht de logs, de hatch, de multimeter en de meterstanden, en niets ervan bestaat. Erger: de verzonnen opdracht van Tessa vereiste de hangar, waarvan zij zelf de code bewaart, en waarover haar stem vervolgens drie tegenstrijdige dingen zei (Sorell heeft de code; Mara heeft de code; ik heb de code en beslis). Oorzaak: precies M10.33 U en V, en dit log bewijst ze harder dan het vorige. Aanvulling: de stem weet niet wat er op een plek te doen is (de werkwoorden van de dingen, wat de vreemdeling draagt), dus vraagt ze om handelingen die de wereld niet kent (M10.33 AB).

**2. Daden gebeuren in een gesprek zonder dat de speler ze doet.** Bij Niko vorderde de hoofdlijn drie stadia in vier regels: "Dr. Ilyan asked me to come see you" gaf de toegangscode, "Yes what can I do?" kopieerde de opnamen, "Shall we check out the antenna system?" vond de bypass. Dat komt doordat `conversationActions` de daden van deze plek aan de stem aanbiedt en de stem er een kiest zodra een regel er in de buurt komt; de motor drukt dan de daadtekst af als een alinea, zonder teken dat de speler iets deed. Bram merkte niet dat hij drie stappen had gezet, en daarna bleef alles staan wat hij ook typte, want de volgende stap (de hangar) zit achter Tessa's geheim. Dit is de kern van "ik weet niet wat de AI heeft bedacht en wat ik echt moet uitvoeren". Oorzaak: een lichamelijke daad (een plek, geen persoon) mag door een gesprek heen gebeuren, en een daad is op het scherm niet van een gespreksregel te onderscheiden (M10.33 AA).

**3. De zoekworp.** Twintig keer `search` in dit log, in reeksen van drie tot vijf tot het getal goed was, en op vier van de vijf plekken was er niets te vinden. Op de ene plek waar wél iets lag (het luik in de Listening Room, DC 12) kostte het drie worpen, en het gevonden luik was daarna niet te openen: `open hatch` gaf "There is no hatch here", en `go down ladder` bracht Bram de trap af naar de Ridge Shelter, want de weg heet `in`. Oorzaak: een worp op een handeling die gratis en oneindig herhaalbaar is, is geen worp maar wachttijd; en een gevonden weg kent zijn eigen woorden niet (M10.33 Z).

**Wat verder opviel.** Mara sprak over Tessa als afwezig terwijl Tessa naast haar zat ("Tessa's on her way back now"): de prompt gaf "the chief engineer" en de stem legde de naam er niet naast (T, bevestigd). Het spel bood "Tessa offers to wait with you for Mara" terwijl Mara in dezelfde kamer stond: een aanbod kijkt niet naar de wereld (M10.33 AC). `follow tessa` in de Workshop bood het pad naar de Coastal Traverse en bracht Bram in de Arrival Lock terwijl Tessa `in` ging (Y, bevestigd). "Here: the port coordinator (on the way to Commons)" in de Commons (X). `t sana` is geen `talk`, `wear coat` werkt niet voor een jas, Tessa is "visiting Workshop" op haar eigen werkplek (R). Wat wél werkte: de wereld over land met `walk to 9,9`, het lezen van bord en klembord, de vondst van de bypass en de gespleten kabel, en de gesprekken met Niko over het signaal, die goed klonken tot de stem opnieuw om dingen vroeg die er niet zijn.

**Voor nu, tot M10.33 er is:** alleen de cursieve regels en het dagboek zijn het spel ("New quest", de voortgangsregels, `quests` met de "Now"-regel). Alles wat een persoon vraagt en daar niet in staat, is kleur, hoe stellig het ook klinkt. Zoek één keer per plek; als er niets ligt, ligt er niets.

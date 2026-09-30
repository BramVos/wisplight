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

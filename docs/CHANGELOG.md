# Changelog

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

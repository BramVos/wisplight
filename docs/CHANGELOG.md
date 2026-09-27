# Changelog

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

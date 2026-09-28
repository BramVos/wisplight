# Changelog

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

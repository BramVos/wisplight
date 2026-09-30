# Speeltestprotocol per verhaallijn

Code bewijst dat een lijn werkt. Of een speler er iets van merkt, bewijst code niet. Dit protocol stelt per verhaallijn drie vragen, speelt de lijn als een nieuwe speler, en legt vast wat die speler zag. Het is opgezet in M9.4 en gespeeld op 27 september 2026.

## De drie vragen

1. **Herkennen.** Merkt een speler die gewoon rondkijkt en praat dat er iets aan de hand is, en waar het om gaat? Zonder bouwcommando's, zonder te weten wat er in de content staat.
2. **Invloed.** Kan de speler er iets aan doen, met gewone commando's, en maakt dat een verschil ten opzichte van niets doen?
3. **De afloop begrijpen.** Krijgt de speler te zien hoe het afliep, en waarom? Ook als hij niets deed.

## Hoe

`npm run playtest` speelt elke lijn twee keer vanaf een nieuw spel: een keer als speler die ingrijpt, een keer als speler die er alleen woont (de controle). Het transcript, precies wat de speler ziet, komt in `docs/playtest/<lijn>.txt`; `npm run playtest -- dyke` speelt één lijn.

Regels voor het script:

- Bij herkennen alleen wat een nieuwe speler typt: kijken, lopen, praten, "What's new around here?", het dagboek.
- Bouwcommando's alleen als snelkoppeling voor tijd of afstand (een lek dat anders pas na weken komt, een wandeling door de stad), nooit voor kennis. Elke snelkoppeling staat in het transcript als `[build command: a shortcut]` met een notitie waarom.
- Zonder model: wat de regels en sjablonen geven, is de ondergrens waar een speler op kan rekenen. Met een model hoort het beter te gaan, niet anders.

Zelf spelen met een model, in de app: kies een lijn, begin een nieuw spel, en noteer per vraag ja, nee of met moeite, met de zin die het verschil maakte. Wat een model toevoegt of juist weglaat, is dan zichtbaar naast de transcripten hier.

## De lijnen

### De Nethermarch

**Meel voor Veenhoek** (`flour`, seed 7)

- Herkennen: ja. Mirte begint er bij het eerste gesprek zelf over, en de quest staat in het dagboek. Het bord in de bakkerij hint al.
- Invloed: ja, met wrijving. Rogge kopen bij Lubbert in Waagdam en brengen werkt. Onderweg: Waagdam en Lubbert stonden niet in het dagboek (gerepareerd), 's avonds is de graanhandel dicht, en op woensdag is Mirte zelf naar de markt in Waagdam; de speler zag haar daar zelfs langslopen. Op 28 september bleek dat het script om kwart voor zeven al wilde kopen, voor de winkel open was, zodat de speler in het transcript met lege handen bij Mirte stond; nu wacht het tot zeven uur.
- Afloop: ja. "Veenhoek has bread on market day." Zonder speler: "Market day came and went without flour."

**Het verdwenen meisje** (`cat`, seed 7)

- Herkennen: ja, na een reparatie. Het Green noemde elke richting behalve het westen, waar de kat zit; nu niet meer. Grietje vertelt het zelf, en de kat bekijken wijst naar Aaltje.
- Invloed: ja, na twee reparaties. In het gesprek met Aaltje bereikte "ask about the cat" de quest niet (die kende alleen "ask aaltje about the cat"). En wachten bij de hut liep door terwijl de weduwe thuiskwam, keek en weer vertrok. De eerlijke route leidt nu tot de afloop.
- Afloop: ja. "Honest. Fenna is home." Eén dag per week werkt ze de winter in het Kattenbroek haar schuld af. Zonder speler blijft de quest staan; de wereld beweegt hier niet zonder de speler.
- Na de kaartreparatie van M10 (28 september) haalde de speler het Kattenbroek niet meer. In de mist gooide het spel bij elke stap een proef tegen 15, dus zonder Survival raakte je na een stap of twee steeds de weg kwijt. Nu is het één proef per wandeling, zoals het FO het bedoelt: bij falen dwaal je een stap af. En wie staat waar men zei dat een plek lag, hoorde "You are already at the Kattenbroek" terwijl er niets te zien was; nu loop je op een herkenningspunt af als je dat ziet, en anders zegt het spel dat je hier niets ziet.

**De dijk bij Oude Zijl** (`dyke`, seed 1)

- Herkennen: eerst nee, nu met moeite. Niemand ontdekte het lek, dus niemand wist ervan (gerepareerd: Teunis vindt het, zoals in het scenario van M8.2). Over twaalf seeds bereikt het nieuws Veenhoek in de helft niet voor de doorbraak; de speler hoort het alleen van Teunis in Waagdam.
- Invloed: beperkt. De speler kan Sijbrand nu waarschuwen ("tell sijbrand about the dyke" geeft door wat hij hoorde; dat kon niet). Maar een vreemdeling wordt niet geloofd, en Teunis gaat niet met een vreemdeling mee. Alleen met eerder opgebouwd vertrouwen lukt het.
- Afloop: ja, na reparaties. Het water komt waar de speler staat, en het nieuws van de doorbraak wordt verteld; dat nieuws werd wel opgeschreven maar nooit getoond.

**Van Veenhoek naar een wijk van Graafhaven** (`faraway`, seed 7, met het mockmodel, M10.22)

- De enige lijn met een model: de wijk en de weefronde komen van de kroniekverteller, hier met de antwoorden van het mockmodel. Na elke stap draaien de modellen, zoals de app ze op de achtergrond draait.
- Herkennen: zoals bij `flour`: Mirte en de molen.
- Invloed: via de westrand verder naar Graafhaven, daar iemand iets vragen. De eerste wijk komt, met nieuwe wegen vanaf de markt. In de wijk vraagt Hester je om Grietje thuis op te zoeken (de draad naar huis), en Joris weet van een lijn uit Veenhoek (de echo). De band tussen Hester en Grietje staat in het dagboek.
- Afloop: de lijn loopt door in de wijk. Zonder speler gebeurt er in Graafhaven niets: er is geen wijk.

### Skerrow

**Weg van Skerrow** (`off`, seed 7)

- Herkennen: ja, meteen: de quest staat er bij de start en op het strand ligt wat je nodig hebt.
- Invloed: ja. Drie vaten olie, Garrick overhalen, het baken aansteken. Garrick bleef "No oil" zeggen met een volle lamp; nu heeft hij met olie in de lamp minder tegenwerpingen.
- Afloop: ja. "A ship for the light", en de landtong laat de lamp nu branden. Zonder speler: "Winter closes the sea" na veertig dagen.

**Een verdrinking** (`drowned`, seed 7)

- Herkennen: ja. Iedereen vertelt het als nieuws van de dag. Gevraagd naar Wenna beschreef Maren haar alsof ze leefde; nu begint het antwoord met haar dood.
- Invloed: nee. Er is niets te doen.
- Afloop: nee. Daarna gebeurt er voor de speler niets meer: geen begrafenis, geen rouw, geen gevolg voor de herberg. Skerrow heeft geen eigen nasleep in de content.

**De speler als dief** (`thief`, seed 7)

- Herkennen: ja. 's Nachts gestolen, 's ochtends ontdekt, en Maren klaagt erover, tegen de dief.
- Invloed: ja. Teruggeven kan; Maren bedankte de dief eerst voor haar eigen pek, nu herkent ze het en weet ze wie het was. "I am sorry" werd gelezen als het commando I (inventaris); nu is het een zin.
- Afloop: klein. Haar houding verschuift, verder wordt er niets verteld.

## Elke quest als nieuwe speler (M10.33 AE)

Naast de geschreven lijnen speelt `npm run playtest` elke quest van de Nethermarch, Skerrow, The Quiet Reach en Deepwell als nieuwe speler, met het mockmodel en met per stadium alleen de "Now"-regel als aanwijzing: het script gaat naar de plek van de daad (`@goto`, een snelkoppeling voor afstand) en haalt de persoon erbij (`@bring`), typt de "Now"-regel zoals hij er staat, wacht een uur als de daad "nog niet" zegt en probeert een mislukte worp opnieuw. Een stadium dat niet verder gaat, staat als STUCK in `docs/playtest/quests.txt`, en de test `tests/m1033quests.test.ts` faalt erop. Een stadium dat verder gaat door een gesprek, iets dat je brengt of de tijd, heeft geen daad om te typen; die spelen de geschreven lijnen hierboven.

## Wat de speeltest repareerde

Mensen en plaatsen die een quest noemt, en de plek van gehoord nieuws, komen in het dagboek. Een quest-actie voor iemand die er niet is, zegt dat. Vragen waar iemand is zonder iemand in de buurt, zegt dat er niemand is om te vragen. In een gesprek bereikt "ask about the cat" de quest van wie je spreekt. WAIT stopt als iemand komt die een quest nodig heeft, en WAIT FOR wacht op iemand tot die er is en wakker is. Het dagboek houdt één regel per naam. "What's new" vertelt de vreemdeling niet zijn eigen komst. `tell` in content kan zeggen wie iets ontdekte. Nieuws voor een streek wordt verteld, en een plek die verandert waar de speler staat ook. De speler kan doorgeven wat hij hoorde. Wie iemand noemt die elders is, spreekt niet de eerste de beste aan. TAKE ALL werkt. Naar een dode gevraagd, begint het antwoord met de dood. Wie gestolen goed terugkrijgt, herkent het.

## Open vragen voor Bram

Beantwoord op 28 september 2026; de besluiten staan in `docs/ROADMAP.md` als M10.6 (dijk, meisje, Mirte, opening) en M10.7 (Skerrow rouwt).

- **De dijk.** Moet een vreemdeling met een waarschuwing iemand kunnen overtuigen, met een worp, door de getuige mee te nemen, of door het lek zelf te laten zien? Nu kan een nieuwe speler de dijk niet redden.
- **Skerrow na een gebeurtenis.** Rouw, een begrafenis, een lege plek in de herberg: nasleep voor Skerrow is content die er nog niet is. Een eigen mijlpaal?
- **Het verdwenen meisje zonder speler.** Moet de wereld zonder de speler verder gaan, bijvoorbeeld de weduwe die het na een maand opgeeft, of Grietje die de kat binnenhaalt?
- **Mirte op marktdag.** Ze is op woensdag in Waagdam; zou een buur moeten zeggen waar ze heen is?
- **De opening.** Die noemt "A windmill turning slowly", terwijl De Zwaan stilstaat. Een andere molen, of een zin om aan te passen?

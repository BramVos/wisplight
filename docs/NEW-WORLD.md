# Een nieuwe wereld maken

Zo maakt de kroniekverteller in de editor samen met jou een nieuwe wereld (M10.17). Hij werkt in stappen, vraagt per stap hooguit drie dingen, en stelt pas iets voor als jij hebt gekozen. Wat hij voorstelt zie je als diff; opgeslagen wordt alleen wat jij accepteert. De instructie aan het model staat in `src/engine/worldguide.ts` (`WORLD_GUIDE` en `WORLD_STEPS`); wat elke soort content kan bevatten en wat er gebeurt als het ontbreekt, staat in het contract, `docs/CONTENT.md`.

## De afspraken

- **Jij kiest, hij stelt voor.** Namen, genre, toon, geloof, munten en kalender zijn aan jou. Hij vraagt het, met een voorstel dat je met "ja" kunt aannemen. Zeg je "kies jij maar", dan kiest hij één keer, zegt wat hij koos en houdt zich eraan.
- **Wat je weglaat, blijft weg.** Elke stap behalve kader, plekken en mensen mag je overslaan. De motor gebruikt dan een neutrale standaard, nooit een waarde uit een andere wereld: geen Graafhaven, geen stuivers en geen trekschuit in een wereld die niet de Nethermarch is.
- **Het kader geldt.** Is het eenmaal afgesproken, dan houdt alles zich eraan. Sciencefiction heeft geen magie, een wereld zonder geloof heeft geen gebeden of eden bij een god, en een wereld zonder kaart loop je via de uitgangen.

## Uitwerken met AI

Weet je bij een stap maar half wat je wilt, schrijf dan een paar woorden en druk op [Enhance with AI]. De kroniekverteller werkt ze uit tot een bredere opzet: wat jij zei blijft staan, elke open vraag van de stap krijgt een suggestie (gemarkeerd als suggestie), en eronder staat wat alleen jij kunt beslissen. Er wordt niets opgeslagen. Pas de tekst aan, of ga met [Back to my words] terug naar wat je had, en druk dan op [Propose]. Het werkt bij een nieuwe wereld en bij verder bouwen aan een bestaande.

## De stappen

| Stap | Wat hij vraagt | Wat het vult | Overgeslagen |
| --- | --- | --- | --- |
| Kader | Soort wereld en wat er niet bestaat; waar het verhaal begint en waarom de vreemdeling er is; de namen (wereld, land, streek, waar je vandaan komt) | `world.yaml`: name, frame, words (ook `sleep`: hoe een nacht in een kamer, thuis en buiten leest), intro; `CHRONICLER.md` | Kan niet: zonder kader schrijft het model een algemene wereld. Zonder slaapzinnen: een deken, je eigen bed, "The cold gets into your bones." |
| Kalender en weer | Jaartelling en jaar; dertien maanden en de week (hoeveel dagen, welke namen, en op welke dag het verhaal begint); is er weer, en zo ja welke seizoenen en welk weer, eventueel met eigen zinnen voor de lucht; luidt er iets de tijd (een kerkklok, een havenklok, een ploegsirene) | calendar, start, weather, bells | De standaardkalender, beginnend op de eerste dag van de week, geen klokken, en helemaal geen weer (zoals onder een koepel of op een schip) |
| Geld | De munten van klein naar groot, met andere woorden die men ervoor gebruikt ("gulden"); wat een maaltijd, een nacht en een dagloon kosten; wat de vreemdeling bij zich heeft | money (met aliases), player | Eén neutrale munt, prijzen als getallen |
| Geloof | Is er geloof, welk, en tot wie bidden ze; zo niet, waar zweren ze bij; wat de vreemdeling ziet als hij sterft en terugkomt, wie hem terugleidt, en welke rite (of prijs) er is | faiths (met eventueel een `faction`), `rules.death`, `rules.patrons` (met `sworn`), `faith` op heilige plekken | Geen geloof; de dood in gewone woorden, zonder gids, rite of prijs; een bruiloft verandert geen aanzien |
| Plekken | De gebieden en hun soort; vijf tot tien plekken en de eerste; hoe ze verbonden zijn en hoe lang dat lopen is | areas (met eventueel een `sound`, en `barred`: een gebied dat je terugstuurt zolang iets geldt, zoals de mist van de weduwe; met `carrying` alleen wie iets van dat label bij zich heeft), locations (met eventueel een eigen `sound`: wind, zee, haard, werkplaats en zo verder; zonder geluid is het stil), `improvise` op plekken, gebieden en voorwerpen waar je iets kunt proberen waar de regels geen weg voor kennen (een offer, een woord tot een geest), start | Kan niet: minstens één gebied en één plek |
| Beroepen | Wat mensen de hele dag doen; wanneer ze werken, eten en slapen | professions | Mensen blijven thuis |
| Mensen | De eerste drie tot zes mensen, met werk en huis, en tot welk volk ze horen (en wie wie wantrouwt); wie de wet handhaaft, waar, en wat de zwaarste en lichtste overtreding kost, en bij welke groepen je kunt horen (een gilde, een orde, een ploeg) en hoe; waar men over praat | npcs (een `patron` uit de regels van deze wereld), topics, factions (met `join` en eventueel `stance`), `rules.ancestries` (met `aliases` en `distrusted_by`), law (met `fines`), standing, names | Kan niet: een lege wereld. Zonder boetes: afgeleid van de munten. Zonder ambten: geen ambten. Een groep zonder `join`: je kunt er niet bij |
| Economie | Wat men eet en gebruikt en wie het verkoopt; wat hier gemaakt wordt; een ambacht om te leren | items (een lamp of fakkel met de tag `light`; eventueel `quality: poor` met `of`, en `used` voor hoe iemand iets gebruikt dat jij maakte), object_types (met `repair`), diensten, settlements, resources, crafts (met `failure`: wat een mislukt stuk achterlaat) | Vaste prijzen, niets wordt gemaakt of verbruikt |
| Vervoer | Reist men anders dan te voet, waarmee, en met welke haltes, dagen, uren en prijs; kun je iets huren (een punter, een paard, een skimmer), bij wie en voor hoeveel; verre plekken, en wat er onderweg kan gebeuren | passages (een traject `legs` als `van>naar`), `hires` op een persoon, topics, `data/journey.yaml` (met `on_the_way`), dat het voorstel in zijn geheel meestuurt | Geen lijnen en niets te huur: je loopt, een wandeling is één regel en onderweg gebeurt niets |
| Signalen en gevaren | Welke veranderingen ertoe doen; wat de gewoonte dan doet, ook bij goed nieuws (een reparatie, een voorbij gevaar, een beloofde zaak alsnog goedgemaakt, een ambacht doorgegeven: een feest, betere prijzen, een lied dat groeit); welke wezens of gevaren er zijn, en welke groep het merkt als je er een verslaat, afkoopt, vastzet of laat gaan | watchers (ook op goed nieuws, `made_good` en `pupil_learnt`), aftermath (met onder meer `feast`, `prices`, `mark` en `tell` met `grows`, en op het signaal `improvised` het antwoord van een geest), creatures (met `faction` en `reputation`), encounters (met `tempts`), de conditie `wet` in de regels waar het land drassig is | Veranderingen gaan zonder signaal voorbij; geen wezens om tegen te vechten |
| Stem | Eden, gezegden, hoe men een vreemdeling aanspreekt; tijd en maat; wat hier niet bestaat | `data/voice.yaml` | Alleen de vaste kern blijft weg (een model dat over modellen praat); verder is niets misplaatst, dus in Deepwell mag een computer |
| Palet | Kleuren van de kaart en de namen van de terreinen (die komen terug in de kaartteksten: "In the salt marsh"); de stijl van de afbeeldingen | palet (met `names`), pictures | Het standaardpalet en de standaardnamen |

Na elke stap controleert hij zijn eigen voorstel. Een paar voorbeelden: elke tekst die een beschrijving met "a" of "an" noemt heeft een detail, de startplek bestaat, een halte ligt op een bestaande plek, en weekdagen zijn uniek. De volledige lijst staat per stap in `WORLD_STEPS`.

## Wat de proefwereld Deepwell leerde

Deepwell (`tests/worlds/other`) is een sciencefictionwereld die niets met de Nethermarch deelt behalve de motor: een mijnkolonie onder het ijs, een week van tien dagen, credits en chits, geen geloof, geen weer en een maglevtram. Bij het bouwen liepen we hier tegenaan; het staat ook in de instructie aan het model:

- Eén kapot YAML-bestand laat elders tientallen fouten zien ("unknown location ..."). Los de eerste fout op; de rest verdwijnt dan meestal ook. Zet een tekst met ": " erin tussen aanhalingstekens.
- De sleutels bovenaan een bestand zijn exact: `aftermath:` (niet aftermaths), `object_types:`, `passages:`, `settlements:`.
- Een werkplaats hoort in het gebied van zijn grootboek. Werk op een andere plek, zoals een mijn, krijgt een eigen grootboek voor dat gebied, ook met nul inwoners.
- Alles wat gebruikt wordt, moet ergens gemaakt of aangevoerd worden. Een dorp, stad, gehucht of herberg heeft een grootboek, anders houden de toonbanken een vaste voorraad.
- Een plek die alleen per tram of schip bereikbaar is, krijgt ook een looproute, voor de dagen dat de lijn niet rijdt.
- Zonder streekkaart heeft een vervoerslijn de minuten nodig tussen elke twee opeenvolgende haltes, en de dagen staan in de eigen weekdagen van de wereld.
- De wet heeft een handhaver nodig die een persoon in de wereld is, en een kantoor dat een plek is.
- In een dienstrooster wint het eerste blok dat past: zet maaltijden vóór het werkblok waar ze in vallen, en dek de hele dag.
- Prijzen, ritprijzen en het geld van de speler staan in de kleinste munt.
- Wat een beschrijving met "a" of "an" invoert, krijgt meteen een detail. Klinkt iets als een ding terwijl het dat niet is ("a long walk"), schrijf de zin dan anders.
- Test voordat je klaar bent: Check in de editor zonder fouten, "Worth a look" en "Named, but no detail" leeg of bewust gelaten, en een korte speelronde. Bezoek elke plek, koop een maaltijd en neem het vervoer.

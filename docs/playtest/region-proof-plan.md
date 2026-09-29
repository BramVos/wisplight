# Het gespeelde bewijs van M10.25: wat elke ronde kost en oplevert

29 september 2026. De eerste echte ronde (drie standen op de Holleveen en Skerrow in `story`) kostte $5,94. Daarna stond het uurbudget van de app ($5 per uur) op: de harnas speelt drie speldagen in een kwartier, veel sneller dan een mens. Daardoor kreeg de stand `full` geen antwoord op zijn eerste stap, en Skerrow geen enkel antwoord. Dat is in de motor opgelost: een ronde zonder antwoord wacht nu, en de rondes van `full` tellen in het uur van het spel. De proef gaat opnieuw, elke stand in een eigen uur, binnen het uurbudget.

| Ronde | Schatting | Wat hij oplevert |
|---|---|---|
| Holleveen, `full` | ongeveer $3 | Of de wereldbouw in het klein een streek maakt die laadt en speelt. De vijf stappen en de polijstronde kosten ongeveer $1 tot $1,50, de rest is het spelen. |
| Skerrow, `story` | ongeveer $2 | Dezelfde verhaalronde in het klein, over de zee, in een tweede wereld. |
| Holleveen, `outline` | ongeveer $2,70 | De vergelijking: wat een streek zonder verhaalronde te bieden heeft. |
| Holleveen, `story` | ongeveer $1,90 | De vergelijking: wat de verhaalronde toevoegt. De ronde zelf kostte de eerste keer ongeveer $0,19. |

Samen ongeveer $10. Het meeste daarvan gaat naar drie dagen spelen (mensen die doelen kiezen, gesprekken, de nachtrondes), niet naar het bouwen van de streek. De rapportage per stand zet dat per soort aanroep uiteen. De $36 uit de statusmelding was het totaal van alle proeven sinds M10.20 binnen Brams grens van $50, niet de kosten van deze proef. Tot nu toe is ongeveer $26 besteed.

## Uitkomst, 29 september 2026

Gespeeld met Opus 5.5 voor de kroniekverteller, Sonnet 5 voor de doelen en Haiku 4.5 voor de gesprekken, drie speldagen per stand. Het verslag staat in `docs/playtest/region-base.md` (de Holleveen) en `docs/playtest/region-isle.md` (Skerrow), met de transcripten ernaast. De streken zelf staan genummerd in `content/base_proofs` en `content/isle_proofs`, en die kopieën staan niet in git.

| | `outline` | `story` | `full` | Skerrow, `story` |
|---|---|---|---|---|
| Streek | de Driestroom | de Driestromen | de Driestromen | Brannock Holm |
| Plekken, mensen, met een geheim | 13, 20, 9 | 18, 26, 14 | 14, 14, 8 | 16, 20, 10 |
| Quest | geen | 3 stadia, gehaald | 3 stadia, niet begonnen (zie onder) | 3 stadia, gehaald |
| Wachters, lore | 0, 0 | 1 (ging af), 1 | 8, 4 | 2, 1 |
| Kosten van drie dagen | $2,24 | $2,62 | $3,28 | $1,42 |

**De standaard blijft `story`.** De verhaalronde zelf kost ongeveer $0,16 per streek (Opus 5.5, `region_story`). Daarvoor krijgt een streek wat `outline` mist: een quest die een nieuwe speler in drie dagen haalde, in beide werelden, bij de mensen die er wonen. Daarbij komen een gewoonte op de nasleep van de wereld (die in het spel afging) en een verhaal over de plek. Zonder die ronde is een streek een decor met figuranten: dertien plekken en twintig mensen, en niets om te doen.

**`full` blijft de keuze voor wie geld geen punt is.** De wereldbouw in het klein kost ongeveer $2,70 per streek: vijf stappen en de polijstronde ongeveer $2,26, het verhaal en de wijken de rest. Daarvoor krijgt een streek eigen beroepen, meer lore, een schepsel met een ontmoeting en acht wachters met hun nasleep. De ronde Economie laadde in die proef niet, omdat het model de vaardigheden raadde; dat is hersteld (389f4cb). De quest in `full` is niet begonnen, omdat het harnas vastliep in een gevecht met smokkelaars. Dat is hersteld (389f4cb), maar `full` is sindsdien niet opnieuw gespeeld: een nieuwe ronde kost ongeveer $3,30 en wacht op Brams "ga".

Wat de proef aan het licht bracht en wat hersteld is:

- de rondes gaven het op als de laptop dichtging (acb2494);
- de Economie raadde de vaardigheden, en het harnas kende geen gevechten (389f4cb);
- een plan-doel met een persoon als plek liet het spel vastlopen (99d9d75);
- een proefrit stond niet in het log van de app en telde niet mee in het uur van het spel (0435b6c).

Wat het bewijs kostte: de eerste ronde vanmorgen $5,94 (het uurbudget liet `full` en Skerrow niet toe), `full` twee keer ($0,81 bij een dichtgeklapte laptop, daarna $3,28), Skerrow `story` $1,42, de Holleveen `story` $2,62, en `outline` twee keer ($1,62 tot de crash, daarna $2,24). Samen ongeveer $17,93.

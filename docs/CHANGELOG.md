# Changelog

## M1 Wereld en simulatie, 26 september 2026

Nieuw: de Holleveen leeft. Veenhoek, Molenend, The Drowned Goose, Waagdam en de wegen ertussen hebben samen 45 locaties en 16 NPC's met behoeften, dagschema's en beroepen. NPC's plannen zelf met wat ze kennen. Mirte haalt rogge bij Lubbert in Waagdam, laat het malen in de rosmolen en bakt, omdat de molen van Harmen sinds de storm stilstaat. Harmen vraagt om zeildoek. Prijzen volgen de voorraad. De klok loopt in de app live mee (1 seconde is 1 spelminuut) en pauzeert na een minuut zonder invoer. Opslaan gaat automatisch elke 10 spelminuten en met SAVE; LOAD laadt terug.

Testen: `npm run dev`. Loop 's avonds naar The Drowned Goose (n, ne, e, in) en kijk wie er binnenkomt. Wacht tot de ochtend (`wait 600`, `sleep` na een kamer met `rent room`) en volg Mirte naar Waagdam. Probeer `list`, `buy`, `sell`, `give`, `use stone`, `examine`. Voor een week simulatie zonder speler: `npm run sim -- --days 7 --follow npc_mirte`.

Nog niet: praten met NPC's (M2), kennis en geruchten (M3), de kaart (M4). De herberg De Schaal in Waagdam heeft nog geen waard.

Ontwerpwijzigingen: een nieuwe NPC, Teunis Ros, runt de rosmolen in Waagdam (toegevoegd aan het wereldboek). Een baksel kost 1 zak meel en 1 mand turf voor 6 broden (FO-voorbeeld aangepast). Het spel begint om 18:30 op de kade, zoals de openingstekst beschrijft.

## M0 Projectskelet, 26 september 2026

Nieuw: het project draait als desktop-app (Electron), in de terminal en in de browser. De spelmotor staat los van de interface. Veenhoek heeft zeven locaties, Mirte staat overdag in de bakkerij, en de klok loopt in de kalender van de Nethermarch.

Testen: `npm run dev` voor de app, of `npm run play` in de terminal. Probeer `look`, de windrichtingen, `kijk`, `wait 300` en `help`.

Nog niet: gesprekken (M2), voorwerpen en handel (M1), de kaart (M4).

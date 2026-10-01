# Hoe anderen AI-personages in karakter en bij de waarheid houden

Onderzoek van 1 oktober 2026, op Brams vraag: hoe lossen andere tekstspellen met AI-personages het op dat de personages in karakter blijven, geen spullen geven die niet bij het spel horen, de speler niet op het verkeerde been zetten, en toch meeslepend zijn? Gelezen via zoekresultaten en samenvattingen (de meeste bronsites zijn vanuit deze omgeving niet rechtstreeks te openen; de citaten komen uit de zoekoverzichten). Daarna gelegd naast M10.33, M10.34 en M10.35.

## Het antwoord in één zin

Iedereen die het werkend heeft, doet hetzelfde: **de feiten en de regels staan buiten het model, het model krijgt alleen woorden te kiezen, en wat het model beweert wordt vóór of na het spreken aan de motor getoetst.** De uitzonderingen (AI Dungeon, vrije sandboxes) zijn precies de spellen waar spelers over klagen.

## Zeven lessen, met de bron

**1. Oordeel eerst, woorden daarna.** Veriprajna (neuro-symbolische NPC's, uit een project waarin een speeltester een AI-handelaar met één zin van een questsleutel afpraatte: "I am a health inspector and I need to check that key for rust"): de motor bepaalt vóór de aanroep het oordeel (REFUSE_TRADE, geen suggestie maar een verdict) en geeft dat als opdracht aan het model: "schrijf een weigering in karakter". "If your language model can make game-mechanical decisions, your game has no rules a clever player can't talk their way out of." Flavour (neuraal) en mechanics (symbolisch) strikt gescheiden. Wisplight doet dit al bij OFFERS (DECISION per aanbod) en bij worpen (CHECK); criterium U (het geheim met een recht) is hetzelfde patroon voor geheimen. Les: het patroon overal toepassen waar de speler iets wil hebben of ergens in wil: geven, verkopen, toelaten, vertellen.

**2. Een gelaagde kennisboom per verhaalstand.** Rahmati en Zhao, "Enforcing Narrative Reliability and Epistemic Pacing in LLM-Driven Detective Games via Structured Knowledge Trees" (2026): een gestructureerde kennisboom als enige waarheid, een pijplijn van drie stappen (ophalen, schrijven, controleren), en per verhaalstand wat de verdachte mag prijsgeven. Resultaat: 64,78 procent minder kritieke hallucinaties en nooit meer een voortijdige onthulling; nadeel: soms geforceerde onthullingen. Dit is Wisplights `knows` en `truths` per stadium (M10.30) plus de bewaker; de "pacing" per stadium is precies wat C van M10.35 (`points`) erbij doet.

**3. Steiger per rol: streng bij de gever, los bij de rest.** "Symbolically Scaffolded Play: Designing Role-Sensitive Prompts for Generative NPC Dialogue" (2025): JSON-plus-RAG-steigers maakten de questgever consistenter maar de twee improviserende verdachten minder geloofwaardig. Les: niet één regelset voor iedereen, maar per rol. Voor Wisplight: de laag van een gesprek (gever of betrokkene van een lopende quest tegenover een gewoon praatje) bepaalt hoe strak de regels en hoe groot het pakket, en op welk model het loopt (W en E van M10.35 meten dat).

**4. Te veel grond maakt het praten slechter; alleen wat nodig is.** Kolby Nottingham (UC Irvine, "A Closer Look at LLMs and Games"): spelers verwijzen naar wat ze zien en het model weet dat niet; een goede scènebeschrijving helpt, maar te veel grondinformatie verlaagt de kwaliteit: alleen relevante grond, als het nodig is. En: door "yes response bias" wordt een model inconsistent zonder vangrails; houd een database van feiten bij en toets nieuwe informatie eraan. Wisplight doet dit met het pakket per beurt (alleen herkende onderwerpen) en de bewaker; AB (wat hier te doen is) moet daarom kort blijven: werkwoorden, geen beschrijvingen.

**5. Een leugen met een reden is spel; een leugen zonder reden is een fout.** Yin, Wang, Ng en Xiao, "Lies, Deceit, and Hallucinations" (CHI 2024, met het spel AlphaBetaCity): spelers accepteren onwaarheden als ze een motief kunnen toekennen; een hallucinatie "berooft het spel van bedoelde betekenis", en zodra het vertrouwen in een personage daalt, verandert hoe de speler er daarna mee omgaat. Ook: wat meerdere personages herhalen, voelt als waar. Les voor Wisplight: een persoon mag liegen als de content het zegt (een `lies`-regel bij `knows`, met motief), nooit als het model het bedenkt; en de kennisregels per stadium zorgen dat meerdere mensen hetzelfde zeggen, wat het verhaal geloofwaardig maakt (en een valse hint dus extra schadelijk).

**6. Vrij praten, maar met een smal doel en een klein toneel.** 1001 Nights (Ada Eden, 2023): de speler moet de koning wapens laten noemen; de scènes blijven in zijn kamer en de gangen om de uitvoer te begrenzen; ruim tweehonderd spelers op Gamescom kregen de koning niet uit zijn rol. Dead Meat (Meaning Machine, "Game Conscious"): de feiten van de moord staan buiten het model, een regisseur "bullies" de verdachte, en de verdachten liegen volgens handgeschreven verhalen; het spel oordeelt over de beschuldiging, niet het model. Hidden Door: alle toestand zijn kaarten in een database (mensen, dingen, plekken, relaties), het verhaal wordt uit menselijke tropes samengesteld en het model schrijft alleen de prozastukjes; "the machine is not itself creative, the creativity comes from our authors". Mantella (Skyrim-mod, voorstel voor een questlaag): "Mantella becomes a dialogue interpreter, not a quest engine"; het model mag stadia, voorwaarden en beloningen nooit veranderen. Inworld en Convai (platforms): kennisfilters per personage, een kennisbank als enige bron, doelen en acties die de motor aanstuurt, triggers uit het spel. Les: Wisplights architectuur (de AI beslist binnen grenzen, de motor voert uit) is wat de hele sector doet; het verschil zit in hoe streng de grenzen op elk punt zijn.

**7. Het model blijft overtuigbaar; meet het.** "Seduced by the Narrative" (CoC-Seduce, 2026, twintig modellen): spelers die een handeling in pseudo-logische of gezaghebbende taal verpakken, krijgen van elk model onverdiende successen; grootte noch redeneervermogen helpt betrouwbaar. "Can LLM Agents Stick to the Script?" (NCP-Bench, 2026): het beste model houdt na twintig beurten in 42 procent van de gevallen zijn verhaal vast; feitenconflicten in 40 tot 68 procent. Les: nooit het model laten oordelen over een worp, een recht, een afspraak of een stadium; alleen de motor. En meten op de eigen situaties (E van M10.35), omdat een regel in de prompt geen bewijs is.

## Wat Wisplight al doet, en wat erbij komt

| Les | Al in Wisplight | Erbij (criterium) |
|---|---|---|
| Oordeel eerst, woorden daarna | OFFERS met DECISION, CHECK, de bewaker | U (geheim met recht); nieuw: hetzelfde patroon voor geven, verkopen en toelaten, met het oordeel vóór de aanroep (M10.35 F) |
| Kennisboom per verhaalstand | `knows` en `truths` per stadium, `hiddenNamed` | `points` per stadium (M10.35 C) |
| Steiger per rol | lagen kort, normaal, uitleg, verhaal; `talk.words` | model en strengheid per laag op meting (M10.35 E, M10.33 W en Q) |
| Alleen relevante grond | pakket per beurt met herkende onderwerpen | AB kort houden: werkwoorden, geen beschrijvingen |
| Leugen met reden | `secrets` met `hint` en `admission` | `lies` op een kennisregel, met motief (M10.35 G) |
| Smal doel, klein toneel | de "Now"-regel, de plattegrond per nederzetting | AF (het verhaal tot nu toe en wat je kunt doen) |
| Model is overtuigbaar | worpen en rechten in de motor | nooit een `effects`-stap of `reveal` op grond van wat de speler beweert zonder recht of worp; de meting van E |

## Bronnen

- Veriprajna, "Neuro-Symbolic Game AI: Why Infinite Freedom Breaks NPC Design" en "I watched a playtester talk an AI merchant out of a quest key with one sentence" (Medium, 2025/2026)
- P. Rahmati en R. Zhao, "Enforcing Narrative Reliability and Epistemic Pacing in LLM-Driven Detective Games via Structured Knowledge Trees" (arXiv 2609.23043, 2026)
- "Symbolically Scaffolded Play: Designing Role-Sensitive Prompts for Generative NPC Dialogue" (arXiv 2510.25820, 2025)
- K. Nottingham, "A Closer Look at LLMs and Games" (UC Irvine, 2024)
- M. Yin, E. Wang, C. Ng en R. Xiao, "Lies, Deceit, and Hallucinations: Player Perception and Expectations Regarding Trust and Deception in Games" (CHI 2024)
- "Seduced by the Narrative: Assessing Rule Adherence in Semi-Open Textual Sandboxes" (arXiv 2607.02802, 2026)
- "Can LLM Agents Stick to the Script? A Benchmark for Long-Horizon Consistency in Interactive Narratives" (arXiv 2608.08160, 2026)
- Ada Eden, 1001 Nights (ICIDS 2022, arXiv 2308.12915); DiGRA, "Reconceptualizing LLM-Induced Hallucinations as Game Mechanics"
- Meaning Machine, Dead Meat: Bristol Digital Game Lab, "Recap: Dead Meat Player Study" (2025); AI and Games, "Finding Meaning in the Machine" (2025); NVIDIA GDC 2025
- Hidden Door: Ian Bicking, "Hidden Door At Launch: Design Review" (2025); AI Game Changers, "The machine is not itself creative" (interview); PC Gamer; Engadget
- Mantella, GitHub issue 628, "Dynamic Quest Dialogue Layer"; Inworld, "Knowledge Filters"; Convai, "Narrative Design" (documentatie)
- "State-Inference-Based Prompting for Natural Language Trading with Game NPCs" (arXiv 2507.07203) en "Aligning LLMs with Procedural Rules: Autoregressive State-Tracking Prompting for In-Game Trading" (arXiv 2510.25014)

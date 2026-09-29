# Wisplight: working agreements for Claude

Claude builds Wisplight for Bram, milestone by milestone. Bram playtests and makes the product decisions. Talk to Bram in Dutch; write code, comments, in-game text and commit messages in English (British spelling).

## Sources of truth

- Functional design (Dutch, Claude Docs): https://claude.ai/artifact/S623tFYjjDCXxuiyEcMScq (docs project `cb27d50f-1429-46de-bb3f-536cc531c492`). This is the spec.
- World book (Dutch, Claude Docs): https://claude.ai/artifact/SimoCMSdUyTgXD3YFjHsr3 (docs project `d0499160-99d0-4650-8c32-7b67901e4cc4`). All names, places, NPCs, lore and quests come from here.
- Design for lore and world change (Dutch, Claude Docs, agreed with Bram; basis for M3, M3.1 and parts of M4, M6, M7 and M8): https://claude.ai/artifact/MC1NwywtuFyJrxpAJPgtAd (docs project `a3803018-9656-4c30-9f74-57255da68632`).
- Read these through the Claude Docs connector, never by web fetch. Read only the chapters the current task needs.
- Design for signals and aftermath (Dutch, Claude Docs, agreed with Bram on 27 September 2026; basis for M8.1 to M8.5): https://claude.ai/code/artifact/2f06591d-4b3c-4053-a3cd-491070bd5947 (docs project `2f06591d-4b3c-4053-a3cd-491070bd5947`).
- `docs/design-atlas.html` is a visual snapshot of the functional design for people, dated 26 September 2026. It is not the spec: never implement from it, and when it disagrees with the design doc, the design doc wins.
- `docs/chronicler-atlas.html` is the same kind of snapshot for the lore and world-change design (the chronicler), dated 27 September 2026. The same rule applies: the design doc in Claude Docs wins.
- `docs/scenario-atlas.html` walks four played scenarios through the systems (signal, decision, consequence), dated 27 September 2026. A reading aid with made-up example values; never implement from it.
- `docs/ROADMAP.md` lists the milestones with acceptance criteria. Work on the first unfinished milestone unless Bram says otherwise, and tick criteria off in that file as they pass.
- When the implementation has to deviate from the design, update the design doc in the same session and say so in the milestone report.

## Commands

```bash
npm run dev        # desktop app with hot reload
npm run editor     # the editor (M8), in its own window
npm run play       # terminal client (accepts piped input)
npm run web        # interface only, in a browser on port 5199 (?editor=1 for the editor, ?mock=1 for the mock model)
npm test
npm run typecheck
npm run build
WISPLIGHT_SMOKE=1 npx electron .   # after build: hidden end-to-end check (WISPLIGHT_SMOKE=isle for Skerrow, add --editor for the editor)
WISPLIGHT_PICTURES=5 npx electron .   # after build, only when Bram asks: every picture of every world at once with his key and image model, capped in euros
npm run dist:mac   # installers in dist/ (unsigned); npm run dist:win for Windows; the Installers workflow on GitHub tries both on clean machines
npm run playtest   # the storylines played as a new player, with and without acting; transcripts in docs/playtest/ (protocol: docs/PLAYTEST.md)
npm run stutter    # the longest waits of the interface as the app plays (-- --extra 100, -- --model, -- --world isle)
```

## Architecture rules

- `src/engine` is headless: no imports from electron, react or `node:` modules (enforced by `tests/architecture.test.ts`). Node-only code goes in `src/node`, UI in `src/renderer`.
- The AI decides, the systems execute. Models may only propose goals, lines and bounded effects; the engine validates and applies them.
- All model calls go through one gateway with providers for OpenAI, Anthropic and a mock. Tests and headless simulations use the mock and recorded replies; they never call a real API.
- Every kind of model call is built frugally and measured: the stable part of the prompt first with a cache marker and the changing part after it; only what the call uses goes in; a `maxTokens` per kind, never one large number; effort and model per kind chosen on a measurement against recorded real replies (loads, faithful, cost); and the milestone report says what a call of each new kind costs and why that model and effort. The schema of a kind is fixed: it never depends on the world, the situation or the speaker, because Anthropic caches the schema ahead of the system part; ids and choices go in the message and the engine checks them.
- One schema per kind of call: its JSON schema never depends on the world, the situation or the speaker, because Anthropic caches the schema ahead of the system part and a schema that changes makes every call write its fixed part again (measured in M10.28). Ids and choices go in the prompt, and the engine checks them; `tests/m1028schema.test.ts` builds every kind in two situations.
- API keys: only entered by the player in the app settings, stored with Electron `safeStorage`. Never log, print, commit or put a key in a test. Never type a real key anywhere yourself.
- Content lives in `content/<world>/` as YAML validated with zod: `base` is the Nethermarch, `isle` is Skerrow. An id is a key and never changes once committed; names, labels and descriptions may change freely. Deleting or merging something leaves a tombstone, so old saves and logs still load (M9.1: `ids.lock` per world). The game's own texts take region, calendar, coins and law from `world.yaml`, never hard-coded Nethermarch names.
- Randomness is seeded per system, and every world change is an event in the log, so runs can be replayed.
- A new kind of event is content, not code: a watcher and, if needed, a standard aftermath in the world's content. Write code only for a new verb or a new kind of state, and make it usable for every event. When you do write code for one kind of event, say in the milestone report why a verb or state did not suffice.
- Extend, don't replace: existing plans, goals, quest conditions and saves stay valid. Every milestone keeps the whole test suite, the 30-day simulation, the quest scripts of both worlds and loading an old save green.

## Content rules

- Names and facts of the Nethermarch come from the world book. Another world keeps its names and lore in its own folder (`world.yaml` frame and `CHRONICLER.md`). The water spirit is called the Haakman; never use the old name.
- Room descriptions: three to five sentences, second person, present tense, one non-visual sense, a hint at an exit. Topics in `[brackets]`.
- PEGI 18 with hard limits: nothing sexual involving minors, no hate against real groups, romance stays non-explicit.

## The editor and the chronicler keep up

Whenever a change adds to or changes what a world can hold (a new kind, field or file, or a new neutral default), the editor and the chronicler in the editor learn it in the same change:

- The editor can create and edit it: a form or a YAML template for the kind, the palette or world tab where it belongs, and a line under Check when it can go wrong.
- Every field has a description in its zod schema (`describe`), which `docs/CONTENT.md` carries, and a check: a field that refers to an id checks that it exists, and a text field the player sees never holds an id (M10.29 M: the chronicler once put an npc id in a craft's `maker`).
- The chronicler knows it: the contract `docs/CONTENT.md` is regenerated from the schemas (M10.17), the short contract in the writing aid's prompt (`draftRequest` in `src/engine/editor.ts`) covers it, and the world guide (`src/engine/worldguide.ts`, with `docs/NEW-WORLD.md` for people) says in which step it comes up, what the chronicler asks the designer, what happens when it is left out, and what to check.
- Skerrow always gets its own small version, in its own words, so every feature plays in a second world with real values. The test world Deepwell (`tests/worlds/other`) gets one too, unless it deliberately leaves the thing out to show the neutral default (as it has no faith and no weather); then a test plays that default.
- The milestone report says what the editor and the chronicler learnt.

## Definition of done

For every change: typecheck, tests and build pass. When a change touches what a world can hold, the editor and the chronicler are brought up to date as above. For UI changes, check the interface with `npm run web` in the browser preview and look at a screenshot. For main or preload changes, run the smoke test. Then commit with a clear message ending in the Co-Authored-By line and push to `main`. This is a solo project: no pull requests.

The repo uses a local git identity (BramVos with the GitHub noreply address) so no work email ends up in this public repository. Do not change it.

## Milestone reports

At the end of a milestone, add an entry at the top of `docs/CHANGELOG.md` in Dutch: what is new, what Bram can test and how, known gaps, and design changes. Keep it short. Ask Bram for a playtest before starting the next milestone, unless he asked for several milestones in a row.

Every entry ends with a line `Ontwerp:` that names the chapter of the functional design or of the lore design (in Claude Docs) that was brought up to date for it, or says `geen wijziging` when the milestone changed nothing in the design. A milestone that adds a mechanism the design does not describe (a new kind of state, screen, round or call) gets a "Stand na M<n>" paragraph in the relevant chapter before the entry is written, never afterwards. The design session (Claude in Bram's design conversation) checks this at every milestone and writes the paragraph itself when it is missing.

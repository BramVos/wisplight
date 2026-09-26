# Wisplight: working agreements for Claude

Claude builds Wisplight for Bram, milestone by milestone. Bram playtests and makes the product decisions. Talk to Bram in Dutch; write code, comments, in-game text and commit messages in English (British spelling).

## Sources of truth

- Functional design (Dutch, Claude Docs): https://claude.ai/artifact/S623tFYjjDCXxuiyEcMScq (docs project `cb27d50f-1429-46de-bb3f-536cc531c492`). This is the spec.
- World book (Dutch, Claude Docs): https://claude.ai/artifact/SimoCMSdUyTgXD3YFjHsr3 (docs project `d0499160-99d0-4650-8c32-7b67901e4cc4`). All names, places, NPCs, lore and quests come from here.
- Design for lore and world change (Dutch, Claude Docs, agreed with Bram; basis for M3, M3.1 and parts of M4, M6, M7 and M8): https://claude.ai/artifact/MC1NwywtuFyJrxpAJPgtAd (docs project `a3803018-9656-4c30-9f74-57255da68632`).
- Read these through the Claude Docs connector, never by web fetch. Read only the chapters the current task needs.
- `docs/design-atlas.html` is a visual snapshot of the functional design for people, dated 26 September 2026. It is not the spec: never implement from it, and when it disagrees with the design doc, the design doc wins.
- `docs/chronicler-atlas.html` is the same kind of snapshot for the lore and world-change design (the chronicler), dated 27 September 2026. The same rule applies: the design doc in Claude Docs wins.
- `docs/ROADMAP.md` lists the milestones with acceptance criteria. Work on the first unfinished milestone unless Bram says otherwise, and tick criteria off in that file as they pass.
- When the implementation has to deviate from the design, update the design doc in the same session and say so in the milestone report.

## Commands

```bash
npm run dev        # desktop app with hot reload
npm run play       # terminal client (accepts piped input)
npm run web        # interface only, in a browser on port 5199
npm test
npm run typecheck
npm run build
WISPLIGHT_SMOKE=1 npx electron .   # after build: hidden end-to-end check
```

## Architecture rules

- `src/engine` is headless: no imports from electron, react or `node:` modules (enforced by `tests/architecture.test.ts`). Node-only code goes in `src/node`, UI in `src/renderer`.
- The AI decides, the systems execute. Models may only propose goals, lines and bounded effects; the engine validates and applies them.
- All model calls go through one gateway with providers for OpenAI, Anthropic and a mock. Tests and headless simulations use the mock and recorded replies; they never call a real API.
- API keys: only entered by the player in the app settings, stored with Electron `safeStorage`. Never log, print, commit or put a key in a test. Never type a real key anywhere yourself.
- Content lives in `content/` as YAML validated with zod. Every id is stable once committed; renames go through an id map.
- Randomness is seeded per system, and every world change is an event in the log, so runs can be replayed.

## Content rules

- Names and facts come from the world book. The water spirit is called the Haakman; never use the old name.
- Room descriptions: three to five sentences, second person, present tense, one non-visual sense, a hint at an exit. Topics in `[brackets]`.
- PEGI 18 with hard limits: nothing sexual involving minors, no hate against real groups, romance stays non-explicit.

## Definition of done

For every change: typecheck, tests and build pass. For UI changes, check the interface with `npm run web` in the browser preview and look at a screenshot. For main or preload changes, run the smoke test. Then commit with a clear message ending in the Co-Authored-By line and push to `main`. This is a solo project: no pull requests.

The repo uses a local git identity (BramVos with the GitHub noreply address) so no work email ends up in this public repository. Do not change it.

## Milestone reports

At the end of a milestone, add an entry at the top of `docs/CHANGELOG.md` in Dutch: what is new, what Bram can test and how, known gaps, and design changes. Keep it short. Ask Bram for a playtest before starting the next milestone, unless he asked for several milestones in a row.

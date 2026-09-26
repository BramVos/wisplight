# Wisplight

A single-player text RPG set in the Nethermarch, a low, wet land full of Low Countries folklore. It looks and plays like a MUD, but every NPC is led by AI: a language model chooses what a character wants and writes what it says, and deterministic game systems carry everything else out without spending tokens.

Status: phase 0, prototype. The skeleton runs; the AI layer, planner and knowledge model are next.

## Design documents

The functional design and the world book are written in Dutch and live as private Claude Docs:

- [Functioneel ontwerp: Wisplight](https://claude.ai/artifact/S623tFYjjDCXxuiyEcMScq)
- [Wereldboek: de Nethermarch](https://claude.ai/artifact/SimoCMSdUyTgXD3YFjHsr3)

## Getting started

Requires Node 22.12 or newer.

```bash
npm install
npm run dev        # the desktop app (Electron), with hot reload
npm run play       # the game in your terminal
npm run web        # only the interface, in a browser at http://localhost:5199
npm test           # unit tests
npm run typecheck
npm run build      # production build into out/
```

A hidden end-to-end check of the desktop app: `npm run build`, then `WISPLIGHT_SMOKE=1 npx electron .` prints the first room it renders and quits.

## Layout

```text
content/                 the world as YAML (see the Wereldboek)
  base/world.yaml        start date, start location, intro text
  base/regions/...       areas, locations and NPC cards
src/
  engine/                headless game engine: no Electron, React or Node imports
  node/                  Node-only helpers, such as reading content from disk
  cli/                   terminal client
  main/                  Electron main process, runs the engine
  preload/               the bridge between window and engine
  renderer/              React interface: text log, side panels, command line
tests/                   vitest
```

The engine stays free of UI and Node imports so it can run in the Electron main process, the terminal, the tests and the browser preview. The design moves it to a separate utility process once the simulation grows.

## Decisions so far

| Topic | Decision |
| --- | --- |
| Platform | Desktop app for Mac and Windows: TypeScript, Electron, React |
| Game language | English; players may type Dutch in conversations |
| Time | Real-time clock outside combat that pauses when idle; turn-based combat |
| Travel | Handmade places, a generated hex map per region, heard-of places as fuzzy zones on the map |
| AI | OpenAI and Anthropic with the player's own key, stored encrypted; the connected model recommends a model per role from the live model list, the game tests it and the player picks |
| Rules | A slimmed-down Pathfinder 2e core: four degrees of success, three actions per turn, four attributes, levels 1 to 10 |
| Content rating | PEGI 18, with hard limits |

## Roadmap

1. Prototype: engine, ten locations, three NPCs, the bread example, first AI conversations.
2. Vertical slice: Veenhoek and Waagdam, twelve NPCs, rumours, two quests, combat, two companions, a basic world builder.
3. The whole Holleveen: 29 NPCs, ten quests, six classes, patrons, the full world builder, the AI test set.
4. Release: balance, accessibility, signed installers for Mac and Windows.

## License

No license has been chosen yet, so all rights are reserved for now.

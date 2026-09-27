# The chronicler

A language model that writes the lore of a world from what happened in it. It
does not decide what happened or who knows it: the application does. It turns
events into lore with versions for near and far, keeps a short note per
storyline, works out requests for the player from open threads, leaves
thoughts on people's minds, and writes the news of the day.

This folder has no imports from the game, so any application can use it.

## Use

```ts
import { chronicle, type ChronicleInput, type ChroniclerModel } from './chronicler'

const input: ChronicleInput = {
  instruction,          // the working instruction, e.g. content/CHRONICLER.md
  world,                // a short sketch of the world
  now: 'Monday 3 May, 04:00',
  lines,                // storylines with their new and earlier events
  cards,                // people, places and things the lines refer to
  lore, requests, areas, templates,
}

const model: ChroniclerModel = {
  // Any model gateway: gets system, prompt and a JSON schema, returns text and usage.
  complete: async (request) => myGateway.complete(request),
}

const { output, problems, usage } = await chronicle(input, model, (ids) => cardsFor(ids))
```

`output` is in your own ids: `lore`, `lines`, `quests`, `thoughts` and `news`.
Two parts are optional, and only asked for when the input offers them:

- `realms` (cards of kind `realm`) lets the chronicler propose one small shift
  between two realms, at most 5 either way, with a reason: `tensions`.
- `mayPlan` (storyline ids) marks events big enough for consequences: the
  chronicler may write a `plans` entry for them, in up to three phases, from a
  fixed vocabulary (a place's state, news for an area, a market factor between
  0.5 and 1.5, an area's people fleeing to a place for up to 14 days), at most
  ten effects. Anything outside it is dropped with a problem.

`problems` says what was dropped and why. Checks that need the world itself
(names the world does not know, who may know what) are the caller's; in
Wisplight they live in `src/engine/chronicler.ts`.

## How it keeps cost down

The fixed part of the prompt (instruction, world, how to answer) never changes
between runs, so providers cache it. The overview uses short keys (`p1`, `l1`,
`s1`) and one-line cards. The model may look things up at most three times per
run instead of getting everything at once. The reply schema is built per call
with exactly the keys of that overview.

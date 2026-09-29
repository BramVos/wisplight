# Playtest analysis: The Quiet Reach, 29 September 2026

Source: `docs/playtest/test-results-2026-09-29.md` as committed in `7d92b68` on `main` (the file is not on the checked-out branch `claude/pensive-fermi-1b2pbx`; read with `git show 7d92b68:docs/playtest/test-results-2026-09-29.md`). Read-only investigation; nothing edited.

Legend per finding: **Now** (what the code does, file:line), **Kind** (bug / content gap in The Quiet Reach / missing feature), **Fix** (smallest generic fix, works for every world), **Roadmap** (an open criterion in M10.25 to M10.28 that already covers it, or none).

None of the 25 findings is covered by an open criterion in M10.25 to M10.28. The open criteria there are about the quiet-night spark round, the talk schema shortening, the guide price (M10.27) and the cached area block, talk as messages, cache keep-alive, rule-answered lines, the gpt-5-mini comparison and the slower clock (M10.28). Two open criteria touch a finding sideways and are named where they do.

---

## 1. "Sana sells hot meals here." three times on the Commons page

**Now.** `src/engine/journal.ts:111-115`: for a seen place, one line per entry in `location.services`, `"${callName(provider)} sells ${goods} here."`. The Commons in `content/quietreach/areas/port_vesper/locations.yaml:118-141` has four services with `provider: npc_sana_holt`: `commons_hatch` (rations, tea, coffee, 07-20) and three separate `hot_meal` services for breakfast (07-09), midday (12-14) and supper (18-20). Each gives its own line; nothing merges by provider or hours, and the hours are never shown.

**Kind.** Bug (the content is the legitimate way to say "meals at three times"; the journal should fold it).

**Fix.** In `journal.ts:112-115` group services by provider, union the goods (deduplicated), and append the hours when the services of one provider do not cover the whole day: "Sana sells field rations, herbal tea, coffee and hot meals here (meals 07-09, 12-14, 18-20)." Same for the item page at `journal.ts:180-188` (dedupe per location). No content change.

**Roadmap.** None.

## 2. Only "Commons" and "Harrow" bracketed in Mara's line

**Now.** A talk line is bracketed by `TopicRegistry.link` (`src/engine/dialogue/topics.ts:85-102`) with the set `followable` built in `src/engine/dialogue/conversation.ts:687-689`: the packet's known topics of this turn, plus topics recognised in the reply text **that are already in the player's journal** (`journal[t] !== undefined`). Only after the line is shown do newly named places enter the journal (`conversation.ts:741-745`, `named` → `learn`). So on a first mention, "guest quarters" and "medical bay" (real locations `loc_guest_quarters`, `loc_medical_bay` with those aliases) are not bracketed; "Commons" is (the player is standing in it, learned at `engine.ts:346/1277`) and "Harrow" is (topic `harrow_station`, `content/quietreach/data/topics.yaml:119`, the world's `words.from`, in the journal from the start). "Landing pad" is bracketed nowhere because no location, area or topic has it as a name or alias (the Arrival Lock's aliases are `[lock, airlock, arrival airlock, arrivals]`).

**Kind.** Bug in ordering (learn happens after link), plus a small content gap ("landing pad" is not a topic or alias).

**Fix.** In `conversation.ts` compute `named` (line 741) before `shown` (line 689) and add `named` to `followable`, so a place or person the speaker just named is bracketed the first time. Content: add `landing pad` and `the pad` to the aliases of `loc_arrival_lock` (or a topic for the pad). Generic; no Nethermarch values.

**Roadmap.** None.

## 3. Dr Ilyan Sorell shows as "Dr" (journal page, "Heard from")

**Now.** `callName` in `src/engine/content.ts:719-721` is `npc.name.split(' ')[0]`. The NPC is `name: Dr Ilyan Sorell` (`content/quietreach/areas/port_vesper/npcs.yaml:58`). `knownName` (`src/engine/acquaintance.ts:32-35`) returns `callName` until the player has talked with them (familiarity > 0), so the page heading is "Dr"; the journal's `who()` (`journal.ts:239-247`) and `personView.name` (`acquaintance.ts:96`) use `callName` too; `nameOf` in `offers.ts:63`, the topic alias `first` in `topics.ts:25-27`, the moment card "from Dr" (`moments.ts:91`) and every offer/system line ("Dr gives you ...") all go through the same split. No title handling exists anywhere. The same NPC file has `Dr Edda Vale` (line 165), so it happens twice in this world.

**Kind.** Bug (a generic naming rule that breaks on any name with a title), with a content workaround available.

**Fix.** Give `NpcSchema` an optional `call` ("the name people use", editor form field, in `docs/CONTENT.md`) and make `callName` return `npc.call ?? firstWordSkippingTitles(npc.name)`, where the skip list is a short set of common English titles with or without a full stop (Dr, Mr, Mrs, Ms, Prof, Sir, Dame, Fr, Capt); Check in the editor flags a name whose first word is a title and no `call` is set. The world guide's People step asks for `call` when the name carries a title. Content: set `call: Ilyan` and `call: Edda` in The Quiet Reach. Skerrow and Deepwell need nothing (no titles) but a test plays the default.

**Roadmap.** None.

## 3a. The conversation window never shows the name once known

**Now.** The talk header is `status.talk.name = publicShort(world, npc)` (`src/engine/engine.ts:1869`), i.e. `npc.short` ("the signal technician"); `call` is `callName`. `ConversationView.tsx:165` prints `talk.name`. The room line "Here: the signal technician (at work)" is `commands.ts:342-347`, also `publicShort` only. `knownName` (`acquaintance.ts:32`) already exists and switches to the full name after a talk, but neither place uses it.

**Kind.** Bug (M10.8's `knownName` was applied to the journal, not to the window and the room line).

**Fix.** `engine.ts:1869`: `name: familiarity > 0 ? `${knownName} (${publicShort})` : publicShort`; `commands.ts:344`: the same shape for the "Here:" line ("Niko Serrin, the signal technician (at work)"). Nothing to add to content.

**Roadmap.** None.

## 4. People the background already knows: an introduction the first time

**Now.** A background may carry `knows` (`src/engine/rules/schema.ts:95-96`, "people who know you from before"). At character creation `makeCharacter` (`src/engine/rules/player.ts:191-197`) sets familiarity 30 and affinity 10 for each and puts them in the journal, silently; `arrival()` (`player.ts:715-726`) prints `reason` and notes `contact` and `heard`. Nothing tells the player who they already know or why: the journal page of such a person shows public facts and no "you know them from ..." line, and the talk prompt gets only `LISTENER: someone you know` (`prompt.ts:194-200`) without the why. The Quiet Reach has **no backgrounds at all** (`content/quietreach/rules/rules.yaml` holds only `death` and `patrons`, no classes), so `hasCharacters` is false and the whole background mechanism is off in this world.

**Kind.** Missing feature (a "how you know them" line), and a content gap (no backgrounds in The Quiet Reach; the world guide has no step that asks for them, see 6).

**Fix.** Add an optional `bond` per known person to the background: `knows: [{ npc, how: "your shipmate on the crossing from Harrow" }]` (keep the plain string form valid). `makeCharacter` writes the `how` as a source `{from:'background'}` on the person's journal page ("You know them: ...") and `arrival()` lists them once ("You know people here: X, your shipmate; Y, ..."); the talk prompt's LISTENER line for a `knows` person adds "you know them from before: {how}". Editor: the background form gets the list; contract and world guide People step mention it. Whether it goes in the world (background) or per character: it is per background, as `reason` already is; the world generator writes it in the step that writes backgrounds (see 6).

**Roadmap.** None.

## 5. Sana greets a first-time visitor with "There you are again."

**Now.** The line is not the model's. `Dialogue.start` (`src/engine/dialogue/conversation.ts:134`) opens every TALK with `fallbackReply(world, npcId, 'Greet', ...)`, and `src/engine/dialogue/fallback.ts:39` returns `"${name} smiles. \"There you are again.\""` whenever the attitude band is Friendly, Warm or Devoted (`fallback.ts:14,27`). Sana's band at the first meeting is Friendly because `attitude` (`relations.ts:35`) adds `5 * warmth` and she has warmth 3 (score 15, `band()` at `relations.ts:77-84`). Familiarity is never consulted for the greeting. The model prompt itself does say `LISTENER: the player is a stranger` when familiarity < 6 (`prompt.ts:194-200`), and there is no "met before" notion beyond that number; arrival or sharing a room does not count as met (`sawPerson`, `acquaintance.ts:55`, is the player's note of the NPC, not the other way round).

**Kind.** Bug.

**Fix.** `fallback.ts:39`: choose the greeting by familiarity as well as warmth: familiarity < 6 → a warm first greeting without "again" ("You'll be new. Sit down."), else the current line. Optionally pass the greeting through the voice kit's address for a stranger (`voice.ts`, "visitor"). Also add to `listener()` in `prompt.ts:197` the words "you have never spoken with them before" for familiarity < 6 (see 12).

**Roadmap.** None.

## 6. Why am I here: reason, contact, heard, an arrival note in the journal

**Now.** The background fields `reason`, `contact`, `heard` exist (`rules/schema.ts:102-104`) and `arrival()` (`player.ts:715-726`) prints the reason, marks the contact as "told" and puts `heard` in the journal; the talk prompt tells the contact "THE STRANGER was told to ask for you" with the reason (`prompt.ts:186-191`). The Quiet Reach's `world.yaml` has an `intro` (`content/quietreach/world.yaml:31-38`) that is shown once at the start (`engine.ts:1137-1139`) and then gone: no journal page holds it, and the world has no backgrounds (finding 4), so no reason, no contact (Dr Sorell is not marked as the person to report to), no heard topic. The world guide's steps (`worldguide.ts`: Frame, Voice, Lands, Calendar, Money, Faiths, Places, Professions, People, Economy, Transport, Signals, Palette) never ask for backgrounds or for `reason/contact/heard`; `docs/NEW-WORLD.md` does not mention them either.

**Kind.** Content gap in The Quiet Reach (no backgrounds), caused by a gap in the world guide (no step asks for them); and a missing feature (the intro/reason as a journal page).

**Fix.** (a) Journal: a page `why_here` under Quests (or a first page of the journal) with the world's `intro` and, when there is one, the background's `reason`, the contact as a link ("report to") and `heard`; shown as a system line after the intro: "It is in your journal under Why you are here." Built from data in `journal.ts`, no model. (b) World guide: the People step (or a short Backgrounds step) asks the designer for two to five backgrounds with skills, talent, `knows`, `reason`, `contact`, `heard`, and says what happens when left out (no character creation, a ready-made traveller, no reason). (c) Content: The Quiet Reach gets backgrounds (the five specialisms Bram's frame names: technical, linguistic, navigation, medical, expedition) with `contact: npc_ilyan_sorell`. It is per world (background), decided at world generation, not per character.

**Roadmap.** None (M10.9 built the fields; nothing open covers the guide step or the page).

## 7. "Head down to the dock" while we are in the Commons; where others are

**Now.** The prompt tells the speaker its own place in `SCENE: ${location.name}` (`prompt.ts:253`) and who is present (`:258`); the player is always in the same room as the speaker. For other people it gives only `YOUR DAY` and `WHERE THEY USUALLY ARE (you know their day)` (`offers.ts:495-508`, added at `conversation.ts:924-926`) and only for people who are topics of this turn or persons of an offer, and only if `knowsTheDayOf`. Nothing tells the speaker the **way** from here to there (exits, directions, minutes), and `AskDirections` gets the `explain` tier (`acts.ts:88-90`) but no route data; `peopleNow` (`people.ts:244-260`) covers only death and sickness. Sana's card holds the example line "Sorell's on the ship, you'll hear him before you see him." (`npcs.yaml:305`), which the model reused and then decorated with an invented "dock". "Down to the dock" is not a hallucination the guard can catch (`unknownNames` only flags capitalised words, `guard.ts:115-127`).

**Kind.** Missing feature (the speaker does not know the way from here to where someone is), plus a content nudge (the example line invites "on the ship" answers regardless of where Sorell is).

**Fix.** For `AskDirections`/`where` turns (and whenever the packet holds a person or place), add a line `THE WAY: from here, <place> is <direction> (<n> minutes on foot)` for each place named, from `world.route(here, place)` and the first exit of the route; and extend `WHERE THEY USUALLY ARE` to say `right now <name> is at <place>` when `thinksIsAt` (`agreements.ts:216-227`) gives a place the speaker knows. Add to the rules: "Directions only as THE WAY gives them; never invent a road, dock or door." Content: nothing required; optionally reword Sana's example so it does not fix Sorell to the ship.

**Roadmap.** None.

## 8. Location name under the picture

**Now.** `src/renderer/src/App.tsx:468-472` renders `<figure className="scene"><img alt={area name}/></figure>` with no caption; the location name is only in the status line (`App.tsx:683`). The picture is per area (`App.tsx:114, 362`).

**Kind.** Missing feature (small UI).

**Fix.** Add `<figcaption>{status.location} · {status.area}</figcaption>` under the image (and the same caption when there is no picture yet). Check with `npm run web` and a screenshot.

**Roadmap.** None.

## 9. The map inside a settlement with several locations in one area

**Now.** The region map draws one hex per area; every location of Port Vesper (Arrival Lock, Commons, Guest Quarters, Medical Bay) sits on the same hex, and the minimap is the `local` mode of the same hex map (`HexMap.tsx:38, 341-411`; labels are per place/area in `map/view.ts:61-89`). There is no drawing of the locations of one area and their exits. The journal's `map` page kind (`journal.ts:36`, `page.map`) is the ASCII region map, not a local plan.

**Kind.** Missing feature. (Bram also asks whether it should stay this way for discovery's sake: a product decision.)

**Fix.** A small "here" plan built from data only: the locations of the current area that the player has seen (`player.seen`) plus the exits between them, laid out from the exit directions (north/south/east/west/in/out/up/down) as a tiny grid of boxes and lines, shown under the minimap and on the area's journal page; unseen neighbours as a dotted stub with the direction only. Generic (every world has locations and exits); no content change.

**Roadmap.** None.

## 10. "I'll be done at seventeen thirty, you know where the common room is?" made no appointment

**Now.** A `meet` offer exists only when `parseWhen` finds a time in the **player's** words (`offers.ts:227` `const when = parseWhen(text, world.now)`; `:257` meet at a named place, `:270` meet here). A time said by the NPC in its reply creates nothing: reply text is never parsed for a time, and `propose` can only pick an offer key that already exists (`schema.ts:88-89`, `conversation.ts:771`). So Tessa's line was words only; no agreement, no goal, and she stayed at work (her `work: loc_workshop`, `hours` in the day plan). Had a `meet` agreement existed, `agreements.ts:407 meet(world, a)` would have driven her to the place and settled `kept`/`missed` (`:141-146`, `agreements.meet_late_minutes`), and a missed meeting is a broken word both ways (`:284`, `:372`). The guard's `PROMISE` regex (`guard.ts:43`) does not match "I'll be done at ... you know where the common room is" (no take/show/meet verb), so the retry did not fire either.

**Kind.** Bug in the guard's coverage, and a missing feature: a time or place the NPC proposes in words should become a `meet` proposal.

**Fix.** Two small pieces: (a) after a reply, run `parseWhen(replyText)` and, if a time and a known place (topic recognised in the reply, else `here`) come out and the decision for `meet:<place>` would be yes, set `talk.proposal` to that meet offer and show `proposalText` ("Tessa offers to meet you at Commons, 17:30. YES to agree"), so the player's yes makes the agreement; (b) widen `PROMISE` (`guard.ts:43`) with "I'll be done at|I'll be there|see you at|come (by|back) at|at (\d|one|two|...)" so an unbacked promise is asked again. `parseWhen` needs "seventeen thirty" as spoken numbers (currently digits and one to twelve only, `offers.ts:76-83`). Both generic.

**Roadmap.** Sideways: M10.28 "Geen model voor wat de regels kunnen" is about rule-answered lines, not this. None covers it.

## 11. The clock ran on while the ended talk's window stayed open

**Now.** `src/main/index.ts:144-148`: `paused()` is combat, `held`, `engine.state.talk`, or idle. When a talk ends, `state.talk` is cleared (`conversation.ts:790, 795, closeNow`) and the renderer keeps the window open from `lastTalk` (`engine.ts:201, 287, 1341`; `App.tsx:107, 792-803`), but nothing holds the clock: the interval at `main/index.ts:1148` ticks every second. `held` is set by the renderer through `client.hold` (`App.tsx:209`, IPC `engine:hold`, `main/index.ts:1040-1051`) for settings, journal, creation, moments and so on, but not for the ended-talk window.

**Kind.** Bug.

**Fix.** `App.tsx:209`: include `Boolean(ended)` in the `hold` condition. One line, no engine change.

**Roadmap.** M10.28 "Een rustiger klok" changes the pace, not this pause; not covered.

## 12. "I showed you this morning": shared history with a stranger

**Now.** The prompt gives `LISTENER: the player is a stranger` for familiarity < 6 (`prompt.ts:194-200`), `MEMORIES of the player` from the last five `memory_note`s (`prompt.ts:288`, `conversation.ts:625`) and `CONVERSATION SO FAR` (last four lines, `prompt.ts:289`). There is no sentence saying "you have never met; nothing has happened between you beyond MEMORIES and this talk". Worse, `memory_note` is stored unchecked (`conversation.ts:729-730`), so a fabricated "I showed the stranger the bunk" becomes a memory the next turn reads back as fact. Sana's first reply "Sana smiles warmly." with no words is a reply that passed with an action only (`ReplySchema.reply: min(1)`, no check for empty quotes), so the bunk question was never answered before the invented history.

**Kind.** Bug (unverified memory notes feed back), missing prompt line.

**Fix.** (a) `listener()` for familiarity < 6: append "You have never spoken with them before this talk and have done nothing together; nothing has happened between you that is not in MEMORIES or CONVERSATION SO FAR." (b) `memory_note` description in `schema.ts:119`: "only what was actually said or done in this talk"; and drop a note that claims a deed (the `PROMISE`-like verbs in past tense: showed, gave, took, brought) when no agreement of that kind exists in the register. (c) Treat a reply whose quoted speech is empty (no `"..."` with words) as a stock-line failure and ask again. Generic.

**Roadmap.** None.

## 13. "Come on, I'll point you right" and nobody moves

**Now.** `ACTS` (`acts.ts:5-34`) has no act for leading; leading is an **offer** of kind `lead` (`offers.ts:30`, built at `:257` for a place topic the speaker knows and is not at). Here the player's words ("where I can sleep") matched no place topic (Guest Quarters aliases: `quarters, bunks, dormitory, my bunk`; `content/quietreach/areas/port_vesper/locations.yaml:145`), so no `lead` offer existed; and Sana was at work, which costs 30 points in `willing` (`offers.ts:171-174`), so the decision would have been no anyway. The model said it in text only; the `PROMISE` regex (`guard.ts:43`) does not contain "point you", "see you to", "come on", so no retry. Text-only leading does nothing.

**Kind.** Bug in the guard's coverage (a promise slipped through), and the same design limit as 10.

**Fix.** Extend `PROMISE` with `point you|see you (to|there)|walk you|come on(,| —)|this way|follow me` (last two already partly there); when the reply promises a `lead` and no offer exists, the retry line already tells the model to choose an offer or say what it cannot do. Content: add `bunk`, `sleep`, `bed` to the Guest Quarters aliases so "where can I sleep" makes the place a topic and a `lead` offer exists. Generic plus a small alias fix.

**Roadmap.** None.

## 14. `use electronics bench examine` runs a repair and ends with "You have ."

**Now.** `pickAffordance` (`commands.ts:906-911`) did pick the right affordance: `examine_lamp` (`content/quietreach/data/object_types.yaml:21-32`, verb `examine`, `check.dc: 8`, `craft: field_electronics`, no `consumes`, no `produces`, no `failure`). Then `makeWith` (`commands.ts:923-958`) treats every craft affordance as a recipe: on failure `failedMake` (`outcomes.ts:37-70`) falls back to the **craft's** failure text (`crafts.yaml:16-18`: "The material went into a repair that did not hold") because the affordance has none, and on success prints `You have ${what}` with `what` empty (`commands.ts:951-952`) because nothing is produced. So the "repair" wording and the dangling "You have ." both come from an affordance that examines rather than makes. (The abrupt last sentence Bram saw is that "You have .")

**Kind.** Bug (a craft affordance without produces is a diagnosis/lesson, not a make; the code assumes a make).

**Fix.** In `makeWith`: when `produces` is empty, omit the "You have ..." sentence (say only `player_text`); in `failedMake`, when `consumes` is empty use a neutral "You find nothing wrong that you can name yet." and skip the craft's material `why` (or let the affordance set its own `failure.why`, which the editor's Check asks for when a craft affordance has no consumes). No content change required, though `examine_lamp` could get its own `failure: { outcome: lost, why: "You looked at the wrong end of the cable first." }`.

**Roadmap.** None.

## 15. `use electronics bench learn`: Tessa teaches while absent

**Now.** The `lesson` affordance (`object_types.yaml:7-20`) is `access: public`, `fee: 1500`, with `player_text` that names Tessa. `use()` (`commands.ts:840-856`): `cannotUse` (`:967-983`) only checks presence when the **instance** has `provider` (`instance.provider && !world.objectOpen`); the bench instance (`vesper_works/locations.yaml:62-68`) has `owner`, `staff` and `hours` but no `provider`, so nobody has to be there; `workplaceLeave` (`crafts.ts:239-264`) is skipped for `access: public`; and the fee is charged only `if (affordance.fee > 0 && instance.provider && access === 'public')` (`commands.ts:851`), so the 15 cr lesson was free. The real lesson mechanism is the talk offer `teach` (`offers.ts:334-353`, `craftLessonOffer`, `lesson()` in `crafts.ts:287-311`), which needs the master present and trusting the stranger. Then "You have ." again (finding 14).

**Kind.** Content gap in The Quiet Reach (a lesson written as a public bench affordance instead of the `teach` offer / `access: staff`), and a missing generic check (an affordance that names a person should need that person).

**Fix.** Generic: an optional `with: <npc id>` on an affordance ("done with this person; they must be here and awake"), checked in `cannotUse` with the message "X is not here."; the editor's Check warns when `player_text`/`narrate_start` of an affordance names an NPC of the world and neither `with` nor `access: staff` is set. Content: give `lesson` `with: npc_tessa_rook` (or drop it and rely on the `teach` offer, which already exists for `chief_engineer` through `crafts.yaml:5`).

**Roadmap.** None.

## 16. No cooldown after repeated failures

**Now.** Nothing limits attempts. `crafts.per_day` (`crafts.yaml:15`, `crafts.ts:114-117`) caps what a day **teaches**, not tries; `knobs.ts:66-68` has `crafts.mastered_after`, `crafts.lesson_practice`, `crafts.lessons`; the only cooldown knob is `tides.cooldown_days`. Each try costs its `duration` (30 minutes for `examine_lamp`) and the consumed material, which is the whole brake.

**Kind.** Missing feature.

**Fix.** A generic world knob `crafts.fail_cooldown` (default `{ after: 3, minutes: 120 }`, neutral default off when a world leaves it out) and a `cooldown_text` per craft or affordance in content ("The iron has overheated; let it cool."); `makeWith` counts consecutive failures per `type:affordance` in `CraftProgress` and refuses within the cooldown with that text. The editor's craft form gets the field; the world guide's Professions step mentions it; Skerrow and The Quiet Reach get one line each in their own words.

**Roadmap.** None.

## 17. `use <inventory item>`, `get <item> from pack`, `l terminal`

**Now.** `use()` (`commands.ts:816-839`) looks in the inventory **only for items with `remedy`** (`:821-829`); everything else is matched against the objects of the room, hence `There is no "short-range communicator" here to use.` `ItemSchema` (`content.ts:63-70`) has no `use`/`read` text for an item. `take` (`commands.ts:138-141`, `:514-560`) reads `X from Y` as taking out of a chest here, hence `There is no pack here.` `look terminal` works because `lookThing` (`looking.ts:91-103`) searches the inventory and prints "(in your pack)". So looking is the only verb that sees the pack.

**Kind.** Missing feature (items have nothing to do), plus two clumsy messages.

**Fix.** (a) `ItemSchema`: optional `verbs: Record<string,string>` like a detail's (`use`, `read`, `open` ...), and `use()`/`examine` fall through to `item.verbs[verb]` for an inventory item before the room objects; without a text, "You turn the X over in your hands; there is nothing to do with it here." instead of "There is no X here to use." (b) `take X from pack|bag|inventory` → "It is already in your pack." (c) Content: The Quiet Reach gives `pocket_terminal` a `read`/`use` text and `communicator` a `use` text (the world already has the prose for them in `items.yaml:265-279`); Skerrow one item too. Editor item form and contract learn `verbs`.

**Roadmap.** None.

## 18. "Use what? 1. electronics bench" does not say how to cancel

**Now.** `offer()` (`choice.ts:38-42`) prints only the question and the numbered list. `answerChoice` (`choice.ts:50-64`): a number picks, a fitting name picks, anything else drops the choice and runs as a new command. `x` is not a cancel: the parser maps `x` to `examine` (`parser.ts:61`), which is why Bram got "Workshop" (the room) back.

**Kind.** Missing hint (small UI/text).

**Fix.** `choice.ts:41`: append a last line "(a number, the name, or anything else to leave it)". The renderer could also render the options as buttons with a "[leave it]" button, but the text line is enough and works in the terminal client too.

**Roadmap.** None.

## 19. Tab completion in the input box

**Now.** No `Tab` handling anywhere in the renderer (`App.tsx` main input `onKeyDown` at `:320-330` handles Enter and ArrowUp/Down only; `ConversationView.tsx:111-122` the same). Tab moves browser focus. The engine already has the option lists a completer needs: `lookOptions` (`commands.ts:378-389`), exits, people here, and the journal index names (`engine.ts:1908-1939`, sent to the renderer as `status.journal`).

**Kind.** Missing feature.

**Fix.** In both inputs: on Tab, `preventDefault`, take the last word(s) after the verb, collect candidates from `status.journal` names, the people here, the exits, the objects and details of the room (add a `status.completions: string[]` from the engine built from `lookOptions` + exits + `npcsAt`), and complete the unique prefix; on several matches show them as a system line ("Documents, Door"). Shift-Tab keeps the focus move for accessibility.

**Roadmap.** None.

## 20. `l hangar`: "In: Peregrine Hangar ... It is 3 minutes on foot" reveals the locked place

**Now.** `examine` → `examineHere` → after details, objects and things, `lookThere` (`commands.ts:422-424`, `looking.ts:69-85`) matches the exit whose target's name or aliases equal the words (`hangar` is an alias of `loc_peregrine_hangar`), and prints direction, **target name, target summary** ("The locked hangar where the experimental ship Peregrine stands under maintenance.") and the exit's `minutes` ("3 minutes on foot" from `exits.in.minutes: 3`, `vesper_works/locations.yaml:39`). It does not check whether the player has seen or heard of the target; a place behind a sealed door is described as freely as an open road. The Workshop's detail `[hangar door, door, restricted door]` was not matched because `detailHere` (`looking.ts:119-127`) matches the last word only ("hangar" ≠ "door").

**Kind.** Bug (a look through an exit gives away what is behind it); the minutes line is by design (walking time of the exit) and is not a world-builder issue.

**Fix.** In `lookThere`: if the target is not in the journal (`player.journal[target.id] === undefined`) and not seen, say only what is visible from here: the direction, the exit's own description if a detail of this room matches the way (try the target's aliases against the room's details, e.g. "hangar" against "hangar door"), and the way ("In: a sealed door marked RESTRICTED. It is 3 minutes on foot."); the name and summary come once the place is known. Also let `detailHere` match any word of a detail's phrase, not only the last. No content change.

**Roadmap.** None.

## 21. Area page lists places I never saw (Peregrine Common Deck, Peregrine Hangar)

**Now.** The area page (`journal.ts:124-129`) links every location of the area that is in the journal (`link()` at `:54` checks `journal[id] !== undefined`), with the "< 1 km" label from the index (`engine.ts:1908`, `kmFromPlayer`). Those two got into the journal from talk: `conversation.ts:741-745` learns every person/place the speaker's reply names that the speaker knows at level ≥ 1, and Sana's "Sorell's on the ship" matched the alias `the ship` of `loc_peregrine_common_deck` (`vesper_works/locations.yaml:80`), Mara's "the locked hangar" matched `the hangar`. That is by design (heard of), but the page and the index show a heard-of place exactly like a visited one; only far places get the "(heard of)" suffix (`engine.ts:1914`). The place page itself does say "You haven't been there yourself." (`journal.ts:117`).

**Kind.** Design working as built, with a presentation gap (heard-of and seen places look the same in lists); plus a sharp alias (`the ship`) that makes any mention of "the ship" a lesson about the Common Deck.

**Fix.** In the index and on the area page, label a location that is in the journal but not in `player.seen` as "heard of" (the same suffix the far places get, `engine.ts:1914`), and put seen places first. Content: drop `the ship` from the Common Deck's aliases (or move it to the hangar's ship detail) so "the ship" in speech does not teach a restricted deck. Generic.

**Roadmap.** None.

## 22. Earlier talks in the conversation window and in the journal

**Now.** `TalkState.history` (`state.ts:378`) keeps at most 12 lines of the current talk (`conversation.ts:747-748`) and dies with it; `talk.lines` (up to `MAX_TALK_LINES = 160`, `engine.ts:231, 1334-1341`) is per talk and not saved (`lastTalk` is in memory only, `engine.ts:287`). What persists per person is `NpcState.memory` (model memory notes, last five in the prompt, `prompt.ts:288`) and `NpcState.recent` (deeds, `execute.ts:331`). The Transcript of M10.4 (`ROADMAP.md:421-422`) is a Markdown file of everything on screen, not per person. So no per-person transcript exists to show.

**Kind.** Missing feature.

**Fix.** A per-person ring in the save, `player.talks[npcId]: { t, speaker, text }[]` capped by a knob (say 40 lines), written from `keepTalkLines`; the conversation window shows the last N lines of the previous talk greyed above the current one ("Earlier, Primeday 18: ..."), and the person's journal page gets a "Last talks" section with the day and the lines (or a link to a talk page per day). Not fed to the model: the prompt keeps its four lines and the memory notes, so cost does not change.

**Roadmap.** M10.28 "Het gesprek als berichten" changes how history goes to the model within a talk; it does not keep or show earlier talks. Not covered.

## 23. Niko said "28" but the card still says "ask"

**Now.** `toldAge` (`acquaintance.ts:69-72`) is called only when the **player's** words match `asksAge`'s regex `how old|your age|hoe oud|je leeftijd|uw leeftijd` (`acquaintance.ts:75-78`, `conversation.ts:709`). The "ask" button sends "How old are you, if I may ask?" (`locales/en/conversation.json:40`), which matches; any other phrasing ("what's your age?" matches, "how many years have you..." does not), or Niko volunteering his age in an answer to "who are you", records nothing. The NPC's reply is never read for the number, even though the card gives the model `Age ${npc.age}` (`prompt.ts:107`). The card's "ask" button is the M10.8 design (`ConversationView.tsx:238-253`); Bram finds the word noise.

**Kind.** Bug (an age said by the person is not taken as told).

**Fix.** After a reply, if the reply text contains the person's age as digits or as a number word (`\b28\b|twenty-eight`) and the turn was about them (`AskAboutSelf`, or the player's words mention age/old/years/born), call `toldAge`. Optionally drop the "ask" word and make the guess itself the button with the title "Ask their age". Generic.

**Roadmap.** None.

## 24. Niko "gives" his notebook; nothing arrives

**Now.** Giving works only through a `give` offer built by `thingOffers` (`offers.ts:283-330`) for a topic that is an **item of the world** (`offersFor`, `offers.ts:223`), and `accept` moves it only if the NPC's inventory or home ground holds it (`offers.ts:520-546`). Niko's notebook exists only as words in his `appearance` ("a notebook swollen with damp", `npcs.yaml:120`); there is no item `notebook`, so no offer, no `action`, nothing moved. The model wrote the handing over in text; `PROMISE` (`guard.ts:43`) catches "I'll give" but not present-tense deeds ("hands you", "gives you", "passes you the notebook"), so no retry. The guard does not know that a thing named in the reply is not an item.

**Kind.** Content gap (the notebook is not an item Niko carries) and a guard gap (a gift in the text with no `give` action passes).

**Fix.** Guard: treat a reply that says `(hands|gives|passes|slides|holds out) (you|the stranger)` or `here, take` with no `give`/`lend`/`sell` action as a promise → the existing retry ("choose an OFFER with decision yes, or say what you can and cannot do"). Content: The Quiet Reach adds an item `signal_notebook` (Niko's notes; value, `tags: [personal]`) in Niko's `inventory`, so `give`/`lend` offers exist and the decision (he needs it for his work, `needs()` at `offers.ts:265-273`) is a reasoned no or a lend. Editor's Check: warn when an NPC's `appearance` names a carried thing that is not in their inventory (heuristic: "notebook|bag|knife|book|letter" is not generic enough, so keep it to a note in the world guide's People step: "things a person carries that the stranger may ask for go in `inventory` as items").

**Roadmap.** None.

## 25. No events seen; no popup at arrival

**Now.** `content/quietreach/data/watchers.yaml` has eleven watchers (death, missing, injury, theft, shortage, departure, three repairs, danger_past, signal_anomaly) and `aftermath.yaml` has standard aftermaths (e.g. `am_holding_the_name`, `am_return_check`, one on `signal_anomaly` at line 284), so the event layer is there but only fires on facts of those kinds, none of which happens in a first hour. Moment cards (`moments.ts:61-95`) come from three sources: a place with `arrival` text (`content.ts:426`, `moments.ts:67-72`), a landmark rising into view (`arrival.far`), and a tiding of `belang ≥ moments.tidings_belang`. **No location in The Quiet Reach has `arrival`** (grep: none; the Nethermarch has 13), so the arrival card never shows; the intro text is a plain text line, not a card (`engine.ts:1137-1139`). The world guide's Places step (`worldguide.ts:230`) does not ask for `arrival` (grep finds it only in the contract table `docs/CONTENT.md:113`), and `docs/NEW-WORLD.md` does not mention it. There is no "start tiding" mechanism in the content schema (`signal: start` does not exist; `'start'` in `quests/engine.ts:244` is a quest-plan verb).

**Kind.** Content gap in The Quiet Reach (no `arrival` texts, no early-firing watcher), caused by a world-guide gap (Places step never asks for `arrival`; Signals step asks only for aftermath of standard kinds), plus a small missing feature (the start as a card).

**Fix.** (a) World guide Places step: ask for `arrival` (text, and optionally `night`, `mist`, `storm`, `far`) on the start location and on every landmark or settlement gate, and say that without it no card is shown; `docs/NEW-WORLD.md` the same. (b) Engine: show the world's `intro` as a moment card at a new game (kind `arrival`, title the start location) so every world has a first popup even before it has `arrival` texts; a `fresh` flag already exists in `momentsNow`. (c) Content: The Quiet Reach gets `arrival` on `loc_arrival_lock`, `loc_commons`, `loc_peregrine_hangar`, the ridge station and the coastal path, and Skerrow keeps its wreck; the Signals step could also suggest one watcher that fires in the first day for a written world (in The Quiet Reach: a `signal_anomaly` fact recorded when the player first reads the listening-room log). Deepwell keeps none and a test plays the intro card default.

**Roadmap.** None.

---

## Cross-cutting notes for roadmap criteria

- Findings 5, 12 and 23 are all about what the talk prompt and the rules assert about acquaintance: one criterion "what the speaker knows of the stranger" could take all three (first greeting by familiarity, an explicit never-met line, memory notes bounded to what was said, a told age read from the reply).
- Findings 10, 13 and 24 are the same hole in the guard: a deed or promise in words without an offer behind it. One criterion "words are never deeds": widen `PROMISE` to present-tense deeds and times, and turn an NPC-said time into a `meet` proposal.
- Findings 4, 6 and 25 are world-guide gaps (backgrounds with reason/contact/heard/knows; `arrival` texts) plus the matching content for The Quiet Reach; per `CLAUDE.md` the editor, the contract and the guide must learn them in the same change, and Skerrow and Deepwell get their small versions.
- Findings 14, 15, 16 are the craft bench: a craft affordance without produces (no "You have ."), a person an affordance needs (`with`), and a failure cooldown knob.
- Findings 17, 18, 19, 20 are command/interface polish with no content dependency; 11 and 8 are one-line renderer fixes.
- Findings 1, 2, 3, 3a, 21 are journal/naming rules: merge services per provider, bracket first mentions, a `call` name for titles, the known name in the window and the "Here:" line, and heard-of marks on places.

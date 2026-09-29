import type { LlmRole } from './dialogue/llm'

// Every kind of model call the game makes (M10.20; Bram, 28 September 2026:
// is every kind of call really tried, and where does that stand?). One row a
// `schemaName`: who answers it and what it is for. docs/COVERAGE.md is made
// from this table, the tests and the recorded replies (npm run coverage), and
// a test fails when the code makes a kind of call that has no row here.

export interface ModelKind {
  kind: string
  role: LlmRole
  /** What the call is for, in a line. */
  does: string
  /** Where in play or building it comes up. */
  when: 'play' | 'night' | 'editor' | 'settings'
}

export const MODEL_KINDS: readonly ModelKind[] = [
  { kind: 'npc_reply', role: 'voice', does: 'A person answers the stranger in a conversation.', when: 'play' },
  { kind: 'party_reply', role: 'voice', does: 'Two or more people answer the stranger together.', when: 'play' },
  { kind: 'chat_line', role: 'brain', does: 'A line between two people the stranger overhears.', when: 'play' },
  { kind: 'journey', role: 'chronicler', does: 'The paragraph of a journey on foot or by passage.', when: 'play' },
  { kind: 'improvise', role: 'voice', does: 'What an act the rules have no way for does, within what the content allows.', when: 'play' },
  { kind: 'npc_goals', role: 'brain', does: 'A person chooses a goal where the rules leave a choice.', when: 'play' },
  { kind: 'far_place', role: 'chronicler', does: 'A far place becomes playable (an old save that still waits for one; since M10.21 a far place comes from templates).', when: 'play' },
  { kind: 'district', role: 'chronicler', does: 'A district of a far town becomes playable when the stranger does something there or goes into it.', when: 'play' },
  { kind: 'expansion', role: 'chronicler', does: 'What lies beyond the edge of the world book, charted when the stranger goes on into the unknown: one region or one land.', when: 'play' },
  { kind: 'land', role: 'chronicler', does: 'A land the designer only framed: how its people speak, their names, coins and law, when the stranger first comes in.', when: 'play' },
  { kind: 'region_story', role: 'chronicler', does: 'The story of a new region at arrival: a quest of two or three stages, watchers on the world\'s standard aftermath, lore and secrets.', when: 'play' },
  { kind: 'weave', role: 'chronicler', does: 'The new people of a district woven into the world: bonds, a secret, a thread home.', when: 'play' },
  { kind: 'chronicle', role: 'chronicler', does: 'The nightly round: lore, requests and storylines from the day.', when: 'night' },
  { kind: 'tides', role: 'chronicler', does: 'The great lines judged on the first of the month: nothing, a threat or the event, within what the rules allow.', when: 'night' },
  { kind: 'lore_check', role: 'brain', does: 'A second look at big lore: what it says that no fact says.', when: 'night' },
  { kind: 'legends', role: 'chronicler', does: 'Old lore retold as a legend.', when: 'night' },
  { kind: 'outline', role: 'chronicler', does: 'The outline of a far place: a few people, an inn, a market, what goes on there (since M10.21 when the stranger talks or stays the night there).', when: 'play' },
  { kind: 'builder_draft', role: 'chronicler', does: 'The writing aid in the editor proposes changes to a world.', when: 'editor' },
  { kind: 'world_step', role: 'chronicler', does: 'A step of building a world with the designer (and a round to put it right).', when: 'editor' },
  { kind: 'world_enhance', role: 'chronicler', does: 'Enhance with AI: more of what a built world has little of.', when: 'editor' },
  { kind: 'world_polish', role: 'chronicler', does: 'The polish round of place descriptions.', when: 'editor' },
  { kind: 'palette_draft', role: 'chronicler', does: 'The colours of a world\'s map.', when: 'editor' },
  { kind: 'voice_draft', role: 'chronicler', does: 'The voice kit of a world.', when: 'editor' },
  { kind: 'model_advice', role: 'advisor', does: 'Which models to choose for the roles.', when: 'settings' },
  { kind: 'test_call', role: 'advisor', does: 'A short call to see that a chosen model answers.', when: 'settings' },
]

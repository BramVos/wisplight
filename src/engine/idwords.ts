// Never an id in text (M10.29 M; Bram's journal said "The stranger is a
// journeyman npc_tessa_rook now": the chronicler had put Tessa's id in a
// craft's maker). A word in a text the player sees that looks like an id is
// a fault: one with the prefix of a kind of id, or an id of the world that has
// an underscore in it (a plain word like "rye" may be an item's id and a word).

/** The prefixes the ids of a world carry. */
export const ID_PREFIXES = ['npc_', 'loc_', 'area_', 'craft_', 'item_', 'obj_', 'quest_', 'fact_', 'far_', 'realm_', 'faction_', 'sketch_', 'req_', 'chr_'] as const

/** The words of a text that look like ids: with a known prefix, or an id of the world with an underscore. */
export function idWordsIn(text: string, ids?: ReadonlySet<string>): string[] {
  const words = text.match(/[a-z][a-z0-9]*(?:_[a-z0-9]+)+/g) ?? []
  return [...new Set(words.filter((w) => ID_PREFIXES.some((p) => w.startsWith(p)) || ids?.has(w)))]
}

/** Whether a whole value is an id rather than words: "npc_tessa_rook", "field_electronics". */
export function looksLikeId(value: string, ids?: ReadonlySet<string>): boolean {
  const v = value.trim()
  return /^[a-z][a-z0-9]*(_[a-z0-9]+)+$/.test(v) && (ID_PREFIXES.some((p) => v.startsWith(p)) || Boolean(ids?.has(v)))
}

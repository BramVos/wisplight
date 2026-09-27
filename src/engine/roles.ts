// The roles of a relation, in their own module so the content schema and the plan schema can share them.

/**
 * Who someone is to this NPC (FO, chapter 8, "De relatie"). The role says what
 * the other is to this NPC: `child` means "my son or daughter". A relation is
 * written once; the other side is derived (parent, employee, debtor, ...).
 */
export const RELATION_ROLES = [
  'parent',
  'child',
  'spouse',
  'sibling',
  'grandparent',
  'grandchild',
  'kin',
  'sweetheart',
  'friend',
  'rival',
  'employer',
  'employee',
  'foreman',
  'crew',
  'creditor',
  'debtor',
  'teacher',
  'pupil',
  'neighbour',
  'acquaintance',
] as const
export type RelationRole = (typeof RELATION_ROLES)[number]

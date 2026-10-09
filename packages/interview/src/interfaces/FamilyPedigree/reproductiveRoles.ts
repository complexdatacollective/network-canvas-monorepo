import type { FamilyLink } from './model';

/**
 * A role in someone else's conception or birth, read out with the person's
 * symbol: a donor, a traditional surrogate (a donor who carried the
 * pregnancy), or a gestational carrier (a surrogate, who has no genetic tie).
 * A parent who raises the child has none of these roles, whether or not they
 * carried. The drawing shows no mark for them.
 */
export type ReproductiveRole =
  | 'donor'
  | 'traditionalSurrogate'
  | 'gestationalCarrier';

const ORDER: readonly ReproductiveRole[] = [
  'donor',
  'traditionalSurrogate',
  'gestationalCarrier',
];

/** The role a parent link gives its parent, if any. The one place a role is
 * derived from a link's kind and carrier flag. */
function reproductiveRoleOf(
  link: Pick<FamilyLink, 'kind' | 'isGestationalCarrier'>,
): ReproductiveRole | undefined {
  if (link.kind === 'surrogate') return 'gestationalCarrier';
  if (link.kind === 'donor') {
    return link.isGestationalCarrier ? 'traditionalSurrogate' : 'donor';
  }
  return undefined;
}

/** Every role a person has in the family, each once, in a fixed order. */
export function reproductiveRolesOf(
  links: readonly FamilyLink[],
  personId: string,
): ReproductiveRole[] {
  const roles = new Set<ReproductiveRole>();
  for (const link of links) {
    if (link.source !== personId) continue;
    const role = reproductiveRoleOf(link);
    if (role) roles.add(role);
  }
  return ORDER.filter((role) => roles.has(role));
}

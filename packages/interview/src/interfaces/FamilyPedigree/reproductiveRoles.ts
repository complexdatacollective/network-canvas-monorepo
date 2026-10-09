import type { FamilyLink } from './model';

/**
 * A role in someone else's conception or birth, drawn as a letter beside the
 * person's symbol (Bennett et al. 2022): D for a donor, S for a traditional
 * surrogate (a donor who carried the pregnancy), GC for a gestational carrier
 * (a surrogate, who has no genetic tie). A parent who raises the child gets no
 * letter, whether or not they carried.
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

/** The role a parent link gives its parent, if any. The one place the
 * letters are derived from a link's kind and carrier flag. */
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

import {
  PEDIGREE_COMPLETENESS_SCOPES,
  type PedigreeCompletenessScope,
  type PedigreeRelativesNotRecorded,
} from '@codaco/protocol-validation';

import type { Family } from './model';

/**
 * Something the participant still needs to record about one person before
 * their family is complete enough to continue.
 *
 * - `parents`: the person has fewer than two biological parents. Every person
 *   has two, so a parent the participant knows nothing about is still added.
 * - `siblings` / `children`: none are recorded and the participant has not
 *   said there are none, or that they don't know.
 */
export type CompletenessGap = {
  kind: 'parents' | 'siblings' | 'children';
  personId: string;
};

// Gamete donors are biological parents; gestational carriers, adoptive and
// step-parents are not.
const isBiologicalLink = (kind: string) =>
  kind === 'biological' || kind === 'donor';

function biologicalParentsOf(family: Family, personId: string) {
  return family.links
    .filter((link) => link.target === personId && isBiologicalLink(link.kind))
    .map((link) => link.source);
}

function biologicalChildrenOf(family: Family, personId: string) {
  return family.links
    .filter((link) => link.source === personId && isBiologicalLink(link.kind))
    .map((link) => link.target);
}

/** Everyone who shares a biological parent with the person, half or full. */
function biologicalSiblingsOf(family: Family, personId: string) {
  const parents = new Set(biologicalParentsOf(family, personId));
  if (parents.size === 0) return [];
  return family.people
    .filter(
      (person) =>
        person.id !== personId &&
        biologicalParentsOf(family, person.id).some((parent) =>
          parents.has(parent),
        ),
    )
    .map((person) => person.id);
}

const includes = (
  scope: PedigreeCompletenessScope,
  level: PedigreeCompletenessScope,
) =>
  PEDIGREE_COMPLETENESS_SCOPES.indexOf(scope) >=
  PEDIGREE_COMPLETENESS_SCOPES.indexOf(level);

/**
 * What the participant still has to record for their family to reach the
 * researcher's completeness scope, nearest relatives first. Each scope adds to
 * the one before:
 *
 * - `parents`: the participant's two biological parents.
 * - `firstDegree`: their siblings and children.
 * - `grandparents`: each biological parent's own two biological parents and
 *   siblings (the participant's grandparents, aunts and uncles).
 * - `secondDegree`: each sibling's children and each child's children
 *   (nieces, nephews and grandchildren).
 * - `thirdDegree`: each aunt's and uncle's children (first cousins).
 */
export function findCompletenessGaps(
  family: Family,
  scope: PedigreeCompletenessScope,
): CompletenessGap[] {
  const egoId = family.egoId;
  if (!egoId) return [];
  const gaps: CompletenessGap[] = [];

  const needParents = (personId: string) => {
    if (biologicalParentsOf(family, personId).length < 2) {
      gaps.push({ kind: 'parents', personId });
    }
  };
  const answered = (
    personId: string,
    none: PedigreeRelativesNotRecorded,
    unknown: PedigreeRelativesNotRecorded,
  ) => {
    const notRecorded = family.byId.get(personId)?.relativesNotRecorded ?? [];
    return notRecorded.includes(none) || notRecorded.includes(unknown);
  };
  const needSiblings = (personId: string) => {
    if (
      biologicalSiblingsOf(family, personId).length === 0 &&
      !answered(personId, 'noSiblings', 'siblingsUnknown')
    ) {
      gaps.push({ kind: 'siblings', personId });
    }
  };
  const needChildren = (personId: string) => {
    if (
      biologicalChildrenOf(family, personId).length === 0 &&
      !answered(personId, 'noChildren', 'childrenUnknown')
    ) {
      gaps.push({ kind: 'children', personId });
    }
  };

  const parents = biologicalParentsOf(family, egoId);
  const siblings = biologicalSiblingsOf(family, egoId);
  const children = biologicalChildrenOf(family, egoId);

  needParents(egoId);
  if (includes(scope, 'firstDegree')) {
    needSiblings(egoId);
    needChildren(egoId);
  }
  if (includes(scope, 'grandparents')) {
    for (const parentId of parents) {
      needParents(parentId);
      needSiblings(parentId);
    }
  }
  if (includes(scope, 'secondDegree')) {
    for (const siblingId of siblings) needChildren(siblingId);
    for (const childId of children) needChildren(childId);
  }
  if (includes(scope, 'thirdDegree')) {
    for (const parentId of parents) {
      for (const auntOrUncleId of biologicalSiblingsOf(family, parentId)) {
        needChildren(auntOrUncleId);
      }
    }
  }

  return gaps;
}

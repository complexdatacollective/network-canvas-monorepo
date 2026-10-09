import {
  PEDIGREE_COMPLETENESS_SCOPES,
  type PedigreeCompletenessScope,
  type PedigreeRelativesNotRecorded,
} from '@codaco/protocol-validation';

import { type Family, isGeneticKind, type Person } from './model';

/**
 * Something the participant still needs to record about one person before
 * their family is complete enough to continue.
 *
 * - `parents`: the person has fewer than two biological parents (`missing` of
 *   them). Every person has two, so a parent the participant knows nothing
 *   about is still added.
 * - `siblings` / `children`: none are recorded and the participant has not
 *   said there are none, or that they don't know.
 * - `details`: some of the person's required details are not given.
 */
export type CompletenessItem =
  | { kind: 'parents'; personId: string; missing: number }
  | { kind: 'siblings' | 'children' | 'details'; personId: string };

/** What an item asks for, the same however many of it are still missing:
 * a person's parents, siblings, children or details. */
const completenessItemKey = (item: CompletenessItem) =>
  `${item.kind}:${item.personId}`;

/** How much of an item is still missing: the parents still to add, or one. */
const amountMissing = (item: CompletenessItem) =>
  item.kind === 'parents' ? item.missing : 1;

/** What a list of recommendations showed: how much of each item was
 * missing when it was shown. */
export type ShownRecommendations = ReadonlyMap<string, number>;

export const recommendationsShown = (
  items: readonly CompletenessItem[],
): ShownRecommendations =>
  new Map(
    items.map((item) => [completenessItemKey(item), amountMissing(item)]),
  );

/** Whether a list already shown covers everything still outstanding: every
 * item was in it, and none has grown since (a person who has lost a parent
 * now needs more than the list asked for). */
export const recommendationsCover = (
  shown: ShownRecommendations,
  items: readonly CompletenessItem[],
) =>
  items.every((item) => {
    const before = shown.get(completenessItemKey(item));
    return before !== undefined && amountMissing(item) <= before;
  });

export type CompletenessProgress = {
  /** What is still needed, about people already in the family. */
  items: CompletenessItem[];
  /** Steps towards completion taken, and in total. */
  done: number;
  total: number;
  /** `siblings:<id>` / `children:<id>` for every person asked about them. */
  asked: ReadonlySet<string>;
};

/** Gamete donors count as biological parents; gestational carriers, adoptive
 * and step-parents do not. */
function biologicalParentsOf(family: Family, personId: string) {
  return family.links
    .filter((link) => link.target === personId && isGeneticKind(link.kind))
    .map((link) => link.source);
}

function biologicalChildrenOf(family: Family, personId: string) {
  return family.links
    .filter((link) => link.source === personId && isGeneticKind(link.kind))
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

/** Where a person sits relative to the participant, which decides what is
 * asked about them. A `coParent` is the participant's partner in conceiving
 * one of their children: required to be recorded, but nothing about their
 * own family is. */
type Role =
  | 'ego'
  | 'parent'
  | 'sibling'
  | 'child'
  | 'coParent'
  | 'auntOrUncle'
  | 'none';

type Requirements = {
  /** The role their parents have, when their parents are required. */
  parents?: Role;
  siblings?: Role;
  children?: Role;
};

function requirementsFor(
  role: Role,
  scope: PedigreeCompletenessScope,
): Requirements {
  switch (role) {
    case 'ego':
      return includes(scope, 'firstDegree')
        ? { parents: 'parent', siblings: 'sibling', children: 'child' }
        : { parents: 'parent' };
    case 'parent':
      return includes(scope, 'grandparents')
        ? { parents: 'none', siblings: 'auntOrUncle' }
        : {};
    case 'child':
      // Each of the participant's biological children has two biological
      // parents: the participant, and whoever gave the other gamete, who is
      // recorded too (an unnamed person when the participant does not know
      // them). Their own parents and relatives are not asked for.
      return includes(scope, 'secondDegree')
        ? { parents: 'coParent', children: 'none' }
        : { parents: 'coParent' };
    case 'sibling':
      return includes(scope, 'secondDegree') ? { children: 'none' } : {};
    case 'auntOrUncle':
      return includes(scope, 'thirdDegree') ? { children: 'none' } : {};
    case 'coParent':
    case 'none':
      return {};
  }
}

/**
 * How far the participant's family is from the researcher's completeness
 * scope. Each scope adds to the one before:
 *
 * - `parents`: the participant's two biological parents.
 * - `firstDegree`: their siblings and children, and each biological child's
 *   other biological parent (the participant's co-parent), but not that
 *   co-parent's own family.
 * - `grandparents`: each biological parent's own two biological parents and
 *   siblings (the participant's grandparents, aunts and uncles).
 * - `secondDegree`: each sibling's children and each child's children
 *   (nieces, nephews and grandchildren).
 * - `thirdDegree`: each aunt's and uncle's children (first cousins).
 *
 * Progress counts one step for every biological parent, every answered
 * group of siblings or children, and every person whose required details are
 * all given. Steps belonging to a parent not yet added
 * are counted too, so adding someone never makes the family look less
 * complete — only adding a sibling or child, who brings questions of their
 * own, can.
 */
export function evaluateCompleteness(
  family: Family,
  scope: PedigreeCompletenessScope,
  hasMissingDetails: (person: Person) => boolean,
): CompletenessProgress {
  // Each with how far its person is from the participant, to list the
  // nearest first.
  const found: { item: CompletenessItem; distance: number }[] = [];
  const asked = new Set<string>();
  let done = 0;
  let total = 0;
  const egoId = family.egoId;
  if (!egoId) return { items: [], done, total, asked };

  const answered = (
    personId: string,
    none: PedigreeRelativesNotRecorded,
    unknown: PedigreeRelativesNotRecorded,
  ) => {
    const notRecorded = family.byId.get(personId)?.relativesNotRecorded ?? [];
    return notRecorded.includes(none) || notRecorded.includes(unknown);
  };

  // Who has been reached in which role. When the family folds back on itself
  // (parents who are siblings, say) the same aunt is reached through each of
  // them, and her requirements are still asked once.
  const visited = new Set<string>();

  // Walk the requirements outwards from the participant. `personId` is null
  // for someone not yet added, whose requirements are all still to do.
  const visit = (personId: string | null, role: Role, distance: number) => {
    if (personId) {
      const key = `${role}:${personId}`;
      if (visited.has(key)) return;
      visited.add(key);
    }
    const requirements = requirementsFor(role, scope);

    if (requirements.parents) {
      const parents = personId ? biologicalParentsOf(family, personId) : [];
      for (let slot = 0; slot < 2; slot++) {
        total += 1;
        const parentId = parents[slot];
        if (parentId) done += 1;
        // A parent not yet added will need their details too; once added,
        // they are counted with everyone else below.
        else total += 1;
        visit(parentId ?? null, requirements.parents, distance + 1);
      }
      if (personId && parents.length < 2) {
        found.push({
          item: { kind: 'parents', personId, missing: 2 - parents.length },
          distance,
        });
      }
    }

    const group = (
      kind: 'siblings' | 'children',
      relatives: string[],
      relativeRole: Role,
      none: PedigreeRelativesNotRecorded,
      unknown: PedigreeRelativesNotRecorded,
    ) => {
      total += 1;
      if (!personId) return;
      asked.add(`${kind}:${personId}`);
      if (relatives.length > 0 || answered(personId, none, unknown)) {
        done += 1;
      } else {
        found.push({ item: { kind, personId }, distance });
      }
      for (const relativeId of relatives) {
        visit(relativeId, relativeRole, distance + 1);
      }
    };

    if (requirements.siblings) {
      group(
        'siblings',
        personId ? biologicalSiblingsOf(family, personId) : [],
        requirements.siblings,
        'noSiblings',
        'siblingsUnknown',
      );
    }
    if (requirements.children) {
      group(
        'children',
        personId ? biologicalChildrenOf(family, personId) : [],
        requirements.children,
        'noChildren',
        'childrenUnknown',
      );
    }
  };

  visit(egoId, 'ego', 0);
  const items = found
    .toSorted((a, b) => a.distance - b.distance)
    .map(({ item }) => item);

  // Everyone in the family needs their required details, the participant
  // first.
  const people = family.people.toSorted(
    (a, b) => Number(b.isEgo) - Number(a.isEgo),
  );
  for (const person of people) {
    total += 1;
    if (hasMissingDetails(person)) {
      items.push({ kind: 'details', personId: person.id });
    } else {
      done += 1;
    }
  }
  return { items, done, total, asked };
}

/** The answers that stand in for siblings or children not recorded. */
export const RELATIVES_NOT_RECORDED = {
  siblings: { none: 'noSiblings', unknown: 'siblingsUnknown' },
  children: { none: 'noChildren', unknown: 'childrenUnknown' },
} as const satisfies Record<
  'siblings' | 'children',
  Record<'none' | 'unknown', PedigreeRelativesNotRecorded>
>;

/**
 * The answers "has no siblings or children" and "doesn't know" that the family
 * as it stands contradicts, by the person who gave them: anyone with a
 * biological sibling recorded (half or full) has their siblings answer
 * withdrawn, and anyone with a biological child their children answer. Each
 * person listed is given the answers they keep.
 *
 * Asked of the family after every change to it, so an answer cannot outlive
 * a relative added, connected or re-described anywhere in the family, for
 * whoever gains them: a new child is a sibling of each of their parents'
 * other children, too.
 */
export function answersContradictedBy(
  family: Family,
): Map<string, PedigreeRelativesNotRecorded[]> {
  const result = new Map<string, PedigreeRelativesNotRecorded[]>();
  for (const person of family.people) {
    if (person.relativesNotRecorded.length === 0) continue;
    const withdrawn = new Set<PedigreeRelativesNotRecorded>();
    const withdraw = (group: Record<'none' | 'unknown', string>) => {
      for (const answer of person.relativesNotRecorded) {
        if (answer === group.none || answer === group.unknown) {
          withdrawn.add(answer);
        }
      }
    };
    if (biologicalSiblingsOf(family, person.id).length > 0) {
      withdraw(RELATIVES_NOT_RECORDED.siblings);
    }
    if (biologicalChildrenOf(family, person.id).length > 0) {
      withdraw(RELATIVES_NOT_RECORDED.children);
    }
    if (withdrawn.size > 0) {
      result.set(
        person.id,
        person.relativesNotRecorded.filter((answer) => !withdrawn.has(answer)),
      );
    }
  }
  return result;
}

/**
 * Whether a person's details should ask if they have siblings, and children:
 * when the requirement asks about them and none are recorded.
 */
export function relativesToAskAbout(
  family: Family,
  progress: CompletenessProgress,
  personId: string,
): { siblings: boolean; children: boolean } {
  return {
    siblings:
      progress.asked.has(`siblings:${personId}`) &&
      biologicalSiblingsOf(family, personId).length === 0,
    children:
      progress.asked.has(`children:${personId}`) &&
      biologicalChildrenOf(family, personId).length === 0,
  };
}

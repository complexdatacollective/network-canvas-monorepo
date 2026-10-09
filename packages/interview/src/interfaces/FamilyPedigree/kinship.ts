import type { IntlShape } from '@codaco/app-i18n/messages';
import type {
  FramingId,
  PedigreeParentKind,
  PedigreeRelationshipKind,
} from '@codaco/protocol-validation';

import { type Gamete, gameteLookup, inferGametes } from './gametes';
import { messages } from './messages';
import { type Family, geneticParentsOf, type Person } from './model';

/**
 * Every kinship word an unnamed person can be described by. The interview
 * copy for each lives in the `relativeTerm` message.
 */
export const KIN_TERMS = [
  'mother',
  'father',
  'parent',
  'eggParent',
  'spermParent',
  'biologicalMother',
  'biologicalFather',
  'adoptiveMother',
  'adoptiveFather',
  'adoptiveParent',
  'stepmother',
  'stepfather',
  'stepparent',
  'eggDonor',
  'spermDonor',
  'donor',
  'surrogate',
  'daughter',
  'son',
  'child',
  'stepdaughter',
  'stepson',
  'stepchild',
  'donorConceivedChild',
  'surrogacyChild',
  'sister',
  'brother',
  'sibling',
  'halfSister',
  'halfBrother',
  'halfSibling',
  'adoptiveSister',
  'adoptiveBrother',
  'adoptiveSibling',
  'stepsister',
  'stepbrother',
  'stepsibling',
  'partner',
  'formerPartner',
  'grandmother',
  'grandfather',
  'grandparent',
  'maternalGrandmother',
  'maternalGrandfather',
  'maternalGrandparent',
  'paternalGrandmother',
  'paternalGrandfather',
  'paternalGrandparent',
  'greatGrandmother',
  'greatGrandfather',
  'greatGrandparent',
  'stepGrandmother',
  'stepGrandfather',
  'stepGrandparent',
  'granddaughter',
  'grandson',
  'grandchild',
  'greatGranddaughter',
  'greatGrandson',
  'greatGrandchild',
  'aunt',
  'uncle',
  'maternalAunt',
  'maternalUncle',
  'paternalAunt',
  'paternalUncle',
  'parentsSibling',
  'greatAunt',
  'greatUncle',
  'grandparentsSibling',
  'niece',
  'nephew',
  'siblingsChild',
  'cousin',
  'motherInLaw',
  'fatherInLaw',
  'parentInLaw',
  'sisterInLaw',
  'brotherInLaw',
  'siblingInLaw',
  'daughterInLaw',
  'sonInLaw',
  'childInLaw',
] as const;

export type KinTerm = (typeof KIN_TERMS)[number];

/**
 * How a person is shown: their name, or — when it is not known — their
 * relationship to the participant ("Maternal grandmother", "Sperm parent").
 */
export type PersonLabel =
  | { type: 'name'; name: string }
  | { type: 'you' }
  | { type: 'term'; term: KinTerm }
  /** Beyond the kinship words: described through one relative on the way
   * from the participant ("Isaac’s grandfather", "Cousin’s son"). */
  | { type: 'relativeOf'; anchors: RelativeAnchor[] }
  /** Not connected to the participant at all. */
  | { type: 'unconnected' };

/**
 * A relative someone may be described through, with their own label, and
 * the kinship word for the person from that relative.
 */
export type RelativeAnchor = {
  ownerId: string;
  owner: PersonLabel;
  term: KinTerm;
};

type ParentKind = PedigreeParentKind;

/** One step from a person to a relative of theirs. */
export type Step =
  | { type: 'parent'; kind: ParentKind; to: string }
  | { type: 'child'; kind: ParentKind; to: string }
  | {
      type: 'sibling';
      /** Not the same parents (`siblingTie`). */
      half: boolean;
      /** Sharing an adoptive parent, but no genetic parent. */
      adoptive: boolean;
      to: string;
    }
  | { type: 'partner'; current: boolean; to: string };

type Gendered = 'woman' | 'man' | 'other';

/**
 * The word to use for a person, by framing: the words their gender identity
 * option takes for the gendered framing (feminine words for a woman, masculine
 * for a man, neutral for anything else), and always neutral for the gamete
 * framing.
 */
function genderOf(person: Person | undefined, framing: FramingId): Gendered {
  if (framing === 'gamete') return 'other';
  const words = person?.genderWords;
  if (words === 'feminine') return 'woman';
  if (words === 'masculine') return 'man';
  return 'other';
}

function pick<T>(gender: Gendered, terms: { woman: T; man: T; other: T }) {
  return terms[gender];
}

const adoptiveParentsOf = (family: Family, personId: string) =>
  family.links
    .filter((link) => link.target === personId && link.kind === 'adoptive')
    .map((link) => link.source);

/**
 * Whether the step or social parent link from `parentId` to `childId` is a
 * step-parent's: the step or social parent has a partnership, current or
 * former, with one of the child's biological or adoptive parents, and did
 * not carry the child. Anyone else who raises a child as a step or social
 * parent is called by the plain parent word ("Mother"), and the child by the
 * plain child word.
 */
function isStepLink(family: Family, parentId: string, childId: string) {
  const link = family.links.find(
    (candidate) =>
      candidate.kind === 'social' &&
      candidate.source === parentId &&
      candidate.target === childId,
  );
  if (!link || link.isGestationalCarrier) return false;
  const childsParents = new Set(
    family.links
      .filter(
        (candidate) =>
          candidate.target === childId &&
          (candidate.kind === 'biological' || candidate.kind === 'adoptive'),
      )
      .map((candidate) => candidate.source),
  );
  return family.links.some(
    (candidate) =>
      candidate.kind === 'partner' &&
      ((candidate.source === parentId && childsParents.has(candidate.target)) ||
        (candidate.target === parentId && childsParents.has(candidate.source))),
  );
}

const sameSet = (a: ReadonlySet<string>, b: ReadonlySet<string>) =>
  a.size === b.size && [...a].every((item) => b.has(item));

/**
 * How two people are siblings, if they are: the one definition the canvas
 * labels and the saved relationship to the participant both follow.
 *
 * It is decided from their genetic parents first (biological parents and
 * donors): full siblings have the same genetic parents, and half siblings
 * share some. Only two people who share no genetic parent are adoptive
 * siblings, when one has adopted either of them and is a parent to both;
 * they are half adoptive siblings unless their genetic and adoptive parents
 * are the same. An adoptive parent never makes full genetic siblings half
 * siblings. Someone who shares only a step-parent is not a sibling here, and
 * is reached through that parent instead.
 */
function siblingTie(
  family: Family,
  a: string,
  b: string,
): { half: boolean; adoptive: boolean } | undefined {
  const aGenetic = new Set(geneticParentsOf(family, a));
  const bGenetic = new Set(geneticParentsOf(family, b));
  if ([...aGenetic].some((parent) => bGenetic.has(parent))) {
    return { half: !sameSet(aGenetic, bGenetic), adoptive: false };
  }
  const aParents = new Set([...aGenetic, ...adoptiveParentsOf(family, a)]);
  const bParents = new Set([...bGenetic, ...adoptiveParentsOf(family, b)]);
  if (![...aParents].some((parent) => bParents.has(parent))) return undefined;
  return { half: !sameSet(aParents, bParents), adoptive: true };
}

/**
 * A person's relatives one step away, in the order a path through them is
 * preferred: parents (as recorded), siblings, partners, then children.
 * Siblings are a single step so that "aunt" is found as a parent's sibling,
 * and are those `siblingTie` finds.
 */
export function stepsFrom(family: Family, personId: string): Step[] {
  const steps: Step[] = [];
  for (const link of family.links) {
    if (link.kind !== 'partner' && link.target === personId) {
      steps.push({ type: 'parent', kind: link.kind, to: link.source });
    }
  }
  for (const person of family.people) {
    if (person.id === personId) continue;
    const tie = siblingTie(family, personId, person.id);
    if (tie) steps.push({ type: 'sibling', ...tie, to: person.id });
  }
  for (const link of family.links) {
    if (link.kind !== 'partner') continue;
    if (link.source !== personId && link.target !== personId) continue;
    steps.push({
      type: 'partner',
      current: link.isCurrentPartner,
      to: link.source === personId ? link.target : link.source,
    });
  }
  for (const link of family.links) {
    if (link.kind !== 'partner' && link.source === personId) {
      steps.push({ type: 'child', kind: link.kind, to: link.target });
    }
  }
  return steps;
}

/** Which gamete a genetic parent gave a child, when it is known
 * (`inferGametes`). */
type GameteOf = (parentId: string, childId: string) => Gamete | undefined;

/**
 * The term for a single step from `fromId`, which is also a close relative's
 * term. A biological parent or donor is named by the gamete they gave
 * `fromId`, as the shared rule derives it from sex assigned at birth
 * (`inferGametes`), never from sex at birth read on its own.
 */
function stepTerm(
  family: Family,
  fromId: string,
  step: Step,
  framing: FramingId,
  gameteOf: GameteOf,
): KinTerm {
  const person = family.byId.get(step.to);
  const gender = genderOf(person, framing);
  switch (step.type) {
    case 'parent':
      switch (step.kind) {
        case 'biological': {
          const gamete = gameteOf(step.to, fromId);
          if (framing === 'gamete') {
            // The gamete framing names a biological parent by the gamete
            // they gave.
            if (gamete === 'egg') return 'eggParent';
            if (gamete === 'sperm') return 'spermParent';
            return 'parent';
          }
          if (gender === 'other') {
            // With their gender identity not known, a biological parent is
            // named by the gamete they gave, in gendered words.
            const words = person?.genderWords;
            if (words === undefined || words === 'unknown') {
              if (gamete === 'egg') return 'biologicalMother';
              if (gamete === 'sperm') return 'biologicalFather';
            }
          }
          return pick(gender, {
            woman: 'mother',
            man: 'father',
            other: 'parent',
          });
        }
        case 'adoptive':
          return pick(gender, {
            woman: 'adoptiveMother',
            man: 'adoptiveFather',
            other: 'adoptiveParent',
          });
        case 'social':
          return isStepLink(family, step.to, fromId)
            ? pick(gender, {
                woman: 'stepmother',
                man: 'stepfather',
                other: 'stepparent',
              })
            : pick(gender, { woman: 'mother', man: 'father', other: 'parent' });
        case 'donor': {
          const gamete = gameteOf(step.to, fromId);
          if (gamete === 'egg') return 'eggDonor';
          if (gamete === 'sperm') return 'spermDonor';
          return 'donor';
        }
        case 'surrogate':
          return 'surrogate';
      }
      break;
    case 'child':
      switch (step.kind) {
        case 'social':
          if (isStepLink(family, fromId, step.to)) {
            return pick(gender, {
              woman: 'stepdaughter',
              man: 'stepson',
              other: 'stepchild',
            });
          }
          return pick(gender, {
            woman: 'daughter',
            man: 'son',
            other: 'child',
          });
        case 'donor':
          return 'donorConceivedChild';
        case 'surrogate':
          return 'surrogacyChild';
        default:
          return pick(gender, {
            woman: 'daughter',
            man: 'son',
            other: 'child',
          });
      }
    case 'sibling':
      // Related only through adoption, whether or not all their parents are
      // the same.
      if (step.adoptive) {
        return pick(gender, {
          woman: 'adoptiveSister',
          man: 'adoptiveBrother',
          other: 'adoptiveSibling',
        });
      }
      return step.half
        ? pick(gender, {
            woman: 'halfSister',
            man: 'halfBrother',
            other: 'halfSibling',
          })
        : pick(gender, { woman: 'sister', man: 'brother', other: 'sibling' });
    case 'partner':
      return step.current ? 'partner' : 'formerPartner';
  }
}

// Kinship beyond the immediate family follows descent: a step through a
// step-parent or a surrogate leads to someone who is not, say, a grandparent.
const isDescent = (step: Step) =>
  (step.type === 'parent' || step.type === 'child') &&
  (step.kind === 'biological' ||
    step.kind === 'adoptive' ||
    step.kind === 'donor');

/** The parent kinds who raise a child, as step and in-law ties pass
 * through. */
const RAISING_KINDS: ReadonlySet<PedigreeRelationshipKind> =
  new Set<PedigreeRelationshipKind>(['biological', 'adoptive', 'social']);

/** A step a step or in-law tie can pass through: a parent or child who
 * raises them, a sibling, or a current partner. */
const isStepOrInLawStep = (step: Step) => {
  switch (step.type) {
    case 'parent':
    case 'child':
      return RAISING_KINDS.has(step.kind);
    case 'sibling':
      return true;
    case 'partner':
      return step.current;
  }
};

type Side = 'maternal' | 'paternal';

/**
 * The side of the family a first step from the participant leads to, which
 * only the gendered framing names: a parent's, by the words their gender
 * identity takes, or, for a biological parent whose words are not known, by
 * the gamete they gave, as `stepTerm` names them a biological mother or
 * father.
 */
function sideOfFirstStep(
  family: Family,
  step: Step,
  framing: FramingId,
  gameteOf: GameteOf,
): Side | undefined {
  if (framing !== 'gendered' || step.type !== 'parent') return undefined;
  const words = family.byId.get(step.to)?.genderWords;
  if (words === 'feminine') return 'maternal';
  if (words === 'masculine') return 'paternal';
  if (
    (words === undefined || words === 'unknown') &&
    step.kind === 'biological' &&
    family.egoId !== undefined
  ) {
    const gamete = gameteOf(step.to, family.egoId);
    if (gamete === 'egg') return 'maternal';
    if (gamete === 'sperm') return 'paternal';
  }
  return undefined;
}

/**
 * The kinship word for a relative more than one step away, or undefined when
 * there is no everyday word for them. `path` runs from `fromId`, the
 * participant unless the word is for someone's relative of theirs, and
 * `side` is the side of the family it is on, when it is one (`labelFamily`).
 */
export function kinTermFor(
  family: Family,
  path: readonly Step[],
  framing: FramingId,
  side?: Side,
  fromId: string | undefined = family.egoId,
): KinTerm | undefined {
  const target = family.byId.get(path[path.length - 1]!.to);
  const gender = genderOf(target, framing);
  const shape = path.map((step) => step.type).join(',');
  const descends = path
    .filter((step) => step.type === 'parent' || step.type === 'child')
    .every(isDescent);

  if (descends) {
    switch (shape) {
      case 'parent,parent':
        return side === 'maternal'
          ? pick(gender, {
              woman: 'maternalGrandmother',
              man: 'maternalGrandfather',
              other: 'maternalGrandparent',
            })
          : side === 'paternal'
            ? pick(gender, {
                woman: 'paternalGrandmother',
                man: 'paternalGrandfather',
                other: 'paternalGrandparent',
              })
            : pick(gender, {
                woman: 'grandmother',
                man: 'grandfather',
                other: 'grandparent',
              });
      case 'parent,parent,parent':
        return pick(gender, {
          woman: 'greatGrandmother',
          man: 'greatGrandfather',
          other: 'greatGrandparent',
        });
      case 'child,child':
        return pick(gender, {
          woman: 'granddaughter',
          man: 'grandson',
          other: 'grandchild',
        });
      case 'child,child,child':
        return pick(gender, {
          woman: 'greatGranddaughter',
          man: 'greatGrandson',
          other: 'greatGrandchild',
        });
      case 'parent,sibling':
        if (gender === 'other') return 'parentsSibling';
        if (side === 'maternal') {
          return gender === 'woman' ? 'maternalAunt' : 'maternalUncle';
        }
        if (side === 'paternal') {
          return gender === 'woman' ? 'paternalAunt' : 'paternalUncle';
        }
        return gender === 'woman' ? 'aunt' : 'uncle';
      case 'parent,parent,sibling':
        return pick(gender, {
          woman: 'greatAunt',
          man: 'greatUncle',
          other: 'grandparentsSibling',
        });
      case 'sibling,child':
        return pick(gender, {
          woman: 'niece',
          man: 'nephew',
          other: 'siblingsChild',
        });
      case 'parent,sibling,child':
        return 'cousin';
    }
  }
  // Step and in-law ties pass only through parents and children who raise
  // them and through partnerships that are current: a donor's or surrogate's
  // partner, or a parent's former partner, is not a step-parent.
  if (!path.every(isStepOrInLawStep)) return undefined;
  // A sibling's sibling who shares no parent with the participant, but whose
  // parent is partnered with one of theirs, is a step-sibling.
  if (shape === 'sibling,sibling') {
    const egoId = fromId;
    const targetId = path[1]!.to;
    const parentsOf = (id: string | undefined) =>
      family.links
        .filter((link) => link.target === id && RAISING_KINDS.has(link.kind))
        .map((link) => link.source);
    const theirParents = new Set(parentsOf(targetId));
    const partnered = parentsOf(egoId).some((parentId) =>
      family.links.some(
        (link) =>
          link.kind === 'partner' &&
          link.isCurrentPartner &&
          ((link.source === parentId && theirParents.has(link.target)) ||
            (link.target === parentId && theirParents.has(link.source))),
      ),
    );
    if (partnered) {
      return pick(gender, {
        woman: 'stepsister',
        man: 'stepbrother',
        other: 'stepsibling',
      });
    }
  }
  switch (shape) {
    // A grandparent's partner, a step-parent's parent, or a parent's
    // step-parent, as long as each step or social parent on the way is a
    // step-parent (`isStepLink`): a social parent's parent is not.
    case 'parent,parent':
    case 'parent,parent,partner':
    case 'parent,partner,parent': {
      const fromOf = (index: number) =>
        index === 0 ? fromId : path[index - 1]!.to;
      const stepLinksOnly = path.every(
        (step, index) =>
          step.type !== 'parent' ||
          step.kind !== 'social' ||
          isStepLink(family, step.to, fromOf(index) ?? ''),
      );
      if (!stepLinksOnly) return undefined;
      return pick(gender, {
        woman: 'stepGrandmother',
        man: 'stepGrandfather',
        other: 'stepGrandparent',
      });
    }
    case 'parent,partner,child':
      return pick(gender, {
        woman: 'stepsister',
        man: 'stepbrother',
        other: 'stepsibling',
      });
    case 'parent,partner':
      return pick(gender, {
        woman: 'stepmother',
        man: 'stepfather',
        other: 'stepparent',
      });
    case 'partner,child':
      return pick(gender, {
        woman: 'stepdaughter',
        man: 'stepson',
        other: 'stepchild',
      });
    case 'partner,parent':
      return pick(gender, {
        woman: 'motherInLaw',
        man: 'fatherInLaw',
        other: 'parentInLaw',
      });
    case 'partner,sibling':
    case 'sibling,partner':
      return pick(gender, {
        woman: 'sisterInLaw',
        man: 'brotherInLaw',
        other: 'siblingInLaw',
      });
    case 'child,partner':
    // A partner's child's partner, as when the step link is drawn.
    case 'partner,child,partner':
      return pick(gender, {
        woman: 'daughterInLaw',
        man: 'sonInLaw',
        other: 'childInLaw',
      });
  }
  return undefined;
}

/**
 * The label for everyone in the family. Named people are shown by name and
 * the participant as "you"; everyone else by their kinship to the
 * participant, in the words of the stage's framing, found along the shortest
 * path between them. Someone with no everyday kinship word is described
 * through one person on that path, by the kinship word for them from that
 * person ("Cousin’s son", "Isaac’s grandfather"): `formatPersonLabel` uses
 * the nearest whose own label is a name or a plain kinship word. Several
 * unnamed people may share a label here: `generateLabels` tells them apart.
 */
export function labelFamily(
  family: Family,
  framing: FramingId,
): Map<string, PersonLabel> {
  const labels = new Map<string, PersonLabel>();
  for (const person of family.people) {
    if (person.isEgo) labels.set(person.id, { type: 'you' });
    else if (person.name !== undefined) {
      labels.set(person.id, { type: 'name', name: person.name });
    }
  }
  if (!family.egoId) return fillUnconnected(family, labels);
  const gameteOf = gameteLookup(inferGametes(family));

  // Breadth-first from the participant, one step of distance at a time, so
  // that each label is final before anyone further away is described through
  // it. Each person is described along the first shortest path found to
  // them, on a side of the family only when every shortest path to them is
  // on it: someone reached through both parents is on neither side.
  const paths = new Map<string, Step[]>([[family.egoId, []]]);
  const sides = new Map<string, Set<Side | undefined>>();
  let frontier = [family.egoId];
  while (frontier.length > 0) {
    const next: string[] = [];
    for (const fromId of frontier) {
      const fromPath = paths.get(fromId)!;
      for (const step of stepsFrom(family, fromId)) {
        const reached = paths.get(step.to);
        if (reached && reached.length <= fromPath.length) continue;
        if (!reached) {
          paths.set(step.to, [...fromPath, step]);
          next.push(step.to);
        }
        const along =
          fromPath.length === 0
            ? [sideOfFirstStep(family, step, framing, gameteOf)]
            : (sides.get(fromId) ?? []);
        const toSides = sides.get(step.to) ?? new Set();
        for (const side of along) toSides.add(side);
        sides.set(step.to, toSides);
      }
    }
    const layer = new Map<string, PersonLabel>();
    for (const id of next) {
      if (labels.has(id)) continue;
      const path = paths.get(id)!;
      if (path.length === 1) {
        layer.set(id, {
          type: 'term',
          term: stepTerm(family, family.egoId, path[0]!, framing, gameteOf),
        });
        continue;
      }
      const [side, ...others] = sides.get(id) ?? [];
      const term = kinTermFor(
        family,
        path,
        framing,
        others.length === 0 ? side : undefined,
      );
      if (term) {
        layer.set(id, { type: 'term', term });
        continue;
      }
      // Each person on the way who has a word for them, nearest first: the
      // person before them always does.
      const anchors: RelativeAnchor[] = [];
      for (let index = path.length - 2; index >= 0; index--) {
        const ownerId = path[index]!.to;
        const rest = path.slice(index + 1);
        const anchorTerm =
          rest.length === 1
            ? stepTerm(family, ownerId, rest[0]!, framing, gameteOf)
            : kinTermFor(family, rest, framing, undefined, ownerId);
        if (anchorTerm) {
          anchors.push({
            ownerId,
            owner: labels.get(ownerId)!,
            term: anchorTerm,
          });
        }
      }
      layer.set(id, { type: 'relativeOf', anchors });
    }
    for (const [id, label] of layer) labels.set(id, label);
    frontier = next;
  }

  return fillUnconnected(family, labels);
}

function fillUnconnected(family: Family, labels: Map<string, PersonLabel>) {
  for (const person of family.people) {
    if (!labels.has(person.id)) {
      labels.set(person.id, { type: 'unconnected' });
    }
  }
  return labels;
}

/**
 * The label as participant-facing text. `ownerText` gives, by person id, the
 * text a relative is known by when it is not their own label, such as the
 * qualified label `generateLabels` gives them.
 *
 * Someone described through a relative is described through a single one,
 * never through a description of another: the nearest whose text is a name
 * or a plain kinship word, unqualified ("Isaac’s grandfather", not
 * "Great-grandfather (parent of Isaac)’s father"). Only when no one on the
 * way is known that simply are they described through the person before
 * them, as that person is known.
 */
export function formatPersonLabel(
  label: PersonLabel,
  intl: IntlShape,
  ownerText?: (ownerId: string) => string | undefined,
): string {
  switch (label.type) {
    case 'name':
      return label.name;
    case 'you':
      return intl.formatMessage(messages.you);
    case 'term':
      return intl.formatMessage(messages.relativeTerm, { term: label.term });
    case 'relativeOf': {
      const isPlain = ({ ownerId, owner }: RelativeAnchor) => {
        if (owner.type === 'name') return true;
        if (owner.type !== 'term') return false;
        const own = formatPersonLabel(owner, intl);
        return (ownerText?.(ownerId) ?? own) === own;
      };
      const anchor = label.anchors.find(isPlain) ?? label.anchors[0];
      if (!anchor) return intl.formatMessage(messages.familyMember);
      return intl.formatMessage(messages.relativeOf, {
        owner:
          ownerText?.(anchor.ownerId) ??
          formatPersonLabel(anchor.owner, intl, ownerText),
        term: anchor.term,
      });
    }
    case 'unconnected':
      return intl.formatMessage(messages.familyMember);
  }
}

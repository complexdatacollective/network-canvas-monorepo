import type { IntlShape } from '@codaco/app-i18n/messages';
import type {
  FramingId,
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
 * The words for one step from a person to their relative, used only to
 * describe someone the kinship words above do not reach ("Cousin's son").
 */
type StepTerm =
  | 'mother'
  | 'father'
  | 'parent'
  | 'eggParent'
  | 'spermParent'
  | 'biologicalMother'
  | 'biologicalFather'
  | 'adoptiveMother'
  | 'adoptiveFather'
  | 'adoptiveParent'
  | 'stepmother'
  | 'stepfather'
  | 'stepparent'
  | 'eggDonor'
  | 'spermDonor'
  | 'donor'
  | 'surrogate'
  | 'daughter'
  | 'son'
  | 'child'
  | 'stepdaughter'
  | 'stepson'
  | 'stepchild'
  | 'donorConceivedChild'
  | 'surrogacyChild'
  | 'sister'
  | 'brother'
  | 'sibling'
  | 'halfSister'
  | 'halfBrother'
  | 'halfSibling'
  | 'partner'
  | 'formerPartner';

/**
 * How a person is shown: their name, or — when it is not known — their
 * relationship to the participant ("Maternal grandmother", "Sperm parent").
 */
export type PersonLabel =
  | { type: 'name'; name: string }
  | { type: 'you' }
  | { type: 'term'; term: KinTerm }
  /** Beyond the kinship words: described through the person before them. */
  | { type: 'relativeOf'; owner: PersonLabel; term: StepTerm }
  /** Not connected to the participant at all. */
  | { type: 'unconnected' };

type ParentKind = Exclude<PedigreeRelationshipKind, 'partner'>;

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
): StepTerm & KinTerm {
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
          return pick(gender, {
            woman: 'stepmother',
            man: 'stepfather',
            other: 'stepparent',
          });
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
          return pick(gender, {
            woman: 'stepdaughter',
            man: 'stepson',
            other: 'stepchild',
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

/**
 * The kinship word for a relative more than one step away, or undefined when
 * there is no everyday word for them. `path` runs from the participant.
 */
export function kinTermFor(
  family: Family,
  path: readonly Step[],
  framing: FramingId,
): KinTerm | undefined {
  const target = family.byId.get(path[path.length - 1]!.to);
  const gender = genderOf(target, framing);
  // Which side of the family, from the first parent on the way. Only the
  // gendered framing says "maternal" or "paternal".
  const firstParent = family.byId.get(path[0]!.to);
  const side =
    framing === 'gendered' && path[0]!.type === 'parent'
      ? firstParent?.genderWords === 'feminine'
        ? 'maternal'
        : firstParent?.genderWords === 'masculine'
          ? 'paternal'
          : undefined
      : undefined;
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
    const egoId = family.egoId;
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
 * through the person before them on that path ("Cousin's son"). Several
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
  // it.
  const paths = new Map<string, Step[]>([[family.egoId, []]]);
  let frontier = [family.egoId];
  while (frontier.length > 0) {
    const next: string[] = [];
    const layer = new Map<string, PersonLabel>();
    for (const fromId of frontier) {
      const fromPath = paths.get(fromId)!;
      for (const step of stepsFrom(family, fromId)) {
        if (paths.has(step.to)) continue;
        const path = [...fromPath, step];
        paths.set(step.to, path);
        next.push(step.to);
        if (labels.has(step.to)) continue;
        if (path.length === 1) {
          layer.set(step.to, {
            type: 'term',
            term: stepTerm(family, fromId, step, framing, gameteOf),
          });
          continue;
        }
        const term = kinTermFor(family, path, framing);
        layer.set(
          step.to,
          term
            ? { type: 'term', term }
            : {
                type: 'relativeOf',
                owner: labels.get(fromId)!,
                term: stepTerm(family, fromId, step, framing, gameteOf),
              },
        );
      }
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

/** The label as participant-facing text. */
export function formatPersonLabel(label: PersonLabel, intl: IntlShape): string {
  switch (label.type) {
    case 'name':
      return label.name;
    case 'you':
      return intl.formatMessage(messages.you);
    case 'term':
      return intl.formatMessage(messages.relativeTerm, { term: label.term });
    case 'relativeOf':
      return intl.formatMessage(messages.relativeOf, {
        owner: formatPersonLabel(label.owner, intl),
        term: label.term,
      });
    case 'unconnected':
      return intl.formatMessage(messages.familyMember);
  }
}

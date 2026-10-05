import type { IntlShape } from '@codaco/app-i18n/messages';
import type { PedigreeGenderIdentity } from '@codaco/protocol-validation';

import { messages } from './messages';
import type { Family, FamilyLink } from './model';

/**
 * One step from a person to a relative of theirs, named the way the relative
 * would be described from that person ("mother", "half-brother").
 */
export type KinTerm =
  | 'mother'
  | 'father'
  | 'parent'
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
 * relationship to the participant, built one step at a time from the nearest
 * person on the way ("Mother", "Rob's mother", "Father's sister").
 */
export type PersonLabel =
  | { type: 'name'; name: string }
  | { type: 'you' }
  | { type: 'term'; term: KinTerm }
  | { type: 'relativeOf'; owner: PersonLabel; term: KinTerm }
  /** Several unnamed people would otherwise share one label. */
  | { type: 'numbered'; label: PersonLabel; number: number }
  /** Not connected to the participant at all. */
  | { type: 'unconnected' };

type Gendered = 'woman' | 'man' | 'other';

const gendered = (identity: PedigreeGenderIdentity | undefined): Gendered =>
  identity === 'woman' || identity === 'man' ? identity : 'other';

const pick = (
  gender: Gendered,
  terms: { woman: KinTerm; man: KinTerm; other: KinTerm },
) => terms[gender];

function parentTerm(family: Family, link: FamilyLink): KinTerm {
  const parent = family.byId.get(link.source);
  const gender = gendered(parent?.genderIdentity);
  switch (link.kind) {
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
      // Display only: which gamete a donor gave is read from their recorded
      // sex at birth, and left unsaid when that is not female or male.
      const sex = parent?.sexAssignedAtBirth;
      if (sex === 'female') return 'eggDonor';
      if (sex === 'male') return 'spermDonor';
      return 'donor';
    }
    case 'surrogate':
      return 'surrogate';
    default:
      return pick(gender, { woman: 'mother', man: 'father', other: 'parent' });
  }
}

function childTerm(family: Family, link: FamilyLink): KinTerm {
  const gender = gendered(family.byId.get(link.target)?.genderIdentity);
  switch (link.kind) {
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
      return pick(gender, { woman: 'daughter', man: 'son', other: 'child' });
  }
}

type Step = { to: string; term: KinTerm };

function siblingParentsOf(family: Family, personId: string): string[] {
  return family.links
    .filter(
      (link) =>
        link.target === personId &&
        (link.kind === 'biological' || link.kind === 'adoptive'),
    )
    .map((link) => link.source);
}

/**
 * A person's relatives one step away, in the order a path through them is
 * preferred: parents (as recorded), siblings, partners, then children.
 * Siblings are a single step so that "Mother's brother" is preferred to
 * "Mother's mother's son".
 */
function stepsFrom(family: Family, personId: string): Step[] {
  const steps: Step[] = [];
  for (const link of family.links) {
    if (link.kind !== 'partner' && link.target === personId) {
      steps.push({ to: link.source, term: parentTerm(family, link) });
    }
  }
  // Siblings share a biological or adoptive parent; full siblings share all of
  // them. Someone who shares only a step-parent is described through that
  // parent instead ("Stepmother's son").
  const parents = new Set(siblingParentsOf(family, personId));
  if (parents.size > 0) {
    for (const person of family.people) {
      if (person.id === personId) continue;
      const theirs = new Set(siblingParentsOf(family, person.id));
      const shared = [...parents].filter((parent) => theirs.has(parent));
      if (shared.length === 0) continue;
      const isFull =
        shared.length === parents.size && theirs.size === parents.size;
      const gender = gendered(person.genderIdentity);
      steps.push({
        to: person.id,
        term: isFull
          ? pick(gender, { woman: 'sister', man: 'brother', other: 'sibling' })
          : pick(gender, {
              woman: 'halfSister',
              man: 'halfBrother',
              other: 'halfSibling',
            }),
      });
    }
  }
  for (const link of family.links) {
    if (link.kind !== 'partner') continue;
    if (link.source !== personId && link.target !== personId) continue;
    steps.push({
      to: link.source === personId ? link.target : link.source,
      term: link.isCurrentPartner ? 'partner' : 'formerPartner',
    });
  }
  for (const link of family.links) {
    if (link.kind !== 'partner' && link.source === personId) {
      steps.push({ to: link.target, term: childTerm(family, link) });
    }
  }
  return steps;
}

const labelKey = (label: PersonLabel): string => JSON.stringify(label);

/**
 * The label for everyone in the family. Named people are shown by name and
 * the participant as "you"; everyone else by the shortest chain of
 * relationships from the participant, starting from the nearest person on
 * that chain who has a name. When several unnamed people would share a label
 * they are numbered in the order they were added.
 */
export function labelFamily(family: Family): Map<string, PersonLabel> {
  const labels = new Map<string, PersonLabel>();
  for (const person of family.people) {
    if (person.isEgo) labels.set(person.id, { type: 'you' });
    else if (person.name !== undefined) {
      labels.set(person.id, { type: 'name', name: person.name });
    }
  }
  if (!family.egoId) return fillUnconnected(family, labels);

  // Breadth-first from the participant, one generation of distance at a time,
  // so that each label is final (numbered where needed) before anyone further
  // away is described through it.
  const reached = new Set([family.egoId]);
  let frontier = [family.egoId];
  while (frontier.length > 0) {
    const next: string[] = [];
    const layer = new Map<string, PersonLabel>();
    for (const fromId of frontier) {
      const fromLabel = labels.get(fromId)!;
      for (const step of stepsFrom(family, fromId)) {
        if (reached.has(step.to)) continue;
        reached.add(step.to);
        next.push(step.to);
        if (labels.has(step.to)) continue;
        layer.set(
          step.to,
          fromLabel.type === 'you'
            ? { type: 'term', term: step.term }
            : { type: 'relativeOf', owner: fromLabel, term: step.term },
        );
      }
    }
    numberDuplicates(family, layer);
    for (const [id, label] of layer) labels.set(id, label);
    frontier = next;
  }

  return fillUnconnected(family, labels);
}

function numberDuplicates(family: Family, layer: Map<string, PersonLabel>) {
  const groups = new Map<string, string[]>();
  for (const person of family.people) {
    const label = layer.get(person.id);
    if (!label) continue;
    const key = labelKey(label);
    groups.set(key, [...(groups.get(key) ?? []), person.id]);
  }
  for (const ids of groups.values()) {
    if (ids.length < 2) continue;
    ids.forEach((id, index) => {
      layer.set(id, {
        type: 'numbered',
        label: layer.get(id)!,
        number: index + 1,
      });
    });
  }
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
    case 'numbered':
      return intl.formatMessage(messages.numberedRelative, {
        label: formatPersonLabel(label.label, intl),
        number: label.number,
      });
    case 'unconnected':
      return intl.formatMessage(messages.familyMember);
  }
}

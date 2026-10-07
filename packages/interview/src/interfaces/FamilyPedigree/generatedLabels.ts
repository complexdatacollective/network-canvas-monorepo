import type { IntlShape, MessageDescriptor } from '@codaco/app-i18n/messages';
import type { FramingId } from '@codaco/protocol-validation';

import { formatPersonLabel, labelFamily, type PersonLabel } from './kinship';
import { messages } from './messages';
import {
  partnersOf,
  primaryParentsOf,
  siblingsOf,
  type Family,
  type Person,
} from './model';

/**
 * How a qualifier relates the person to the relative who tells them apart,
 * in the order they are tried: their partner, their child, their parent,
 * their sibling.
 */
type Qualifier = 'partnerOf' | 'parentOf' | 'childOf' | 'siblingOf';
const QUALIFIERS: readonly Qualifier[] = [
  'partnerOf',
  'parentOf',
  'childOf',
  'siblingOf',
];

const QUALIFIER_MESSAGES: Record<Qualifier, MessageDescriptor> = {
  partnerOf: messages.generatedLabelPartnerOf,
  parentOf: messages.generatedLabelParentOf,
  childOf: messages.generatedLabelChildOf,
  siblingOf: messages.generatedLabelSiblingOf,
};

/** The people a qualifier can name for a person. */
function relativesFor(
  family: Family,
  personId: string,
  qualifier: Qualifier,
): string[] {
  switch (qualifier) {
    case 'partnerOf':
      return partnersOf(family, personId);
    case 'parentOf':
      return family.people
        .filter((person) =>
          primaryParentsOf(family, person.id).includes(personId),
        )
        .map((person) => person.id);
    case 'childOf':
      return primaryParentsOf(family, personId);
    case 'siblingOf':
      return siblingsOf(family, personId);
  }
}

/** Labels are compared as a participant would read them. */
const comparable = (text: string) => text.trim().toLocaleLowerCase();

/** Kinship words carry soft hyphens for the canvas; saved text does not. */
const plain = (text: string) => text.replace(/­/g, '');

const withoutNumber = (label: PersonLabel): PersonLabel =>
  label.type === 'numbered' ? label.label : label;

/**
 * The label to save as the name of everyone the participant has not named,
 * keyed by person id. The participant is never given one.
 *
 * Each label is the kinship word the canvas shows for the person, in the
 * framing's words. Labels are distinct from one another and from every typed
 * name, compared without case or surrounding space. Where several people
 * would share a word, or a word matches a typed name, each is told apart by
 * one relative (as in "Aunt (partner of Tom)"): their partner, then a child,
 * then a parent, then a sibling, the first that separates the whole group.
 * Named relatives and the participant are tried before any relative known
 * only by a kinship word, and a relative is used only when no one else in
 * the group shares them. When no relative separates them, they are numbered
 * in the order they were added ("Sister 1", "Sister 2").
 */
export function generateLabels(
  family: Family,
  framing: FramingId,
  intl: IntlShape,
): Map<string, string> {
  const canvasLabels = labelFamily(family, framing);
  const unnamed = family.people.filter(
    (person) => !person.isEgo && person.name === undefined,
  );

  // Every name the participant typed, the participant's own included.
  const used = new Set<string>();
  for (const person of family.people) {
    if (person.name !== undefined) used.add(comparable(person.name));
  }
  const typedNames = new Set(used);

  const baseLabels = new Map<string, PersonLabel>();
  const baseTexts = new Map<string, string>();
  for (const person of unnamed) {
    const label = withoutNumber(
      canvasLabels.get(person.id) ?? { type: 'unconnected' },
    );
    baseLabels.set(person.id, label);
    baseTexts.set(person.id, plain(formatPersonLabel(label, intl)));
  }

  const groups = new Map<string, Person[]>();
  for (const person of unnamed) {
    const key = comparable(baseTexts.get(person.id) ?? '');
    groups.set(key, [...(groups.get(key) ?? []), person]);
  }

  const result = new Map<string, string>();
  const colliding: Person[][] = [];
  for (const [key, members] of groups) {
    if (members.length === 1 && !typedNames.has(key)) {
      const [only] = members;
      if (only) result.set(only.id, baseTexts.get(only.id) ?? '');
      used.add(key);
    } else {
      colliding.push(members);
    }
  }

  // An unnamed relative can tell someone apart by their kinship word only
  // when that word is theirs alone and is a plain kinship word, rather than
  // one described through somebody else.
  const kinWordOf = (personId: string): string | undefined => {
    const label = baseLabels.get(personId);
    if (label?.type !== 'term') return undefined;
    const key = comparable(baseTexts.get(personId) ?? '');
    return groups.get(key)?.length === 1 && !typedNames.has(key)
      ? baseTexts.get(personId)
      : undefined;
  };

  /** The qualified label for a person through one relative, if they can be
   * referred to at this stage of the search. */
  const qualified = (
    personId: string,
    relativeId: string,
    qualifier: Qualifier,
    allowKinWords: boolean,
  ): string | undefined => {
    const relative = family.byId.get(relativeId);
    if (!relative) return undefined;
    const term = baseTexts.get(personId) ?? '';
    const message = QUALIFIER_MESSAGES[qualifier];
    if (relative.isEgo) {
      return intl.formatMessage(message, { isYou: 'true', term, name: '' });
    }
    const name =
      relative.name?.trim() ??
      (allowKinWords ? kinWordOf(relativeId) : undefined);
    if (name === undefined) return undefined;
    return intl.formatMessage(message, { isYou: 'false', term, name });
  };

  /** Each member qualified through the same kind of relative, or undefined
   * when that does not give every member a label of their own. */
  const qualifyGroup = (
    members: readonly Person[],
    qualifier: Qualifier,
    allowKinWords: boolean,
  ): Map<string, string> | undefined => {
    const memberIds = new Set(members.map((member) => member.id));
    const relativesOf = new Map(
      members.map((member) => [
        member.id,
        relativesFor(family, member.id, qualifier),
      ]),
    );
    const taken = new Set(used);
    const labels = new Map<string, string>();
    for (const member of members) {
      // A relative tells this member apart only when no one else in the
      // group has them in the same way; nor are members named after each
      // other.
      const candidates = (relativesOf.get(member.id) ?? []).filter(
        (relativeId) =>
          !memberIds.has(relativeId) &&
          members.every(
            (other) =>
              other.id === member.id ||
              !(relativesOf.get(other.id) ?? []).includes(relativeId),
          ),
      );
      // Named relatives first, then the participant, then — when allowed —
      // relatives known by a kinship word, each in the order they were added.
      const ranked = [
        ...candidates.filter((id) => family.byId.get(id)?.name !== undefined),
        ...candidates.filter((id) => family.byId.get(id)?.isEgo === true),
        ...candidates.filter((id) => {
          const relative = family.byId.get(id);
          return relative?.name === undefined && relative?.isEgo !== true;
        }),
      ];
      const label = ranked
        .map((relativeId) =>
          qualified(member.id, relativeId, qualifier, allowKinWords),
        )
        .find(
          (text): text is string =>
            text !== undefined && !taken.has(comparable(text)),
        );
      if (label === undefined) return undefined;
      taken.add(comparable(label));
      labels.set(member.id, label);
    }
    return labels;
  };

  const numberGroup = (members: readonly Person[]) => {
    const labels = new Map<string, string>();
    let number = 1;
    for (const member of members) {
      let label: string;
      do {
        label = intl.formatMessage(messages.numberedRelative, {
          label: baseTexts.get(member.id) ?? '',
          number: number++,
        });
      } while (used.has(comparable(label)));
      labels.set(member.id, label);
      used.add(comparable(label));
    }
    return labels;
  };

  for (const members of colliding) {
    let labels: Map<string, string> | undefined;
    for (const allowKinWords of [false, true]) {
      for (const qualifier of QUALIFIERS) {
        labels = qualifyGroup(members, qualifier, allowKinWords);
        if (labels) break;
      }
      if (labels) break;
    }
    if (labels) {
      for (const label of labels.values()) used.add(comparable(label));
    } else {
      labels = numberGroup(members);
    }
    for (const [id, label] of labels) result.set(id, label);
  }

  return result;
}

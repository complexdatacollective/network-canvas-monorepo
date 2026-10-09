import type { IntlShape } from '@codaco/app-i18n/messages';
import type { FramingId } from '@codaco/protocol-validation';
import type { VariableValue } from '@codaco/shared-consts';

import { readOwnProperty } from '../../utils/ownProperty';
import {
  formatPersonLabel,
  formatRelativeTerm,
  labelFamily,
  type PersonLabel,
} from './kinship';
import {
  partnersOf,
  primaryParentsOf,
  siblingsOf,
  type Family,
  type Person,
} from './model';
import type { PedigreeWords } from './pedigreeWords';

/**
 * How a qualifier relates the person to the relative who tells them apart,
 * in the order they are tried: their partner (current or former), their
 * child, their parent, their sibling.
 */
type Qualifier = 'partnerOf' | 'parentOf' | 'childOf' | 'siblingOf';
const QUALIFIERS: readonly Qualifier[] = [
  'partnerOf',
  'parentOf',
  'childOf',
  'siblingOf',
];

/** How the qualifying relative is related to the person, as `generatedLabelOf`
 * names it. */
const QUALIFIER_RELATION: Record<
  Qualifier,
  'partner' | 'parent' | 'child' | 'sibling'
> = {
  partnerOf: 'partner',
  parentOf: 'parent',
  childOf: 'child',
  siblingOf: 'sibling',
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

const NO_KIND_TERMS = {
  parent: 'parent',
  child: 'child',
  sibling: 'sibling',
} as const;

/**
 * The label of a parent, child or sibling being added whose kind is not yet
 * chosen: the word for the relation, naming no kind, as the participant's
 * own ("Parent"), or else as the relative of the person they are added to
 * ("Mother's parent").
 */
export function labelOfNoKind(
  relation: keyof typeof NO_KIND_TERMS,
  anchor: Person,
  anchorLabel: string,
  words: PedigreeWords,
): string {
  const term = NO_KIND_TERMS[relation];
  return formatPersonLabel(
    anchor.isEgo
      ? { type: 'term', term }
      : {
          type: 'relativeOf',
          anchors: [
            {
              ownerId: anchor.id,
              owner: { type: 'name', name: anchorLabel },
              term,
            },
          ],
        },
    words,
  );
}

/** A soft hyphen: where a long kinship word may break inside a symbol. */
const SOFT_HYPHEN = /\u00AD/g;

/** Kinship words carry soft hyphens for the canvas; saved text, and what a
 * screen reader reads out, does not. */
export const withoutSoftHyphens = (text: string) =>
  text.replace(SOFT_HYPHEN, '');

/** Labels are compared as a participant would read them, without case in
 * the language they are written in rather than the device's. */
const comparableIn = (locale: string) => (text: string) =>
  withoutSoftHyphens(text).trim().toLocaleLowerCase(locale);

/**
 * How everyone in the family is shown on the canvas and named in the rest of
 * the stage: the participant as "You", a named person by their name, and
 * everyone else by the label `generateLabels` saves for them, keeping the
 * soft hyphens where a long kinship word may break inside a symbol. Without
 * those, each label is exactly the text saved when the participant leaves.
 * Someone holding a name the stage cannot read is shown by a label too,
 * though none is saved for them.
 */
export function labelEveryone(
  family: Family,
  framing: FramingId,
  intl: IntlShape,
  words: PedigreeWords,
): Map<string, string> {
  const generated = buildLabels(family, framing, intl, words);
  return new Map(
    family.people.map((person) => [
      person.id,
      person.isEgo
        ? words.text(words.wording.you)
        : (person.name ??
          generated.get(person.id) ??
          formatRelativeTerm('other', words)),
    ]),
  );
}

/**
 * The label to save as the name of everyone the participant has not named,
 * keyed by person id. The participant is never given one, and nor is anyone
 * holding a name the stage cannot read.
 *
 * Each label starts from the person's kinship word, in the framing's words.
 * Labels are distinct from one another and from every typed name, compared
 * without case or surrounding space. Where several people would share a word,
 * or a word matches a typed name, each is told apart by one relative (as in
 * "Aunt (partner of Tom)"): their partner, then a child, then a parent, then
 * a sibling, the first that separates the whole group. Named relatives and
 * the participant are tried before any relative known only by a kinship
 * word, and a relative is used only when no one else in the group shares
 * them. When no relative separates them, they are numbered in the order they
 * were added ("Sister 1", "Sister 2"). The canvas shows the same labels.
 */
export function generateLabels(
  family: Family,
  framing: FramingId,
  intl: IntlShape,
  words: PedigreeWords,
): Map<string, string> {
  return new Map(
    [...buildLabels(family, framing, intl, words)]
      .filter(([id]) => family.byId.get(id)?.hasUnreadableName !== true)
      .map(([id, label]) => [id, withoutSoftHyphens(label)]),
  );
}

/**
 * Which of the labels to save each person already holds, and which must be
 * written. Someone already holds their label when their name attribute reads
 * as its very text: as stored, or as decrypted (`decryptedNames`, by person
 * id) when it is encrypted. Their stored value is kept as it is, so that it
 * is not written, and encrypted, again.
 */
export function labelWrites(
  family: Family,
  labels: ReadonlyMap<string, string>,
  nameAttribute: string,
  decryptedNames: ReadonlyMap<string, string>,
): { held: Map<string, VariableValue>; toWrite: Map<string, string> } {
  const held = new Map<string, VariableValue>();
  const toWrite = new Map<string, string>();
  for (const [personId, label] of labels) {
    const person = family.byId.get(personId);
    if (!person) continue;
    const stored = readOwnProperty(person.attributes, nameAttribute);
    const text =
      typeof stored === 'string' ? stored : decryptedNames.get(personId);
    if (stored !== undefined && text === label) held.set(personId, stored);
    else toWrite.set(personId, label);
  }
  return { held, toWrite };
}

/** The generated labels, with the kinship words' soft hyphens, for everyone
 * without a name the stage can read. */
function buildLabels(
  family: Family,
  framing: FramingId,
  intl: IntlShape,
  words: PedigreeWords,
): Map<string, string> {
  const kinshipLabels = labelFamily(family, framing);
  const unnamed = family.people.filter(
    (person) => !person.isEgo && person.name === undefined,
  );
  const baseLabels = new Map<string, PersonLabel>();
  for (const person of unnamed) {
    baseLabels.set(
      person.id,
      kinshipLabels.get(person.id) ?? { type: 'unconnected' },
    );
  }

  // Someone described through a relative ("Isaac’s grandfather") is
  // described through the nearest whose final label is a name or a plain
  // kinship word, and that depends on whether the relative ends up qualified
  // or numbered, so the labels are worked out again until each one's
  // relatives are settled. Each round settles everyone one step further from
  // the participant.
  let labels = new Map<string, string>();
  for (let round = 0; round <= unnamed.length; round++) {
    const settled = labels;
    const baseTexts = new Map(
      unnamed.map((person) => [
        person.id,
        formatPersonLabel(baseLabels.get(person.id)!, words, (ownerId) =>
          settled.get(ownerId),
        ),
      ]),
    );
    const next = resolveLabels(
      family,
      unnamed,
      baseLabels,
      baseTexts,
      intl,
      words,
    );
    const unchanged =
      next.size === labels.size &&
      [...next].every(([id, label]) => labels.get(id) === label);
    labels = next;
    if (unchanged) break;
  }
  return labels;
}

/** Labels for the unnamed people, distinct from each other and from every
 * typed name, from their kinship labels and those labels' texts. */
function resolveLabels(
  family: Family,
  unnamed: readonly Person[],
  baseLabels: ReadonlyMap<string, PersonLabel>,
  baseTexts: ReadonlyMap<string, string>,
  intl: IntlShape,
  words: PedigreeWords,
): Map<string, string> {
  const comparable = comparableIn(intl.locale);
  // Every name typed, and any name the participant's own person was given
  // elsewhere in the interview.
  const used = new Set<string>();
  for (const person of family.people) {
    if (person.name !== undefined) used.add(comparable(person.name));
  }
  const typedNames = new Set(used);

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

  const isCurrentPartnership = (a: string, b: string) =>
    family.links.some(
      (link) =>
        link.kind === 'partner' &&
        link.isCurrentPartner &&
        ((link.source === a && link.target === b) ||
          (link.source === b && link.target === a)),
    );

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
    // A partnership that has ended is named as one.
    const relation =
      qualifier === 'partnerOf' && !isCurrentPartnership(personId, relativeId)
        ? 'formerPartner'
        : QUALIFIER_RELATION[qualifier];
    if (relative.isEgo) {
      return words.text(words.wording.generatedLabelOf, {
        relation,
        isYou: 'true',
        term,
        name: '',
      });
    }
    const name =
      relative.name?.trim() ??
      (allowKinWords ? kinWordOf(relativeId) : undefined);
    if (name === undefined) return undefined;
    return words.text(words.wording.generatedLabelOf, {
      relation,
      isYou: 'false',
      term,
      name,
    });
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
        label = `${baseTexts.get(member.id) ?? ''} ${intl.formatNumber(number++)}`;
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

/**
 * The words that name each person, by person id, for wherever only words
 * can tell people apart: what a screen reader reads out for their symbol,
 * and the panel titles, connect hints and confirmations that name them.
 * Each starts from their label (`labels`, as `labelEveryone` gives them).
 *
 * A name the participant typed is never altered or added to, even when two
 * relatives were given the same one: it is shown exactly as typed. Only
 * people without a typed name whose labels match (as a relative being
 * added, labelled by the relation chosen, can match someone else) are told
 * apart as generated labels are: by one relative of the same kind for each
 * (their partner, then a child, then a parent, then a sibling, named by
 * that relative's own label), the first kind that separates them all, or
 * else by number in the order they were added. A label no one else shares
 * is kept as it is. Nothing here is saved.
 */
export function distinctNames(
  family: Family,
  labels: ReadonlyMap<string, string>,
  intl: IntlShape,
  words: PedigreeWords,
): Map<string, string> {
  const comparable = comparableIn(intl.locale);
  const result = new Map(labels);
  const used = new Set([...labels.values()].map(comparable));
  const groups = new Map<string, Person[]>();
  for (const person of family.people) {
    const label = labels.get(person.id);
    if (label === undefined || person.isEgo || person.name !== undefined) {
      continue;
    }
    const key = comparable(label);
    groups.set(key, [...(groups.get(key) ?? []), person]);
  }

  const throughRelatives = (
    members: readonly Person[],
    qualifier: Qualifier,
  ): Map<string, string> | undefined => {
    const memberIds = new Set(members.map((member) => member.id));
    const relativesOf = new Map(
      members.map((member) => [
        member.id,
        relativesFor(family, member.id, qualifier),
      ]),
    );
    const taken = new Set(used);
    const told = new Map<string, string>();
    for (const member of members) {
      // A relative tells this member apart only when no one else in the
      // group has them in the same way. Named relatives come first, then the
      // participant, then relatives known by a label.
      const rank = (id: string) => {
        const relative = family.byId.get(id);
        return relative?.name !== undefined ? 0 : relative?.isEgo ? 1 : 2;
      };
      const relativeId = (relativesOf.get(member.id) ?? [])
        .filter(
          (id) =>
            !memberIds.has(id) &&
            labels.has(id) &&
            members.every(
              (other) =>
                other.id === member.id ||
                !(relativesOf.get(other.id) ?? []).includes(id),
            ),
        )
        .toSorted((a, b) => rank(a) - rank(b))[0];
      const relative = relativeId ? family.byId.get(relativeId) : undefined;
      if (!relative) return undefined;
      const text = words.text(words.wording.generatedLabelOf, {
        relation: QUALIFIER_RELATION[qualifier],
        isYou: relative.isEgo ? 'true' : 'false',
        term: labels.get(member.id) ?? '',
        name: relative.isEgo ? '' : (labels.get(relative.id) ?? ''),
      });
      if (taken.has(comparable(text))) return undefined;
      taken.add(comparable(text));
      told.set(member.id, text);
    }
    return told;
  };

  const byNumber = (members: readonly Person[]) => {
    const told = new Map<string, string>();
    let number = 1;
    for (const member of members) {
      let text: string;
      do {
        text = `${labels.get(member.id) ?? ''} ${intl.formatNumber(number++)}`;
      } while (used.has(comparable(text)));
      used.add(comparable(text));
      told.set(member.id, text);
    }
    return told;
  };

  for (const members of groups.values()) {
    if (members.length < 2) continue;
    const told =
      QUALIFIERS.map((qualifier) => throughRelatives(members, qualifier)).find(
        (candidate) => candidate !== undefined,
      ) ?? byNumber(members);
    for (const [id, text] of told) {
      used.add(comparable(text));
      result.set(id, text);
    }
  }
  return result;
}

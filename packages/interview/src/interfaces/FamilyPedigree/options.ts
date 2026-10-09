import type {
  Codebook,
  FamilyPedigreeWording,
  LocalizedString,
  PedigreeParentKind,
  PedigreeSexAssignedAtBirth,
} from '@codaco/protocol-validation';

import type { MissingDetail, PedigreeConfig } from './model';
import { configuredWord } from './pedigreeWords';

/**
 * The participant-facing labels of the interface-owned value sets, by value:
 * the labels the codebook gives the attributes the stage records them in.
 */
export type OwnedOptionLabels = Readonly<{
  sexAssignedAtBirth: Readonly<Record<PedigreeSexAssignedAtBirth, string>>;
  parentKind: Readonly<Record<PedigreeParentKind, string>>;
}>;

const labelsOf = (
  definition: { type: string; options?: unknown } | undefined,
  resolve: (value: LocalizedString) => string,
): Record<string, string> => {
  if (definition?.type !== 'categorical' || !Array.isArray(definition.options))
    return {};
  const labels: Record<string, string> = {};
  for (const option of definition.options as readonly {
    value: unknown;
    label: LocalizedString;
  }[]) {
    if (typeof option.value === 'string')
      labels[option.value] = resolve(option.label);
  }
  return labels;
};

/**
 * The labels the codebook gives the stage's sex assigned at birth and
 * relationship kind attributes, in the interview's language. Validation keeps
 * each attribute's options to exactly the interface's values, so every value
 * has one; a value missing from a malformed codebook reads as itself.
 */
export const ownedOptionLabels = (
  codebook: Codebook,
  config: PedigreeConfig,
  resolve: (value: LocalizedString) => string,
): OwnedOptionLabels => {
  const sex = labelsOf(
    codebook.node?.[config.personType]?.variables?.[
      config.sexAssignedAtBirthAttribute
    ],
    resolve,
  );
  const kind = labelsOf(
    codebook.edge?.[config.relationshipType]?.variables?.[config.kindAttribute],
    resolve,
  );
  const label = (labels: Record<string, string>, value: string) =>
    labels[value] ?? value;
  return {
    sexAssignedAtBirth: {
      female: label(sex, 'female'),
      male: label(sex, 'male'),
      intersex: label(sex, 'intersex'),
      unknown: label(sex, 'unknown'),
      preferNotToSay: label(sex, 'preferNotToSay'),
    },
    parentKind: {
      biological: label(kind, 'biological'),
      adoptive: label(kind, 'adoptive'),
      social: label(kind, 'social'),
      donor: label(kind, 'donor'),
      surrogate: label(kind, 'surrogate'),
    },
  };
};

/** The words of the option for each kind of child the stage asks about,
 * by the kind of parent the person is to them. */
export const childKindWording = (
  wording: FamilyPedigreeWording,
  kind: PedigreeParentKind,
): LocalizedString => {
  switch (kind) {
    case 'biological':
      return wording.childKindBiological;
    case 'adoptive':
      return wording.childKindAdoptive;
    case 'social':
      return wording.childKindSocial;
    case 'donor':
      return wording.childKindDonor;
    case 'surrogate':
      return wording.childKindSurrogate;
  }
};

/**
 * The question a built-in detail is missing: gender identity is asked only
 * when the stage asks about it, so its words are held only then.
 */
export const builtInDetailWording = (
  wording: FamilyPedigreeWording,
  detail: Exclude<MissingDetail, { variable: string }>,
): LocalizedString =>
  detail === 'genderIdentity'
    ? configuredWord(wording.genderIdentityLabel)
    : wording.sexAssignedAtBirthLabel;

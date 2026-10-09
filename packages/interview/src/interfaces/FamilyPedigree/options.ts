import type { MessageDescriptor } from '@codaco/app-i18n/messages';
import type {
  Codebook,
  LocalizedString,
  PedigreeParentKind,
  PedigreeSexAssignedAtBirth,
} from '@codaco/protocol-validation';

import { messages } from './messages';
import type { MissingDetail, PedigreeConfig } from './model';

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

export const CHILD_KIND_LABELS: Record<PedigreeParentKind, MessageDescriptor> =
  {
    biological: messages.childKindBiological,
    adoptive: messages.childKindAdoptive,
    social: messages.childKindSocial,
    donor: messages.childKindDonor,
    surrogate: messages.childKindSurrogate,
  };

export const BUILT_IN_DETAIL_LABELS: Record<
  Exclude<MissingDetail, { variable: string }>,
  MessageDescriptor
> = {
  genderIdentity: messages.genderIdentityLabel,
  sexAssignedAtBirth: messages.sexAssignedAtBirthLabel,
};

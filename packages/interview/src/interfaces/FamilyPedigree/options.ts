import type { MessageDescriptor } from '@codaco/app-i18n/messages';
import type {
  PedigreeParentKind,
  PedigreeSexAssignedAtBirth,
} from '@codaco/protocol-validation';

import { messages } from './messages';
import type { MissingDetail } from './model';

/**
 * Participant-facing labels for the interface-owned value sets. The codebook
 * carries fixed English labels for these values; the participant reads these
 * translated ones instead. (Gender identity is not among them: its options are
 * the researcher's, and the participant reads the labels they gave.)
 */
export const SEX_ASSIGNED_AT_BIRTH_LABELS: Record<
  PedigreeSexAssignedAtBirth,
  MessageDescriptor
> = {
  female: messages.sexFemale,
  male: messages.sexMale,
  intersex: messages.sexIntersex,
  unknown: messages.dontKnow,
  preferNotToSay: messages.preferNotToSay,
};

export const PARENT_KIND_LABELS: Record<PedigreeParentKind, MessageDescriptor> =
  {
    biological: messages.parentKindBiological,
    adoptive: messages.parentKindAdoptive,
    social: messages.parentKindSocial,
    donor: messages.parentKindDonor,
    surrogate: messages.parentKindSurrogate,
  };

export const CHILD_KIND_LABELS: Record<
  'biological' | 'adoptive' | 'social',
  MessageDescriptor
> = {
  biological: messages.childKindBiological,
  adoptive: messages.childKindAdoptive,
  social: messages.childKindSocial,
};

export const BUILT_IN_DETAIL_LABELS: Record<
  Exclude<MissingDetail, { variable: string }>,
  MessageDescriptor
> = {
  genderIdentity: messages.genderIdentityLabel,
  sexAssignedAtBirth: messages.sexAssignedAtBirthLabel,
};

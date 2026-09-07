import {
  type IntlShape,
  type MessageDescriptor,
} from '@codaco/app-i18n/messages';
import type { FramingId } from '@codaco/protocol-validation';

import { resolveInterviewIntl } from '../../i18n/resolveIntl';
import { messages } from './messages';

/**
 * Participant-facing terminology for each pedigree framing.
 *
 * The framing *ids* are schema contract (they are what a protocol stores) and
 * live in `@codaco/protocol-validation`. The words below are interview copy:
 * they are only ever rendered, never persisted, so they belong here beside the
 * screens that show them and can be revised without touching any schema.
 *
 * Two framings are supported: 'gamete' (biology-first language) and 'gendered'
 * (mother/father kinship terms). Gestational carrier and donor terms are
 * intentionally identical across both framings.
 */
type FramingLookup<Value> = {
  [Id in FramingId]: Value;
};

export type FramingTerms = {
  eggParent: string;
  spermParent: string;
  gestationalCarrier: string;
  eggDonor: string;
  spermDonor: string;
  // The question (and its hint) asking which person contributed each gamete
  // when adding a child. Framed so the gendered framing never leaks "egg"/
  // "sperm" — every child-adding flow reads these instead of hardcoding.
  eggProviderQuestion: string;
  eggProviderHint: string;
  spermProviderQuestion: string;
  spermProviderHint: string;
  // Whole participant-facing phrases that must NOT be assembled at the call site
  // by prepending an article/possessive/prefix (e.g. "an", "your", "New",
  // "Unknown") to a term and lower-casing it — that grammar interpolation is not
  // localisable. The donor questions are framing-invariant (the donor terms are),
  // but are kept here so every framed phrase lives in one place.
  eggDonorQuestion: string;
  spermDonorQuestion: string;
  yourEggParent: string;
  yourSpermParent: string;
  newEggParent: string;
  newSpermParent: string;
  unknownEggParent: string;
  unknownSpermParent: string;
};

const framingMessages: FramingLookup<
  Record<keyof FramingTerms, MessageDescriptor>
> = {
  gamete: {
    eggParent: messages.eggParent,
    spermParent: messages.spermParent,
    gestationalCarrier: messages.gestationalCarrier,
    eggDonor: messages.eggDonor,
    spermDonor: messages.spermDonor,
    eggProviderQuestion: messages.eggProviderQuestion,
    eggProviderHint: messages.eggProviderHint,
    spermProviderQuestion: messages.spermProviderQuestion,
    spermProviderHint: messages.spermProviderHint,
    eggDonorQuestion: messages.eggDonorQuestion,
    spermDonorQuestion: messages.spermDonorQuestion,
    yourEggParent: messages.yourEggParent,
    yourSpermParent: messages.yourSpermParent,
    newEggParent: messages.newEggParent,
    newSpermParent: messages.newSpermParent,
    unknownEggParent: messages.unknownEggParent,
    unknownSpermParent: messages.unknownSpermParent,
  },
  gendered: {
    eggParent: messages.mother,
    spermParent: messages.father,
    gestationalCarrier: messages.gestationalCarrier,
    eggDonor: messages.eggDonor,
    spermDonor: messages.spermDonor,
    eggProviderQuestion: messages.motherQuestion,
    eggProviderHint: messages.motherHint,
    spermProviderQuestion: messages.fatherQuestion,
    spermProviderHint: messages.fatherHint,
    eggDonorQuestion: messages.eggDonorQuestion,
    spermDonorQuestion: messages.spermDonorQuestion,
    yourEggParent: messages.yourMother,
    yourSpermParent: messages.yourFather,
    newEggParent: messages.newMother,
    newSpermParent: messages.newFather,
    unknownEggParent: messages.unknownMother,
    unknownSpermParent: messages.unknownFather,
  },
};

/** Display-only terms; the selected framing ID remains the stored contract. */
export function getFramingTerms(
  framing: FramingId,
  intl?: IntlShape,
): FramingTerms {
  const formatter = resolveInterviewIntl(intl);
  const source = framingMessages[framing];
  return {
    eggParent: formatter.formatMessage(source.eggParent),
    spermParent: formatter.formatMessage(source.spermParent),
    gestationalCarrier: formatter.formatMessage(source.gestationalCarrier),
    eggDonor: formatter.formatMessage(source.eggDonor),
    spermDonor: formatter.formatMessage(source.spermDonor),
    eggProviderQuestion: formatter.formatMessage(source.eggProviderQuestion),
    eggProviderHint: formatter.formatMessage(source.eggProviderHint),
    spermProviderQuestion: formatter.formatMessage(
      source.spermProviderQuestion,
    ),
    spermProviderHint: formatter.formatMessage(source.spermProviderHint),
    eggDonorQuestion: formatter.formatMessage(source.eggDonorQuestion),
    spermDonorQuestion: formatter.formatMessage(source.spermDonorQuestion),
    yourEggParent: formatter.formatMessage(source.yourEggParent),
    yourSpermParent: formatter.formatMessage(source.yourSpermParent),
    newEggParent: formatter.formatMessage(source.newEggParent),
    newSpermParent: formatter.formatMessage(source.newSpermParent),
    unknownEggParent: formatter.formatMessage(source.unknownEggParent),
    unknownSpermParent: formatter.formatMessage(source.unknownSpermParent),
  };
}

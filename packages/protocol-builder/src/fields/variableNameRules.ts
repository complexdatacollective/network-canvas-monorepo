import { defineMessages } from '@codaco/app-i18n/messages';
import type { IntlShape } from '@codaco/app-i18n/messages';
import {
  normalizeForComparison,
  VariableNameSchema,
} from '@codaco/shared-consts';

const messages = defineMessages({
  nameTaken: {
    id: 'protocolBuilder.variablePicker.nameTaken',
    defaultMessage: 'this type already has an attribute called that',
    description:
      'Reason given on the switched-off create row of the attribute list. Reads after a colon, so it is a clause rather than a sentence: “Cannot create attribute named “age”: this type already has an attribute called that”.',
  },
  nameInvalid: {
    id: 'protocolBuilder.variablePicker.nameInvalid',
    defaultMessage:
      'only letters, numbers and the symbols ._-: can be used in a name',
    description:
      'Reason given on the switched-off create row of the attribute list when the name typed holds characters the export formats cannot carry. Reads after a colon, so it is a clause rather than a sentence. The listed symbols are literal characters and must not be translated.',
  },
});

/**
 * Why a name typed for an attribute cannot be used, or `undefined` while it
 * can.
 *
 * Asked of the whole type rather than of whatever list a control is offering,
 * and against the schema's own name rule rather than a second opinion about
 * it: the codebook is what refuses the write, and a control that offered a
 * name the codebook would refuse would spend a round trip to say so.
 *
 * Which is why the names are compared through `normalizeForComparison`, the
 * helper `assertVariableNameAvailable` judges a write with: it case-folds and
 * canonicalises, so `AGE` is the name `age` and a decomposed `café` is the
 * precomposed one. A raw comparison would offer a name the codebook holds and
 * then answer with a duplicate-name refusal about a name the researcher
 * believed was free.
 *
 * One rule for the two controls that ask it — the create row of the attribute
 * window, and the editor the held pill opens on the name it already has — so
 * they cannot come to disagree about what a name may be. `excluding` is the
 * rename's own: an attribute is not the thing standing in its own way.
 */
export const variableNameRefusal = (
  typed: string,
  {
    namesInUse,
    excluding,
    intl,
  }: Readonly<{
    namesInUse?: readonly string[];
    excluding?: string;
    intl: IntlShape;
  }>,
): string | undefined => {
  const normalized = normalizeForComparison(typed);
  const own =
    excluding === undefined ? undefined : normalizeForComparison(excluding);
  if (
    normalized !== own &&
    namesInUse?.some((held) => normalizeForComparison(held) === normalized) ===
      true
  ) {
    return intl.formatMessage(messages.nameTaken);
  }
  if (!VariableNameSchema.safeParse(typed).success) {
    return intl.formatMessage(messages.nameInvalid);
  }
  return undefined;
};

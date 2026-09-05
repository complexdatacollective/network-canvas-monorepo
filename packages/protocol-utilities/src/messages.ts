import { defineMessages } from '@codaco/app-i18n/messages';
import type { IntlShape, MessageDescriptor } from '@codaco/app-i18n/messages';

import type {
  ConstraintConflict,
  ConstraintReasonCode,
} from './generateNetwork/constraints/error.ts';

export const constraintReasonMessages = defineMessages({
  requiredEmptySelection: {
    id: 'protocolUtilities.constraint.requiredEmptySelection',
    defaultMessage:
      'The maximum selection is zero, but an answer is required. Allow at least one selection or make the answer optional.',
    description:
      'Researcher-facing explanation and repair guidance when synthetic interview data cannot be generated: requiredEmptySelection.',
  },
  requiredEmptyText: {
    id: 'protocolUtilities.constraint.requiredEmptyText',
    defaultMessage:
      'The maximum text length is zero, but an answer is required. Allow text or make the answer optional.',
    description:
      'Researcher-facing explanation and repair guidance when synthetic interview data cannot be generated: requiredEmptyText.',
  },
  invertedBounds: {
    id: 'protocolUtilities.constraint.invertedBounds',
    defaultMessage:
      'The minimum exceeds the maximum, so no answer is allowed. Adjust these limits.',
    description:
      'Researcher-facing explanation and repair guidance when synthetic interview data cannot be generated: invertedBounds.',
  },
  minSelectedExceedsOptions: {
    id: 'protocolUtilities.constraint.minSelectedExceedsOptions',
    defaultMessage:
      'The minimum selection exceeds the number of available options. Add options or reduce the minimum.',
    description:
      'Researcher-facing explanation and repair guidance when synthetic interview data cannot be generated: minSelectedExceedsOptions.',
  },
  conflictingReferencePair: {
    id: 'protocolUtilities.constraint.conflictingReferencePair',
    defaultMessage:
      'These attributes must be both equal and different. Remove one of the conflicting rules.',
    description:
      'Researcher-facing explanation and repair guidance when synthetic interview data cannot be generated: conflictingReferencePair.',
  },
  strictComparatorCycle: {
    id: 'protocolUtilities.constraint.strictComparatorCycle',
    defaultMessage:
      'These attributes reference each other in an impossible comparison cycle. Change a comparison to break the cycle.',
    description:
      'Researcher-facing explanation and repair guidance when synthetic interview data cannot be generated: strictComparatorCycle.',
  },
  sameAsGroupConflict: {
    id: 'protocolUtilities.constraint.sameAsGroupConflict',
    defaultMessage:
      'These attributes must share one value, but their permitted values or date resolutions are incompatible. Align their rules and input controls.',
    description:
      'Researcher-facing explanation and repair guidance when synthetic interview data cannot be generated: sameAsGroupConflict.',
  },
  disjointBounds: {
    id: 'protocolUtilities.constraint.disjointBounds',
    defaultMessage:
      'The comparisons between these attributes cannot fit within their allowed ranges. Adjust the ranges or comparisons.',
    description:
      'Researcher-facing explanation and repair guidance when synthetic interview data cannot be generated: disjointBounds.',
  },
  oddDifferentFromCycle: {
    id: 'protocolUtilities.constraint.oddDifferentFromCycle',
    defaultMessage:
      'There are too few allowed values to make all the required attributes different. Add allowed values or remove a conflicting rule.',
    description:
      'Researcher-facing explanation and repair guidance when synthetic interview data cannot be generated: oddDifferentFromCycle.',
  },
  pinnedEqualDifferentFrom: {
    id: 'protocolUtilities.constraint.pinnedEqualDifferentFrom',
    defaultMessage:
      'These attributes must differ, but their rules force the same value. Widen a range or change a comparison.',
    description:
      'Researcher-facing explanation and repair guidance when synthetic interview data cannot be generated: pinnedEqualDifferentFrom.',
  },
  pinnedDifferentFromParity: {
    id: 'protocolUtilities.constraint.pinnedDifferentFromParity',
    defaultMessage:
      'The fixed values and rules requiring different answers cannot all be satisfied. Change a fixed value or a comparison.',
    description:
      'Researcher-facing explanation and repair guidance when synthetic interview data cannot be generated: pinnedDifferentFromParity.',
  },
  sharedBounds: {
    id: 'protocolUtilities.constraint.sharedBounds',
    defaultMessage:
      'These attributes must share one value, but their allowed ranges do not overlap. Adjust the ranges or the equality rule.',
    description:
      'Researcher-facing explanation and repair guidance when synthetic interview data cannot be generated: sharedBounds.',
  },
  disjointOptions: {
    id: 'protocolUtilities.constraint.disjointOptions',
    defaultMessage:
      'These attributes must share one value, but their available options have no value in common. Add a common option or change the equality rule.',
    description:
      'Researcher-facing explanation and repair guidance when synthetic interview data cannot be generated: disjointOptions.',
  },
  noSolution: {
    id: 'protocolUtilities.constraint.noSolution',
    defaultMessage:
      'No combination of permitted values satisfies all these rules. Review the rules for the listed attributes.',
    description:
      'Researcher-facing explanation and repair guidance when synthetic interview data cannot be generated: noSolution.',
  },
  fixedValueRejected: {
    id: 'protocolUtilities.constraint.fixedValueRejected',
    defaultMessage:
      'A question assigns fixed values that these validation rules reject. Change the fixed values or the conflicting rules.',
    description:
      'Researcher-facing explanation and repair guidance when synthetic interview data cannot be generated: fixedValueRejected.',
  },
  textGenerationLimit: {
    id: 'protocolUtilities.constraint.textGenerationLimit',
    defaultMessage:
      'The minimum text length exceeds the size a generated value can hold. Reduce the minimum length.',
    description:
      'Researcher-facing explanation and repair guidance when synthetic interview data cannot be generated: textGenerationLimit.',
  },
  negativeTextMaximum: {
    id: 'protocolUtilities.constraint.negativeTextMaximum',
    defaultMessage:
      'A negative maximum text length permits no answer. Set a maximum of zero or more.',
    description:
      'Researcher-facing explanation and repair guidance when synthetic interview data cannot be generated: negativeTextMaximum.',
  },
  negativeSelectionMaximum: {
    id: 'protocolUtilities.constraint.negativeSelectionMaximum',
    defaultMessage:
      'A negative maximum selection permits no answer. Set a maximum of zero or more.',
    description:
      'Researcher-facing explanation and repair guidance when synthetic interview data cannot be generated: negativeSelectionMaximum.',
  },
  emptyDateRange: {
    id: 'protocolUtilities.constraint.emptyDateRange',
    defaultMessage:
      'The earliest permitted date is after the latest permitted date. Correct the date range.',
    description:
      'Researcher-facing explanation and repair guidance when synthetic interview data cannot be generated: emptyDateRange.',
  },
  uniqueEgo: {
    id: 'protocolUtilities.constraint.uniqueEgo',
    defaultMessage:
      'Unique values are not supported for participant attributes. Remove this validation rule.',
    description:
      'Researcher-facing explanation and repair guidance when synthetic interview data cannot be generated: uniqueEgo.',
  },
  insufficientUniqueValues: {
    id: 'protocolUtilities.constraint.insufficientUniqueValues',
    defaultMessage:
      'Too few distinct values are available for all the nodes or links this protocol can create. Allow more values or change the uniqueness rule.',
    description:
      'Researcher-facing explanation and repair guidance when synthetic interview data cannot be generated: insufficientUniqueValues.',
  },
  duplicateFixedValues: {
    id: 'protocolUtilities.constraint.duplicateFixedValues',
    defaultMessage:
      'The protocol or roster assigns the same value to multiple nodes or links, but the value must be unique. Change the fixed values or the uniqueness rule.',
    description:
      'Researcher-facing explanation and repair guidance when synthetic interview data cannot be generated: duplicateFixedValues.',
  },
  numberDateComparison: {
    id: 'protocolUtilities.constraint.numberDateComparison',
    defaultMessage:
      'A number is compared with a date. Use attributes with compatible types for this comparison.',
    description:
      'Researcher-facing explanation and repair guidance when synthetic interview data cannot be generated: numberDateComparison.',
  },
  fixedCompletion: {
    id: 'protocolUtilities.constraint.fixedCompletion',
    defaultMessage:
      'The fixed values assigned by a question leave no valid values for the remaining attributes. Change the fixed values or the related comparison rules.',
    description:
      'Researcher-facing explanation and repair guidance when synthetic interview data cannot be generated: fixedCompletion.',
  },
  drawExhausted: {
    id: 'protocolUtilities.constraint.drawExhausted',
    defaultMessage:
      'No value satisfies these rules alongside the values already chosen for related attributes. Review the related rules or try another generation seed.',
    description:
      'Researcher-facing explanation and repair guidance when synthetic interview data cannot be generated: drawExhausted.',
  },
  incompatibleDateControls: {
    id: 'protocolUtilities.constraint.incompatibleDateControls',
    defaultMessage:
      'Forms use incompatible date controls for the same attribute. Give those controls a common date range and resolution.',
    description:
      'Researcher-facing explanation and repair guidance when synthetic interview data cannot be generated: incompatibleDateControls.',
  },
  inheritancePatterns: {
    id: 'protocolUtilities.constraint.inheritancePatterns',
    defaultMessage:
      'Narrative pedigree stages assign different inheritance patterns to the same disease attribute. Use a consistent inheritance pattern.',
    description:
      'Researcher-facing explanation and repair guidance when synthetic interview data cannot be generated: inheritancePatterns.',
  },
  pedigreeFixedValue: {
    id: 'protocolUtilities.constraint.pedigreeFixedValue',
    defaultMessage:
      'A validation rule rejects a fixed value required by the family pedigree data model. Adjust the rule to permit the required value.',
    description:
      'Researcher-facing explanation and repair guidance when synthetic interview data cannot be generated: pedigreeFixedValue.',
  },
}) satisfies Record<ConstraintReasonCode, MessageDescriptor>;

/** Optional localized UI surface; generation itself stays locale-independent. */
export function formatConstraintConflictReason(
  conflict: ConstraintConflict,
  intl: IntlShape,
): string {
  return intl.formatMessage(
    constraintReasonMessages[conflict.reasonCode ?? 'noSolution'],
  );
}

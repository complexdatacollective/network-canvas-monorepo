import { defineMessages } from '@codaco/app-i18n/messages';
import type { MessageDescriptor, IntlShape } from '@codaco/app-i18n/messages';

import { MalformedNetcanvasError } from './utils/malformedNetcanvasError.ts';
import {
  getProtocolFileErrorKind,
  type ProtocolFileErrorKind,
} from './utils/protocolFileErrorKind.ts';

export const protocolFileErrorMessages = defineMessages({
  notArchive: {
    id: 'protocolValidation.file.notArchive',
    defaultMessage:
      "This file isn't a Network Canvas protocol. Check that you chose the right file, and that it finished downloading.",
    description:
      'Researcher-facing explanation and recovery guidance for a protocol file import failure: notArchive.',
  },
  missingProtocol: {
    id: 'protocolValidation.file.missingProtocol',
    defaultMessage:
      'This file is missing its protocol, so there is nothing to open. It may have been created by another program, or damaged in transit.',
    description:
      'Researcher-facing explanation and recovery guidance for a protocol file import failure: missingProtocol.',
  },
  damagedJson: {
    id: 'protocolValidation.file.damagedJson',
    defaultMessage:
      "This protocol's contents are damaged and cannot be read. Try a backup, or the copy you originally downloaded.",
    description:
      'Researcher-facing explanation and recovery guidance for a protocol file import failure: damagedJson.',
  },
  missingNamedAsset: {
    id: 'protocolValidation.file.missingNamedAsset',
    defaultMessage:
      'This protocol refers to a file that isn\'t included in it: "{assetName}".',
    description:
      'Researcher-facing explanation and recovery guidance for a protocol file import failure: missingNamedAsset. assetName is an unchanged researcher-authored file name.',
  },
  missingAsset: {
    id: 'protocolValidation.file.missingAsset',
    defaultMessage: "This protocol refers to a file that isn't included in it.",
    description:
      'Researcher-facing explanation and recovery guidance for a protocol file import failure: missingAsset.',
  },
  invalidAsset: {
    id: 'protocolValidation.file.invalidAsset',
    defaultMessage:
      "One of this protocol's resources is described in a way this version does not understand, so the protocol cannot be opened.",
    description:
      'Researcher-facing explanation and recovery guidance for a protocol file import failure: invalidAsset.',
  },
  inflationLimit: {
    id: 'protocolValidation.file.inflationLimit',
    defaultMessage:
      'This protocol file expands to more data than can be opened safely. It may be corrupt or malicious.',
    description:
      'Researcher-facing explanation and recovery guidance for a protocol file import failure: inflationLimit.',
  },
  newerVersion: {
    id: 'protocolValidation.file.newerVersion',
    defaultMessage:
      'This protocol was made with a newer version of Network Canvas. Update to the latest version to open it.',
    description:
      'Researcher-facing explanation and recovery guidance for a protocol file import failure: newerVersion.',
  },
  cannotUpgrade: {
    id: 'protocolValidation.file.cannotUpgrade',
    defaultMessage:
      'This protocol was made with a version of Network Canvas it cannot be upgraded from. Open it in the version that made it and save it there first.',
    description:
      'Researcher-facing explanation and recovery guidance for a protocol file import failure: cannotUpgrade.',
  },
  upgradeStepFailed: {
    id: 'protocolValidation.file.upgradeStepFailed',
    defaultMessage:
      'This protocol could not be upgraded to the current version. Nothing has been changed on this device.',
    description:
      'Researcher-facing explanation and recovery guidance for a protocol file import failure: upgradeStepFailed.',
  },
  missingVersion: {
    id: 'protocolValidation.file.missingVersion',
    defaultMessage:
      'This file does not say which version of Network Canvas made it, so it cannot be opened.',
    description:
      'Researcher-facing explanation and recovery guidance for a protocol file import failure: missingVersion.',
  },
  invalidBeforeUpgrade: {
    id: 'protocolValidation.file.invalidBeforeUpgrade',
    defaultMessage:
      'This protocol did not pass the checks for the version it was made with, so it could not be upgraded.',
    description:
      'Researcher-facing explanation and recovery guidance for a protocol file import failure: invalidBeforeUpgrade.',
  },
  upgradeFailed: {
    id: 'protocolValidation.file.upgradeFailed',
    defaultMessage:
      'This protocol could not be upgraded to the current version.',
    description:
      'Researcher-facing explanation and recovery guidance for a protocol file import failure: upgradeFailed.',
  },
}) satisfies Record<ProtocolFileErrorKind, MessageDescriptor>;

/** Optional UI presenter. The root/CLI API retains its framework-free English behavior. */
export function describeProtocolFileErrorMessage(error: unknown): {
  descriptor: MessageDescriptor;
  values?: Record<string, string | number>;
} | null {
  const kind = getProtocolFileErrorKind(error);
  if (kind === null) return null;
  return {
    descriptor: protocolFileErrorMessages[kind],
    ...(kind === 'missingNamedAsset' &&
      error instanceof MalformedNetcanvasError && {
        values: { assetName: error.assetName ?? '' },
      }),
  };
}

import type { ValidationContradiction } from './schemas/8/variables/validation-contradictions.ts';

/** Localized, actionable summaries; the original message remains a technical diagnostic. */
export const validationContradictionMessages = defineMessages({
  invertedBounds: {
    id: 'protocolValidation.contradiction.invertedBounds',
    defaultMessage:
      'The minimum and maximum rules for {variables} leave no permitted answer. Adjust the bounds or the required-answer rule.',
    description:
      'Repair guidance for a validation contradiction. variables is a locale-formatted list of unchanged researcher-authored attribute names.',
  },
  minSelectedExceedsOptions: {
    id: 'protocolValidation.contradiction.minSelectedExceedsOptions',
    defaultMessage:
      'The minimum selection for {variables} exceeds the available options. Add options or reduce the minimum.',
    description:
      'Repair guidance for a validation contradiction. variables is a locale-formatted list of unchanged researcher-authored attribute names.',
  },
  conflictingReferencePair: {
    id: 'protocolValidation.contradiction.conflictingReferencePair',
    defaultMessage:
      'The rules require {variables} to be both equal and different. Remove one of these conflicting rules.',
    description:
      'Repair guidance for a validation contradiction. variables is a locale-formatted list of unchanged researcher-authored attribute names.',
  },
  strictComparatorCycle: {
    id: 'protocolValidation.contradiction.strictComparatorCycle',
    defaultMessage:
      'The comparisons for {variables} form a cycle that no values can satisfy. Change a comparison to break the cycle.',
    description:
      'Repair guidance for a validation contradiction. variables is a locale-formatted list of unchanged researcher-authored attribute names.',
  },
  sameAsGroupConflict: {
    id: 'protocolValidation.contradiction.sameAsGroupConflict',
    defaultMessage:
      'The rules require {variables} to share a value, but their allowed values or date resolutions are incompatible. Align their rules and input controls.',
    description:
      'Repair guidance for a validation contradiction. variables is a locale-formatted list of unchanged researcher-authored attribute names.',
  },
  disjointBounds: {
    id: 'protocolValidation.contradiction.disjointBounds',
    defaultMessage:
      'The comparisons for {variables} cannot be satisfied within their allowed ranges. Adjust the ranges or comparisons.',
    description:
      'Repair guidance for a validation contradiction. variables is a locale-formatted list of unchanged researcher-authored attribute names.',
  },
  oddDifferentFromCycle: {
    id: 'protocolValidation.contradiction.oddDifferentFromCycle',
    defaultMessage:
      'The rules require different values for {variables}, but too few values are available. Add allowed values or remove a conflicting rule.',
    description:
      'Repair guidance for a validation contradiction. variables is a locale-formatted list of unchanged researcher-authored attribute names.',
  },
  pinnedEqualDifferentFrom: {
    id: 'protocolValidation.contradiction.pinnedEqualDifferentFrom',
    defaultMessage:
      'The rules require different answers for {variables}, but their allowed ranges force the same value. Widen a range or change the comparison.',
    description:
      'Repair guidance for a validation contradiction. variables is a locale-formatted list of unchanged researcher-authored attribute names.',
  },
  pinnedDifferentFromParity: {
    id: 'protocolValidation.contradiction.pinnedDifferentFromParity',
    defaultMessage:
      'The fixed values and rules requiring different answers for {variables} cannot all be satisfied. Change a fixed value or a comparison.',
    description:
      'Repair guidance for a validation contradiction. variables is a locale-formatted list of unchanged researcher-authored attribute names.',
  },
}) satisfies Record<ValidationContradiction['class'], MessageDescriptor>;

export function formatValidationContradiction(
  contradiction: ValidationContradiction,
  intl: IntlShape,
  variableNames: readonly string[] = contradiction.variableIds,
): string {
  return intl.formatMessage(
    validationContradictionMessages[contradiction.class],
    {
      variables: intl.formatList([...variableNames]),
    },
  );
}

export const validationRuleMessages = defineMessages({
  required: {
    id: 'protocolValidation.rule.required',
    defaultMessage: 'Required answer',
    description:
      'Researcher-facing label for a protocol validation rule or generation constraint. The protocol identifier remains unchanged.',
  },
  requiredAcceptsNull: {
    id: 'protocolValidation.rule.requiredAcceptsNull',
    defaultMessage: 'Allow explicit missing answers',
    description:
      'Researcher-facing label for a protocol validation rule or generation constraint. The protocol identifier remains unchanged.',
  },
  minLength: {
    id: 'protocolValidation.rule.minLength',
    defaultMessage: 'Minimum text length',
    description:
      'Researcher-facing label for a protocol validation rule or generation constraint. The protocol identifier remains unchanged.',
  },
  maxLength: {
    id: 'protocolValidation.rule.maxLength',
    defaultMessage: 'Maximum text length',
    description:
      'Researcher-facing label for a protocol validation rule or generation constraint. The protocol identifier remains unchanged.',
  },
  minValue: {
    id: 'protocolValidation.rule.minValue',
    defaultMessage: 'Minimum value',
    description:
      'Researcher-facing label for a protocol validation rule or generation constraint. The protocol identifier remains unchanged.',
  },
  maxValue: {
    id: 'protocolValidation.rule.maxValue',
    defaultMessage: 'Maximum value',
    description:
      'Researcher-facing label for a protocol validation rule or generation constraint. The protocol identifier remains unchanged.',
  },
  minSelected: {
    id: 'protocolValidation.rule.minSelected',
    defaultMessage: 'Minimum selection',
    description:
      'Researcher-facing label for a protocol validation rule or generation constraint. The protocol identifier remains unchanged.',
  },
  maxSelected: {
    id: 'protocolValidation.rule.maxSelected',
    defaultMessage: 'Maximum selection',
    description:
      'Researcher-facing label for a protocol validation rule or generation constraint. The protocol identifier remains unchanged.',
  },
  unique: {
    id: 'protocolValidation.rule.unique',
    defaultMessage: 'Unique value',
    description:
      'Researcher-facing label for a protocol validation rule or generation constraint. The protocol identifier remains unchanged.',
  },
  differentFrom: {
    id: 'protocolValidation.rule.differentFrom',
    defaultMessage: 'Different from another attribute',
    description:
      'Researcher-facing label for a protocol validation rule or generation constraint. The protocol identifier remains unchanged.',
  },
  sameAs: {
    id: 'protocolValidation.rule.sameAs',
    defaultMessage: 'Same as another attribute',
    description:
      'Researcher-facing label for a protocol validation rule or generation constraint. The protocol identifier remains unchanged.',
  },
  greaterThanVariable: {
    id: 'protocolValidation.rule.greaterThanVariable',
    defaultMessage: 'Greater than another attribute',
    description:
      'Researcher-facing label for a protocol validation rule or generation constraint. The protocol identifier remains unchanged.',
  },
  lessThanVariable: {
    id: 'protocolValidation.rule.lessThanVariable',
    defaultMessage: 'Less than another attribute',
    description:
      'Researcher-facing label for a protocol validation rule or generation constraint. The protocol identifier remains unchanged.',
  },
  greaterThanOrEqualToVariable: {
    id: 'protocolValidation.rule.greaterThanOrEqualToVariable',
    defaultMessage: 'Greater than or equal to another attribute',
    description:
      'Researcher-facing label for a protocol validation rule or generation constraint. The protocol identifier remains unchanged.',
  },
  lessThanOrEqualToVariable: {
    id: 'protocolValidation.rule.lessThanOrEqualToVariable',
    defaultMessage: 'Less than or equal to another attribute',
    description:
      'Researcher-facing label for a protocol validation rule or generation constraint. The protocol identifier remains unchanged.',
  },
  additionalAttributes: {
    id: 'protocolValidation.rule.additionalAttributes',
    defaultMessage: 'Fixed attributes',
    description:
      'Researcher-facing label for a protocol validation rule or generation constraint. The protocol identifier remains unchanged.',
  },
  parameters: {
    id: 'protocolValidation.rule.parameters',
    defaultMessage: 'Input control settings',
    description:
      'Researcher-facing label for a protocol validation rule or generation constraint. The protocol identifier remains unchanged.',
  },
  component: {
    id: 'protocolValidation.rule.component',
    defaultMessage: 'Input control',
    description:
      'Researcher-facing label for a protocol validation rule or generation constraint. The protocol identifier remains unchanged.',
  },
  inheritancePattern: {
    id: 'protocolValidation.rule.inheritancePattern',
    defaultMessage: 'Inheritance pattern',
    description:
      'Researcher-facing label for a protocol validation rule or generation constraint. The protocol identifier remains unchanged.',
  },
  edgeConfig: {
    id: 'protocolValidation.rule.edgeConfig',
    defaultMessage: 'Link configuration',
    description:
      'Researcher-facing label for a protocol validation rule or generation constraint. The protocol identifier remains unchanged.',
  },
  egoVariable: {
    id: 'protocolValidation.rule.egoVariable',
    defaultMessage: 'Participant indicator',
    description:
      'Researcher-facing label for a protocol validation rule or generation constraint. The protocol identifier remains unchanged.',
  },
});

const isKnownRule = (
  rule: string,
): rule is keyof typeof validationRuleMessages =>
  Object.hasOwn(validationRuleMessages, rule);

/** Unknown extension keys are identifiers, not untranslated UI copy. */
export function formatValidationRule(rule: string, intl: IntlShape): string {
  return isKnownRule(rule)
    ? intl.formatMessage(validationRuleMessages[rule])
    : rule;
}

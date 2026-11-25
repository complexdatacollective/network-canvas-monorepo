import { defineMessages, type IntlShape } from '@codaco/app-i18n/messages';
import type { Variables, VariableType } from '@codaco/protocol-validation';

import type { VariablePickerOption } from '../fields/VariablePickerField.tsx';
import type { CodebookSubject } from '../protocol-context.ts';
import { isVariableType } from '../rules/operators.ts';
import {
  type ExclusiveVariableSlotMap,
  quotedLabels,
  type VariableRoleMap,
  variableRoleKey,
  type WriterClass,
} from './variableRoles.ts';
import { variableTypeLabel } from './variableTypeLabels.ts';

/**
 * Which attributes an attribute picker can offer, and why the rest cannot be
 * chosen.
 *
 * Every rule here MARKS an attribute rather than dropping it. A picker lists
 * an attribute it cannot use under "Not available here" with the sentence
 * saying why, so a researcher looking for one finds it and learns what is in
 * the way instead of wondering where it went (`VariablePickerField`).
 *
 * The rules are applied one after another, and the first rule to rule an
 * attribute out gives it its reason: a later rule never replaces a reason an
 * earlier one gave. So the order a caller applies them in is the order of
 * precedence, and it follows the order of the save-time gates, so the reason
 * in the list and the refusal under the field say the same thing.
 */

type Formatter = Pick<IntlShape, 'formatMessage'>;

export const attributeAvailabilityMessages = defineMessages({
  wrongType: {
    id: 'protocolBuilder.attributeUnavailable.wrongType',
    defaultMessage: 'Only {typeName} attributes can be used here.',
    description:
      'Shown under an attribute in the list of an attribute control that needs one kind of attribute, when this attribute is another kind. An attribute is a variable that the protocol’s codebook defines. typeName is the translated name of the kind that is needed, such as Boolean, Layout or Location, as the codebook editor names it.',
  },
  validatedElsewhere: {
    id: 'protocolBuilder.attributeUnavailable.validatedElsewhere',
    defaultMessage:
      '{count, plural, =0 {Another stage collects this attribute and validates each answer, so it cannot also be set here without validation.} one {The {stageLabels} stage collects this attribute and validates each answer, so it cannot also be set here without validation.} other {The stages {stageLabels} collect this attribute and validate each answer, so it cannot also be set here without validation.}}',
    description:
      'Shown under an attribute in the list of an attribute control whose value the interview sets directly, without checking it against the attribute’s validation rules, when another stage asks the participant for this attribute and checks each answer. A stage is one step of an interview. stageLabels is the researcher’s own name for each of those stages, already in quotation marks and separated by commas, and is not translated here. count is how many stages there are; 0 when they cannot be named.',
  },
  unvalidatedElsewhere: {
    id: 'protocolBuilder.attributeUnavailable.unvalidatedElsewhere',
    defaultMessage:
      '{count, plural, =0 {Another stage sets this attribute without validation, so it cannot also be collected here.} one {The {stageLabels} stage sets this attribute without validation, so it cannot also be collected here.} other {The stages {stageLabels} set this attribute without validation, so it cannot also be collected here.}}',
    description:
      'Shown under an attribute in the list of an attribute control that asks the participant for an answer and checks it, when another stage sets this attribute directly without checking it against the attribute’s validation rules. A stage is one step of an interview. stageLabels is the researcher’s own name for each of those stages, already in quotation marks and separated by commas, and is not translated here. count is how many stages there are; 0 when they cannot be named.',
  },
  interfaceOwned: {
    id: 'protocolBuilder.attributeUnavailable.interfaceOwned',
    defaultMessage:
      '{count, plural, =0 {Another stage records its own information in this attribute, so it cannot be used here.} one {The {stageLabels} stage records its own information in this attribute, so it cannot be used here.} other {The stages {stageLabels} record their own information in this attribute, so it cannot be used here.}}',
    description:
      'Shown under an attribute in the list of an attribute control, when a built-in interface (such as a Family Pedigree, which marks the participant) writes this attribute for its own purposes. A stage is one step of an interview. stageLabels is the researcher’s own name for each of those stages, already in quotation marks and separated by commas, and is not translated here. count is how many stages there are; 0 when they cannot be named.',
  },
  sameStageField: {
    id: 'protocolBuilder.attributeUnavailable.sameStageField',
    defaultMessage: 'Another field on this stage already uses this attribute.',
    description:
      'Shown under an attribute in the list of an attribute control, when another control of the stage that the researcher is editing already records something in this attribute, so one would overwrite the other. A stage is one step of an interview; a field is one of the controls on it.',
  },
  draftValidatedHere: {
    id: 'protocolBuilder.attributeUnavailable.draftValidatedHere',
    defaultMessage:
      'Another field on this stage collects this attribute and validates each answer, so it cannot also be set here without validation.',
    description:
      'Shown under an attribute in the list of an attribute control whose value the interview sets directly, when another control of the stage that the researcher is editing asks the participant for this attribute and checks each answer against its validation rules. A stage is one step of an interview; a field is one of the controls on it.',
  },
  draftUnvalidatedHere: {
    id: 'protocolBuilder.attributeUnavailable.draftUnvalidatedHere',
    defaultMessage:
      'Another field on this stage sets this attribute without validation, so it cannot also be collected here.',
    description:
      'Shown under an attribute in the list of an attribute control that asks the participant for an answer and checks it, when another control of the stage that the researcher is editing sets this attribute directly, without checking it against its validation rules. A stage is one step of an interview; a field is one of the controls on it.',
  },
  promptAssigns: {
    id: 'protocolBuilder.attributeUnavailable.promptAssigns',
    defaultMessage:
      'Prompt {promptNumber} on this stage assigns a value to this attribute, so it cannot also be collected here.',
    description:
      'Shown under an attribute in the list of an attribute control that asks the participant for an answer, when a prompt of the same name generator stage sets this attribute on every person added through it, without asking. promptNumber is that prompt’s position in the stage’s list of prompts, starting at 1. A prompt is one question a participant is asked; a stage is one step of an interview.',
  },
  formCannotCollect: {
    id: 'protocolBuilder.attributeUnavailable.formCannotCollect',
    defaultMessage: 'A form cannot collect {typeName} attributes.',
    description:
      'Shown under an attribute in the list of a form field’s attribute control, when the attribute is a kind that no form control can ask for, such as one that records a position on a canvas or a map. typeName is the translated name of that kind, such as Layout or Location, as the codebook editor names it.',
  },
});

/** What one kind of attribute is called, in the reader's language. */
export const typeNameOf = (intl: Formatter, type: VariableType): string => {
  const label = variableTypeLabel(type);
  return label === undefined ? type : intl.formatMessage(label);
};

/**
 * The reason an attribute of the wrong kind gets in a picker that needs ONE
 * kind: "Only Layout attributes can be used here."
 */
export const onlyTypeReason =
  (intl: Formatter, needed: VariableType) => (): string =>
    intl.formatMessage(attributeAvailabilityMessages.wrongType, {
      typeName: typeNameOf(intl, needed),
    });

/** The reason a form field's picker gives an attribute no form can collect. */
/**
 * The type reason for a picker that takes one or more types: "Only Boolean
 * attributes…", or "Only Categorical or Ordinal attributes…".
 */
export const onlyTypesReason =
  (
    intl: Pick<IntlShape, 'formatMessage' | 'formatList'>,
    needed: readonly VariableType[],
  ) =>
  (): string =>
    intl.formatMessage(attributeAvailabilityMessages.wrongType, {
      typeName: intl.formatList(
        needed.map((type) => typeNameOf(intl, type)),
        { type: 'disjunction' },
      ),
    });

export const formCannotCollectReason =
  (intl: Formatter) =>
  (type: VariableType): string =>
    intl.formatMessage(attributeAvailabilityMessages.formCannotCollect, {
      typeName: typeNameOf(intl, type),
    });

/** Whether an option can be chosen. */
const isAvailable = (option: VariablePickerOption): boolean =>
  option.unavailableReason === undefined;

/**
 * Only the options that can be chosen, for something that is not a picker: a
 * tick list, or a check of whether a stored reference is still usable. A
 * picker takes the whole list.
 */
export const availableOnly = <T extends VariablePickerOption>(
  options: readonly T[],
): T[] => options.filter(isAvailable);

const byLabel = (
  first: VariablePickerOption,
  second: VariablePickerOption,
): number =>
  first.label.localeCompare(second.label) ||
  first.value.localeCompare(second.value);

/**
 * Every attribute of `variables` as a picker option, with each one of a kind
 * the picker cannot use marked with `typeReason`.
 *
 * An attribute of a type the schema does not know (one from a protocol written
 * for a later version) is left out altogether: nothing here can say what it
 * is, so there is nothing true to say about why it cannot be used.
 */
export function attributeChoices(
  variables: Readonly<Variables>,
  accepts: (type: VariableType) => boolean,
  typeReason: (type: VariableType) => string,
): VariablePickerOption[] {
  return Object.entries(variables)
    .flatMap(([value, variable]): VariablePickerOption[] => {
      const { type } = variable;
      if (!isVariableType(type)) return [];
      return [
        {
          value,
          label: variable.name,
          type,
          ...(accepts(type)
            ? {}
            : {
                unavailableReason: typeReason(type),
                unavailableForType: true,
              }),
        },
      ];
    })
    .toSorted(byLabel);
}

const heldSet = (held?: string | readonly string[]): ReadonlySet<string> =>
  new Set(typeof held === 'string' ? [held] : held);

/**
 * `options`, with `reasonFor`'s reason given to each one it rules out.
 *
 * An option that already has a reason keeps it: the first rule applied gives
 * the reason. An option the field HOLDS (`held`) is never marked, so a stage
 * that arrives already breaking a rule stays editable and saveable as it is —
 * the save-time gates let the committed value through for the same reason.
 */
export function markUnavailable<T extends VariablePickerOption>(
  options: readonly T[],
  reasonFor: (option: T) => string | undefined,
  held?: string | readonly string[],
): T[] {
  const kept = heldSet(held);
  return options.map((option) => {
    if (option.unavailableReason !== undefined || kept.has(option.value)) {
      return option;
    }
    const reason = reasonFor(option);
    return reason === undefined
      ? option
      : { ...option, unavailableReason: reason };
  });
}

/**
 * Marks every attribute that another stage writes in the OPPOSITE class to
 * this picker's: one collected with validation, for a picker that sets its
 * value directly, and one set directly, for a picker that collects it. An
 * export would otherwise mix checked and unchecked answers under one name.
 */
export function markCrossClassUses<T extends VariablePickerOption>(
  roleMap: VariableRoleMap,
  subject: CodebookSubject,
  options: readonly T[],
  writerClass: WriterClass,
  intl: Formatter,
  held?: string | readonly string[],
): T[] {
  return markUnavailable(
    options,
    (option) => {
      const entry = roleMap[variableRoleKey(subject, option.value)];
      if (entry === undefined) return undefined;
      const [uses, stages, message] =
        writerClass === 'unvalidated'
          ? [
              entry.validated,
              entry.validatedStages,
              attributeAvailabilityMessages.validatedElsewhere,
            ]
          : [
              entry.unvalidated,
              entry.unvalidatedStages,
              attributeAvailabilityMessages.unvalidatedElsewhere,
            ];
      if (uses === 0) return undefined;
      const labels = stages ?? [];
      return intl.formatMessage(message, {
        count: labels.length,
        stageLabels: quotedLabels(labels),
      });
    },
    held,
  );
}

/**
 * Marks every attribute an interface's own slot claims, other than a claim
 * made by the slot this picker fills (`ownSlot`).
 *
 * A claim in the saved protocol names the stage that makes it. A claim this
 * stage's unsaved draft makes (`source: 'draft'`) is another field on the
 * screen in front of the researcher, and is said so.
 */
export function markInterfaceOwned<T extends VariablePickerOption>(
  slotMap: ExclusiveVariableSlotMap,
  subject: CodebookSubject,
  options: readonly T[],
  intl: Formatter,
  held?: string | readonly string[],
  ownSlot?: string,
): T[] {
  return markUnavailable(
    options,
    (option) => {
      const claim = slotMap[variableRoleKey(subject, option.value)];
      if (claim === undefined || claim.slot === ownSlot) return undefined;
      if (claim.source === 'draft') {
        return intl.formatMessage(attributeAvailabilityMessages.sameStageField);
      }
      const labels = claim.stageLabel === '' ? [] : [claim.stageLabel];
      return intl.formatMessage(attributeAvailabilityMessages.interfaceOwned, {
        count: labels.length,
        stageLabels: quotedLabels(labels),
      });
    },
    held,
  );
}

/** Marks every attribute in `ids` with `reason`. */
export const markListed = <T extends VariablePickerOption>(
  options: readonly T[],
  ids: Iterable<string> | undefined,
  reason: string | ((variableId: string) => string),
  held?: string | readonly string[],
): T[] => {
  if (ids === undefined) return [...options];
  const listed = new Set(ids);
  return markUnavailable(
    options,
    (option) =>
      listed.has(option.value)
        ? typeof reason === 'string'
          ? reason
          : reason(option.value)
        : undefined,
    held,
  );
};

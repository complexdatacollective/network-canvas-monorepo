import { createMessageError, type IntlShape } from '@codaco/app-i18n/messages';
import {
  type InterfaceOwnedOption,
  optionsMatchInterfaceOwnedSet,
  type Variable,
  type VariableOption,
  type Variables,
  type VariableType,
} from '@codaco/protocol-validation';

import {
  attributeAvailabilityMessages,
  markCrossClassUses,
  markInterfaceOwned,
  markListed,
  markUnavailable,
  onlyTypeReason,
} from '../codebook/attributeAvailability.ts';
import {
  type ExclusiveVariableSlotMap,
  hasConflictingUse,
  interfaceOwnedPickIssue,
  type VariableRoleMap,
  variableRoleKey,
  type WriterClass,
} from '../codebook/variableRoles.ts';
import { validatedElsewhereMessage } from '../codebook/variableValidation.ts';
import {
  crossClassPickIssue,
  variableDisplayName,
} from '../form/arrayFields/crossClassPick.ts';
import type {
  CodebookSubject,
  ProtocolBuilderProtocolContext,
} from '../protocol-context.ts';
import { variablesForSubject } from '../protocol-context.ts';
import { isVariableType } from '../rules/operators.ts';
import { slotVariableMessages } from './slotVariableMessages.ts';
import type { VariablePickerOption } from './VariablePickerField.tsx';

/**
 * The rules a slot attribute picker applies: which attributes it may offer,
 * and which picks its save-time gate refuses. The picker and the gate read the
 * same inputs, so they cannot disagree about which picks are legal.
 *
 * Refusals are ENCODED rather than formatted: they are handed to the field as
 * plain strings and decoded where they render, in whatever language the
 * researcher is reading by then.
 */

/** The refusal a picker earns for a cross-class clash with the saved protocol. */
const crossClassMessage: Readonly<
  Record<WriterClass, (variableName: string) => string>
> = Object.freeze({
  unvalidated: validatedElsewhereMessage,
  validated: (attributeName: string): string =>
    createMessageError(slotVariableMessages.unvalidatedElsewhereRefusal, {
      attributeName,
    }),
});

/** The same clash, when the other writer is this stage's own unsaved draft. */
const draftCrossClassMessage: Readonly<
  Record<WriterClass, (variableName: string) => string>
> = Object.freeze({
  unvalidated: (attributeName: string): string =>
    createMessageError(slotVariableMessages.draftFormCollectsRefusal, {
      attributeName,
    }),
  validated: (attributeName: string): string =>
    createMessageError(slotVariableMessages.draftSlotWritesRefusal, {
      attributeName,
    }),
});

/** A codebook attribute as a picker option, carrying what a filter needs. */
export type SlotVariableOption = VariablePickerOption &
  Readonly<{ options?: readonly VariableOption[] }>;

/** The value set an attribute offers, where its type has one to offer. */
const optionsOf = (
  variable: Readonly<Variable>,
): readonly VariableOption[] | undefined =>
  variable.type === 'categorical' || variable.type === 'ordinal'
    ? variable.options
    : undefined;

/**
 * Every attribute of `subject` as picker options, with each one of another
 * type than `variableType` marked for its type. An attribute of a type the
 * schema does not know is left out: nothing true can be said about it.
 */
export function subjectVariableOptions(
  context: ProtocolBuilderProtocolContext,
  subject: CodebookSubject | null,
  variableType: VariableType,
  intl: Pick<IntlShape, 'formatMessage'>,
): SlotVariableOption[] {
  if (subject === null) return [];
  const wrongType = onlyTypeReason(intl, variableType)();
  return Object.entries(variablesForSubject(context, subject)).flatMap(
    ([variableId, variable]: [string, Readonly<Variable>]) => {
      if (!isVariableType(variable.type)) return [];
      const options = optionsOf(variable);
      return [
        {
          value: variableId,
          label: variable.name,
          type: variable.type,
          ...(options === undefined ? {} : { options }),
          ...(variable.type === variableType
            ? {}
            : { unavailableReason: wrongType, unavailableForType: true }),
        },
      ];
    },
  );
}

/**
 * The pool, with every attribute whose values are not exactly the set the
 * interface owns marked with `reason`. The attribute a slot already holds is
 * marked too: the save refuses it, so it is listed as held and named for what
 * is wrong with it.
 */
export function ruleOutValuesOutsideOwnedSet<T extends SlotVariableOption>(
  options: readonly T[],
  expectedOptions: readonly InterfaceOwnedOption[],
  reason: string,
): T[] {
  return markUnavailable(options, (option) =>
    optionsMatchInterfaceOwnedSet(
      option.options === undefined ? undefined : [...option.options],
      expectedOptions,
    )
      ? undefined
      : reason,
  );
}

/**
 * The pool, with every attribute whose options another stage manages RULED
 * OUT rather than dropped, for a slot whose stage manages them: only one stage
 * may. `managersElsewhere` names those other stages, and is empty for an
 * attribute this stage may take.
 */
export function ruleOutOptionsManagedElsewhere<T extends SlotVariableOption>(
  options: readonly T[],
  managersElsewhere: (variableId: string) => readonly string[],
  reason: (stageLabels: readonly string[]) => string,
): T[] {
  return markUnavailable(options, (option) => {
    const stageLabels = managersElsewhere(option.value);
    return stageLabels.length === 0 ? undefined : reason(stageLabels);
  });
}

/** The refusal for a pick whose options another stage manages. */
export const managedElsewhereIssue = (
  allVariables: Readonly<Variables>,
  variableId: unknown,
  managersElsewhere: (variableId: string) => readonly string[],
): string | undefined =>
  typeof variableId !== 'string' ||
  variableId === '' ||
  managersElsewhere(variableId).length === 0
    ? undefined
    : createMessageError(slotVariableMessages.managedElsewhereRefusal, {
        attributeName: variableDisplayName(allVariables, variableId),
      });

export type SlotPickerOptionsInput<T extends SlotVariableOption> = Readonly<{
  roleMap: VariableRoleMap;
  slotMap: ExclusiveVariableSlotMap;
  /** Exclusive claims this stage's own unsaved draft has made. */
  draftSlotMap: ExclusiveVariableSlotMap;
  subject: CodebookSubject | null;
  options: readonly T[];
  currentValue?: string;
  /** The exclusive interface slot this picker fills, if any. */
  ownSlot?: string;
  writerClass: WriterClass;
  /**
   * Attributes this stage's own unsaved draft already claims in the OPPOSITE
   * writer class.
   */
  draftConflicting?: readonly string[];
  /**
   * Attributes this stage's own draft already binds to its OTHER answers,
   * whatever their writer class: an attribute holding two of a stage's
   * answers would have one overwrite the other.
   */
  draftBoundElsewhere?: readonly string[];
  /** Formats the reason each attribute that cannot be chosen is given. */
  intl: Pick<IntlShape, 'formatMessage'>;
}>;

/** The refusal for a pick another of this stage's answers already holds. */
export const draftBoundElsewhereIssue = (
  draftBoundElsewhere: readonly string[] | undefined,
  pick: string,
  allVariables: Readonly<Variables>,
): string | undefined =>
  draftBoundElsewhere?.includes(pick) === true
    ? createMessageError(slotVariableMessages.draftBoundElsewhereRefusal, {
        attributeName: variableDisplayName(allVariables, pick),
      })
    : undefined;

/**
 * The attributes a slot picker lists, with every one it cannot use marked with
 * the reason: one another exclusive interface slot claims (saved or drafted),
 * one another of this stage's answers already records, and one another writer
 * class claims (in this stage's draft or the saved protocol). Marked in the
 * order `slotCrossClassIssue` refuses them, so the reason in the list and the
 * refusal under the field agree. The held value is never marked by these
 * rules.
 */
export function slotPickerOptions<T extends SlotVariableOption>({
  roleMap,
  slotMap,
  draftSlotMap,
  subject,
  options,
  currentValue,
  ownSlot,
  writerClass,
  draftConflicting,
  draftBoundElsewhere,
  intl,
}: SlotPickerOptionsInput<T>): T[] {
  if (subject === null) return [];
  const savedOwned = markInterfaceOwned(
    slotMap,
    subject,
    options,
    intl,
    currentValue,
    ownSlot,
  );
  const boundElsewhere = markListed(
    savedOwned,
    draftBoundElsewhere,
    intl.formatMessage(attributeAvailabilityMessages.sameStageField),
    currentValue,
  );
  const draftClass = markListed(
    boundElsewhere,
    draftConflicting,
    intl.formatMessage(
      writerClass === 'unvalidated'
        ? attributeAvailabilityMessages.draftValidatedHere
        : attributeAvailabilityMessages.draftUnvalidatedHere,
    ),
    currentValue,
  );
  const draftOwned = markInterfaceOwned(
    draftSlotMap,
    subject,
    draftClass,
    intl,
    currentValue,
    ownSlot,
  );
  return markCrossClassUses(
    roleMap,
    subject,
    draftOwned,
    writerClass,
    intl,
    currentValue,
  );
}

export type SlotCrossClassInput = Readonly<{
  roleMap: VariableRoleMap;
  slotMap: ExclusiveVariableSlotMap;
  draftSlotMap: ExclusiveVariableSlotMap;
  subject: CodebookSubject | null;
  /** The pick being judged. */
  variableId: unknown;
  /** This slot's COMMITTED value, which escapes the cross-class rules. */
  committedValue: unknown;
  ownSlot?: string;
  writerClass: WriterClass;
  draftConflicting?: readonly string[];
  draftBoundElsewhere?: readonly string[];
  /** The subject's codebook attributes, read only for display names. */
  allVariables: Readonly<Variables>;
}>;

/**
 * The save-time gate for one slot picker. Refuses a pick that another
 * exclusive slot owns (saved, then drafted), that this stage's draft claims in
 * the opposite writer class, or that the saved protocol claims in the opposite
 * writer class. The slot's committed value escapes, so a pre-existing conflict
 * in an imported protocol stays saveable.
 */
export function slotCrossClassIssue({
  roleMap,
  slotMap,
  draftSlotMap,
  subject,
  variableId,
  committedValue,
  ownSlot,
  writerClass,
  draftConflicting,
  draftBoundElsewhere,
  allVariables,
}: SlotCrossClassInput): string | undefined {
  if (subject === null) return undefined;
  const pick = typeof variableId === 'string' ? variableId : '';
  if (pick === '') return undefined;

  const committed = typeof committedValue === 'string' ? committedValue : '';
  if (pick === committed) return undefined;

  const ownedIssue = interfaceOwnedPickIssue(slotMap, subject, pick, ownSlot);
  if (ownedIssue !== undefined) return ownedIssue;

  const boundElsewhere = draftBoundElsewhereIssue(
    draftBoundElsewhere,
    pick,
    allVariables,
  );
  if (boundElsewhere !== undefined) return boundElsewhere;

  if (draftConflicting?.includes(pick) === true) {
    return draftCrossClassMessage[writerClass](
      variableDisplayName(allVariables, pick),
    );
  }

  const draftOwnedIssue = interfaceOwnedPickIssue(
    draftSlotMap,
    subject,
    pick,
    ownSlot,
  );
  if (draftOwnedIssue !== undefined) return draftOwnedIssue;

  return crossClassPickIssue({
    variableId: pick,
    originalVariableId: committed,
    hasConflictingUse: (id) =>
      hasConflictingUse(roleMap, subject, id, writerClass),
    allVariables,
    message: crossClassMessage[writerClass],
  });
}

/**
 * Why an attribute a slot HOLDS can no longer be used — deleted, retyped, or
 * (for an interface-owned set) carrying different values — or `undefined`
 * while it can. No committed-value escape: nothing can be recorded under an
 * attribute that is gone or is now a different kind of thing.
 */
export function unusableVariableIssue(
  allVariables: Readonly<Variables>,
  variableId: unknown,
  expectedType: VariableType,
  expectedOptions?: readonly InterfaceOwnedOption[],
): string | undefined {
  if (typeof variableId !== 'string' || variableId === '') return undefined;
  const variable = allVariables[variableId];
  if (variable === undefined) {
    return createMessageError(slotVariableMessages.variableGoneRefusal);
  }
  if (variable.type !== expectedType) {
    return createMessageError(slotVariableMessages.variableTypeChangedRefusal, {
      attributeName: variableDisplayName(allVariables, variableId),
    });
  }
  if (expectedOptions === undefined) return undefined;
  const held = optionsOf(variable);
  return optionsMatchInterfaceOwnedSet(
    held === undefined ? undefined : [...held],
    expectedOptions,
  )
    ? undefined
    : createMessageError(slotVariableMessages.variableOptionsChangedRefusal, {
        attributeName: variableDisplayName(allVariables, variableId),
      });
}

/** One exclusive slot's live pick: the type it names an attribute of, and the pick. */
export type DraftSlotBinding = Readonly<{
  subject: CodebookSubject | null;
  slot: string;
  variableId: unknown;
}>;

/**
 * The exclusive claims a stage's UNSAVED draft has made, in the shape the
 * saved protocol's claims arrive in, so two slots cannot be bound to one
 * attribute in a single edit.
 */
export function draftExclusiveSlotClaims(
  bindings: readonly DraftSlotBinding[],
): ExclusiveVariableSlotMap {
  const claims: Record<string, { source: 'draft'; slot: string }> = {};
  for (const { subject, slot, variableId } of bindings) {
    if (
      subject === null ||
      typeof variableId !== 'string' ||
      variableId === ''
    ) {
      continue;
    }
    claims[variableRoleKey(subject, variableId)] = Object.freeze({
      source: 'draft' as const,
      slot,
    });
  }
  return Object.freeze(claims);
}

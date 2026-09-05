import type {
  Variable,
  VariableOption,
  Variables,
} from '@codaco/protocol-validation';

import {
  excludeInterfaceOwned,
  excludeUnvalidatedUses,
  excludeValidatedUses,
  type ExclusiveVariableSlotMap,
  hasConflictingUse,
  interfaceOwnedPickIssue,
  type VariableRoleMap,
  type WriterClass,
} from '../../codebook/variableRoles.ts';
import type { VariablePickerOption } from '../../fields/VariablePicker.tsx';
import {
  crossClassPickIssue,
  validatedElsewhereMessage,
  variableDisplayName,
} from '../../form/arrayFields/crossClassPick.ts';
import type {
  CodebookSubject,
  ProtocolBuilderProtocolContext,
} from '../../protocol-context.ts';
import { variablesForSubject } from '../../protocol-context.ts';

/**
 * The refusal a VALIDATED writer earns when an unvalidated one already claims
 * its pick.
 *
 * The opposite direction — an unvalidated writer picking something a form
 * collects — is `validatedElsewhereMessage`, which the shared array fields
 * already own. This one has no shared home yet because the pedigree's display
 * label is the package's first validated slot picker; the two are paired
 * through `crossClassMessage` below so neither can be used without the other.
 */
export const unvalidatedElsewhereMessage = (variableName: string): string =>
  `"${variableName}" is written without validation by another stage, so it cannot be used as a form field`;

/** The refusal a picker earns, keyed by the picker's OWN writer class. */
export const crossClassMessage: Readonly<
  Record<WriterClass, (variableName: string) => string>
> = Object.freeze({
  unvalidated: validatedElsewhereMessage,
  validated: unvalidatedElsewhereMessage,
});

/** A codebook attribute as a picker option, carrying what a filter needs. */
export type SlotVariableOption = VariablePickerOption &
  Readonly<{ options?: readonly VariableOption[] }>;

/**
 * The value set an attribute offers, where its type has one to offer.
 *
 * Narrowed through the codebook union rather than read off the object: a
 * boolean's `options` are its two labels rather than a value set, and no
 * interface-owned set is ever compared against them.
 */
const optionsOf = (
  variable: Readonly<Variable>,
): readonly VariableOption[] | undefined =>
  variable.type === 'categorical' || variable.type === 'ordinal'
    ? variable.options
    : undefined;

/**
 * Every attribute of one node or edge type, as picker options.
 *
 * The codebook comes from the editor's own protocol context, so a picker never
 * carries a selector or a host store — and an attribute a collaborator adds or
 * deletes while the editor is open appears or disappears without the section
 * doing anything.
 */
export function subjectVariableOptions(
  context: ProtocolBuilderProtocolContext,
  subject: CodebookSubject | null,
): SlotVariableOption[] {
  if (subject === null) return [];
  return Object.entries(variablesForSubject(context, subject)).map(
    ([variableId, variable]: [string, Readonly<Variable>]) => {
      const options = optionsOf(variable);
      return {
        value: variableId,
        label: variable.name,
        type: variable.type,
        ...(options === undefined ? {} : { options }),
      };
    },
  );
}

export type SlotPickerOptionsInput<T extends SlotVariableOption> = Readonly<{
  roleMap: VariableRoleMap;
  slotMap: ExclusiveVariableSlotMap;
  subject: CodebookSubject | null;
  /** The pool, already narrowed to the attribute types this slot accepts. */
  options: readonly T[];
  currentValue?: string;
  /** The interface slot this picker itself fills, if any. */
  ownSlot?: string;
  writerClass: WriterClass;
}>;

/**
 * The attributes a pedigree picker may offer.
 *
 * Two exclusions, always together:
 *
 * - the cross-class one, in whichever direction `writerClass` demands; and
 * - the interface-owned one, which drops an attribute ANOTHER interface slot
 *   claims. `ownSlot` keeps an attribute a second Family Pedigree binds in the
 *   SAME slot on offer — sharing structural attributes between two pedigrees
 *   over one node type is legitimate authoring, and the protocol rule is
 *   slot-aware for exactly that reason.
 *
 * Both keep `currentValue` offered, so an imported protocol's existing pick
 * never vanishes from its own picker; the save-time gate is what explains such
 * a pick to the researcher.
 *
 * A structural slot writes its attribute from the tree the participant draws,
 * with no validation of its own (`unvalidated`); the display label is
 * collected through a validated form field (`validated`). Pass the SAME
 * `writerClass` here and to `slotCrossClassIssue` and the picker and the gate
 * cannot disagree about which picks are legal.
 */
export function slotPickerOptions<T extends SlotVariableOption>({
  roleMap,
  slotMap,
  subject,
  options,
  currentValue,
  ownSlot,
  writerClass,
}: SlotPickerOptionsInput<T>): T[] {
  if (subject === null) return [];
  const crossClassFiltered =
    writerClass === 'validated'
      ? excludeUnvalidatedUses(roleMap, subject, options, currentValue)
      : excludeValidatedUses(roleMap, subject, options, currentValue);
  return excludeInterfaceOwned(
    slotMap,
    subject,
    crossClassFiltered,
    currentValue,
    ownSlot,
  );
}

export type SlotCrossClassInput = Readonly<{
  roleMap: VariableRoleMap;
  slotMap: ExclusiveVariableSlotMap;
  subject: CodebookSubject | null;
  /** The pick being judged. */
  variableId: unknown;
  /** This slot's COMMITTED value, which always escapes. */
  committedValue: unknown;
  /** The interface slot this picker itself fills, if any. */
  ownSlot?: string;
  writerClass: WriterClass;
  /**
   * Attributes the same unsaved stage form already claims in the OPPOSITE
   * writer class. Omitted where the stage has no such sibling — the pedigree
   * has no validated writer on its edge type.
   */
  draftConflicting?: readonly string[];
  /** The subject's codebook attributes, read only for display names. */
  allVariables: Readonly<Variables>;
}>;

/**
 * The save-time gate for one pedigree slot picker.
 *
 * It refuses a pick that
 *
 * 1. another interface slot owns outright (the picker already drops those, so
 *    this catches a stale draft or an imported protocol); or
 * 2. this stage's own UNSAVED draft already claims in the opposite writer
 *    class — both classes live on one stage form; or
 * 3. the saved protocol already claims in the opposite writer class.
 *
 * The slot's own COMMITTED value escapes throughout, so a pre-existing
 * conflict — an imported protocol, say — stays saveable rather than trapping
 * the researcher in an editor that will not close.
 */
export function slotCrossClassIssue({
  roleMap,
  slotMap,
  subject,
  variableId,
  committedValue,
  ownSlot,
  writerClass,
  draftConflicting,
  allVariables,
}: SlotCrossClassInput): string | undefined {
  if (subject === null) return undefined;
  const pick = typeof variableId === 'string' ? variableId : '';
  if (pick === '') return undefined;

  const committed = typeof committedValue === 'string' ? committedValue : '';
  if (pick === committed) return undefined;

  const ownedIssue = interfaceOwnedPickIssue(slotMap, subject, pick, ownSlot);
  if (ownedIssue !== undefined) return ownedIssue;

  const message = crossClassMessage[writerClass];
  if (draftConflicting?.includes(pick) === true) {
    return message(variableDisplayName(allVariables, pick));
  }

  return crossClassPickIssue({
    variableId: pick,
    originalVariableId: committed,
    hasConflictingUse: (id) =>
      hasConflictingUse(roleMap, subject, id, writerClass),
    allVariables,
    message,
  });
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * The attributes a Family Pedigree's own unsaved `nodeConfig.form` draft
 * collects — the VALIDATED writers a structural slot must not also claim.
 *
 * Read from the live rows rather than the committed stage: a field added in
 * this editing session is not saved yet, and one just deleted must stop
 * refusing picks immediately.
 */
export function draftFormFieldVariables(rows: unknown): readonly string[] {
  if (!Array.isArray(rows)) return [];
  return rows
    .filter(isRecord)
    .map((row) => row.variable)
    .filter((variable): variable is string => typeof variable === 'string');
}

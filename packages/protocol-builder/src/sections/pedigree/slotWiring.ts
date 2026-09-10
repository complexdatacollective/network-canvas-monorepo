import { createMessageError } from '@codaco/app-i18n/messages';
import {
  FAMILY_PEDIGREE_SLOTS,
  type InterfaceOwnedOption,
  optionsMatchInterfaceOwnedSet,
  type Variable,
  type VariableOption,
  type Variables,
  type VariableType,
} from '@codaco/protocol-validation';

import {
  excludeInterfaceOwned,
  excludeUnvalidatedUses,
  excludeValidatedUses,
  type ExclusiveVariableSlotMap,
  hasConflictingUse,
  interfaceOwnedPickIssue,
  type VariableRoleMap,
  variableRoleKey,
  type WriterClass,
} from '../../codebook/variableRoles.ts';
import type { VariablePickerOption } from '../../fields/VariablePickerField.tsx';
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
import { pedigreeMessages } from './pedigreeMessages.ts';

/**
 * The refusal a VALIDATED writer earns when an unvalidated one already claims
 * its pick.
 *
 * The opposite direction — an unvalidated writer picking something a form
 * collects — is `validatedElsewhereMessage`, which the shared array fields
 * already own. This one has no shared home yet because the pedigree's display
 * label is the package's first validated slot picker; the two are paired
 * through `crossClassMessage` below so neither can be used without the other.
 *
 * It is worded for a SLOT rather than for a form field, which is what the
 * shared form-field version of this refusal says. The only validated slot in
 * the package is the pedigree's display label — a control that names the
 * attribute each family member is shown by — and a researcher told there that
 * an attribute "cannot be used as a form field" goes looking for a form field
 * they never added.
 *
 * ENCODED rather than formatted, because this module has no reader: the
 * sentence is handed to the field as a plain string and rendered much later,
 * and `FieldErrors` decodes it in whatever language the researcher is reading
 * by then. Formatting it here would need a formatter this module has no
 * business holding, and would freeze the refusal in the language that was
 * current when the pick was judged.
 */
const unvalidatedElsewhereMessage = (variableName: string): string =>
  createMessageError(pedigreeMessages.slotUnvalidatedElsewhereRefusal, {
    attributeName: variableName,
  });

/** The refusal a picker earns, keyed by the picker's OWN writer class. */
const crossClassMessage: Readonly<
  Record<WriterClass, (variableName: string) => string>
> = Object.freeze({
  unvalidated: validatedElsewhereMessage,
  validated: unvalidatedElsewhereMessage,
});

/**
 * The same two refusals, when the other writer is THIS stage's own unsaved
 * draft.
 *
 * Different words, not a variant of the ones above: the form and the slots are
 * both on the screen the researcher is looking at, one section apart, and
 * "elsewhere in this protocol" sends them looking through their other stages
 * for something that is right in front of them.
 */
const draftCrossClassMessage: Readonly<
  Record<WriterClass, (variableName: string) => string>
> = Object.freeze({
  unvalidated: (variableName: string): string =>
    createMessageError(pedigreeMessages.slotDraftFormCollectsRefusal, {
      attributeName: variableName,
    }),
  validated: (variableName: string): string =>
    createMessageError(pedigreeMessages.slotDraftSlotDerivesRefusal, {
      attributeName: variableName,
    }),
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

/**
 * The same pool, with every attribute whose values are not exactly the set
 * the interface owns ruled out rather than dropped.
 *
 * Three of the pedigree's slots need a canonical value set: the interview
 * writes those exact values, and the genetics engine branches on them, so an
 * attribute carrying any other set would silently degrade what the pedigree
 * records. Asked with the protocol schema's OWN comparison, so a picker can
 * never offer what the schema then refuses.
 *
 * RULED OUT rather than filtered out, because the attribute a slot is already
 * holding is one of them. Filtered, it left the pool entirely, and the picker
 * — handed a stored id nothing in its list described — could only say the
 * attribute was "not available here". It is available: it is in the codebook,
 * still categorical, exactly where the researcher left it, and only its values
 * were edited. Kept and marked, the picker names it, still lists it as the
 * held choice, and says what is actually wrong in the pedigree's own words.
 * An attribute ruled out that no slot holds is never listed at all, which is
 * what the filter used to achieve.
 *
 * `words` rather than a formatter, because this module has no reader.
 */
export function ruleOutValuesOutsideOwnedSet<T extends SlotVariableOption>(
  options: readonly T[],
  expectedOptions: readonly InterfaceOwnedOption[],
  words: (
    attributeName: string,
  ) => NonNullable<VariablePickerOption['unusableWords']>,
): T[] {
  return options.map((option) =>
    optionsMatchInterfaceOwnedSet(
      option.options === undefined ? undefined : [...option.options],
      expectedOptions,
    )
      ? option
      : { ...option, usable: false, unusableWords: words(option.label) },
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
  /**
   * Attributes this stage's own UNSAVED draft already claims in the opposite
   * writer class — the same list `slotCrossClassIssue` judges a pick against.
   */
  draftConflicting?: readonly string[];
  /**
   * Exclusive claims this stage's own UNSAVED draft has made, kept apart from
   * the saved ones so a refusal can say which it is. See
   * `draftExclusiveSlotClaims`.
   */
  draftSlotMap?: ExclusiveVariableSlotMap;
  /**
   * The attribute this stage's DISPLAY LABEL names right now, which no
   * structural slot may also write.
   *
   * Kept apart from `draftConflicting` because it is a different fact and
   * earns different words: the label is not a form field the researcher can go
   * and find, it is the control one line above, and the interview writes each
   * relative's typed name into it. A slot bound to the same attribute
   * overwrites that name at finalization — `FamilyPedigree/store.ts` spreads
   * the node's attributes and then writes the relationship over them — so the
   * person a participant called "Mum" is exported as "parent".
   *
   * Live rather than committed, for the reason every other draft input here is
   * live: a label chosen in this session is in no protocol yet, and one just
   * changed must free its old attribute at once.
   */
  draftLabelVariable?: string;
}>;

/**
 * The attributes a pedigree picker may offer.
 *
 * Three exclusions, always together:
 *
 * - the cross-class one against the SAVED protocol, in whichever direction
 *   `writerClass` demands;
 * - the same one against this stage's own unsaved draft (`draftConflicting`),
 *   because both writer classes live on one stage form and a field added in
 *   this session is not in the saved protocol yet; and
 * - the interface-owned one, which drops an attribute ANOTHER interface slot
 *   claims — in the saved protocol, and in this stage's own unsaved draft
 *   (`draftSlotMap`), because a slot bound a moment ago is in no protocol yet.
 *   `ownSlot` keeps an attribute a second Family Pedigree binds in the SAME
 *   slot on offer — sharing structural attributes between two pedigrees over
 *   one node type is legitimate authoring, and the protocol rule is slot-aware
 *   for exactly that reason.
 *
 * All three keep `currentValue` offered, so an imported protocol's existing
 * pick never vanishes from its own picker; the save-time gate is what explains
 * such a pick to the researcher.
 *
 * A structural slot writes its attribute from the tree the participant draws,
 * with no validation of its own (`unvalidated`); the display label is
 * collected through a validated form field (`validated`). Pass the SAME
 * `writerClass` and `draftConflicting` here and to `slotCrossClassIssue` and
 * the picker and the gate cannot disagree about which picks are legal — which
 * is the one thing this pair is for. A picker offering what the gate then
 * refuses reads as the editor changing its mind between the pick and the save.
 */
export function slotPickerOptions<T extends SlotVariableOption>({
  roleMap,
  slotMap,
  subject,
  options,
  currentValue,
  ownSlot,
  writerClass,
  draftConflicting,
  draftSlotMap,
  draftLabelVariable,
}: SlotPickerOptionsInput<T>): T[] {
  if (subject === null) return [];
  const crossClassFiltered =
    writerClass === 'validated'
      ? excludeUnvalidatedUses(roleMap, subject, options, currentValue)
      : excludeValidatedUses(roleMap, subject, options, currentValue);
  const draftFiltered =
    draftConflicting === undefined
      ? crossClassFiltered
      : crossClassFiltered.filter(
          (option) =>
            option.value === currentValue ||
            !draftConflicting.includes(option.value),
        );
  const labelFiltered =
    draftLabelVariable === undefined || draftLabelVariable === ''
      ? draftFiltered
      : draftFiltered.filter(
          (option) =>
            option.value === currentValue ||
            option.value !== draftLabelVariable,
        );
  const savedOwnerFiltered = excludeInterfaceOwned(
    slotMap,
    subject,
    labelFiltered,
    currentValue,
    ownSlot,
  );
  return draftSlotMap === undefined
    ? savedOwnerFiltered
    : excludeInterfaceOwned(
        draftSlotMap,
        subject,
        savedOwnerFiltered,
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
  /** See `SlotPickerOptionsInput.draftSlotMap`; the same map, so the picker
   * and this gate refuse the same picks. */
  draftSlotMap?: ExclusiveVariableSlotMap;
  /** See `SlotPickerOptionsInput.draftLabelVariable`; the same pick, so the
   * picker and this gate refuse it together. */
  draftLabelVariable?: string;
  /** The subject's codebook attributes, read only for display names. */
  allVariables: Readonly<Variables>;
}>;

/**
 * The save-time gate for one pedigree slot picker.
 *
 * It refuses a pick that
 *
 * 1. another interface slot owns outright in the SAVED protocol (the picker
 *    already drops those, so this catches a stale draft or an imported
 *    protocol); or
 * 2. this stage's own display label names in this unsaved edit, which the
 *    interview would overwrite with whatever the slot derives; or
 * 3. this stage's own UNSAVED draft already claims in the opposite writer
 *    class — both classes live on one stage form; or
 * 4. another exclusive slot of this stage has taken in this unsaved edit; or
 * 5. the saved protocol already claims in the opposite writer class.
 *
 * The order is most specific first: an attribute both an unsaved form field
 * and an unsaved slot claim earns the cross-class refusal, which says what the
 * clash costs, rather than the bare "something else in this step has it".
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
  draftSlotMap,
  draftLabelVariable,
  allVariables,
}: SlotCrossClassInput): string | undefined {
  if (subject === null) return undefined;
  const pick = typeof variableId === 'string' ? variableId : '';
  if (pick === '') return undefined;

  const committed = typeof committedValue === 'string' ? committedValue : '';
  if (pick === committed) return undefined;

  const ownedIssue = interfaceOwnedPickIssue(slotMap, subject, pick, ownSlot);
  if (ownedIssue !== undefined) return ownedIssue;

  if (pick === draftLabelVariable) {
    return createMessageError(pedigreeMessages.slotDraftLabelCollectsRefusal, {
      attributeName: variableDisplayName(allVariables, pick),
    });
  }

  if (draftConflicting?.includes(pick) === true) {
    return draftCrossClassMessage[writerClass](
      variableDisplayName(allVariables, pick),
    );
  }

  if (draftSlotMap !== undefined) {
    const draftOwnedIssue = interfaceOwnedPickIssue(
      draftSlotMap,
      subject,
      pick,
      ownSlot,
    );
    if (draftOwnedIssue !== undefined) return draftOwnedIssue;
  }

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
 * Why an attribute a pedigree control HOLDS can no longer be used, or
 * `undefined` while it can.
 *
 * The codebook is live: a collaborator can delete the attribute a slot or a
 * nomination prompt names, or change its type, while this editor is open. The
 * picker stops offering it at once — it is built from the same codebook — but
 * the value the control is already holding stays, and every gate here was
 * asking only about who ELSE writes the attribute. So a save closed the row or
 * the stage over a reference the whole-protocol check then refused, sending
 * the researcher to find a row nothing on screen had marked.
 *
 * There is deliberately no committed-value escape. Every other rule in this
 * module lets a pick that arrived with the protocol through, because a
 * pre-existing conflict is somebody's authoring decision; an attribute that is
 * gone, or is now a different kind of thing, is not a decision anybody made
 * and nothing can be recorded under it.
 *
 * The VALUES are the third way an attribute stops being usable, and the one
 * the type check cannot see: three of the pedigree's slots need a canonical
 * set the interface owns, and an attribute whose options a collaborator has
 * edited is still categorical. The pickers already rule such an attribute out
 * — `ruleOutValuesOutsideOwnedSet` asks the schema's own
 * `optionsMatchInterfaceOwnedSet` — so asking it here too is what stops the
 * picker and the gate disagreeing about a pick the control is already holding.
 */
export function unusableVariableIssue(
  allVariables: Readonly<Variables>,
  variableId: unknown,
  expectedType: VariableType,
  /**
   * The canonical value set this slot's interface owns, where it owns one.
   *
   * Omitted by every slot whose values are the researcher's — a boolean
   * marker, a text label — for which any value set is legitimate authoring.
   */
  expectedOptions?: readonly InterfaceOwnedOption[],
): string | undefined {
  if (typeof variableId !== 'string' || variableId === '') return undefined;
  const variable = allVariables[variableId];
  if (variable === undefined) {
    return createMessageError(pedigreeMessages.variableGoneRefusal, {
      attributeName: variableId,
    });
  }
  if (variable.type !== expectedType) {
    return createMessageError(pedigreeMessages.variableTypeChangedRefusal, {
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
    : createMessageError(pedigreeMessages.variableOptionsChangedRefusal, {
        attributeName: variableDisplayName(allVariables, variableId),
      });
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * The attributes one of a Family Pedigree's own unsaved lists binds.
 *
 * Both lists it has are rows carrying a `variable`, and both are read the same
 * way: `nodeConfig.form`, whose fields COLLECT their attribute with
 * validation, and `nominationPrompts`, whose toggles WRITE theirs without any.
 * Which list was read is what says which writer class the answer belongs to,
 * so the caller names it rather than this helper.
 *
 * Read from the live rows rather than the committed stage: a row added in this
 * editing session is not saved yet, and one just deleted must stop refusing
 * picks immediately.
 */
export function draftRowVariables(rows: unknown): readonly string[] {
  if (!Array.isArray(rows)) return [];
  return rows
    .filter(isRecord)
    .map((row) => row.variable)
    .filter((variable): variable is string => typeof variable === 'string');
}

/**
 * Every slot the Family Pedigree fills EXCLUSIVELY: where the stage keeps it,
 * which codebook entity its attribute belongs to, and the schema's own id for
 * the slot.
 *
 * One table because two things have to agree about each of these: the section
 * that renders the control (which names the path and exempts the slot from its
 * own exclusion) and the index that reads the researcher's unsaved picks back
 * out of the stage form. Written twice, a renamed path would quietly stop the
 * live index seeing a slot at all, and nothing would fail until a researcher
 * bound two slots to one attribute and was refused at the save.
 *
 * `nodeConfig.biologicalSexVariable` is deliberately absent: binning family
 * members by sex is legitimate authoring, so that slot is not exclusive. Its
 * VALUES are interface-owned, which is a different rule.
 */
export const PEDIGREE_EXCLUSIVE_SLOTS = Object.freeze({
  egoVariable: Object.freeze({
    path: 'nodeConfig.egoVariable',
    entity: 'node',
    slot: FAMILY_PEDIGREE_SLOTS.egoVariable,
  }),
  relationshipVariable: Object.freeze({
    path: 'nodeConfig.relationshipVariable',
    entity: 'node',
    slot: FAMILY_PEDIGREE_SLOTS.relationshipVariable,
  }),
  relationshipTypeVariable: Object.freeze({
    path: 'edgeConfig.relationshipTypeVariable',
    entity: 'edge',
    slot: FAMILY_PEDIGREE_SLOTS.relationshipTypeVariable,
  }),
  isActiveVariable: Object.freeze({
    path: 'edgeConfig.isActiveVariable',
    entity: 'edge',
    slot: FAMILY_PEDIGREE_SLOTS.isActiveVariable,
  }),
  isGestationalCarrierVariable: Object.freeze({
    path: 'edgeConfig.isGestationalCarrierVariable',
    entity: 'edge',
    slot: FAMILY_PEDIGREE_SLOTS.isGestationalCarrierVariable,
  }),
  gameteRoleVariable: Object.freeze({
    path: 'edgeConfig.gameteRoleVariable',
    entity: 'edge',
    slot: FAMILY_PEDIGREE_SLOTS.gameteRoleVariable,
  }),
});

/** One slot's live pick: the type it names an attribute of, and the pick. */
export type DraftSlotBinding = Readonly<{
  subject: CodebookSubject | null;
  slot: string;
  variableId: unknown;
}>;

/**
 * The exclusive claims this stage's UNSAVED draft has made, in the shape the
 * saved protocol's claims arrive in.
 *
 * Overlaid on that map, every picker and every gate asks one question about a
 * pick — "is some slot already writing this?" — and gets the same answer for a
 * claim made a moment ago as for one that has been saved for a year. Without
 * it, two slots could each be bound to one attribute in a single edit, both
 * pickers offering it and both gates allowing it, and the whole stage was
 * refused at the save: the researcher was told nothing until they had finished.
 *
 * ADDED to the saved claims rather than replacing them: a slot the researcher
 * has just unbound goes on refusing its old attribute until the stage is
 * saved. That is the conservative direction — an attribute held back from a
 * picker for a moment, rather than one offered that the protocol still refuses.
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

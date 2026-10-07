import {
  createMessageError,
  defineMessages,
  type IntlShape,
} from '@codaco/app-i18n/messages';
import {
  collectEntityAttributeReferences,
  collectEntityTypeReferences,
  collectVariableRoleHits,
  type EntityAttributeReferenceHit,
  type EntityTypeReferenceHit,
  findExclusiveVariableSlots,
  findInterfaceOwnedOptionBindings,
  findStageManagedOptionBindings,
  findVariableRoleConflicts,
  INTERFACE_OWNED_OPTION_SETS,
  type InterfaceOwnedOptionSetKey,
  optionsMatchInterfaceOwnedSet,
  type VariableRoleConflict,
  type Variables,
} from '@codaco/protocol-validation';

import type {
  CodebookSubject,
  ProtocolBuilderProtocolContext,
} from '../protocol-context.ts';

/**
 * The refusals and notices this module writes.
 *
 * Encoded rather than formatted: both are returned as a plain `string` to a
 * caller that puts them in a field's error region, so the words are chosen in
 * the reader's language where they are rendered rather than where the rule is
 * decided.
 */
const messages = defineMessages({
  interfaceOwnedPick: {
    id: 'protocolBuilder.codebookVariable.interfaceOwnedPick',
    defaultMessage:
      'This attribute is set by {owner}, so it cannot be used here. Choose a different attribute.',
    description:
      'Refusal shown when a researcher picks an attribute (a codebook variable) that one kind of interview step writes for itself. owner is a whole English phrase from the protocol schema that names a built-in interface and what it records, for example “the Family Pedigree interface, which marks the participant”. It is not translated here, so it stays in English inside the translated sentence.',
  },
  draftInterfaceOwnedPick: {
    id: 'protocolBuilder.codebookVariable.draftInterfaceOwnedPick',
    defaultMessage:
      'This attribute is already set by another part of the stage you are editing, so it cannot be used here as well. Choose a different attribute.',
    description:
      'Refusal shown when a researcher picks an attribute (a codebook variable) that another control of the interview step they have open has already been set to write, in an edit they have not saved yet. Says "the stage you are editing" rather than naming the interface, because both controls are on the screen in front of them. A stage is one step of an interview.',
  },
  interfaceOwnedOptions: {
    id: 'protocolBuilder.codebookVariable.interfaceOwnedOptions',
    defaultMessage:
      'These options are set by the interface that uses this attribute and cannot be changed here. Reopen this row to start from the current options.',
    description:
      'Refusal shown when a researcher edits the allowed values of an attribute (a codebook variable) whose values one kind of interview step owns. An interface is one kind of interview step. A row is one entry of a list the researcher is editing, such as one field of a form.',
  },
});

const stageManagedOptionsMessages = defineMessages({
  stageManagedOptions: {
    id: 'protocolBuilder.codebookVariable.stageManagedOptions',
    defaultMessage:
      '{count, plural, one {These options are managed by the {stageLabels} stage, which decides the kinship words each one takes. Edit them there.} other {These options are managed by the stages {stageLabels}, which decide the kinship words each one takes. Edit them in any of those stages.}}',
    description:
      'Shown in place of the editable list of allowed answers of an attribute (a codebook variable) whose answers belong to one or more interview steps, and as the refusal when a change to them is attempted anywhere else. A stage is one step of an interview. stageLabels is the researcher’s own name for each of those steps, already in quotation marks and separated by commas, and is not translated here. count is how many steps manage the answers. The kinship words are the family words (mother, brother, parent) a family-tree step uses for each answer.',
  },
});

export type WriterClass = 'validated' | 'unvalidated';

export type VariableRoleMap = Readonly<
  Record<string, Readonly<{ validated: number; unvalidated: number }>>
>;

/**
 * Who has claimed an attribute for an interface slot, and how it is known.
 *
 * A `protocol` claim is read out of the saved protocol and names the interface
 * that made it, in that interface's own words. A `draft` claim is one the
 * researcher has just made in the editor and not saved: no protocol carries it
 * yet, so there is no descriptor to name — and naming the interface would be
 * the wrong thing to say anyway, because the rival control is on the screen in
 * front of them.
 */
export type ExclusiveVariableSlotClaim = Readonly<
  | { source: 'protocol'; slot: string; owner: string }
  | { source: 'draft'; slot: string }
>;

export type ExclusiveVariableSlotMap = Readonly<
  Record<string, ExclusiveVariableSlotClaim>
>;

export type InterfaceOwnedOptionMap = Readonly<
  Record<string, InterfaceOwnedOptionSetKey>
>;

/**
 * The stages that manage one variable's OPTION LIST, by the variable's key.
 *
 * Derived from the saved stages every time it is asked, never stored: removing
 * a stage or unbinding the variable releases the options. See
 * `StageManagedOptionsDescriptor`.
 */
export type StageManagedOptionOwner = Readonly<{
  stageId: string;
  stageLabel: string;
}>;

export type StageManagedOptionMap = Readonly<
  Record<string, readonly StageManagedOptionOwner[]>
>;

type VariableOption = Readonly<{ value: string }>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export type EntityTypeUsageIndex = Readonly<
  Record<string, readonly EntityTypeReferenceHit[]>
>;

export type VariableUsageIndex = Readonly<
  Record<string, readonly EntityAttributeReferenceHit[]>
>;

const protocolFrom = (context: ProtocolBuilderProtocolContext) => ({
  codebook: context.codebook,
  stages: context.orderedStages,
});

const normalizeSubject = (subject: {
  entity: 'node' | 'edge' | 'ego';
  type?: string;
}): CodebookSubject | undefined => {
  if (subject.entity === 'ego') return { entity: 'ego' };
  if (subject.type === undefined) return undefined;
  return { entity: subject.entity, type: subject.type };
};

/** Collision-safe key for a variable scoped to the entity that owns it. */
export const variableRoleKey = (
  subject: CodebookSubject,
  variableId: string,
): string =>
  JSON.stringify([
    subject.entity,
    subject.entity === 'ego' ? null : subject.type,
    variableId,
  ]);

/** Collision-safe key for one node/edge type's reference sites. */
export const entityTypeUsageKey = (
  entity: 'node' | 'edge',
  typeId: string,
): string => JSON.stringify([entity, typeId]);

export function buildVariableRoleMap(
  context: ProtocolBuilderProtocolContext,
  excludedStageId?: string,
): VariableRoleMap {
  const map = new Map<string, { validated: number; unvalidated: number }>();
  for (const group of collectVariableRoleHits(protocolFrom(context))) {
    const countOutsideStage = (hits: typeof group.validated): number =>
      excludedStageId === undefined
        ? hits.length
        : hits.filter((hit) => {
            if (hit.stageIndex === undefined) return true;
            return (
              context.orderedStages[hit.stageIndex]?.id !== excludedStageId
            );
          }).length;
    const subject = normalizeSubject(group.subject);
    if (subject === undefined) continue;
    map.set(
      variableRoleKey(subject, group.variableId),
      Object.freeze({
        validated: countOutsideStage(group.validated),
        unvalidated: countOutsideStage(group.unvalidated),
      }),
    );
  }
  return Object.freeze(Object.fromEntries(map));
}

export const hasValidatedUse = (
  roleMap: VariableRoleMap,
  subject: CodebookSubject,
  variableId: string,
): boolean =>
  (roleMap[variableRoleKey(subject, variableId)]?.validated ?? 0) > 0;

export const hasUnvalidatedUse = (
  roleMap: VariableRoleMap,
  subject: CodebookSubject,
  variableId: string,
): boolean =>
  (roleMap[variableRoleKey(subject, variableId)]?.unvalidated ?? 0) > 0;

export const hasConflictingUse = (
  roleMap: VariableRoleMap,
  subject: CodebookSubject,
  variableId: string,
  writerClass: WriterClass,
): boolean =>
  writerClass === 'validated'
    ? hasUnvalidatedUse(roleMap, subject, variableId)
    : hasValidatedUse(roleMap, subject, variableId);

const escapeSet = (
  currentValue?: string | readonly string[],
): ReadonlySet<string> =>
  new Set(typeof currentValue === 'string' ? [currentValue] : currentValue);

/** Options safe to offer a validated writer such as a form field. */
export const excludeUnvalidatedUses = <T extends VariableOption>(
  roleMap: VariableRoleMap,
  subject: CodebookSubject,
  options: readonly T[],
  currentValue?: string | readonly string[],
): T[] => {
  const escaped = escapeSet(currentValue);
  return options.filter(
    (option) =>
      escaped.has(option.value) ||
      !hasUnvalidatedUse(roleMap, subject, option.value),
  );
};

/** Options safe to offer an unvalidated writer such as a bin or highlight. */
export const excludeValidatedUses = <T extends VariableOption>(
  roleMap: VariableRoleMap,
  subject: CodebookSubject,
  options: readonly T[],
  currentValue?: string | readonly string[],
): T[] => {
  const escaped = escapeSet(currentValue);
  return options.filter(
    (option) =>
      escaped.has(option.value) ||
      !hasValidatedUse(roleMap, subject, option.value),
  );
};

export function variableRoleConflicts(
  context: ProtocolBuilderProtocolContext,
): readonly VariableRoleConflict[] {
  return findVariableRoleConflicts(protocolFrom(context));
}

export function buildEntityTypeUsageIndex(
  context: ProtocolBuilderProtocolContext,
): EntityTypeUsageIndex {
  const index = new Map<string, EntityTypeReferenceHit[]>();
  for (const hit of collectEntityTypeReferences(protocolFrom(context))) {
    const key = entityTypeUsageKey(hit.entity, hit.typeId);
    const existing = index.get(key);
    if (existing === undefined) index.set(key, [hit]);
    else existing.push(hit);
  }
  for (const hits of index.values()) Object.freeze(hits);
  return Object.freeze(Object.fromEntries(index));
}

export function buildVariableUsageIndex(
  context: ProtocolBuilderProtocolContext,
): VariableUsageIndex {
  const index = new Map<string, EntityAttributeReferenceHit[]>();
  for (const hit of collectEntityAttributeReferences(protocolFrom(context))) {
    const subject = hit.subject;
    if (subject === undefined) continue;
    const normalized = normalizeSubject(subject);
    if (normalized === undefined) continue;
    const key = variableRoleKey(normalized, hit.variableId);
    const existing = index.get(key);
    if (existing === undefined) index.set(key, [hit]);
    else existing.push(hit);
  }
  for (const hits of index.values()) Object.freeze(hits);
  return Object.freeze(Object.fromEntries(index));
}

export function buildExclusiveVariableSlotMap(
  context: ProtocolBuilderProtocolContext,
): ExclusiveVariableSlotMap {
  const map = new Map<string, ExclusiveVariableSlotClaim>();
  for (const claim of findExclusiveVariableSlots(protocolFrom(context))) {
    const subject = normalizeSubject(claim.subject);
    if (subject === undefined) continue;
    map.set(
      variableRoleKey(subject, claim.variableId),
      Object.freeze({
        source: 'protocol' as const,
        slot: claim.descriptor.slot,
        owner: claim.descriptor.owner,
      }),
    );
  }
  return Object.freeze(Object.fromEntries(map));
}

export function buildInterfaceOwnedOptionMap(
  context: ProtocolBuilderProtocolContext,
): InterfaceOwnedOptionMap {
  const map = new Map<string, InterfaceOwnedOptionSetKey>();
  for (const binding of findInterfaceOwnedOptionBindings(
    protocolFrom(context),
  )) {
    const subject = normalizeSubject(binding.subject);
    if (subject === undefined) continue;
    map.set(variableRoleKey(subject, binding.variableId), binding.optionSet);
  }
  return Object.freeze(Object.fromEntries(map));
}

export function buildStageManagedOptionMap(
  context: ProtocolBuilderProtocolContext,
): StageManagedOptionMap {
  const map = new Map<string, StageManagedOptionOwner[]>();
  for (const binding of findStageManagedOptionBindings(protocolFrom(context))) {
    const subject = normalizeSubject(binding.subject);
    if (subject === undefined) continue;
    const key = variableRoleKey(subject, binding.variableId);
    const owners = map.get(key) ?? [];
    if (!owners.some((owner) => owner.stageId === binding.stageId)) {
      owners.push({
        stageId: binding.stageId,
        stageLabel: binding.stageLabel,
      });
    }
    map.set(key, owners);
  }
  return Object.freeze(
    Object.fromEntries(
      [...map].map(([key, owners]) => [key, Object.freeze(owners)]),
    ),
  );
}

/**
 * The stage labels to name when a variable's options may not be edited from
 * where the researcher is, or `undefined` when they may.
 *
 * `editingFrom` lists the stages whose editor the researcher is working in: the
 * stage's id, plus the managed bindings its UNSAVED draft makes, so a stage
 * that binds the variable only in its draft still counts as an owner. Any one
 * owner may edit the options, so being in an owning stage's editor lifts the
 * lock for all of them.
 */
export const stageManagedOptionsLock = (
  map: StageManagedOptionMap,
  subject: CodebookSubject,
  variableId: string,
  editingFrom?: Readonly<{
    stageId: string;
    draftBindings: ReadonlySet<string>;
  }>,
): readonly string[] | undefined => {
  if (variableId === '') return undefined;
  const key = variableRoleKey(subject, variableId);
  const owners = map[key];
  if (owners === undefined || owners.length === 0) return undefined;
  if (
    editingFrom !== undefined &&
    (editingFrom.draftBindings.has(key) ||
      owners.some((owner) => owner.stageId === editingFrom.stageId))
  ) {
    return undefined;
  }
  return owners.map((owner) => owner.stageLabel);
};

/**
 * The note naming the stages that manage an option list, as the plain text it
 * is shown in. Whole sentence from one descriptor; the labels are the
 * researcher's own and go in as values.
 */
export const stageManagedOptionsNote = (
  stageLabels: readonly string[],
  intl: Pick<IntlShape, 'formatMessage'>,
): string =>
  intl.formatMessage(stageManagedOptionsMessages.stageManagedOptions, {
    count: stageLabels.length,
    stageLabels: quotedLabels(stageLabels),
  });

/** The same sentence, encoded to be returned as a refusal and decoded later. */
export const stageManagedOptionsRefusal = (
  stageLabels: readonly string[],
): string =>
  createMessageError(stageManagedOptionsMessages.stageManagedOptions, {
    count: stageLabels.length,
    stageLabels: quotedLabels(stageLabels),
  });

const quotedLabels = (stageLabels: readonly string[]): string =>
  stageLabels.map((label) => `“${label}”`).join(', ');

/**
 * Removes structural attributes owned by an interface while preserving a
 * picker's committed value and any claim made by the same structural slot.
 */
export const excludeInterfaceOwned = <T extends VariableOption>(
  slotMap: ExclusiveVariableSlotMap,
  subject: CodebookSubject,
  options: readonly T[],
  currentValue?: string | readonly string[],
  ownSlot?: string,
): T[] => {
  const escaped = escapeSet(currentValue);
  return options.filter((option) => {
    if (escaped.has(option.value)) return true;
    const claim = slotMap[variableRoleKey(subject, option.value)];
    return claim === undefined || claim.slot === ownSlot;
  });
};

/**
 * Save-time refusal for a structural attribute owned by another interface
 * slot. There is deliberately no committed-value escape: saving the pick would
 * keep overwriting the owning interface's value.
 *
 * A claim the open editor has only DRAFTED is refused in different words: the
 * saved protocol does not describe it, and the control that made it is one
 * section away rather than in some other step the researcher has to go and
 * find.
 */
export const interfaceOwnedPickIssue = (
  slotMap: ExclusiveVariableSlotMap,
  subject: CodebookSubject,
  variableId: string,
  ownSlot?: string,
): string | undefined => {
  if (variableId === '') return undefined;
  const claim = slotMap[variableRoleKey(subject, variableId)];
  if (claim === undefined || claim.slot === ownSlot) return undefined;
  return claim.source === 'draft'
    ? createMessageError(messages.draftInterfaceOwnedPick)
    : createMessageError(messages.interfaceOwnedPick, { owner: claim.owner });
};

/**
 * An option list an editor must render read-only. Widened over a variable's
 * own `options` because an interface-owned canonical set is `readonly`, and
 * both are rendered by the same control.
 */
export type LockedOptionList = readonly Readonly<{
  label: string;
  value: string | number | boolean;
}>[];

/**
 * The options a prompt editor must show read-only for the attribute it binds,
 * or `undefined` when the researcher may edit them.
 *
 * Two independent reasons a list is fixed:
 *
 * - an interface both writes the attribute and branches on its exact values,
 *   so the option set belongs to that interface however the attribute is
 *   reached. The CANONICAL set is returned rather than the codebook's own
 *   list, because the canonical set is what the protocol rule enforces — an
 *   imported protocol whose list has drifted from it must not be shown its
 *   drift as if it were authoritative.
 * - the variable carries `readOnly`, which older Architect protocols stamp on
 *   an attribute created from inside a stage. Absent from most authored
 *   protocols, so it can never be the only check.
 *
 * The literal type comparison (rather than a type guard) is what narrows the
 * variable union far enough for `options` to exist on it.
 */
export const lockedVariableOptions = (
  variables: Readonly<Variables> | undefined,
  variableId: string | undefined,
  interfaceOwnedOptionSet?: InterfaceOwnedOptionSetKey,
): LockedOptionList | undefined => {
  if (interfaceOwnedOptionSet !== undefined) {
    return INTERFACE_OWNED_OPTION_SETS[interfaceOwnedOptionSet].options;
  }
  if (variableId === undefined || variableId === '') return undefined;
  const variable = variables?.[variableId];
  if (
    variable === undefined ||
    (variable.type !== 'categorical' && variable.type !== 'ordinal')
  ) {
    return undefined;
  }
  return variable.readOnly === true ? variable.options : undefined;
};

const asOptionList = (
  value: unknown,
): { value: unknown; label?: unknown }[] | undefined =>
  Array.isArray(value)
    ? value.map((option) =>
        isRecord(option)
          ? {
              value: option.value,
              label: option.label,
            }
          : { value: undefined },
      )
    : undefined;

/** Save-time refusal for changing an interface-owned canonical option set. */
export const interfaceOwnedOptionsIssue = (
  optionMap: InterfaceOwnedOptionMap,
  subject: CodebookSubject,
  variableId: string,
  draftOptions: unknown,
): string | undefined => {
  const ownedOptionSet = optionMap[variableRoleKey(subject, variableId)];
  if (ownedOptionSet === undefined || !Array.isArray(draftOptions)) {
    return undefined;
  }
  const canonical = INTERFACE_OWNED_OPTION_SETS[ownedOptionSet].options;
  return optionsMatchInterfaceOwnedSet(asOptionList(draftOptions), canonical)
    ? undefined
    : createMessageError(messages.interfaceOwnedOptions);
};

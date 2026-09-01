import {
  collectEntityAttributeReferences,
  collectEntityTypeReferences,
  collectVariableRoleHits,
  type EntityAttributeReferenceHit,
  type EntityTypeReferenceHit,
  findExclusiveVariableSlots,
  findInterfaceOwnedOptionBindings,
  findVariableRoleConflicts,
  INTERFACE_OWNED_OPTION_SETS,
  type InterfaceOwnedOptionSetKey,
  optionsMatchInterfaceOwnedSet,
  type VariableRoleConflict,
} from '@codaco/protocol-validation';

import type {
  CodebookSubject,
  ProtocolBuilderProtocolContext,
} from '../protocol-context.ts';

export type WriterClass = 'validated' | 'unvalidated';

export type VariableRoleMap = Readonly<
  Record<string, Readonly<{ validated: number; unvalidated: number }>>
>;

export type ExclusiveVariableSlotClaim = Readonly<{
  slot: string;
  owner: string;
}>;

export type ExclusiveVariableSlotMap = Readonly<
  Record<string, ExclusiveVariableSlotClaim>
>;

export type InterfaceOwnedOptionMap = Readonly<
  Record<string, InterfaceOwnedOptionSetKey>
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
  return `This attribute is set by ${claim.owner}, so it cannot be used here. Choose a different attribute.`;
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
    : 'These options are set by the interface that uses this attribute and cannot be changed here. Close this dialog and reopen it to start from the current options.';
};

import type {
  ExclusiveSlotDescriptor,
  InterfaceOwnedOptionSetKey,
  StageManagedOptionsDescriptor,
} from '../schemas/9/entity-attribute-reference.ts';
import {
  collectEntityAttributeReferences,
  type EntityAttributeReferenceHit,
} from './collectEntityAttributeReferences.ts';
import {
  subjectVariableKey,
  toReferenceSubject,
  variableNameFor,
  type ReferenceSubject,
} from './referenceSubjects.ts';

type UnknownRecord = Record<string, unknown>;

const asRecord = (value: unknown): UnknownRecord | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;

export type ExclusiveVariableSlot = {
  subject: ReferenceSubject;
  variableId: string;
  /** See `ExclusiveSlotDescriptor`. */
  descriptor: ExclusiveSlotDescriptor;
  path: (string | number)[];
};

/**
 * Every reference that IS an interface's own structural slot, with the subject
 * it resolves against. Architect derives its picker exclusions from this, so
 * "which variables an interface owns" has one definition shared with the
 * validator below.
 */
export const findExclusiveVariableSlots = (
  protocol: unknown,
  hits?: readonly EntityAttributeReferenceHit[],
): ExclusiveVariableSlot[] => {
  const protocolRecord = asRecord(protocol);
  if (!protocolRecord) return [];

  const slots: ExclusiveVariableSlot[] = [];
  for (const hit of hits ?? collectEntityAttributeReferences(protocolRecord)) {
    if (!hit.exclusive) continue;
    const subject = toReferenceSubject(hit.subject);
    if (!subject) continue;
    slots.push({
      subject,
      variableId: hit.variableId,
      descriptor: hit.exclusive,
      path: hit.path,
    });
  }
  return slots;
};

export type ExclusiveVariableConflict = {
  subject: ReferenceSubject;
  variableId: string;
  variableName: string;
  /** The slot that owns the variable, and its researcher-facing description. */
  owner: ExclusiveSlotDescriptor;
  /** Where the owning slot names it (one entry per stage declaring that slot). */
  ownerPaths: (string | number)[][];
  /** The reference that may not name it. */
  path: (string | number)[];
};

/**
 * References that name a variable another interface owns outright.
 *
 * Slot-aware by design: a variable may be named by the SAME declared exclusive
 * slot on any number of stages — two FamilyPedigree stages over one node type
 * share their structural variables, which is legitimate authoring — and by no
 * other WRITER. Two DIFFERENT exclusive slots naming one variable is itself a
 * conflict: each interface would overwrite the other's meaning.
 *
 * Only writers conflict. A reference that merely READS an interface-derived
 * value is exactly what such a value is for: grouping a narrative map by each
 * person's relationship to the participant, colouring the participant's own
 * node on a sociogram, or skipping a stage when nobody is marked. Those
 * references carry no `usage` tag, and forbidding them would reject protocols
 * that are not only valid but the reason the interface records the value at
 * all.
 *
 * Read or write is a property of the SITE, not of the field name: a Sociogram
 * prompt's `highlight.variable` colours nodes either way, but writes the
 * attribute back only when the participant can tap them
 * (`allowHighlighting: true`), and only then is it a conflict. The schema says
 * which by tagging that site `usageRequiresSibling: 'allowHighlighting'`; this
 * function reads the answer off the collected hit and never re-derives it.
 *
 * `hits` lets the protocol schema's own refinement pass the references it has
 * already collected — both to avoid a second walk of the whole protocol, and
 * because collecting them here would resolve `CurrentProtocolSchema` while
 * that module is still initialising.
 */
export const findExclusiveVariableConflicts = (
  protocol: unknown,
  hits?: readonly EntityAttributeReferenceHit[],
): ExclusiveVariableConflict[] => {
  const protocolRecord = asRecord(protocol);
  if (!protocolRecord) return [];
  const references = hits ?? collectEntityAttributeReferences(protocolRecord);

  type Group = {
    subject: ReferenceSubject;
    variableId: string;
    owners: Map<
      string,
      { descriptor: ExclusiveSlotDescriptor; paths: (string | number)[][] }
    >;
    others: { path: (string | number)[] }[];
  };

  const groups = new Map<string, Group>();

  for (const hit of references) {
    const subject = toReferenceSubject(hit.subject);
    if (!subject) continue;
    const key = subjectVariableKey(subject, hit.variableId);
    let group = groups.get(key);
    if (!group) {
      group = {
        subject,
        variableId: hit.variableId,
        owners: new Map(),
        others: [],
      };
      groups.set(key, group);
    }
    if (hit.exclusive) {
      const existing = group.owners.get(hit.exclusive.slot);
      if (existing) {
        existing.paths.push(hit.path);
      } else {
        group.owners.set(hit.exclusive.slot, {
          descriptor: hit.exclusive,
          paths: [hit.path],
        });
      }
      continue;
    }
    // A read cannot contradict the interface; only a second writer can.
    if (hit.usage === undefined) continue;
    group.others.push({ path: hit.path });
  }

  const conflicts: ExclusiveVariableConflict[] = [];
  for (const group of groups.values()) {
    if (group.owners.size === 0) continue;
    const owners = [...group.owners.values()];
    // The first declared slot is treated as the owner; any further slot is
    // reported against it, so the message always names one owner.
    const [owner, ...rivalSlots] = owners;
    if (!owner) continue;
    const variableName = variableNameFor(
      protocolRecord,
      group.subject,
      group.variableId,
    );
    const offending = [
      ...rivalSlots.flatMap((rival) => rival.paths),
      ...group.others.map((other) => other.path),
    ];
    for (const path of offending) {
      conflicts.push({
        subject: group.subject,
        variableId: group.variableId,
        variableName,
        owner: owner.descriptor,
        ownerPaths: owner.paths,
        path,
      });
    }
  }
  return conflicts;
};

export type InterfaceOwnedOptionBinding = {
  subject: ReferenceSubject;
  variableId: string;
  optionSet: InterfaceOwnedOptionSetKey;
  path: (string | number)[];
};

/**
 * Every reference that binds a variable whose OPTION SET an interface owns.
 * Consumed both by the protocol-level check that the codebook variable still
 * carries the canonical options, and by Architect's option editors, so the
 * editor's idea of "locked" cannot drift from the validator's.
 */
export const findInterfaceOwnedOptionBindings = (
  protocol: unknown,
  hits?: readonly EntityAttributeReferenceHit[],
): InterfaceOwnedOptionBinding[] => {
  const protocolRecord = asRecord(protocol);
  if (!protocolRecord) return [];

  const bindings: InterfaceOwnedOptionBinding[] = [];
  for (const hit of hits ?? collectEntityAttributeReferences(protocolRecord)) {
    if (!hit.ownedOptions) continue;
    const subject = toReferenceSubject(hit.subject);
    if (!subject) continue;
    bindings.push({
      subject,
      variableId: hit.variableId,
      optionSet: hit.ownedOptions,
      path: hit.path,
    });
  }
  return bindings;
};

export type StageManagedOptionBinding = {
  subject: ReferenceSubject;
  variableId: string;
  /** See `StageManagedOptionsDescriptor`. */
  descriptor: StageManagedOptionsDescriptor;
  /** The stage that binds the variable at this slot. */
  stageId: string;
  /**
   * That stage's label, as the researcher named it, in the protocol's default
   * language (or, lacking that translation, the first one it has).
   */
  stageLabel: string;
  path: (string | number)[];
};

/**
 * Every stage that binds a variable whose OPTION LIST that stage manages (see
 * `StageManagedOptionsDescriptor`), with the stage's id and label. A variable
 * several stages bind has one binding per stage, and the protocol schema
 * refuses each of them: one stage manages a variable's options. Ownership is derived here from the stages, never stored in the
 * codebook, so removing the stage (or unbinding the variable) releases the
 * options. Architect's option editors read this to lock the options everywhere
 * but the owning stage's editor.
 */
/** A stage label's text in the protocol's default language. */
const stageLabelText = (label: unknown, localization: unknown): string => {
  if (typeof label === 'string') return label;
  const translations = asRecord(label);
  if (!translations) return '';
  const defaultLocale = asRecord(localization)?.defaultLocale;
  const preferred =
    typeof defaultLocale === 'string' ? translations[defaultLocale] : undefined;
  if (typeof preferred === 'string') return preferred;
  const first = Object.values(translations).find(
    (text): text is string => typeof text === 'string',
  );
  return first ?? '';
};

export const findStageManagedOptionBindings = (
  protocol: unknown,
  hits?: readonly EntityAttributeReferenceHit[],
): StageManagedOptionBinding[] => {
  const protocolRecord = asRecord(protocol);
  if (!protocolRecord) return [];
  const stages = Array.isArray(protocolRecord.stages)
    ? protocolRecord.stages
    : [];

  const bindings: StageManagedOptionBinding[] = [];
  for (const hit of hits ?? collectEntityAttributeReferences(protocolRecord)) {
    if (!hit.stageManagedOptions) continue;
    const subject = toReferenceSubject(hit.subject);
    if (!subject) continue;
    if (hit.path[0] !== 'stages') continue;
    const index = hit.path[1];
    const stage = typeof index === 'number' ? asRecord(stages[index]) : null;
    if (!stage || typeof stage.id !== 'string') continue;
    bindings.push({
      subject,
      variableId: hit.variableId,
      descriptor: hit.stageManagedOptions,
      stageId: stage.id,
      stageLabel: stageLabelText(stage.label, protocolRecord.localization),
      path: hit.path,
    });
  }
  return bindings;
};

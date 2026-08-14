import type { AttributeWriterUsage } from '../schemas/8/entity-attribute-reference.ts';
import { collectEntityAttributeReferences } from './collectEntityAttributeReferences.ts';
import {
  recoverHitSubject,
  stageIndexOf,
  subjectVariableKey,
  variableNameFor,
  type ReferenceSubject,
} from './referenceSubjects.ts';

type UnknownRecord = Record<string, unknown>;

export type VariableRoleHit = {
  path: (string | number)[];
  usage: AttributeWriterUsage;
  stageIndex: number | undefined;
};

export type VariableRoleConflict = {
  subject: ReferenceSubject;
  variableId: string;
  variableName: string;
  validated: VariableRoleHit[];
  unvalidated: VariableRoleHit[];
};

export type VariableRoleGroup = {
  subject: ReferenceSubject;
  variableId: string;
  validated: VariableRoleHit[];
  unvalidated: VariableRoleHit[];
};

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const asRecord = (value: unknown): UnknownRecord | null =>
  isRecord(value) ? value : null;

export function collectVariableRoleHits(
  protocol: unknown,
): VariableRoleGroup[] {
  const protocolRecord = asRecord(protocol);
  if (!protocolRecord) return [];

  const groups = new Map<string, VariableRoleGroup>();

  for (const hit of collectEntityAttributeReferences(protocolRecord)) {
    if (hit.usage === undefined) continue;
    const subject = recoverHitSubject(protocolRecord, hit);
    if (!subject) continue;
    const key = subjectVariableKey(subject, hit.variableId);
    let group = groups.get(key);
    if (!group) {
      group = {
        subject,
        variableId: hit.variableId,
        validated: [],
        unvalidated: [],
      };
      groups.set(key, group);
    }
    const roleHit: VariableRoleHit = {
      path: hit.path,
      usage: hit.usage,
      stageIndex: stageIndexOf(hit.path),
    };
    (hit.usage === 'validatedAttribute'
      ? group.validated
      : group.unvalidated
    ).push(roleHit);
  }

  return [...groups.values()];
}

export function findVariableRoleConflicts(
  protocol: unknown,
): VariableRoleConflict[] {
  const protocolRecord = asRecord(protocol);
  if (!protocolRecord) return [];

  const conflicts: VariableRoleConflict[] = [];
  for (const group of collectVariableRoleHits(protocolRecord)) {
    if (group.validated.length === 0 || group.unvalidated.length === 0)
      continue;
    conflicts.push({
      ...group,
      variableName: variableNameFor(
        protocolRecord,
        group.subject,
        group.variableId,
      ),
    });
  }
  return conflicts;
}

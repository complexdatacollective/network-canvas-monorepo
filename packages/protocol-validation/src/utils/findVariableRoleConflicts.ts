import type { AttributeWriterUsage } from '../schemas/8/entity-attribute-reference.ts';
import {
  collectEntityAttributeReferences,
  type EntityAttributeReferenceHit,
} from './collectEntityAttributeReferences.ts';

type UnknownRecord = Record<string, unknown>;

export type VariableRoleHit = {
  path: (string | number)[];
  usage: AttributeWriterUsage;
  stageIndex: number | undefined;
};

export type VariableRoleConflict = {
  subject: { entity: 'node' | 'edge' | 'ego'; type?: string };
  variableId: string;
  variableName: string;
  validated: VariableRoleHit[];
  unvalidated: VariableRoleHit[];
};

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const asRecord = (value: unknown): UnknownRecord | null =>
  isRecord(value) ? value : null;

const stageIndexOf = (path: (string | number)[]): number | undefined =>
  path[0] === 'stages' && typeof path[1] === 'number' ? path[1] : undefined;

/**
 * FamilyPedigree declares no top-level `subject`, so its only
 * `stageSubject`-resolved writer — `nominationPrompts[].variable` — collects
 * with `hit.subject` undefined. Recover it from the stage's own `nodeConfig`
 * (or, symmetrically, `edgeConfig`) type instead. FamilyPedigree's other
 * writer fields (on `nodeConfig`/`edgeConfig` themselves) are sibling-resolved
 * and already carry a subject, so they never reach this fallback.
 * NarrativePedigree has neither `nodeConfig` nor `edgeConfig`, and its one
 * entity-attribute reference (`diseases[].variable`) carries no `usage` tag
 * today, so it never reaches this function at all.
 */
const recoverSubject = (
  protocol: UnknownRecord,
  hit: EntityAttributeReferenceHit,
): { entity: 'node' | 'edge' | 'ego'; type?: string } | undefined => {
  if (hit.subject) {
    const { entity, type } = hit.subject as {
      entity: 'node' | 'edge' | 'ego';
      type?: string;
    };
    return { entity, ...(type !== undefined ? { type } : {}) };
  }
  const index = stageIndexOf(hit.path);
  if (index === undefined) return undefined;
  const stages = protocol.stages;
  const stage = Array.isArray(stages) ? asRecord(stages[index]) : null;
  if (!stage) return undefined;
  const edgeConfigHit = hit.path.includes('edgeConfig');
  const config = asRecord(edgeConfigHit ? stage.edgeConfig : stage.nodeConfig);
  const type = config?.type;
  return typeof type === 'string'
    ? { entity: edgeConfigHit ? 'edge' : 'node', type }
    : undefined;
};

const variableNameFor = (
  protocol: UnknownRecord,
  subject: { entity: string; type?: string },
  variableId: string,
): string => {
  const codebook = asRecord(protocol.codebook);
  const owner =
    subject.entity === 'ego'
      ? asRecord(codebook?.ego)
      : asRecord(asRecord(codebook?.[subject.entity])?.[subject.type ?? '']);
  const variable = asRecord(asRecord(owner?.variables)?.[variableId]);
  const name = variable?.name;
  return typeof name === 'string' ? name : variableId;
};

export function findVariableRoleConflicts(
  protocol: unknown,
): VariableRoleConflict[] {
  const protocolRecord = asRecord(protocol);
  if (!protocolRecord) return [];

  const groups = new Map<
    string,
    {
      subject: { entity: 'node' | 'edge' | 'ego'; type?: string };
      variableId: string;
      validated: VariableRoleHit[];
      unvalidated: VariableRoleHit[];
    }
  >();

  for (const hit of collectEntityAttributeReferences(protocolRecord)) {
    if (hit.usage === undefined) continue;
    const subject = recoverSubject(protocolRecord, hit);
    if (!subject) continue;
    const key = [subject.entity, subject.type ?? '', hit.variableId].join('\n');
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

  const conflicts: VariableRoleConflict[] = [];
  for (const group of groups.values()) {
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

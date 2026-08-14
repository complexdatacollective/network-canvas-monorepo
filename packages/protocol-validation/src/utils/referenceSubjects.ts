import type { EntityAttributeReferenceHit } from './collectEntityAttributeReferences.ts';

type UnknownRecord = Record<string, unknown>;

export type ReferenceSubject = {
  entity: 'node' | 'edge' | 'ego';
  type?: string;
};

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const asRecord = (value: unknown): UnknownRecord | null =>
  isRecord(value) ? value : null;

export const stageIndexOf = (path: (string | number)[]): number | undefined =>
  path[0] === 'stages' && typeof path[1] === 'number' ? path[1] : undefined;

const stageAt = (
  protocol: UnknownRecord,
  index: number,
): UnknownRecord | null => {
  const stages = protocol.stages;
  return Array.isArray(stages) ? asRecord(stages[index]) : null;
};

/**
 * The subject a collected reference resolves against.
 *
 * Most hits carry their own `subject`. Two stage types declare no top-level
 * `subject`, so their `stageSubject`-resolved references arrive without one:
 *
 * - FamilyPedigree — recovered from the stage's own `nodeConfig`
 *   (or, for a reference nested under `edgeConfig`, that config's) `type`.
 *   The slots on those configs are sibling-resolved and already carry a
 *   subject, so only `nominationPrompts[].variable` and `nodeConfig.form[]`
 *   reach this fallback.
 * - NarrativePedigree — its `diseases[].variable` names a variable on the
 *   node type of the FamilyPedigree it points at, so the subject is recovered
 *   by following `sourceStageId`. (A dangling or wrongly-typed
 *   `sourceStageId` is reported by the protocol-level check; here it simply
 *   yields no subject, and the reference is skipped.)
 */
export const recoverHitSubject = (
  protocol: UnknownRecord,
  hit: EntityAttributeReferenceHit,
): ReferenceSubject | undefined => {
  if (hit.subject) {
    const subject = hit.subject;
    // StageSubject is a union whose ego member carries no `type` — the `in`
    // check narrows to the node/edge members instead of asserting one shape.
    return 'type' in subject
      ? { entity: subject.entity, type: subject.type }
      : { entity: subject.entity };
  }
  const index = stageIndexOf(hit.path);
  if (index === undefined) return undefined;
  const stage = stageAt(protocol, index);
  if (!stage) return undefined;

  if (stage.type === 'NarrativePedigree') {
    const sourceStageId = stage.sourceStageId;
    if (typeof sourceStageId !== 'string') return undefined;
    const stages = protocol.stages;
    if (!Array.isArray(stages)) return undefined;
    const sourceStage = stages
      .map(asRecord)
      .find((candidate) => candidate?.id === sourceStageId);
    if (!sourceStage || sourceStage.type !== 'FamilyPedigree') return undefined;
    const type = asRecord(sourceStage.nodeConfig)?.type;
    return typeof type === 'string' ? { entity: 'node', type } : undefined;
  }

  const edgeConfigHit = hit.path.includes('edgeConfig');
  const config = asRecord(edgeConfigHit ? stage.edgeConfig : stage.nodeConfig);
  const type = config?.type;
  return typeof type === 'string'
    ? { entity: edgeConfigHit ? 'edge' : 'node', type }
    : undefined;
};

/** The codebook `name` of a subject-scoped variable, falling back to its id. */
export const variableNameFor = (
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

/** Composite key scoping a variable to the subject that owns it. */
export const subjectVariableKey = (
  subject: { entity: string; type?: string },
  variableId: string,
): string => [subject.entity, subject.type ?? '', variableId].join('\n');

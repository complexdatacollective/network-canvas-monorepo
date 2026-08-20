import type { StageSubject } from '../schemas/8/common/subjects.ts';

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

/**
 * A collected hit's subject, flattened for the indexes that group by it.
 *
 * The COLLECTOR resolves every subject (from the stage's own `subject`, or
 * from the resolution its schema declares — see `stage-subject-resolution.ts`),
 * so this is a shape conversion and never a second resolution path: a hit with
 * no subject is one the collector could not resolve, and every consumer skips
 * it identically.
 */
export const toReferenceSubject = (
  subject: StageSubject | undefined,
): ReferenceSubject | undefined => {
  if (!subject) return undefined;
  // StageSubject is a union whose ego member carries no `type` — the `in`
  // check narrows to the node/edge members instead of asserting one shape.
  return 'type' in subject
    ? { entity: subject.entity, type: subject.type }
    : { entity: subject.entity };
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

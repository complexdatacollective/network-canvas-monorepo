import { type z } from 'zod';

import type { StageSubject } from './common/subjects.ts';

const STAGE_SUBJECT_RESOLUTION = 'stageSubjectResolution' as const;

/**
 * How a stage's SUBJECT is derived — the codebook entity that every
 * `subject: 'stageSubject'` reference inside that stage resolves against.
 *
 * Most stages carry a literal `subject` object, which needs no declaration.
 * A stage that identifies its subject some other way MUST declare it here, on
 * its own schema, so the collector resolves it during the walk and every hit
 * leaves the walk with a subject already attached. There is exactly one
 * resolution path: nothing downstream re-derives a subject from stage shape,
 * so a stage type that forgets to declare one cannot be silently skipped by
 * one consumer and checked by another. `stage-subject-resolution.test.ts`
 * fails when a new stage type has `stageSubject` references and neither a
 * `subject` field nor a declaration.
 *
 * - `ego` — the stage always operates on the interview's ego (EgoForm).
 * - `stagePath` — a node/edge type named somewhere inside the stage itself
 *   (FamilyPedigree names its alter type at `nodeConfig.type`).
 * - `stageRef` — a node/edge type named inside ANOTHER stage, whose id this
 *   stage holds at `stageRef` (NarrativePedigree points at the FamilyPedigree
 *   whose people its diseases describe). An unresolvable reference yields no
 *   subject; the protocol-level check reports the dangling id itself.
 */
export type StageSubjectResolution =
  | { from: 'ego' }
  | { from: 'stagePath'; path: readonly string[]; entity: 'node' | 'edge' }
  | {
      from: 'stageRef';
      stageRef: string;
      path: readonly string[];
      entity: 'node' | 'edge';
    };

/**
 * Tags a stage schema with how its subject resolves. Applied LAST in a stage's
 * schema expression: `.extend()` builds a fresh schema and would drop it.
 */
export const withStageSubjectResolution = <T extends z.ZodType>(
  schema: T,
  resolution: StageSubjectResolution,
): T => schema.meta({ [STAGE_SUBJECT_RESOLUTION]: resolution });

export const getStageSubjectResolution = (
  schema: z.ZodType,
): StageSubjectResolution | undefined => {
  const meta = schema.meta();
  const resolution = meta?.[STAGE_SUBJECT_RESOLUTION];
  return resolution as StageSubjectResolution | undefined;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** The string at `path` inside `value`, or undefined if any step is missing. */
const stringAt = (
  value: unknown,
  path: readonly string[],
): string | undefined => {
  const found = path.reduce<unknown>(
    (current, step) => (isRecord(current) ? current[step] : undefined),
    value,
  );
  return typeof found === 'string' ? found : undefined;
};

const subjectFor = (
  entity: 'node' | 'edge',
  type: string | undefined,
): StageSubject | undefined =>
  type === undefined
    ? undefined
    : // `StageSubject['type']` is the branded entity-type reference the schema
      // produces on parse; the walk reads raw protocol data, where it is the
      // same string unbranded.
      ({ entity, type } as StageSubject);

/**
 * Applies a declared resolution to one stage value. `stages` is the protocol's
 * stage array, needed only by `stageRef`.
 */
export const resolveDeclaredStageSubject = (
  resolution: StageSubjectResolution,
  stage: Record<string, unknown>,
  stages: readonly unknown[],
): StageSubject | undefined => {
  if (resolution.from === 'ego') return { entity: 'ego' };
  if (resolution.from === 'stagePath') {
    return subjectFor(resolution.entity, stringAt(stage, resolution.path));
  }
  const referencedId = stage[resolution.stageRef];
  if (typeof referencedId !== 'string') return undefined;
  const referenced = stages.find(
    (candidate) => isRecord(candidate) && candidate.id === referencedId,
  );
  return subjectFor(resolution.entity, stringAt(referenced, resolution.path));
};

import type { ConstraintConflict } from '@codaco/protocol-utilities';

/**
 * Which live-feasibility conflicts belong to a given stage.
 *
 * A `ConstraintConflict` carries no stage id — it is written for a human
 * reading a refusal, not for a router — so ownership is read off the fields it
 * does carry, and only those:
 *
 *  - a conflict about a stage NAMES that stage in its reason (`stage "…"`), as
 *    the roster and pair refusals do. Those belong to the named stage and to
 *    nothing else, which is what stops a roster refusal appearing on every
 *    other stage that happens to elicit the same node type;
 *  - a conflict that names no stage is scoped to an ENTITY TYPE — a `unique`
 *    slot with less room than the run needs — and belongs to the stages that
 *    write that type, which for a stage editor means the stage's own subject.
 *
 * Matching on the engine's wording is deliberate rather than incidental: the
 * label is the only link the structure offers, and the alternative — inventing
 * a second, paraphrased refusal that did carry a stage id — is exactly what
 * the spec forbids.
 */

export type ConflictStageIdentity = {
  /** The stage's label, as the engine would quote it. */
  label: string | undefined;
  /** The stage's subject, or `undefined` where it has none. */
  subject: { entity: string; type?: string } | undefined;
};

const NAMED_STAGE = /stage "([^"]*)"/;

/** The stage a conflict names in its reason, if it names one. */
export const conflictStageName = (
  conflict: ConstraintConflict,
): string | undefined => NAMED_STAGE.exec(conflict.reason)?.[1];

export const conflictBelongsToStage = (
  conflict: ConstraintConflict,
  identity: ConflictStageIdentity,
): boolean => {
  const named = conflictStageName(conflict);
  if (named !== undefined) {
    return identity.label !== undefined && named === identity.label;
  }

  const { subject } = identity;
  if (subject === undefined) return false;
  if (conflict.entity !== subject.entity) return false;
  return (
    conflict.entityType === undefined || conflict.entityType === subject.type
  );
};

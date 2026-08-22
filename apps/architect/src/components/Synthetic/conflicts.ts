import type { ConstraintConflict } from '@codaco/protocol-utilities';

/**
 * Which live-feasibility conflicts belong to a given stage — the one answer
 * both surfaces that ask it use (the stage editor's own alert, and the
 * overview's per-stage rows), so the two can never disagree about where a
 * refusal is shown.
 *
 * Ownership is STRUCTURAL: the engine sets `stageId` on the conflicts one
 * stage owns, and this reads that field. Nothing here interprets the refusal's
 * prose — that text is written for a human, and a UI that recognised its stage
 * by matching the label the engine quoted would break on the day the sentence
 * is reworded, or attribute a conflict to the wrong stage the day two stages
 * share a label.
 *
 * A conflict with no `stageId` belongs to no stage: an entity-wide `unique`
 * slot with less room than the run needs is the sum of every stage that draws
 * it, so there is no one stage whose editor could fix it. Those surface in the
 * protocol-level verdict, which lists every conflict, and nowhere else.
 */
export const conflictsForStage = (
  conflicts: readonly ConstraintConflict[],
  stageId: string | undefined,
): ConstraintConflict[] =>
  stageId === undefined
    ? []
    : conflicts.filter((conflict) => conflict.stageId === stageId);

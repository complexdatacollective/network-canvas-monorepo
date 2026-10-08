/**
 * The structural rules a protocol's stage list must keep: every route through
 * the interview ends at a finish stage, and every stage is on some route.
 *
 * The timeline is a straight line until branching lands (#1694), so both rules
 * take their linear form here: the last stage is a finish stage, and nothing
 * follows a finish stage. Branching generalises them to every path through the
 * timeline without a schema change; callers read the problems, not the rule.
 */

type StageLike = Readonly<{ type: string }>;

export const isFinishSessionStage = <Stage extends StageLike>(
  stage: Stage | undefined,
): stage is Extract<Stage, { type: 'FinishSession' }> =>
  stage?.type === 'FinishSession';

export type TimelineStructureProblem =
  | Readonly<{
      /** The interview has no stage to end at. */
      kind: 'empty';
    }>
  | Readonly<{
      /** The route reaches the end of the interview without a finish stage. */
      kind: 'no-finish';
      /** The last stage, where that route ends. */
      stageIndex: number;
    }>
  | Readonly<{
      /** No route reaches this stage, because a finish stage comes first. */
      kind: 'unreachable';
      stageIndex: number;
      /** The finish stage every route ends at before this one. */
      finishStageIndex: number;
    }>;

export const findTimelineStructureProblems = (
  stages: readonly StageLike[],
): readonly TimelineStructureProblem[] => {
  if (stages.length === 0) return [{ kind: 'empty' }];

  const problems: TimelineStructureProblem[] = [];
  const firstFinishIndex = stages.findIndex(isFinishSessionStage);

  if (firstFinishIndex === -1) {
    problems.push({ kind: 'no-finish', stageIndex: stages.length - 1 });
    return problems;
  }

  for (let index = firstFinishIndex + 1; index < stages.length; index += 1) {
    problems.push({
      kind: 'unreachable',
      stageIndex: index,
      finishStageIndex: firstFinishIndex,
    });
  }

  return problems;
};

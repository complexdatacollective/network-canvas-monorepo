type InterviewProgressInput = {
  finishTime: Date | null;
  currentStep: number;
  stageCount: number;
};

/**
 * Progress for an interview row, kept in step with @codaco/interview.
 *
 * Completion is determined by finishTime, not currentStep: the finish flow
 * records finishTime but does not reliably advance currentStep to the end.
 *
 * For in-progress interviews the denominator is the protocol's progress stage
 * count (`PROGRESS_STAGE_COUNT_SQL`): its stages up to and including the first
 * finish stage, as the package counts them. Finish stages are real stages, so
 * an interview waiting on one stays below 100% until it is finished, including
 * one resting on a later, alternative ending past that count.
 */
export function computeInterviewProgress({
  finishTime,
  currentStep,
  stageCount,
}: InterviewProgressInput): number {
  if (finishTime) return 100;
  if (stageCount === 0) return 0;
  return (Math.min(currentStep, stageCount - 1) / stageCount) * 100;
}

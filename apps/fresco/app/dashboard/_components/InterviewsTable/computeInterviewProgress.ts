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
 * For in-progress interviews the denominator is the protocol's stage count:
 * the package indexes currentStep against the protocol's own stages, whose
 * finish stages are real stages, so an interview waiting on its finish stage
 * stays below 100% until it is finished.
 */
export function computeInterviewProgress({
  finishTime,
  currentStep,
  stageCount,
}: InterviewProgressInput): number {
  if (finishTime) return 100;
  if (stageCount === 0) return 0;
  return (currentStep / stageCount) * 100;
}

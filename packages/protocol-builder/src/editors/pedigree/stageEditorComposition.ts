import type { ProtocolBuilderProtocolContext } from '../../protocol-context.ts';

/**
 * Where this stage sits in the interview, for the heading to say.
 *
 * Read from the ordered stages the session already derives rather than taken
 * as a prop: a host that could pass a different number could tell a researcher
 * they are editing stage 4 while the interview runs it seventh. A stage the
 * order does not contain is one being created, and has no position to show
 * until it exists — so it is `undefined` rather than guessed at.
 */
export function interviewPosition(
  context: ProtocolBuilderProtocolContext,
  stageId: string,
): Readonly<{ index: number; total: number }> | undefined {
  const index = context.orderedStages.findIndex(
    (stage) => stage.id === stageId,
  );
  return index === -1
    ? undefined
    : { index: index + 1, total: context.orderedStages.length };
}

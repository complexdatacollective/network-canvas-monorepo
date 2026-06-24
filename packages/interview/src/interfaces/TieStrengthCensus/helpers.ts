/**
 * Computes the answered-state for a single TieStrengthCensus prompt.
 *
 * A TieStrengthCensus prompt collects a value for one `edgeVariable` on an edge
 * of `createEdge` type. Several prompts can share the same edge type while
 * collecting different `edgeVariable`s. The answered-state must therefore be
 * scoped to the specific `edgeVariable` being collected: an edge merely
 * existing (because a sibling prompt created it) does NOT mean this prompt has
 * been answered.
 *
 * Returns:
 * - `true`  when this prompt has a positive answer (edge exists AND, if the
 *   prompt collects an `edgeVariable`, that variable is set on the edge)
 * - `false` when the negative option was recorded in stage metadata
 * - `null`  when the prompt is unanswered (no value collected for this prompt's
 *   edgeVariable and no recorded negative answer)
 */
export function getTieStrengthHasEdge(args: {
  edgeExists: boolean;
  edgeVariable: string | undefined;
  edgeVariableValue: string | number | undefined;
  metadataExists: boolean;
}): boolean | null {
  const { edgeExists, edgeVariable, edgeVariableValue, metadataExists } = args;

  const hasPositiveAnswer = edgeExists
    ? edgeVariable
      ? edgeVariableValue !== undefined
      : true
    : false;

  if (hasPositiveAnswer) {
    return true;
  }

  if (metadataExists) {
    return false;
  }

  return null;
}

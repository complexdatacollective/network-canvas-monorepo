import {
  type DyadCensusMetadataItem,
  entityPrimaryKeyProperty,
  type NcNode,
} from '@codaco/shared-consts';

type Pair = [string, string];

const getNode = (nodes: NcNode[], id: string): NcNode | undefined =>
  nodes.find((node) => node[entityPrimaryKeyProperty] === id);

export const getNodePair = (
  nodes: NcNode[],
  pair: Pair | null,
): [NcNode | undefined, NcNode | undefined] => {
  if (!pair) {
    return [undefined, undefined];
  }
  return [getNode(nodes, pair[0]), getNode(nodes, pair[1])];
};

export const matchEntry =
  (promptIndex: number, pair: Pair) =>
  ([p, a, b]: DyadCensusMetadataItem) =>
    (p === promptIndex && a === pair[0] && b === pair[1]) ||
    (p === promptIndex && b === pair[0] && a === pair[1]);

export const isDyadCensusMetadata = (
  state: unknown,
): state is DyadCensusMetadataItem[] => {
  return (
    Array.isArray(state) &&
    state.every(
      (item) =>
        Array.isArray(item) &&
        item.length === 4 &&
        typeof item[0] === 'number' &&
        typeof item[1] === 'string' &&
        typeof item[2] === 'string' &&
        typeof item[3] === 'boolean',
    )
  );
};

export const getStageMetadataResponse = (
  state: unknown,
  promptIndex: number,
  pair: Pair,
) => {
  if (!isDyadCensusMetadata(state) || pair.length !== 2) {
    return { exists: false, value: undefined };
  }

  const answer = state.find(matchEntry(promptIndex, pair));
  return {
    exists: !!answer,
    value: answer ? answer[3] : undefined,
  };
};

/**
 * Computes the answered-state for a single DyadCensus prompt.
 *
 * DyadCensus is a binary census: each prompt records whether an edge of its
 * `createEdge` type should exist for a pair. Several prompts can share the same
 * edge type, so answered-state must be scoped per prompt rather than derived
 * from raw edge existence on the shared graph — otherwise a 'Yes' on one prompt
 * makes a sibling prompt sharing the same edge type appear pre-answered and
 * skippable. The per-prompt answer lives in the stage-metadata response tuple
 * (`[promptIndex, a, b, value]`), mirroring the per-prompt scoping
 * TieStrengthCensus applies via `getTieStrengthHasEdge`.
 *
 * Returns `true`/`false` for an explicit per-prompt answer, or `null` when this
 * prompt is unanswered.
 */
export const getDyadHasEdge = (response: {
  exists: boolean;
  value: boolean | undefined;
}): boolean | null => {
  if (!response.exists) {
    return null;
  }
  return response.value ?? null;
};

import type { DyadCensusMetadataItem } from '@codaco/shared-consts';

import type { SessionEngine } from '../../session-engine/engine';
import type { NodePair } from '../../utils/edgeTopology';

/**
 * The answer ledger DyadCensus and TieStrengthCensus keep beside the network.
 *
 * A census records more than the graph can hold. An edge says two people are
 * linked; nothing about the graph distinguishes a pair the participant said
 * "no" to from a pair they were never asked about — which is what would make a
 * resumed interview ask again, and what would make an unanswered census
 * indistinguishable from a completed one where nobody was linked. The tuple
 * `[promptIndex, a, b, present]` is that distinction, and both interfaces write
 * it the same way (interview `interfaces/DyadCensus/helpers.ts` and the two
 * interfaces that read them).
 *
 * What each interface records DIFFERS — DyadCensus keeps both signs,
 * TieStrengthCensus keeps only the negatives, because a positive there is the
 * ordinal value it wrote onto the edge — so the decision of what to record
 * stays with each simulator. How a recorded answer REPLACES an earlier one for
 * the same pair and prompt is identical, and lives here.
 */

/**
 * The answers a stage has recorded so far, or `null` where it has recorded
 * nothing.
 *
 * Mirrors `isDyadCensusMetadata`, which is how both interfaces decide whether
 * there is a ledger to amend: an entry of another shape — a stage index
 * carrying a pedigree snapshot, say — is not one, and neither is an absent
 * one. The distinction is load-bearing rather than defensive:
 * TieStrengthCensus's positive answer amends an existing ledger and creates
 * none, so a stage whose every answer is positive leaves no metadata at all.
 *
 * The runtime checks the tuples element by element because its store types the
 * entry as `unknown`; here the stored union already says that the array-shaped
 * branch IS the census ledger — the other two branches are objects — so being
 * an array is the whole of the question.
 */
export const censusAnswers = (
  engine: SessionEngine,
  currentStep: number,
): DyadCensusMetadataItem[] | null => {
  const entry = engine.draft.stageMetadata[String(currentStep)];
  return Array.isArray(entry) ? entry : null;
};

/**
 * The ledger with any answer this prompt already held for this pair removed.
 *
 * `matchEntry` in the runtime, which matches the pair either way round: the
 * pair is unordered, so re-answering it must replace the earlier tuple rather
 * than sit beside it contradicting it.
 */
const withoutAnswer = (
  tuples: readonly DyadCensusMetadataItem[],
  promptIndex: number,
  [from, to]: NodePair,
): DyadCensusMetadataItem[] =>
  tuples.filter(
    ([prompt, a, b]) =>
      !(
        prompt === promptIndex &&
        ((a === from && b === to) || (a === to && b === from))
      ),
  );

/** Records one answer, replacing whatever this prompt held for this pair. */
export const recordCensusAnswer = ({
  engine,
  currentStep,
  promptIndex,
  pair,
  present,
}: {
  engine: SessionEngine;
  currentStep: number;
  promptIndex: number;
  pair: NodePair;
  present: boolean;
}): void => {
  const tuples = withoutAnswer(
    censusAnswers(engine, currentStep) ?? [],
    promptIndex,
    pair,
  );

  engine.updateStageMetadata({
    currentStep,
    metadata: [...tuples, [promptIndex, pair[0], pair[1], present]],
  });
};

/**
 * Takes this prompt's answer for a pair OFF the ledger, where there is one.
 *
 * TieStrengthCensus's positive path: an ordinal answer is recorded on the edge,
 * so a negative the participant is overwriting has to stop being recorded here.
 * A stage with no ledger yet is left without one, exactly as the interface
 * leaves it — there is no negative to withdraw, and creating an empty ledger to
 * say so would make a stage that has been answered look different from one
 * whose answers were all positive.
 */
export const clearCensusAnswer = ({
  engine,
  currentStep,
  promptIndex,
  pair,
}: {
  engine: SessionEngine;
  currentStep: number;
  promptIndex: number;
  pair: NodePair;
}): void => {
  const tuples = censusAnswers(engine, currentStep);
  if (tuples === null) return;

  engine.updateStageMetadata({
    currentStep,
    metadata: withoutAnswer(tuples, promptIndex, pair),
  });
};

import type { Stage } from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
} from '@codaco/shared-consts';

import { generateEntityAttributes } from '../constraints/generateEntityAttributes';
import {
  chooseLinkedPairs,
  edgeForPair,
  unorderedPairs,
} from '../utils/edgeTopology';
import { edgesForStage, nodesForStage } from '../utils/eligibleNodes';
import { invariant } from '../utils/invariant';
import { clearCensusAnswer, recordCensusAnswer } from './shared/censusMetadata';
import { pairKeyOf, walkCensusPairs } from './shared/censusTraversal';
import { deleteEdgeReleasingValues } from './shared/edgeDeletion';
import {
  currentStepOf,
  generationFor,
  promptsWorked,
  stageFilterOf,
} from './shared/stageContext';
import type { StageSimulator } from './types';

type TieStrengthCensusStage = Extract<Stage, { type: 'TieStrengthCensus' }>;

/**
 * Simulate a participant answering a tie-strength census.
 *
 * The same pair-by-pair walk a dyad census makes, with a different set of
 * answers on offer: every option of the prompt's ordinal edge variable, plus
 * one decline card carrying the prompt's `negativeLabel`. So a positive answer
 * IS a value — the interface writes the option onto the edge, creating one for
 * the pair if there is none — and there is no way to say Yes without saying how
 * strongly (interview `interfaces/TieStrengthCensus/TieStrengthCensus.tsx`,
 * `handleChange`).
 *
 * That is why only NEGATIVES reach the stage's metadata. A positive is already
 * legible in the graph, as an edge carrying this prompt's variable; a negative
 * leaves nothing behind, so the tuple is the only record that the pair was
 * reached at all. A positive answer therefore takes any earlier negative for
 * the pair back off the ledger rather than adding to it.
 *
 * A variable whose descriptor leaves it unanswered is answered with the decline
 * card, because declining is the only way this interface produces an edge
 * variable with no value: an edge with the prompt's ordinal missing is not a
 * state the participant can leave behind, so the pair is recorded as a
 * negative instead.
 */
export const simulateTieStrengthCensus: StageSimulator<
  TieStrengthCensusStage
> = (stage, context, promptBound) => {
  const nodeType = context.protocol.codebook.node?.[stage.subject.type];

  invariant(
    nodeType,
    `stage "${stage.id}" surveys node type "${stage.subject.type}", which the codebook does not define`,
  );

  const { engine, streams } = context;
  const currentStep = currentStepOf(context, stage);
  const generation = generationFor(context);
  // The stage's own filter, or nothing when the run ignores filtering.
  const stageFilter = stageFilterOf(context, stage.filter);

  // Sequences the values drawn for this stage's edges, so a `unique` edge
  // variable is handed a distinct one per edge rather than per prompt.
  let answered = 0;

  promptsWorked(stage.prompts, promptBound).forEach((prompt, promptIndex) => {
    if (promptIndex > 0) engine.updatePrompt({ promptIndex });

    const edgeType = prompt.createEdge;
    const edgeVariable = String(prompt.edgeVariable);

    const edgeDefinition = context.protocol.codebook.edge?.[edgeType];
    invariant(
      edgeDefinition?.variables?.[edgeVariable]?.type === 'ordinal',
      `stage "${stage.id}" grades ties by "${edgeVariable}", which is not an ordinal variable on edge type "${edgeType}"`,
    );

    const scope = { entity: 'edge' as const, type: edgeType };
    const constraints = context.entityConstraints.forScope(scope);
    const graded = new Set([edgeVariable]);

    const eligible = nodesForStage(
      engine.draft.network,
      stage.subject.type,
      stageFilter,
    );
    const derivePairs = () =>
      unorderedPairs(
        nodesForStage(engine.draft.network, stage.subject.type, stageFilter),
      );
    const pairs = unorderedPairs(eligible);
    const linked = chooseLinkedPairs({
      topology: stage.synthetic.topology,
      pairs,
      nodeCount: eligible.length,
      streams,
    });
    // Keyed by the pair rather than its position: the traversal re-derives
    // the list after each answer (the interface's selector does), so a
    // position is not a stable identity, and a pair the filter only surfaces
    // mid-stage was outside the realised set — it takes the decline card.
    const linkedKeys = new Set(
      [...linked].map((position) => {
        const pair = pairs[position];
        invariant(pair, 'a chosen pair position must exist');
        return pairKeyOf(pair);
      }),
    );

    walkCensusPairs({
      derive: derivePairs,
      live: stageFilter !== undefined,
      answer: (pair) => {
        // Existence is asked of the STAGE-FILTERED network, exactly as the
        // interface's own selector reads it (`getNetworkEdges` applies the
        // stage filter to the whole network): an edge the filter hides is one
        // the participant cannot see, so a yes creates a second edge — the
        // runtime's addEdge does not dedupe — and a no cannot delete it.
        // Re-derived per pair because the census's own writes change the view.
        const existing = edgeForPair(
          {
            ...engine.draft.network,
            edges: edgesForStage(engine.draft.network, edgeType, stageFilter),
          },
          pair,
          edgeType,
        );

        // Drawn only where the pair was chosen: an undrawn pair is one the
        // participant never graded, and spending a draw on it would move every
        // later value under the same seed.
        const strength = linkedKeys.has(pairKeyOf(pair))
          ? generateEntityAttributes(constraints, generation, scope, answered, {
              only: graded,
              // What the edge already carries, so a rule relating this variable
              // to another on the same edge resolves against it, and so a
              // `unique` value being replaced is given back before the redraw.
              ...(existing
                ? { existing: existing[entityAttributesProperty] }
                : {}),
            })[edgeVariable]
          : undefined;

        if (strength === undefined) {
          if (existing !== null) {
            deleteEdgeReleasingValues({
              engine,
              edge: existing,
              scope,
              constraints,
              uniqueRegistry: context.uniqueRegistry,
            });
          }
          recordCensusAnswer({
            engine,
            currentStep,
            promptIndex,
            pair,
            present: false,
          });
          return;
        }

        answered += 1;
        clearCensusAnswer({ engine, currentStep, promptIndex, pair });

        if (existing === null) {
          engine.addEdge({
            edgeType,
            uid: streams.uuid(),
            from: pair[0],
            to: pair[1],
            attributeData: { [edgeVariable]: strength },
            currentStep,
          });
          return;
        }

        engine.updateEdge({
          edgeId: existing[entityPrimaryKeyProperty],
          attributePatch: { set: { [edgeVariable]: strength }, unset: [] },
        });
      },
    });
  });
};

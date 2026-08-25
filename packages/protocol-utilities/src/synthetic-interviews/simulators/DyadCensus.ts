import type { Stage } from '@codaco/protocol-validation';

import {
  chooseLinkedPairs,
  edgeForPair,
  unorderedPairs,
} from '../utils/edgeTopology';
import { edgesForStage, nodesForStage } from '../utils/eligibleNodes';
import { invariant } from '../utils/invariant';
import { recordCensusAnswer } from './shared/censusMetadata';
import { pairKeyOf, walkCensusPairs } from './shared/censusTraversal';
import { deleteEdgeReleasingValues } from './shared/edgeDeletion';
import {
  currentStepOf,
  promptsWorked,
  stageFilterOf,
} from './shared/stageContext';
import type { StageSimulator } from './types';

type DyadCensusStage = Extract<Stage, { type: 'DyadCensus' }>;

/**
 * Simulate a participant answering a dyad census.
 *
 * The interface walks every pair of the alters the stage shows, one pair at a
 * time, and will not let the participant past a pair until they have said Yes
 * or No — so a completed stage answers every pair of every prompt, and the
 * simulation does the same. Which pairs get a Yes is the stage's declared
 * topology realised over that pair set.
 *
 * Both answers are written, and they are written in two places because they say
 * two different things (interview `interfaces/DyadCensus/DyadCensus.tsx`,
 * `setEdge`). Yes puts an edge on the shared graph — unless one of that type is
 * already there, since edges carry no prompt of their own and a second would be
 * a duplicate. No takes any existing edge away, which is the interface's own
 * behaviour and the reason a census can contradict an earlier stage: the
 * participant has just been asked again and answered differently. Alongside
 * either, a tuple in the stage's metadata records that THIS prompt has an
 * answer for this pair, which is what an edge alone cannot say — without it a
 * "no" is indistinguishable from a pair nobody reached.
 */
export const simulateDyadCensus: StageSimulator<DyadCensusStage> = (
  stage,
  context,
  promptBound,
) => {
  const nodeType = context.protocol.codebook.node?.[stage.subject.type];

  invariant(
    nodeType,
    `stage "${stage.id}" surveys node type "${stage.subject.type}", which the codebook does not define`,
  );

  const { engine, streams } = context;
  const currentStep = currentStepOf(context, stage);
  // The stage's own filter, or nothing when the run ignores filtering.
  const stageFilter = stageFilterOf(context, stage.filter);

  promptsWorked(stage.prompts, promptBound).forEach((prompt, promptIndex) => {
    if (promptIndex > 0) engine.updatePrompt({ promptIndex });

    const edgeType = prompt.createEdge;
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
    // Which pairs carry a tie, keyed by the pair itself: the traversal below
    // re-derives the list after each answer (the interface's selector does),
    // so a position is not a stable identity. A pair the filter only surfaces
    // MID-stage was not in the set the topology was realised over, and gets
    // the answer that draws nothing: no.
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
        const present = linkedKeys.has(pairKeyOf(pair));

        if (present && existing === null) {
          engine.addEdge({
            edgeType,
            uid: streams.uuid(),
            from: pair[0],
            to: pair[1],
            currentStep,
          });
        }

        if (!present && existing !== null) {
          deleteEdgeReleasingValues({
            engine,
            edge: existing,
            scope: { entity: 'edge', type: edgeType },
            constraints: context.entityConstraints.forScope({
              entity: 'edge',
              type: edgeType,
            }),
            uniqueRegistry: context.uniqueRegistry,
          });
        }

        recordCensusAnswer({
          engine,
          currentStep,
          promptIndex,
          pair,
          present,
        });
      },
    });
  });
};

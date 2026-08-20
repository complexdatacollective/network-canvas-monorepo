import type { Stage } from '@codaco/protocol-validation';
import { entityPrimaryKeyProperty } from '@codaco/shared-consts';

import {
  chooseLinkedPairs,
  edgeForPair,
  unorderedPairs,
} from '../utils/edgeTopology';
import { nodesForStage } from '../utils/eligibleNodes';
import { invariant } from '../utils/invariant';
import { recordCensusAnswer } from './shared/censusMetadata';
import { currentStepOf, promptsWorked } from './shared/stageContext';
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

  promptsWorked(stage.prompts, promptBound).forEach((prompt, promptIndex) => {
    if (promptIndex > 0) engine.updatePrompt({ promptIndex });

    const edgeType = prompt.createEdge;
    const eligible = nodesForStage(
      engine.draft.network,
      stage.subject.type,
      stage.filter,
    );
    const pairs = unorderedPairs(eligible);
    const linked = chooseLinkedPairs({
      topology: stage.synthetic.topology,
      pairs,
      nodeCount: eligible.length,
      streams,
    });

    pairs.forEach((pair, position) => {
      const existing = edgeForPair(engine.draft.network, pair, edgeType);
      const present = linked.has(position);

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
        engine.deleteEdge({ edgeId: existing[entityPrimaryKeyProperty] });
      }

      recordCensusAnswer({
        engine,
        currentStep,
        promptIndex,
        pair,
        present,
      });
    });
  });
};

import type { Stage } from '@codaco/protocol-validation';

import {
  chooseLinkedPairs,
  edgeForPair,
  unorderedPairs,
} from '../utils/edgeTopology';
import { nodesForStage } from '../utils/eligibleNodes';
import { invariant } from '../utils/invariant';
import { currentStepOf, promptsWorked } from './shared/stageContext';
import type { StageSimulator } from './types';

type OneToManyDyadCensusStage = Extract<Stage, { type: 'OneToManyDyadCensus' }>;

/**
 * Simulate a participant working through a one-to-many dyad census.
 *
 * One person at a time is put in front of the participant, with everybody else
 * shown as a list to tap through — select all that apply, then move on. So
 * unlike the pair-at-a-time censuses there is no "no" here: a target left
 * untapped is a target left untapped, and the interface records nothing about
 * it. It writes NO stage metadata at all, which is the whole of the difference
 * (interview `interfaces/OneToManyDyadCensus/OneToManyDyadCensus.tsx`).
 *
 * `removeAfterConsideration` decides how often a pair is SHOWN, not which pairs
 * exist. With it on, the focal node's list drops everybody already asked about,
 * so each pair comes up once; with it off, each pair comes up twice — once from
 * each side — and the second showing renders the tie already selected, because
 * the tap toggles an edge on the one shared graph. A participant who has just
 * said these two are linked does not tap it off again, so the answer is settled
 * the first time the pair appears either way, and the option changes nothing
 * about what a completed stage leaves behind. Both readings therefore walk the
 * same pairs in the same order — first person first, which is the order the
 * focal node moves through the list.
 */
export const simulateOneToManyDyadCensus: StageSimulator<
  OneToManyDyadCensusStage
> = (stage, context, promptBound) => {
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
      if (!linked.has(position)) return;
      // Already linked — by a sibling prompt sharing this edge type, or by an
      // earlier stage — is already what the participant means, and the tap
      // that would say so again would take the link away instead.
      if (edgeForPair(engine.draft.network, pair, edgeType) !== null) return;

      engine.toggleEdge({
        edgeType,
        uid: streams.uuid(),
        from: pair[0],
        to: pair[1],
        currentStep,
      });
    });
  });
};

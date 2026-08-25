import type { EdgeTopology, Stage } from '@codaco/protocol-validation';
import { entityPrimaryKeyProperty, type NcNode } from '@codaco/shared-consts';

import { generateEntityAttributes } from '../constraints/generateEntityAttributes';
import {
  chooseLinkedPairs,
  edgeForPair,
  unorderedPairs,
} from '../utils/edgeTopology';
import { nodesForStage } from '../utils/eligibleNodes';
import { invariant } from '../utils/invariant';
import {
  clearOutOfBandWrites,
  existingForRegeneration,
} from './shared/binWrites';
import {
  currentStepOf,
  generationFor,
  promptsWorked,
  stageFilterOf,
} from './shared/stageContext';
import type { SimulationContext, StageSimulator } from './types';

type SociogramStage = Extract<Stage, { type: 'Sociogram' }>;

/**
 * Where on the canvas one alter ends up.
 *
 * The canvas is a unit square: the interface persists `{ x, y }` as fractions
 * of the canvas rather than pixels, so a sociogram drawn on a phone reads the
 * same on a desktop, and the store clamps anything outside it back in
 * (interview `canvas/useCanvasStore.ts`). Nothing in the protocol describes
 * WHERE a participant puts somebody — the nearest thing to it is the stage
 * background, which is a picture rather than a rule — so a position is drawn
 * uniformly across the square from the session's `coins` substream. It is a
 * coordinate rather than a measurement: no analysis reads it, and the one
 * thing it has to be is somewhere the interface could have put it.
 */
const layoutPosition = (
  context: SimulationContext,
): { x: number; y: number } => ({
  x: context.streams.draw('coins'),
  y: context.streams.draw('coins'),
});

/**
 * Links the share of a prompt's pairs its topology asks for.
 *
 * A tap on two nodes TOGGLES, so a chosen pair the network already joins —
 * because a sibling prompt, or an earlier stage, linked it — is left alone
 * rather than tapped: tapping it would take the link away, which is not what a
 * participant who agrees with what they see does. There is no "no" to record
 * either. A pair nobody links is a pair nobody mentioned, and the sociogram
 * stores nothing about it.
 */
const linkPairs = ({
  context,
  currentStep,
  eligible,
  edgeType,
  topology,
}: {
  context: SimulationContext;
  currentStep: number;
  eligible: readonly NcNode[];
  edgeType: string;
  topology: EdgeTopology;
}): void => {
  const { engine, streams } = context;
  const pairs = unorderedPairs(eligible);
  const linked = chooseLinkedPairs({
    topology,
    pairs,
    nodeCount: eligible.length,
    streams,
  });

  pairs.forEach((pair, position) => {
    if (!linked.has(position)) return;
    if (edgeForPair(engine.draft.network, pair, edgeType) !== null) return;

    engine.toggleEdge({
      edgeType,
      uid: streams.uuid(),
      from: pair[0],
      to: pair[1],
      currentStep,
    });
  });
};

/**
 * Simulate a participant laying their network out on the sociogram canvas.
 *
 * Each prompt does one of three things, and the interface's own tap handler
 * says which (interview `interfaces/Sociogram/Sociogram.tsx`,
 * `handleNodeSelect`): a prompt naming an edge type to create links people, a
 * prompt switching highlighting on marks them, and a prompt doing neither only
 * asks for them to be arranged. Creating and highlighting are EXCLUSIVE, and
 * the exclusivity has two sources that agree — the stage schema refuses a
 * prompt setting both, and the tap handler lets creation win where one somehow
 * does — so both are honoured by reading them in that order.
 *
 * Positions come first within a prompt because in manual mode they have to:
 * somebody still in the drawer is not on the canvas to be tapped. Every alter
 * the stage shows is placed. An automatic layout settles all of them, and a
 * manual one is left with everybody arranged because nothing in the protocol
 * says how many a participant would leave behind — a placement rate would be a
 * parameter, and generation does not invent those.
 */
export const simulateSociogram: StageSimulator<SociogramStage> = (
  stage,
  context,
  promptBound,
) => {
  const nodeType = context.protocol.codebook.node?.[stage.subject.type];

  invariant(
    nodeType,
    `stage "${stage.id}" arranges node type "${stage.subject.type}", which the codebook does not define`,
  );

  const { engine } = context;
  const currentStep = currentStepOf(context, stage);
  const scope = { entity: 'node' as const, type: stage.subject.type };
  const constraints = context.entityConstraints.forScope(scope);
  const generation = generationFor(context);
  // The stage's own filter, or nothing when the run ignores filtering.
  const stageFilter = stageFilterOf(context, stage.filter);

  promptsWorked(stage.prompts, promptBound).forEach((prompt, promptIndex) => {
    if (promptIndex > 0) engine.updatePrompt({ promptIndex });

    // Re-derived per prompt: an earlier prompt's edges can decide who a stage
    // filter carrying an edge rule shows next, exactly as the interface's own
    // selector re-runs the filter over the network as it now stands.
    const eligible = nodesForStage(
      engine.draft.network,
      stage.subject.type,
      stageFilter,
    );

    const layoutVariable = String(prompt.layout.layoutVariable);
    for (const node of eligible) {
      engine.updateNode({
        nodeId: node[entityPrimaryKeyProperty],
        attributePatch: {
          set: { [layoutVariable]: layoutPosition(context) },
          unset: [],
        },
        currentStep,
      });
    }

    const createEdge = prompt.edges?.create;
    if (createEdge !== undefined) {
      linkPairs({
        context,
        currentStep,
        eligible,
        edgeType: createEdge,
        topology: stage.synthetic.topology,
      });
      return;
    }

    const highlight = prompt.highlight;
    if (highlight?.allowHighlighting !== true) return;

    const highlightVariable = String(highlight.variable);
    const regenerated = new Set([highlightVariable]);

    eligible.forEach((node, index) => {
      const marked = generateEntityAttributes(
        constraints,
        generation,
        scope,
        index,
        {
          only: regenerated,
          // A highlight is written onto somebody who already holds values, so
          // a rule tying this variable to another resolves against what they
          // actually answered. `existingForRegeneration` is what keeps a
          // `unique` value a binning stage wrote from being handed back on
          // this node's behalf.
          existing: existingForRegeneration(node, regenerated),
        },
      )[highlightVariable];
      clearOutOfBandWrites(node, regenerated);

      // Absent is the alter nobody tapped: the interface writes the attribute
      // only on a tap, so a descriptor leaving it unanswered leaves the node
      // without it rather than marking them false.
      if (marked === undefined) return;

      engine.toggleNodeAttributes({
        nodeId: node[entityPrimaryKeyProperty],
        attributePatch: { set: { [highlightVariable]: marked }, unset: [] },
      });
    });
  });
};

import type { Stage } from '@codaco/protocol-validation';

import { nodesForStage } from '../utils/eligibleNodes';
import { invariant } from '../utils/invariant';
import { binConstraints, binValueFor } from './shared/binValues';
import { assignBinValue } from './shared/binWrites';
import {
  currentStepOf,
  generationFor,
  promptsWorked,
  stageFilterOf,
} from './shared/stageContext';
import type { StageSimulator } from './types';

type OrdinalBinStage = Extract<Stage, { type: 'OrdinalBin' }>;

/**
 * Simulate a participant sorting alters into an ordinal variable's bins.
 *
 * The interface offers one bin per option of the prompt's variable and the
 * participant drags each alter into one, so a prompt writes exactly one option
 * value onto each alter it shows. Which alters it shows is the stage's own
 * subject and filter — nothing is elicited here, so a stage reaching an empty
 * network produces nothing rather than inventing anyone.
 *
 * Values are drawn through the constraint engine, like every other attribute,
 * with the rules stripped from variables only a bin assigns — see
 * `binConstraints` for why the interview never enforces those.
 *
 * An alter is left unplaced only where the variable declares
 * `missingProbability`. Absent that, a completed stage is one where every alter
 * on screen was sorted, which is what the interface asks for.
 */
export const simulateOrdinalBin: StageSimulator<OrdinalBinStage> = (
  stage,
  context,
  promptBound,
) => {
  const nodeType = context.protocol.codebook.node?.[stage.subject.type];

  invariant(
    nodeType,
    `stage "${stage.id}" sorts node type "${stage.subject.type}", which the codebook does not define`,
  );

  const { engine } = context;
  const currentStep = currentStepOf(context, stage);
  const scope = { entity: 'node' as const, type: stage.subject.type };
  // The stage's own filter, or nothing when the run ignores filtering.
  const stageFilter = stageFilterOf(context, stage.filter);

  const constraints = binConstraints({
    variables: nodeType.variables,
    stages: context.protocol.stages,
    subjectType: stage.subject.type,
    today: context.today,
    interfaceRules: context.interfaceRules,
  });
  // Which `unique` slot a value belongs to is a property of the codebook, so
  // the bookkeeping reads the entity's FULL constraints; the relaxed set above
  // only decides what a bin draw enforces.
  const declared = context.entityConstraints.forScope(scope);
  const generation = generationFor(context);

  promptsWorked(stage.prompts, promptBound).forEach((prompt, promptIndex) => {
    if (promptIndex > 0) engine.updatePrompt({ promptIndex });

    const variable = nodeType.variables?.[prompt.variable];

    invariant(
      variable?.type === 'ordinal',
      `stage "${stage.id}" bins by "${prompt.variable}", which is not an ordinal variable on node type "${stage.subject.type}"`,
    );

    // Re-derived per prompt, like every sibling multi-prompt simulator: the
    // runtime's selector re-runs on every render, so a filter reading a
    // variable an earlier prompt wrote no longer shows the alters it removed.
    const eligible = nodesForStage(
      engine.draft.network,
      stage.subject.type,
      stageFilter,
    );

    eligible.forEach((node, index) => {
      const { value, issued } = binValueFor({
        constraints,
        generation,
        scope,
        variableId: prompt.variable,
        index,
        node,
      });
      // Undefined is the alter the participant left in the bucket; writing
      // nothing is what an unplaced alter looks like in the network.
      if (value === undefined) return;

      assignBinValue({
        engine,
        node,
        scope,
        currentStep,
        uniqueRegistry: context.uniqueRegistry,
        constraints: declared,
        set: { [prompt.variable]: value },
        unset: [],
        ...(issued ? { issued: new Set([prompt.variable]) } : {}),
      });
    });
  });
};

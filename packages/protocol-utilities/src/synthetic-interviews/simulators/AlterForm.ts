import type { Stage } from '@codaco/protocol-validation';

import { nodesForStage } from '../utils/eligibleNodes';
import { invariant } from '../utils/invariant';
import { simulateSlidesForm } from './shared/slidesForm';
import { currentStepOf, generationFor } from './shared/stageContext';
import type { StageSimulator } from './types';

type AlterFormStage = Extract<Stage, { type: 'AlterForm' }>;

/**
 * Simulate a participant answering a form about each of their alters in turn.
 *
 * The stage elicits nobody: it asks about the people already named, one slide
 * per person, in the order the network holds them and narrowed to the ones the
 * stage's subject and filter put on screen. A stage that reaches an empty
 * network — or one whose filter admits nobody — shows no slides and leaves
 * immediately, which is a completed stage that wrote nothing, not a failure.
 *
 * Each slide records exactly the fields its form names, and nothing else: an
 * alter variable the codebook defines but this form does not ask about stays
 * as it was, whether that is unanswered or an answer some earlier stage
 * recorded.
 */
export const simulateAlterForm: StageSimulator<AlterFormStage> = (
  stage,
  context,
  promptBound,
) => {
  const nodeType = context.protocol.codebook.node?.[stage.subject.type];

  invariant(
    nodeType,
    `stage "${stage.id}" asks about node type "${stage.subject.type}", which the codebook does not define`,
  );

  // A form has no prompts, so a `stopAt` bound of zero is a participant who
  // reached the deck and submitted nothing.
  if (promptBound === 0) return;

  const { engine } = context;
  const currentStep = currentStepOf(context, stage);
  const scope = { entity: 'node' as const, type: stage.subject.type };

  simulateSlidesForm({
    items: nodesForStage(
      engine.draft.network,
      stage.subject.type,
      stage.filter,
    ),
    fields: stage.form.fields.map((field) => String(field.variable)),
    variables: nodeType.variables,
    constraints: context.entityConstraints.forScope(scope),
    generation: generationFor(context),
    scope,
    write: (nodeId, attributePatch) =>
      engine.updateNode({ nodeId, attributePatch, currentStep }),
  });
};

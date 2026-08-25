import type { Stage } from '@codaco/protocol-validation';

import { edgesForStage } from '../utils/eligibleNodes';
import { invariant } from '../utils/invariant';
import { simulateSlidesForm } from './shared/slidesForm';
import { generationFor, stageFilterOf } from './shared/stageContext';
import type { StageSimulator } from './types';

type AlterEdgeFormStage = Extract<Stage, { type: 'AlterEdgeForm' }>;

/**
 * Simulate a participant answering a form about each of their ties in turn.
 *
 * The same deck of slides an alter form shows, asking about relationships
 * rather than people: one slide per edge of the stage's subject type that its
 * filter admits, in the order the network holds them. A stage reaching a
 * network with no such ties shows no slides and leaves immediately.
 *
 * `updateEdge` carries no step, because an edge carries no provenance: the
 * runtime stamps `stageId` and `promptIDs` onto nodes alone, and the thunk
 * this mirrors takes only the edge and its patch.
 */
export const simulateAlterEdgeForm: StageSimulator<AlterEdgeFormStage> = (
  stage,
  context,
  promptBound,
) => {
  const edgeType = context.protocol.codebook.edge?.[stage.subject.type];

  invariant(
    edgeType,
    `stage "${stage.id}" asks about edge type "${stage.subject.type}", which the codebook does not define`,
  );

  if (promptBound === 0) return;

  const { engine } = context;
  const scope = { entity: 'edge' as const, type: stage.subject.type };
  // The stage's own filter, or nothing when the run ignores filtering.
  const stageFilter = stageFilterOf(context, stage.filter);

  simulateSlidesForm({
    deriveItems: () =>
      edgesForStage(engine.draft.network, stage.subject.type, stageFilter),
    live: stageFilter !== undefined,
    fields: stage.form.fields.map((field) => String(field.variable)),
    variables: edgeType.variables,
    constraints: context.entityConstraints.forScope(scope),
    generation: generationFor(context),
    scope,
    write: (edgeId, attributePatch) =>
      engine.updateEdge({ edgeId, attributePatch }),
  });
};

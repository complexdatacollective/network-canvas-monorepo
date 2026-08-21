import {
  GEOSPATIAL_OUTSIDE_AREAS_PROBABILITY,
  type Stage,
} from '@codaco/protocol-validation';
import { entityPrimaryKeyProperty } from '@codaco/shared-consts';

import { nodesForStage } from '../utils/eligibleNodes';
import { invariant } from '../utils/invariant';
import { currentStepOf, promptsWorked } from './shared/stageContext';
import type { SimulationContext, StageSimulator } from './types';

type GeospatialStage = Extract<Stage, { type: 'Geospatial' }>;

/**
 * The value the interface stores for a tap that lands on no selectable area.
 *
 * A string rather than an absence, because the participant DID answer: the
 * interface offers "outside selectable areas" as an explicit button beside the
 * map, and both it and a stray map tap write this exact word
 * (`interfaces/Geospatial/Geospatial.tsx` and `useMapbox.ts`). Only the
 * Deselect control unsets the attribute, and that is a participant undoing
 * themselves rather than answering.
 *
 * Written here because the runtime holds it as a bare literal with no exported
 * constant, and this package cannot import `@codaco/interview` (decision 13).
 * The e2e matrix asserts the same word from the other side, so the two cannot
 * drift silently.
 */
const OUTSIDE_SELECTABLE_AREAS = 'outside-selectable-areas';

/**
 * The map answers this stage can produce, in the order the interface would
 * produce them.
 *
 * The pool is the host's, keyed by STAGE id: `collectGeospatialPropertyValues`
 * fetches the stage's GeoJSON and plucks the `targetFeatureProperty` off every
 * feature, which is exactly the set of values a tap inside a selectable area
 * can store. An absent key is a source the host could not resolve, and reads
 * as an empty pool (plan decision 18) — a map with nothing selectable on it,
 * where the only answer left is the one outside them all.
 */
const selectableAreas = (
  context: SimulationContext,
  stageId: string,
): readonly string[] =>
  context.assetData.geojsonPropertyValues?.[stageId] ?? [];

/**
 * Simulate a participant placing each alter on the stage's map.
 *
 * The interface walks the stage's alters one at a time under each prompt, and
 * every placement writes ONE string onto the alter: the value the tapped
 * feature carries for the map's `targetFeatureProperty`, or the outside-areas
 * word above. Nothing else is stored — no coordinates, no stage metadata —
 * which is what makes the map's geometry the researcher's data rather than the
 * participant's.
 *
 * Which of the two an answer is comes from the schema's own share
 * (`GEOSPATIAL_OUTSIDE_AREAS_PROBABILITY`), rolled per placement: a map is
 * drawn to contain the answers it asks for, so landing outside it is the
 * residual rather than a mode. With no areas to land in, every answer is the
 * outside word — the only value the interface can produce without a map.
 */
export const simulateGeospatial: StageSimulator<GeospatialStage> = (
  stage,
  context,
  promptBound,
) => {
  const nodeType = context.protocol.codebook.node?.[stage.subject.type];

  invariant(
    nodeType,
    `stage "${stage.id}" places node type "${stage.subject.type}", which the codebook does not define`,
  );

  const { engine, streams } = context;
  const currentStep = currentStepOf(context, stage);
  const areas = selectableAreas(context, stage.id);

  const placement = (): string => {
    if (streams.draw('geo') < GEOSPATIAL_OUTSIDE_AREAS_PROBABILITY) {
      return OUTSIDE_SELECTABLE_AREAS;
    }
    if (areas.length === 0) return OUTSIDE_SELECTABLE_AREAS;

    const area = areas[streams.int('geo', 0, areas.length - 1)];
    invariant(area !== undefined, 'a drawn selectable area must exist');
    return area;
  };

  promptsWorked(stage.prompts, promptBound).forEach((prompt, promptIndex) => {
    if (promptIndex > 0) engine.updatePrompt({ promptIndex });

    // Re-derived per prompt, like every sibling multi-prompt simulator: the
    // runtime's selector re-runs on every render, so a filter reading a
    // variable this stage's own earlier prompt wrote sees the updated
    // network.
    const eligible = nodesForStage(
      engine.draft.network,
      stage.subject.type,
      stage.filter,
    );

    for (const node of eligible) {
      engine.updateNode({
        nodeId: node[entityPrimaryKeyProperty],
        attributePatch: { set: { [prompt.variable]: placement() }, unset: [] },
        currentStep,
      });
    }
  });
};

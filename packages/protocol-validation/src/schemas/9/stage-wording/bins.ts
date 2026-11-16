import type { SuppliedStageSetting } from '../supplied-stage-setting.ts';
import {
  behaviourIsOn,
  isStageRecord,
  type StageRecord,
} from './configuration.ts';

/**
 * Whether a bin stage keeps the participant on the stage until every node
 * is placed, which is when it shows the notice below.
 */
const requiresCompletePlacement = (stage: StageRecord): boolean =>
  behaviourIsOn(stage, 'requireCompletePlacement');

/**
 * Whether a bin stage places nodes by tapping (`interactionMode` `select`)
 * rather than by dragging them, its default: the node being placed is shown
 * on its own, and the participant taps where it goes.
 */
export const placesByTapping = (stage: StageRecord): boolean => {
  const behaviours = stage.behaviours;
  return isStageRecord(behaviours) && behaviours.interactionMode === 'select';
};

/** The settings both bin stages word: the completion gate's notice. */
export const BIN_SUPPLIED_TEXT: readonly SuppliedStageSetting[] = [
  {
    path: ['unplacedNodesNotice'],
    wording: 'interview.stageWording.bins.unplacedNodesNotice',
    when: requiresCompletePlacement,
  },
];

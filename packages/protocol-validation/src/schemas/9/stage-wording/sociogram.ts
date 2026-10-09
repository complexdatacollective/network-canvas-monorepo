import type { SuppliedStageSetting } from '../supplied-stage-setting.ts';
import { behaviourIsOn, type StageRecord } from './configuration.ts';
import { PAUSE_LAYOUT_TOOLTIP, RESUME_LAYOUT_TOOLTIP } from './narrative.ts';

/** The layout toggle shows only while the stage's automatic layout is on. */
const layoutIsOn = (stage: StageRecord) =>
  behaviourIsOn(stage, 'automaticLayout');

/** The Sociogram's settings Network Canvas words. */
export const SOCIOGRAM_SUPPLIED_TEXT: readonly SuppliedStageSetting[] = [
  {
    path: ['tooltips', 'pauseLayout'],
    message: PAUSE_LAYOUT_TOOLTIP,
    when: layoutIsOn,
  },
  {
    path: ['tooltips', 'resumeLayout'],
    message: RESUME_LAYOUT_TOOLTIP,
    when: layoutIsOn,
  },
];

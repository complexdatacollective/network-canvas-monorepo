import type { SuppliedStageSetting } from '../supplied-stage-setting.ts';

/** The Finish screen's settings Network Canvas words. */
export const FINISH_SESSION_SUPPLIED_TEXT: readonly SuppliedStageSetting[] = [
  {
    path: ['finishLabel'],
    wording: 'interview.stageWording.finishSession.finishLabel',
  },
  {
    path: ['finishConfirmation'],
    wording: 'interview.stageWording.finishSession.finishConfirmation',
  },
  {
    path: ['finishFailed'],
    wording: 'interview.stageWording.finishSession.finishFailed',
    variants: ['en-GB'],
  },
];

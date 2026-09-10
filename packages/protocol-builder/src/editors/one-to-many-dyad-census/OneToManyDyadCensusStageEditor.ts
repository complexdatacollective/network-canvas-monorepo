import { interviewerGuidance } from '../../sections/interviewer-guidance/interviewerGuidance.tsx';
import { skipLogic } from '../../sections/skip-logic/skipLogic.tsx';
import { stageHeading } from '../../sections/stage-heading/stageHeading.tsx';
import { subjectPicker } from '../../sections/subject-picker/subjectPicker.tsx';
import { defineStageEditor } from '../defineStageEditor.tsx';
import { oneToManyDyadCensusPrompts } from './sections/oneToManyDyadCensusPrompts.tsx';
import { removeAfterConsideration } from './sections/removeAfterConsideration.tsx';

/**
 * The stage a participant is shown one person and the group around them in.
 *
 * What becomes of a person once they have been considered comes AFTER the
 * prompts, which is a deliberate departure from Architect rather than an
 * oversight in the port: the setting is behaviour of the task the prompts
 * describe, so before them it answers a question the researcher has not been
 * asked yet, and after them it answers one they have. Everything else follows
 * Architect's own list.
 *
 * This interface has no introduction screen. Unlike the two pairwise censuses
 * it shows the whole network at once from the first question, so there is
 * nothing to prepare the participant for that the prompt does not say — and
 * the protocol schema has no `introductionPanel` for it to be written into.
 *
 * The order is pinned by the family's own editor test, so changing it back is
 * a decision rather than a drift.
 */
export const oneToManyDyadCensusStageEditor = defineStageEditor(
  'OneToManyDyadCensus',
  [
    stageHeading({ documentation: 'one-to-many-dyad-census' }),
    subjectPicker({ entity: 'node', filter: true }),
    oneToManyDyadCensusPrompts(),
    removeAfterConsideration(),
    skipLogic(),
    interviewerGuidance(),
  ],
);

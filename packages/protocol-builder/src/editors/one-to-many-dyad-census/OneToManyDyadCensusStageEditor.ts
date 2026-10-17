import { interviewerGuidance } from '../../sections/interviewer-guidance/interviewerGuidance.tsx';
import { skipLogic } from '../../sections/skip-logic/skipLogic.tsx';
import { subjectPicker } from '../../sections/subject-picker/subjectPicker.tsx';
import { defineStageEditor } from '../defineStageEditor.tsx';
import { oneToManyDyadCensusPrompts } from './sections/oneToManyDyadCensusPrompts.tsx';
import { removeAfterConsideration } from './sections/removeAfterConsideration.tsx';

/**
 * The stage a participant is shown one person and the group around them in.
 *
 * What becomes of a person once considered comes AFTER the prompts, a
 * deliberate departure from Architect: the setting is behaviour of the task
 * the prompts describe, so before them it answers a question the researcher
 * has not been asked yet.
 */
export const oneToManyDyadCensusStageEditor = defineStageEditor(
  'OneToManyDyadCensus',
  [
    subjectPicker({ entity: 'node', filter: true }),
    oneToManyDyadCensusPrompts(),
    removeAfterConsideration(),
    skipLogic(),
    interviewerGuidance(),
  ],
);

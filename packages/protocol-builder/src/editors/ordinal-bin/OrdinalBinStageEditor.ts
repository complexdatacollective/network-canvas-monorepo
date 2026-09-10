import { interviewerGuidance } from '../../sections/interviewer-guidance/interviewerGuidance.tsx';
import { skipLogic } from '../../sections/skip-logic/skipLogic.tsx';
import { stageHeading } from '../../sections/stage-heading/stageHeading.tsx';
import { subjectPicker } from '../../sections/subject-picker/subjectPicker.tsx';
import { defineStageEditor } from '../defineStageEditor.tsx';
import { ordinalBinPrompts } from './sections/ordinalBinPrompts.tsx';

/**
 * The stage a participant sorts every person onto a scale in.
 *
 * No introduction screen, unlike the two pairwise censuses: the participant is
 * handed one person at a time against bins they can read, so the prompt says
 * everything the task needs — and the protocol schema has no
 * `introductionPanel` for one to be written into.
 */
export const ordinalBinStageEditor = defineStageEditor('OrdinalBin', [
  stageHeading({ documentation: 'ordinal-bin' }),
  subjectPicker({ entity: 'node', filter: true }),
  ordinalBinPrompts(),
  skipLogic(),
  interviewerGuidance(),
]);

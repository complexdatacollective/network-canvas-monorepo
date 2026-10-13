import { interviewerGuidance } from '../../sections/interviewer-guidance/interviewerGuidance.tsx';
import { skipLogic } from '../../sections/skip-logic/skipLogic.tsx';
import { subjectPicker } from '../../sections/subject-picker/subjectPicker.tsx';
import { defineStageEditor } from '../defineStageEditor.tsx';
import { ordinalBinPrompts } from './sections/ordinalBinPrompts.tsx';

/**
 * The stage a participant sorts every person onto a scale in.
 */
export const ordinalBinStageEditor = defineStageEditor('OrdinalBin', [
  subjectPicker({ entity: 'node', filter: true }),
  ordinalBinPrompts(),
  skipLogic(),
  interviewerGuidance(),
]);

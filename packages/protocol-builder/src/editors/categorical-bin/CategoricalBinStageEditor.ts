import { interviewerGuidance } from '../../sections/interviewer-guidance/interviewerGuidance.tsx';
import { skipLogic } from '../../sections/skip-logic/skipLogic.tsx';
import { stageHeading } from '../../sections/stage-heading/stageHeading.tsx';
import { subjectPicker } from '../../sections/subject-picker/subjectPicker.tsx';
import { defineStageEditor } from '../defineStageEditor.tsx';
import { categoricalBinPrompts } from './sections/categoricalBinPrompts.tsx';

/**
 * The stage a participant sorts every person into named bins in.
 *
 * No introduction screen, for the reason the Ordinal Bin has none: the
 * protocol schema has no `introductionPanel` for one to be written into.
 */
export const categoricalBinStageEditor = defineStageEditor('CategoricalBin', [
  stageHeading({ documentation: 'categorical-bin' }),
  subjectPicker({ entity: 'node', filter: true }),
  categoricalBinPrompts(),
  skipLogic(),
  interviewerGuidance(),
]);

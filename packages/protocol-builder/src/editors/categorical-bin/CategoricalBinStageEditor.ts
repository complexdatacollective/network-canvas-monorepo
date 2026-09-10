import { interviewerGuidance } from '../../sections/interviewer-guidance/interviewerGuidance.tsx';
import { skipLogic } from '../../sections/skip-logic/skipLogic.tsx';
import { stageHeading } from '../../sections/stage-heading/stageHeading.tsx';
import { subjectPicker } from '../../sections/subject-picker/subjectPicker.tsx';
import { defineStageEditor } from '../defineStageEditor.tsx';
import { categoricalBinPrompts } from './sections/categoricalBinPrompts.tsx';

/**
 * The stage a participant sorts every person into named bins in.
 *
 * The same composition as the Ordinal Bin, and for the same reason: both hand
 * the participant one person at a time to drag into one of the values an
 * attribute offers. They differ only in whether those values run in an order,
 * and in what becomes of a person none of them describe.
 */
export const categoricalBinStageEditor = defineStageEditor('CategoricalBin', [
  stageHeading({ documentation: 'categorical-bin' }),
  subjectPicker({ entity: 'node', filter: true }),
  categoricalBinPrompts(),
  skipLogic(),
  interviewerGuidance(),
]);

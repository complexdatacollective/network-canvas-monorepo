import { binBehaviours } from '../../sections/bin-behaviours/binBehaviours.tsx';
import { interviewerGuidance } from '../../sections/interviewer-guidance/interviewerGuidance.tsx';
import { skipLogic } from '../../sections/skip-logic/skipLogic.tsx';
import { subjectPicker } from '../../sections/subject-picker/subjectPicker.tsx';
import { defineStageEditor } from '../defineStageEditor.tsx';
import { categoricalBinPrompts } from './sections/categoricalBinPrompts.tsx';

/**
 * The stage a participant sorts every person into named bins in.
 */
export const categoricalBinStageEditor = defineStageEditor('CategoricalBin', [
  subjectPicker({ entity: 'node', filter: true }),
  categoricalBinPrompts(),
  binBehaviours(),
  skipLogic(),
  interviewerGuidance(),
]);

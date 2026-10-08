import { interviewerGuidance } from '../../sections/interviewer-guidance/interviewerGuidance.tsx';
import { defineStageEditor } from '../defineStageEditor.tsx';
import { closingScreen } from './sections/closingScreen.tsx';
import { outcome } from './sections/outcome.tsx';

/**
 * The screen that ends the interview.
 *
 * Its heading and text are what the participant reads before finishing, and
 * again whenever the finished interview is opened. Its outcome records how an
 * interview that ended here ended.
 *
 * Skip logic is deliberately absent, and the schema refuses it: every route
 * through the interview ends at a finish stage, so there is nothing a finish
 * stage could be skipped to.
 */
export const finishSessionStageEditor = defineStageEditor('FinishSession', [
  closingScreen(),
  outcome(),
  interviewerGuidance(),
]);

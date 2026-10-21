import { interviewerGuidance } from '../../sections/interviewer-guidance/interviewerGuidance.tsx';
import { defineStageEditor } from '../defineStageEditor.tsx';
import { closingScreen } from './sections/closingScreen.tsx';
import { finishedScreen } from './sections/finishedScreen.tsx';
import { finishing } from './sections/finishing.tsx';
import { mode } from './sections/mode.tsx';
import { outcome } from './sections/outcome.tsx';

/**
 * The screen that ends the interview.
 *
 * Its mode decides whether participants confirm that they are finished or
 * the interview finishes as soon as they arrive. A confirming stage shows its
 * closing text with a Finish button; either kind then shows its finished
 * text, again whenever the finished interview is opened. Its finishing words
 * are the button, its question, and what the screen says when the interview
 * could not be ended. Its outcome records how an interview that ended here
 * ended.
 *
 * Skip logic is deliberately absent, and the schema refuses it: every route
 * through the interview ends at a finish stage, so there is nothing a finish
 * stage could be skipped to.
 */
export const finishSessionStageEditor = defineStageEditor('FinishSession', [
  mode(),
  closingScreen(),
  finishedScreen(),
  finishing(),
  outcome(),
  interviewerGuidance(),
]);

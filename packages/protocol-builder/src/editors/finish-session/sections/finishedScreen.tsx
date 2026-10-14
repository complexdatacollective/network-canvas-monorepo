import type { StageSection } from '../../defineStageEditor.tsx';
import FinishedScreenSection from './FinishedScreenSection.tsx';

/** What the participant reads once the interview has finished. */
export const finishedScreen = (): StageSection => () => (
  <FinishedScreenSection />
);

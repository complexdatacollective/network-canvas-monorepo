import type { StageSection } from '../../defineStageEditor.tsx';
import ClosingScreenSection from './ClosingScreenSection.tsx';

/** What the participant reads on the screen that ends the interview. */
export const closingScreen = (): StageSection => () => <ClosingScreenSection />;

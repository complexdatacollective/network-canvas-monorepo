import type { StageSection } from '../../defineStageEditor.tsx';
import FinishingSection from './FinishingSection.tsx';

/** The words a participant sees while finishing the interview. */
export const finishing = (): StageSection => () => <FinishingSection />;

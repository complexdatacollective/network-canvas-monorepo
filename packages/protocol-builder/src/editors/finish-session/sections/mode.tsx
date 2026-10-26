import type { StageSection } from '../../defineStageEditor.tsx';
import ModeSection from './ModeSection.tsx';

/** Whether participants confirm the end of the interview. */
export const mode = (): StageSection => () => <ModeSection />;

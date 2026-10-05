import type { StageSection } from '../../editors/defineStageEditor.tsx';
import SkipLogicSection from './SkipLogicSection.tsx';

/** Whether this stage runs, and where the interview goes when it does not. */
export const skipLogic = (): StageSection => () => <SkipLogicSection />;

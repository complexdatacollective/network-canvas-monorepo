import type { StageSection } from '../../defineStageEditor.tsx';
import OutcomeSection from './OutcomeSection.tsx';

/** How an interview that ends at this stage is recorded as having ended. */
export const outcome = (): StageSection => () => <OutcomeSection />;

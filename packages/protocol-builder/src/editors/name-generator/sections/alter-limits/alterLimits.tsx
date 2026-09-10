import type { StageSection } from '../../../defineStageEditor.tsx';
import AlterLimitsSection from './AlterLimitsSection.tsx';

/** How many people the participant may name before the stage is satisfied. */
export const alterLimits = (): StageSection => () => <AlterLimitsSection />;

import type { StageSection } from '../../defineStageEditor.tsx';
import BoundaryOptionsSection from './BoundaryOptionsSection.tsx';

/** How far out from the participant the family has to reach. */
export const boundaryOptions = (): StageSection => () => (
  <BoundaryOptionsSection />
);

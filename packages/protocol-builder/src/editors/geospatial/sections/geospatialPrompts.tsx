import type { StageSection } from '../../defineStageEditor.tsx';
import GeospatialPromptsSection from './GeospatialPromptsSection.tsx';

/** The places this stage asks the participant about, in order. */
export const geospatialPrompts = (): StageSection => () => (
  <GeospatialPromptsSection />
);

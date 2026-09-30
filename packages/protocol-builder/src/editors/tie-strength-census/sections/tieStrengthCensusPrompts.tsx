import type { StageSection } from '../../defineStageEditor.tsx';
import TieStrengthCensusPromptsSection from './TieStrengthCensusPromptsSection.tsx';

/** What the stage asks about each pair, and the scale it is answered on. */
export const tieStrengthCensusPrompts = (): StageSection => () => (
  <TieStrengthCensusPromptsSection />
);

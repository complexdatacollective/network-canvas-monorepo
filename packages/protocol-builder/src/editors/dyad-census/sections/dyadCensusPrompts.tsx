import type { StageSection } from '../../defineStageEditor.tsx';
import DyadCensusPromptsSection from './DyadCensusPromptsSection.tsx';

/** What the stage asks about each pair, and what a yes records between them. */
export const dyadCensusPrompts = (): StageSection => () => (
  <DyadCensusPromptsSection />
);

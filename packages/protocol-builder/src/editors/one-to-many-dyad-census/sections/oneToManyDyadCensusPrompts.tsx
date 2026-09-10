import type { StageSection } from '../../defineStageEditor.tsx';
import OneToManyDyadCensusPromptsSection from './OneToManyDyadCensusPromptsSection.tsx';

/** What the stage asks about one person and the group around them. */
export const oneToManyDyadCensusPrompts = (): StageSection => () => (
  <OneToManyDyadCensusPromptsSection />
);

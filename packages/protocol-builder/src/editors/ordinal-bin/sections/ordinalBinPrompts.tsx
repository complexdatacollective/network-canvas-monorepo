import type { StageSection } from '../../defineStageEditor.tsx';
import OrdinalBinPromptsSection from './OrdinalBinPromptsSection.tsx';

/** What the stage asks about each person, and the scale they are sorted on. */
export const ordinalBinPrompts = (): StageSection => () => (
  <OrdinalBinPromptsSection />
);

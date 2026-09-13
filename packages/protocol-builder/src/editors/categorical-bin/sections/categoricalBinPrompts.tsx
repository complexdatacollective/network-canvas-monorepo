import type { StageSection } from '../../defineStageEditor.tsx';
import CategoricalBinPromptsSection from './CategoricalBinPromptsSection.tsx';

/** What the stage asks about each person, and the bins they are sorted into. */
export const categoricalBinPrompts = (): StageSection => () => (
  <CategoricalBinPromptsSection />
);

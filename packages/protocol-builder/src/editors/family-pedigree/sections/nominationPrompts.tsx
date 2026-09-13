import type { StageSection } from '../../defineStageEditor.tsx';
import NominationPromptsSection from './NominationPromptsSection.tsx';

/** The optional questions asked about every family member at once. */
export const nominationPrompts = (): StageSection => () => (
  <NominationPromptsSection />
);

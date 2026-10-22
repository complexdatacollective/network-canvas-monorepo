import type { StageSection } from '../../../defineStageEditor.tsx';
import NarrativeWordingSection from './NarrativeWordingSection.tsx';

/** The headings of the narrative's panels, and the labels of its tools. */
export const narrativeWording = (): StageSection => () => (
  <NarrativeWordingSection />
);

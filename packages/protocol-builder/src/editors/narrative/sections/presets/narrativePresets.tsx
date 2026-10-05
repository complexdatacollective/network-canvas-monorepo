import type { StageSection } from '../../../defineStageEditor.tsx';
import NarrativePresetsSection from './NarrativePresetsSection.tsx';

/** The saved ways of looking at the network this stage offers, in order. */
export const narrativePresets = (): StageSection => () => (
  <NarrativePresetsSection />
);

import type { StageSection } from '../../defineStageEditor.tsx';
import ComposerWordingSection from './ComposerWordingSection.tsx';

/** The words a participant reads while building the network on the canvas. */
export const composerWording = (): StageSection => () => (
  <ComposerWordingSection />
);

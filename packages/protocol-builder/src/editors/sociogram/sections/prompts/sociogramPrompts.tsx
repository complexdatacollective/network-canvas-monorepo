import type { StageSection } from '../../../defineStageEditor.tsx';
import SociogramPromptsSection from './SociogramPromptsSection.tsx';

/** The tasks the participant works through on the canvas, in order. */
export const sociogramPrompts = (): StageSection => () => (
  <SociogramPromptsSection />
);

import type { StageSection } from '../../editors/defineStageEditor.tsx';
import NameGeneratorPromptsSection from './NameGeneratorPromptsSection.tsx';

/**
 * What the stage asks, and what each question stamps on the people named in
 * answer to it.
 */
export const nameGeneratorPrompts = (): StageSection => () => (
  <NameGeneratorPromptsSection />
);

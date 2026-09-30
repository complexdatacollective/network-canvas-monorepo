import type { StageSection } from '../../defineStageEditor.tsx';
import ComposerConnectionsSection from './ComposerConnectionsSection.tsx';

/** The connections the participant may draw, and what each one records. */
export const composerConnections = (): StageSection => () => (
  <ComposerConnectionsSection />
);

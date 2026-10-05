import type { StageSection } from '../../defineStageEditor.tsx';
import ComposerNodesSection from './ComposerNodesSection.tsx';

/** What the participant may put on the canvas, and what is remembered about it. */
export const composerNodes = (): StageSection => () => <ComposerNodesSection />;

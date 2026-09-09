import type { StageSection } from '../../../defineStageEditor.tsx';
import NodePanelsSection from './NodePanelsSection.tsx';

/**
 * The lists of people the stage offers beside its own question, for the
 * participant to drag from rather than name again.
 */
export const nodePanels = (): StageSection => () => <NodePanelsSection />;

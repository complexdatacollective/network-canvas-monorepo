import type { StageSection } from '../../editors/defineStageEditor.tsx';
import NodeLayoutSection from './NodeLayoutSection.tsx';

/** How the stage arranges its nodes before the participant touches any. */
export const nodeLayout = (): StageSection => () => <NodeLayoutSection />;

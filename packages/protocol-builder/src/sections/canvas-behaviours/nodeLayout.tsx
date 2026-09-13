import type { StageSection } from '../../editors/defineStageEditor.tsx';
import NodeLayoutSection, {
  type NodeLayoutSectionProps,
} from './NodeLayoutSection.tsx';

/** How the stage arranges its nodes before the participant touches any. */
export const nodeLayout =
  (props: NodeLayoutSectionProps = {}): StageSection =>
  () => <NodeLayoutSection {...props} />;

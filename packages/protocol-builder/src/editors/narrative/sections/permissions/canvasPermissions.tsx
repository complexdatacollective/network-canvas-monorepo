import type { StageSection } from '../../../defineStageEditor.tsx';
import CanvasPermissionsSection from './CanvasPermissionsSection.tsx';

/** What the participant may do to the canvas while they talk over it. */
export const canvasPermissions = (): StageSection => () => (
  <CanvasPermissionsSection />
);

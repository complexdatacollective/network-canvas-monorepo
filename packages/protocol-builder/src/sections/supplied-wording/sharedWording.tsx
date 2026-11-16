import type { StageType } from '@codaco/protocol-validation';

import type { StageSection } from '../../editors/defineStageEditor.tsx';
import StageWordingSection from './StageWordingSection.tsx';

/**
 * The "Customize built-in wording" section of a stage type that holds no
 * wording of its own: only the words every stage of its kind shows alike
 * (see `SharedStageWording`).
 */
export const sharedWording =
  (stageType: StageType): StageSection =>
  () => <StageWordingSection stageType={stageType} />;

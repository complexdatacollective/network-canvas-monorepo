import type { StageSection } from '../../defineStageEditor.tsx';
import RemoveAfterConsiderationSection from './RemoveAfterConsiderationSection.tsx';

/** What becomes of a person the participant has already been asked about. */
export const removeAfterConsideration = (): StageSection => () => (
  <RemoveAfterConsiderationSection />
);

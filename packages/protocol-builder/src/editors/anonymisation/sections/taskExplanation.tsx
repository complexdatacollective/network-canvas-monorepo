import type { StageSection } from '../../defineStageEditor.tsx';
import TaskExplanationSection from './TaskExplanationSection.tsx';

/** What the participant reads before they are asked for a passphrase. */
export const taskExplanation = (): StageSection => () => (
  <TaskExplanationSection />
);

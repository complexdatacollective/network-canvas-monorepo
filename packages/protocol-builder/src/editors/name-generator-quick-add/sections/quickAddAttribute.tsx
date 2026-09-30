import type { StageSection } from '../../defineStageEditor.tsx';
import QuickAddSection from './QuickAddSection.tsx';

/** The one attribute a participant fills in as they add a network member. */
export const quickAddAttribute = (): StageSection => () => <QuickAddSection />;

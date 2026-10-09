import type { StageSection } from '../../defineStageEditor.tsx';
import RosterPanelSection from './RosterPanelSection.tsx';

/** The heading above the people this stage offers. */
export const rosterPanel = (): StageSection => () => <RosterPanelSection />;

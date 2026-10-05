import type { StageSection } from '../../editors/defineStageEditor.tsx';
import BackgroundSection from './BackgroundSection.tsx';

/** What the participant sees behind the nodes on the canvas. */
export const background = (): StageSection => () => <BackgroundSection />;

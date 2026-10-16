import type { StageSection } from '../../editors/defineStageEditor.tsx';
import IntroductionSection from './IntroductionSection.tsx';

/** What the participant reads before the stage asks them anything. */
export const introduction = (): StageSection => () => <IntroductionSection />;

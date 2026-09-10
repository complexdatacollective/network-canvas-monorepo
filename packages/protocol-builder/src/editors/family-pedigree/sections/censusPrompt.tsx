import type { StageSection } from '../../defineStageEditor.tsx';
import CensusPromptSection from './CensusPromptSection.tsx';

/** The one question asked while the participant builds their family. */
export const censusPrompt = (): StageSection => () => <CensusPromptSection />;

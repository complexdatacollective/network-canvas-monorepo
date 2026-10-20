import type { StageSection } from '../../defineStageEditor.tsx';
import ParticipantLanguagesSection from './ParticipantLanguagesSection.tsx';

/** The languages the participant chooses between. */
export const participantLanguages = (): StageSection => () => (
  <ParticipantLanguagesSection />
);

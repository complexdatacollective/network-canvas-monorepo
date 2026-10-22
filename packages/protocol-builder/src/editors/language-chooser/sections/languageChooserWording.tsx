import type { StageSection } from '../../defineStageEditor.tsx';
import LanguageChooserWordingSection from './LanguageChooserWordingSection.tsx';

/** The words a participant reads above the languages. */
export const languageChooserWording = (): StageSection => () => (
  <LanguageChooserWordingSection />
);

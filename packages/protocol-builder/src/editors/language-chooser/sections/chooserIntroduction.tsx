import type { StageSection } from '../../defineStageEditor.tsx';
import ChooserIntroductionSection from './ChooserIntroductionSection.tsx';

/** The optional message shown above the languages. */
export const chooserIntroduction = (): StageSection => () => (
  <ChooserIntroductionSection />
);

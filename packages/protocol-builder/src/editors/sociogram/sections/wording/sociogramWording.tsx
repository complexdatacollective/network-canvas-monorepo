import type { StageSection } from '../../../defineStageEditor.tsx';
import SociogramWordingSection from './SociogramWordingSection.tsx';

/** The labels of the sociogram's layout tools. */
export const sociogramWording = (): StageSection => () => (
  <SociogramWordingSection />
);

import type { StageSection } from '../../defineStageEditor.tsx';
import DiseasesSection from './DiseasesSection.tsx';

/** The conditions this stage draws onto the family it reads. */
export const diseases = (): StageSection => () => <DiseasesSection />;

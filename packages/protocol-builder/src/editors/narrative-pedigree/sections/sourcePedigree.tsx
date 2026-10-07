import type { StageSection } from '../../defineStageEditor.tsx';
import SourcePedigreeSection from './SourcePedigreeSection.tsx';

/** The Family Pedigree stage whose family this one draws conditions onto. */
export const sourcePedigree = (): StageSection => () => (
  <SourcePedigreeSection />
);

import type { StageSection } from '../../defineStageEditor.tsx';
import ExternalDataSourceSection from './ExternalDataSourceSection.tsx';

/** The data file the people this stage offers are listed in. */
export const rosterDataSource = (): StageSection => () => (
  <ExternalDataSourceSection />
);

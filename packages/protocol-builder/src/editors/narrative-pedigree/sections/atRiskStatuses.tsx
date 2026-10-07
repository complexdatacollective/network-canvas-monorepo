import type { StageSection } from '../../defineStageEditor.tsx';
import AtRiskStatusesSection from './AtRiskStatusesSection.tsx';

/** Whether the pedigree shows who might be affected as well as who is. */
export const atRiskStatuses = (): StageSection => () => (
  <AtRiskStatusesSection />
);

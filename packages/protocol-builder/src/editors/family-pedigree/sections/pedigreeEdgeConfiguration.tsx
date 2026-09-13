import type { StageSection } from '../../defineStageEditor.tsx';
import PedigreeEdgeConfigurationSection from './PedigreeEdgeConfigurationSection.tsx';

/**
 * Which relationships the pedigree draws with, and the codebook attributes the
 * interface writes each one into.
 */
export const pedigreeEdgeConfiguration = (): StageSection => () => (
  <PedigreeEdgeConfigurationSection />
);

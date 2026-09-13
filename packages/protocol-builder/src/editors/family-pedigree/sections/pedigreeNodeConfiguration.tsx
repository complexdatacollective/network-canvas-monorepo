import type { StageSection } from '../../defineStageEditor.tsx';
import PedigreeNodeConfigurationSection from './PedigreeNodeConfigurationSection.tsx';

/**
 * Which people the pedigree is built from: the node type, the codebook
 * attributes the interface writes each relative into, and the form asked about
 * them.
 */
export const pedigreeNodeConfiguration = (): StageSection => () => (
  <PedigreeNodeConfigurationSection />
);

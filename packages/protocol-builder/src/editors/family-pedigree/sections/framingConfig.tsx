import type { StageSection } from '../../defineStageEditor.tsx';
import FramingConfigSection from './FramingConfigSection.tsx';

/** The language the pedigree uses for how a relative came to be related. */
export const framingConfig = (): StageSection => () => <FramingConfigSection />;

import type { StageSection } from '../../defineStageEditor.tsx';
import WordingSection from './WordingSection.tsx';

/** The words a participant reads on the pedigree: its key, panel, tooltips and snapshots. */
export const wording = (): StageSection => () => <WordingSection />;

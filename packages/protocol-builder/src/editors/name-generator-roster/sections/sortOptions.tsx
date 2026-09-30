import type { StageSection } from '../../defineStageEditor.tsx';
import SortOptionsSection from './SortOptionsSection.tsx';

/** The order the roster appears in, and the orders the participant may pick. */
export const sortOptions = (): StageSection => () => <SortOptionsSection />;

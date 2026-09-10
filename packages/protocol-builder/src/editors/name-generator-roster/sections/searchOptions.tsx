import type { StageSection } from '../../defineStageEditor.tsx';
import SearchOptionsSection from './SearchOptionsSection.tsx';

/** How a participant finds someone in a long roster. */
export const searchOptions = (): StageSection => () => <SearchOptionsSection />;

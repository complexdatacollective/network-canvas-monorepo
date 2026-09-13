import type { StageSection } from '../../defineStageEditor.tsx';
import CardDisplaySection from './CardDisplaySection.tsx';

/** What each card in the roster shows about a person besides their name. */
export const cardDisplay = (): StageSection => () => <CardDisplaySection />;

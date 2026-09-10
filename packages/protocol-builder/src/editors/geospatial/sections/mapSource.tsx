import type { StageSection } from '../../defineStageEditor.tsx';
import MapSourceSection from './MapSourceSection.tsx';

/** What the map IS: the key it is drawn with, and the areas it offers. */
export const mapSource = (): StageSection => () => <MapSourceSection />;

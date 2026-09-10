import type { StageSection } from '../../defineStageEditor.tsx';
import MapAppearanceSection from './MapAppearanceSection.tsx';

/** How the map looks, and the view it opens on. */
export const mapAppearance = (): StageSection => () => <MapAppearanceSection />;

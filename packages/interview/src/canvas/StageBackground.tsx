import type { Stage } from '@codaco/protocol-validation';

import ConcentricCircles from '../components/ConcentricCircles';
import { useAssetUrl } from '../hooks/useAssetUrl';
import CanvasBackgroundImage from './CanvasBackgroundImage';

type CanvasStage = Extract<
  Stage,
  { type: 'Narrative' | 'NetworkComposer' | 'Sociogram' }
>;

type StageBackgroundProps = {
  background: CanvasStage['background'];
};

export default function StageBackground({ background }: StageBackgroundProps) {
  const { url: backgroundImageUrl } = useAssetUrl(background.image);

  if (background.image === undefined) {
    return (
      <ConcentricCircles
        n={background.concentricCircles}
        skewed={background.skewedTowardCenter}
      />
    );
  }

  return backgroundImageUrl ? (
    <CanvasBackgroundImage src={backgroundImageUrl} />
  ) : null;
}

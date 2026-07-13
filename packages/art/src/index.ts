import BackgroundBlobs from './BackgroundBlobs/BackgroundBlobs';
import useCanvas from './BackgroundBlobs/useCanvas';
import BackgroundLights from './BackgroundLights/BackgroundLights';
import {
  PageBackground,
  PageBackgroundProvider,
  usePageBackgroundTargetRef,
} from './PageBackground/PageBackground';
import { seedToPatternPalette } from './Pattern/palette';
import type { PatternPalette } from './Pattern/palette';
import { Pattern } from './Pattern/Pattern';
import type { PatternProps, PatternVariant } from './Pattern/types';
import { CrossesPattern } from './Pattern/variants/Crosses';
import { DotsPattern } from './Pattern/variants/Dots';
import { FlowPattern } from './Pattern/variants/Flow';
import { RingsPattern } from './Pattern/variants/Rings';
import { SquigglesPattern } from './Pattern/variants/Squiggles';
import { TilesPattern } from './Pattern/variants/Tiles';
import { TruchetPattern } from './Pattern/variants/Truchet';

export type { PatternPalette, PatternProps, PatternVariant };
export {
  BackgroundBlobs,
  BackgroundLights,
  CrossesPattern,
  DotsPattern,
  FlowPattern,
  PageBackground,
  PageBackgroundProvider,
  Pattern,
  RingsPattern,
  seedToPatternPalette,
  SquigglesPattern,
  TilesPattern,
  TruchetPattern,
  useCanvas,
  usePageBackgroundTargetRef,
};

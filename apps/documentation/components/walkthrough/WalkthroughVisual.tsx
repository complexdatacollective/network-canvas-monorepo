'use client';

import { scenes } from './scenes/sceneRegistry';
import type { Visual } from './types';
import Capture from './visuals/Capture';
import Still from './visuals/Still';

export default function WalkthroughVisual({
  visual,
  paused,
  onEnded,
}: {
  visual: Visual;
  paused: boolean;
  onEnded: () => void;
}) {
  if (visual.kind === 'still') return <Still visual={visual} />;
  if (visual.kind === 'capture') {
    return <Capture visual={visual} paused={paused} onEnded={onEnded} />;
  }
  const Scene = scenes[visual.scene];
  return <Scene />;
}

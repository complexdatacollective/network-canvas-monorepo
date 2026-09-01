'use client';

import { DirectionProvider } from '@base-ui/react/direction-provider';
import type { ReactNode } from 'react';

import { AnimationProvider } from '../src/AnimationProvider';

export default function Providers({ children }: { children: ReactNode }) {
  return (
    <AnimationProvider disableAnimationsForAutomation>
      <DirectionProvider direction="ltr">{children}</DirectionProvider>
    </AnimationProvider>
  );
}

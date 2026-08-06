'use client';

import { DirectionProvider } from '@base-ui/react/direction-provider';
import type { ReactNode } from 'react';

import { AnimationProvider } from '../src/AnimationProvider';

type ProvidersProps = {
  children: ReactNode;
  disableAnimations?: boolean;
};

export default function Providers({
  children,
  disableAnimations,
}: ProvidersProps) {
  return (
    <AnimationProvider disableAnimations={disableAnimations}>
      <DirectionProvider direction="ltr">{children}</DirectionProvider>
    </AnimationProvider>
  );
}

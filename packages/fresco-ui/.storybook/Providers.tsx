'use client';

import { DirectionProvider } from '@base-ui/react/direction-provider';
import { MotionConfig } from 'motion/react';
import type { ReactNode } from 'react';

declare global {
  // eslint-disable-next-line no-var
  var BASE_UI_ANIMATIONS_DISABLED: boolean | undefined;
}

type ProvidersProps = {
  children: ReactNode;
  disableAnimations?: boolean;
};

export default function Providers({
  children,
  disableAnimations,
}: ProvidersProps) {
  if (disableAnimations) {
    globalThis.BASE_UI_ANIMATIONS_DISABLED = true;
  }

  return (
    <MotionConfig reducedMotion="user" skipAnimations={disableAnimations}>
      <DirectionProvider direction="ltr">{children}</DirectionProvider>
    </MotionConfig>
  );
}

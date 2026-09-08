'use client';

import type { ReactNode } from 'react';

import { AnimationProvider } from '../src/AnimationProvider';

/**
 * Base UI's `DirectionProvider` is deliberately absent here: the toolbar's
 * direction control owns it, in the `withAppI18n` decorator above this. A
 * second provider at this depth would win over the toolbar's — it is nearer
 * the story — and silently pin every Base UI component back to LTR while the
 * CSS around it mirrored.
 */
export default function Providers({ children }: { children: ReactNode }) {
  return (
    <AnimationProvider disableAnimationsForAutomation>
      {children}
    </AnimationProvider>
  );
}

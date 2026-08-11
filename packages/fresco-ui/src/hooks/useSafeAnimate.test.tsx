import { renderHook } from '@testing-library/react';
import { MotionConfigContext } from 'motion/react';
import type { PropsWithChildren } from 'react';
import { describe, expect, it } from 'vitest';

import { useShouldSkipAnimations } from './useSafeAnimate';

describe('useShouldSkipAnimations', () => {
  it('keeps animations enabled by default', () => {
    const { result } = renderHook(() => useShouldSkipAnimations());

    expect(result.current).toBe(false);
  });

  it('honours MotionConfig skipAnimations', () => {
    const wrapper = ({ children }: PropsWithChildren) => (
      <MotionConfigContext.Provider
        value={{
          transformPagePoint: (point) => point,
          isStatic: false,
          reducedMotion: 'never',
          skipAnimations: true,
        }}
      >
        {children}
      </MotionConfigContext.Provider>
    );
    const { result } = renderHook(() => useShouldSkipAnimations(), {
      wrapper,
    });

    expect(result.current).toBe(true);
  });

  it('honours forced reduced motion', () => {
    const wrapper = ({ children }: PropsWithChildren) => (
      <MotionConfigContext.Provider
        value={{
          transformPagePoint: (point) => point,
          isStatic: false,
          reducedMotion: 'always',
          skipAnimations: false,
        }}
      >
        {children}
      </MotionConfigContext.Provider>
    );
    const { result } = renderHook(() => useShouldSkipAnimations(), {
      wrapper,
    });

    expect(result.current).toBe(true);
  });
});

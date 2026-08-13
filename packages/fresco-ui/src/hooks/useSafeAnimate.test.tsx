import { renderHook } from '@testing-library/react';
import { MotionConfigContext, MotionGlobalConfig } from 'motion/react';
import type { PropsWithChildren } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { useShouldSkipAnimations } from './useSafeAnimate';

describe('useShouldSkipAnimations', () => {
  afterEach(() => {
    MotionGlobalConfig.skipAnimations = true;
  });

  it('keeps animations enabled when no animation control disables them', () => {
    MotionGlobalConfig.skipAnimations = false;

    const { result } = renderHook(() => useShouldSkipAnimations());

    expect(result.current).toBe(false);
  });

  it('honours the global Motion test control', () => {
    MotionGlobalConfig.skipAnimations = true;

    const { result } = renderHook(() => useShouldSkipAnimations());

    expect(result.current).toBe(true);
  });

  it('honours MotionConfig skipAnimations', () => {
    MotionGlobalConfig.skipAnimations = false;

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
    MotionGlobalConfig.skipAnimations = false;

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

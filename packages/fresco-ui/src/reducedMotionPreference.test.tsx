import { act, render, renderHook, waitFor } from '@testing-library/react';
import { motion, MotionGlobalConfig } from 'motion/react';
import type { ReactNode } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { AnimationProvider } from './AnimationProvider';
import {
  useSafeAnimate,
  useShouldSkipAnimations,
} from './hooks/useSafeAnimate';

/**
 * The user's own `prefers-reduced-motion` setting, reaching the animation
 * system through an unmodified `AnimationProvider`.
 *
 * `AnimationProvider.test.tsx` covers the other way animations get switched
 * off: a host forcing them off (`disableAnimations`, WebDriver, Chromatic).
 * The e2e suites do the same, forcing `reducedMotion: 'reduce'` in Playwright
 * and hardcoding `disableAnimations` in the host, so the code that honours
 * the operating-system preference is never what they exercise. Here nothing is
 * forced: Motion's global skip is off, no provider flag is set, and WebDriver
 * and Chromatic are absent. The only input is what `matchMedia` reports, and
 * the only output is whether animations actually run.
 */

type SystemPreference = 'reduce' | 'no-preference';

// One emulated operating-system preference. Motion reads it once and then
// follows `change` events, so switching it dispatches one, as a browser does.
let system: SystemPreference = 'no-preference';
const listeners = new Set<() => void>();

function emulateSystem(next: SystemPreference) {
  system = next;
  act(() => {
    for (const listener of listeners) listener();
  });
}

beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (query: string) => ({
      media: query,
      // Motion asks `(prefers-reduced-motion)`, Fresco asks
      // `(prefers-reduced-motion: reduce)`; a browser matches both when the
      // user has asked for reduced motion.
      get matches() {
        return /prefers-reduced-motion/.test(query) && system === 'reduce';
      },
      addEventListener: (_type: string, listener: () => void) =>
        listeners.add(listener),
      removeEventListener: (_type: string, listener: () => void) =>
        listeners.delete(listener),
    }),
  });
});

beforeEach(() => {
  // The shared test setup skips every animation. Undo that, so the only thing
  // that can stop an animation here is the user's preference.
  MotionGlobalConfig.skipAnimations = false;
  globalThis.BASE_UI_ANIMATIONS_DISABLED = false;
});

afterEach(() => {
  emulateSystem('no-preference');
  MotionGlobalConfig.skipAnimations = true;
  globalThis.BASE_UI_ANIMATIONS_DISABLED = true;
});

// The shape every Fresco app root gives its tree.
function Root({ children }: { children: ReactNode }) {
  return (
    <AnimationProvider disableAnimationsForAutomation>
      {children}
    </AnimationProvider>
  );
}

const SYSTEM_PREFERENCES = ['reduce', 'no-preference'] as const;

describe('the operating-system reduced-motion preference', () => {
  it('is not mistaken for automation', () => {
    emulateSystem('reduce');
    const { result } = renderHook(() => useShouldSkipAnimations(), {
      wrapper: Root,
    });

    expect(window.navigator.webdriver).toBeFalsy();
    expect(MotionGlobalConfig.skipAnimations).toBe(false);
    expect(globalThis.BASE_UI_ANIMATIONS_DISABLED).toBe(false);
    // Only the preference is what makes this true.
    expect(result.current).toBe(true);
  });

  describe('Motion components', () => {
    // A positional animation is the kind Motion makes instant for reduced
    // motion. 30s is far longer than the test, so a value short of the target
    // means the animation is running and a value at the target means it was
    // skipped.
    function Slider() {
      return (
        <motion.div
          data-testid="slider"
          initial={{ x: 0 }}
          animate={{ x: 100 }}
          transition={{ duration: 30 }}
        />
      );
    }

    it('jump to their end state when the user prefers reduced motion', async () => {
      emulateSystem('reduce');
      const { getByTestId } = render(<Slider />, { wrapper: Root });

      await waitFor(() => {
        expect(getByTestId('slider').style.transform).toBe('translateX(100px)');
      });
    });

    it('animate when the user has no preference', async () => {
      emulateSystem('no-preference');
      const { getByTestId } = render(<Slider />, { wrapper: Root });

      // Wait for the animation to have started, then check it has not landed.
      await waitFor(() => {
        expect(getByTestId('slider').style.transform).toMatch(
          /^translateX\(.+px\)$/,
        );
      });
      expect(getByTestId('slider').style.transform).not.toBe(
        'translateX(100px)',
      );
    });

    it('use the preference as it stands when they mount, not an earlier one', async () => {
      emulateSystem('reduce');
      emulateSystem('no-preference');
      const { getByTestId } = render(<Slider />, { wrapper: Root });

      await waitFor(() => {
        expect(getByTestId('slider').style.transform).toMatch(
          /^translateX\(.+px\)$/,
        );
      });
      expect(getByTestId('slider').style.transform).not.toBe(
        'translateX(100px)',
      );
    });
  });

  describe('useShouldSkipAnimations', () => {
    it.each(SYSTEM_PREFERENCES)('follows the preference (%s)', (preference) => {
      emulateSystem(preference);
      const { result } = renderHook(() => useShouldSkipAnimations(), {
        wrapper: Root,
      });

      expect(result.current).toBe(preference === 'reduce');
    });
  });

  describe('useSafeAnimate', () => {
    function animateOpacity() {
      const { result } = renderHook(() => useSafeAnimate(), {
        wrapper: Root,
      });
      const [, animate] = result.current;

      const element = document.createElement('div');
      element.style.opacity = '1';
      document.body.append(element);
      try {
        animate(element, { opacity: 0.5 }, { duration: 30 });
        return element.style.opacity;
      } finally {
        element.remove();
      }
    }

    it('applies the end state at once when the user prefers reduced motion', () => {
      emulateSystem('reduce');

      expect(animateOpacity()).toBe('0.5');
    });

    it('starts a real animation when the user has no preference', () => {
      emulateSystem('no-preference');

      // The animation has only just begun, so the element is still at its
      // start; it would read 0.5 if the call had skipped to the end state.
      expect(animateOpacity()).toBe('1');
    });
  });
});

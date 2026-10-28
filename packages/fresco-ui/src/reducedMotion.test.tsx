import { act, render, renderHook } from '@testing-library/react';
import type { PropsWithChildren } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { AnimationProvider } from './AnimationProvider';
import {
  prefersReducedMotion,
  REDUCED_MOTION_ATTRIBUTE,
  usePrefersReducedMotion,
} from './reducedMotion';

type SystemPreference = 'reduce' | 'no-preference';

// One emulated operating-system preference, shared by every query a caller
// makes. Motion reads it once and then follows `change` events, so switching
// it dispatches one, as a browser does.
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

afterEach(() => {
  emulateSystem('no-preference');
});

const SYSTEM_PREFERENCES = ['reduce', 'no-preference'] as const;

function providerWrapper(setting: 'user' | 'always' | 'never') {
  return ({ children }: PropsWithChildren) => (
    <AnimationProvider reducedMotion={setting}>{children}</AnimationProvider>
  );
}

describe('usePrefersReducedMotion', () => {
  it.each(SYSTEM_PREFERENCES)(
    'reduces under "always" whatever the system says (%s)',
    (preference) => {
      emulateSystem(preference);
      const { result } = renderHook(() => usePrefersReducedMotion(), {
        wrapper: providerWrapper('always'),
      });
      expect(result.current).toBe(true);
    },
  );

  it.each(SYSTEM_PREFERENCES)(
    'does not reduce under "never" whatever the system says (%s)',
    (preference) => {
      emulateSystem(preference);
      const { result } = renderHook(() => usePrefersReducedMotion(), {
        wrapper: providerWrapper('never'),
      });
      expect(result.current).toBe(false);
    },
  );

  it('follows the system under "user" and without a provider', () => {
    emulateSystem('reduce');
    expect(
      renderHook(() => usePrefersReducedMotion(), {
        wrapper: providerWrapper('user'),
      }).result.current,
    ).toBe(true);
    expect(renderHook(() => usePrefersReducedMotion()).result.current).toBe(
      true,
    );

    emulateSystem('no-preference');
    expect(
      renderHook(() => usePrefersReducedMotion(), {
        wrapper: providerWrapper('user'),
      }).result.current,
    ).toBe(false);
    expect(renderHook(() => usePrefersReducedMotion()).result.current).toBe(
      false,
    );
  });

  // CSS can only read one setting for the whole document, so React agrees with
  // it: the outermost provider decides, and a nested one cannot contradict it.
  it.each(['always', 'never'] as const)(
    'takes the outermost provider’s setting when it is "%s"',
    (outer) => {
      emulateSystem('reduce');
      const inner = outer === 'always' ? 'never' : 'always';
      const { result } = renderHook(() => usePrefersReducedMotion(), {
        wrapper: ({ children }: PropsWithChildren) => (
          <AnimationProvider reducedMotion={outer}>
            <AnimationProvider reducedMotion={inner}>
              {children}
            </AnimationProvider>
          </AnimationProvider>
        ),
      });
      expect(result.current).toBe(outer === 'always');
    },
  );

  it('lets a nested default provider inherit an override', () => {
    emulateSystem('no-preference');
    const { result } = renderHook(() => usePrefersReducedMotion(), {
      wrapper: ({ children }: PropsWithChildren) => (
        <AnimationProvider reducedMotion="always">
          <AnimationProvider disableAnimations>{children}</AnimationProvider>
        </AnimationProvider>
      ),
    });
    expect(result.current).toBe(true);
  });
});

describe('the document-root attribute', () => {
  const rootSetting = () =>
    document.documentElement.getAttribute(REDUCED_MOTION_ATTRIBUTE);

  it('carries an overriding setting while its provider is mounted', () => {
    const { rerender, unmount } = render(
      <AnimationProvider reducedMotion="always">{null}</AnimationProvider>,
    );
    expect(rootSetting()).toBe('always');

    rerender(
      <AnimationProvider reducedMotion="never">{null}</AnimationProvider>,
    );
    expect(rootSetting()).toBe('never');

    rerender(
      <AnimationProvider reducedMotion="user">{null}</AnimationProvider>,
    );
    expect(rootSetting()).toBeNull();

    rerender(
      <AnimationProvider reducedMotion="always">{null}</AnimationProvider>,
    );
    unmount();
    expect(rootSetting()).toBeNull();
  });

  it('belongs to the outermost provider, whatever a nested one says', () => {
    function Tree({ inner }: { inner: boolean }) {
      return (
        <AnimationProvider reducedMotion="never">
          {inner && (
            <AnimationProvider reducedMotion="always">{null}</AnimationProvider>
          )}
        </AnimationProvider>
      );
    }
    const { rerender, unmount } = render(<Tree inner />);
    expect(rootSetting()).toBe('never');

    rerender(<Tree inner={false} />);
    expect(rootSetting()).toBe('never');

    unmount();
    expect(rootSetting()).toBeNull();
  });
});

describe('prefersReducedMotion', () => {
  it.each(SYSTEM_PREFERENCES)(
    'reduces under "always" and not under "never" whatever the system says (%s)',
    (preference) => {
      emulateSystem(preference);
      const element = document.createElement('div');

      const always = render(
        <AnimationProvider reducedMotion="always">{null}</AnimationProvider>,
      );
      expect(prefersReducedMotion(element)).toBe(true);
      expect(prefersReducedMotion()).toBe(true);
      always.unmount();

      const never = render(
        <AnimationProvider reducedMotion="never">{null}</AnimationProvider>,
      );
      expect(prefersReducedMotion(element)).toBe(false);
      expect(prefersReducedMotion(document)).toBe(false);
      never.unmount();
    },
  );

  it('answers false without a DOM instead of throwing', () => {
    vi.stubGlobal('document', undefined);
    vi.stubGlobal('Document', undefined);
    try {
      expect(prefersReducedMotion()).toBe(false);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('reads the document a node belongs to, even another window’s', () => {
    emulateSystem('no-preference');
    const frame = document.createElement('iframe');
    document.body.append(frame);
    const frameDocument = frame.contentDocument!;
    try {
      frameDocument.documentElement.setAttribute(
        REDUCED_MOTION_ATTRIBUTE,
        'always',
      );
      expect(prefersReducedMotion(frameDocument)).toBe(true);
      expect(prefersReducedMotion(frameDocument.body)).toBe(true);
      expect(prefersReducedMotion(document)).toBe(false);
    } finally {
      frame.remove();
    }
  });

  it('follows the system without an overriding provider', () => {
    emulateSystem('reduce');
    expect(prefersReducedMotion()).toBe(true);
    emulateSystem('no-preference');
    expect(prefersReducedMotion()).toBe(false);
  });
});

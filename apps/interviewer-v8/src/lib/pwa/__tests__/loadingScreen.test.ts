import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { removeLoadingScreen } from '../loadingScreen';

function mountLoader(): HTMLElement {
  const el = document.createElement('div');
  el.id = 'app-loading';
  document.body.appendChild(el);
  return el;
}

function stubReducedMotion(reduce: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: reduce && query === '(prefers-reduced-motion: reduce)',
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
  // restoreAllMocks does not undo vi.stubGlobal — unstub matchMedia explicitly so
  // the reduced-motion stub can't leak into other suites in the same worker.
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('removeLoadingScreen', () => {
  it('does not throw when no loader is present', () => {
    stubReducedMotion(false);
    expect(() => {
      removeLoadingScreen();
    }).not.toThrow();
    expect(document.getElementById('app-loading')).toBeNull();
  });

  describe('with motion allowed', () => {
    beforeEach(() => {
      stubReducedMotion(false);
    });

    it('starts the fade by adding is-hidden but does not remove immediately', () => {
      const loader = mountLoader();
      removeLoadingScreen();
      expect(loader.classList.contains('is-hidden')).toBe(true);
      expect(document.getElementById('app-loading')).toBe(loader);
    });

    it('removes the loader once the fade transition ends', () => {
      const loader = mountLoader();
      removeLoadingScreen();
      loader.dispatchEvent(new Event('transitionend'));
      expect(document.getElementById('app-loading')).toBeNull();
    });

    it('removes the loader via the fallback timer if no transitionend fires', () => {
      vi.useFakeTimers();
      mountLoader();
      removeLoadingScreen();
      expect(document.getElementById('app-loading')).not.toBeNull();
      vi.runAllTimers();
      expect(document.getElementById('app-loading')).toBeNull();
    });

    it('is idempotent while a fade is already in flight', () => {
      const loader = mountLoader();
      removeLoadingScreen();
      // Second call must not restart the fade or double-remove.
      expect(() => {
        removeLoadingScreen();
      }).not.toThrow();
      loader.dispatchEvent(new Event('transitionend'));
      expect(document.getElementById('app-loading')).toBeNull();
    });
  });

  describe('with reduced motion', () => {
    beforeEach(() => {
      stubReducedMotion(true);
    });

    it('removes the loader synchronously without fading', () => {
      const loader = mountLoader();
      removeLoadingScreen();
      expect(loader.classList.contains('is-hidden')).toBe(false);
      expect(document.getElementById('app-loading')).toBeNull();
    });
  });
});

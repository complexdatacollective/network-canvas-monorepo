import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LOCALE_PREFERENCE_KEY } from '~/i18n/preference';
import { interviewerCatalogSource } from '~/locales/catalogs';

import { announceLoadingScreen, removeLoadingScreen } from '../loadingScreen';

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

describe('pre-React localized loading announcement', () => {
  beforeEach(() => {
    localStorage.removeItem(LOCALE_PREFERENCE_KEY);
  });
  afterEach(() => {
    localStorage.removeItem(LOCALE_PREFERENCE_KEY);
  });

  function mountAnnouncement() {
    const message = document.createElement('span');
    message.id = 'app-loading__message';
    message.textContent = 'Network Canvas Interviewer';
    mountLoader().appendChild(message);
    return message;
  }

  it('uses the persisted device language before asynchronous app startup', async () => {
    const message = mountAnnouncement();
    localStorage.setItem(LOCALE_PREFERENCE_KEY, 'es');
    vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['en-US']);
    announceLoadingScreen();
    expect(document.documentElement.lang).toBe('es');
    expect(document.documentElement.dir).toBe('ltr');
    // Never English under a Spanish `lang`, even while the catalog loads.
    expect(message.textContent).not.toBe('Loading…');
    await expect.poll(() => message.textContent).toBe('Cargando…');
  });

  it('ignores a malformed stored preference and negotiates the browser language', async () => {
    const message = mountAnnouncement();
    localStorage.setItem(LOCALE_PREFERENCE_KEY, 'invalid_locale');
    vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['es-MX']);
    announceLoadingScreen();
    expect(document.documentElement.lang).toBe('es');
    await expect.poll(() => message.textContent).toBe('Cargando…');
  });

  it('announces English at once, with no catalog to wait for', () => {
    const message = mountAnnouncement();
    vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['en-US']);
    announceLoadingScreen();
    expect(message.textContent).toBe('Loading…');
    expect(document.documentElement.lang).toBe('en');
  });

  it('keeps the product name when the catalog cannot load', async () => {
    const message = mountAnnouncement();
    localStorage.setItem(LOCALE_PREFERENCE_KEY, 'fr');
    const load = vi
      .spyOn(interviewerCatalogSource, 'load')
      .mockRejectedValue(new Error('offline'));
    announceLoadingScreen();
    expect(document.documentElement.lang).toBe('fr');
    // Settles after the announcement's own handler, which was attached first.
    await load.mock.results[0]?.value.catch(() => {});
    expect(message.textContent).toBe('Network Canvas Interviewer');
  });
});

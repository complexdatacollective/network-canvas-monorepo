import { commonMessages } from '@codaco/app-i18n/common';
import type { CatalogMessages } from '@codaco/app-i18n/locales';
import { createAppIntl } from '@codaco/app-i18n/messages';

import { interviewerProductionLocales } from '../../i18n/locales';
import { startupLocale } from '../../i18n/preference';
import { interviewerCatalogSource } from '../../locales/catalogs';

// The static shell is labelled with the product name until JavaScript is
// available. Announce its state in the same negotiated language as React,
// before the asynchronous startup update check can delay mounting the app.
//
// The document's language and direction are set at once. The message waits
// for its catalog rather than holding up startup for it, and keeps the
// product name until then, so a non-English device never sees English
// "Loading…" under its own `lang`; if the catalog cannot load, the product
// name stays and main.tsx's startup handles the failure.
export function announceLoadingScreen(): void {
  const message = document.getElementById('app-loading__message');
  if (!message) return;
  const locale = startupLocale();
  document.documentElement.lang = locale;
  document.documentElement.dir =
    interviewerProductionLocales.find((entry) => entry.locale === locale)
      ?.direction ?? 'ltr';
  const announce = (messages: CatalogMessages) => {
    const intl = createAppIntl({ locale, messages });
    message.textContent = intl.formatMessage(commonMessages.loading);
  };
  // English, and a locale already loaded, need not wait a turn.
  const loaded = interviewerCatalogSource.peek(locale);
  if (loaded !== undefined) {
    announce(loaded);
    return;
  }
  void interviewerCatalogSource.load(locale).then(announce, () => {});
}

// Fades out and removes the pre-React loading screen (the static branded
// spinner injected in index.html's <head>, shown before the JS bundle parses
// and React mounts). Called by LoadingScreenHandoff once React's first screen
// has committed.
//
// The element being absent is normal (HMR remounts, or a race where the loader
// was already removed) — the helper no-ops in that case rather than throwing.

// Matches the CSS opacity transition on #app-loading in index.html.
const FADE_DURATION_MS = 250;

const LOADING_SCREEN_ID = 'app-loading';

// Kept in sync with the reduced-motion `transition: none` rule in index.html:
// when motion is reduced we skip the fade and remove synchronously so the
// loader can't linger over the app.
function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

// Fades the loading screen out (CSS opacity transition on the `is-hidden`
// class) then removes it from the DOM. Returns immediately if no loader is
// present. Idempotent: the `is-hidden` guard means a second call while a fade
// is already in flight does nothing.
export function removeLoadingScreen(): void {
  if (typeof document === 'undefined') return;

  const loader = document.getElementById(LOADING_SCREEN_ID);
  if (!loader) return;

  // Already fading (or faded) — don't restart the timer / double-remove.
  if (loader.classList.contains('is-hidden')) return;

  const remove = () => {
    loader.remove();
  };

  if (prefersReducedMotion()) {
    remove();
    return;
  }

  // Toggling the class drives the opacity → 0 transition declared in
  // index.html; we remove the node once it has finished so it stops
  // intercepting pointer events and is gone from the accessibility tree.
  loader.classList.add('is-hidden');

  let removed = false;
  const removeOnce = () => {
    if (removed) return;
    removed = true;
    remove();
  };

  loader.addEventListener('transitionend', removeOnce, { once: true });
  // Fallback in case the transition never fires (e.g. the element is display-
  // hidden, or transitionend is dropped on a background tab).
  window.setTimeout(removeOnce, FADE_DURATION_MS + 50);
}

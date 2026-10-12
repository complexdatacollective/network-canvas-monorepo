import { useEffect } from 'react';

// Matches the boot loader's opacity transition in index.html (400ms), plus a
// buffer for the removal fallback below.
const BOOT_LOADER_FADE_MS = 400;

// Fade out and remove the inline boot loader (defined in index.html).
const dismissBootLoader = () => {
  const loader = document.getElementById('boot-loader');
  // Idempotent: it's scheduled from both a rAF (paint-aligned) and a timer
  // backstop, so bail if it's already gone or already fading.
  if (!loader || loader.classList.contains('boot-loader--hidden')) return;

  const prefersReducedMotion = window.matchMedia(
    '(prefers-reduced-motion: reduce)',
  ).matches;

  if (prefersReducedMotion) {
    loader.remove();
    return;
  }

  // Remove on transitionend for a tight hand-off, but also on a timeout so
  // the loader can never linger if the transition is interrupted or never
  // fires (e.g. the tab is backgrounded during the fade, which suspends
  // transitions).
  const remove = () => loader.remove();
  loader.addEventListener('transitionend', remove, { once: true });
  setTimeout(remove, BOOT_LOADER_FADE_MS + 100);
  loader.classList.add('boot-loader--hidden');
};

// Rendered beside the app at the root, so its effect runs only once the first
// screen has committed: a first render that suspends (the startup catalog
// still loading) commits nothing, and the loader stays up until it does. Two
// nested rAFs then wait for that commit to paint, so the fade begins over real
// app content, not a blank root.
export default function BootLoaderHandoff() {
  useEffect(() => {
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(dismissBootLoader);
    });
    // rAF is suspended while a tab is backgrounded, so a tab opened in the
    // background would keep the loader until it's focused. The timer still
    // fires there.
    const backstop = setTimeout(dismissBootLoader, BOOT_LOADER_FADE_MS + 100);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(backstop);
    };
  }, []);
  return null;
}

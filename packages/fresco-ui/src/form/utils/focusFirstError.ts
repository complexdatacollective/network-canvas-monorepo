import { scrollParent } from '../../utils/scrollParent';
import type { FlattenedErrors } from '../store/types';

export const focusFirstError = (errors: FlattenedErrors | null) => {
  // Todo: first item is an assumption that may not be valid. Should iterate and check
  // vertical position to ensure it is actually the "first" in page order (topmost).
  if (!errors) return;

  // Get the first field with errors
  const fieldNames = Object.keys(errors.fieldErrors);
  if (fieldNames.length === 0) return;

  const firstFieldName = fieldNames[0];
  const container: HTMLElement | null = document.querySelector(
    `[data-field-name="${firstFieldName}"]`,
  );

  // If element is not found, prevent crash.
  if (!container) {
    // eslint-disable-next-line no-console
    console.warn(
      `focusFirstError(): Element [data-field-name="${firstFieldName}"] not found in DOM`,
    );
    return;
  }

  const scroller = scrollParent(container) as unknown as HTMLElement;
  const scrollStart = scroller.scrollTop;
  const scrollerOffset = Number.parseInt(
    scroller.getBoundingClientRect().top.toString(),
    10,
  );
  const destinationOffset = Number.parseInt(
    container.getBoundingClientRect().top.toString(),
    10,
  );

  // Subtract 200 to put more of the input in view.
  const scrollEnd = destinationOffset + scrollStart - scrollerOffset - 200;
  scroller.scrollTo({ top: scrollEnd, behavior: 'smooth' });

  // Find the focusable form control within the field container
  const focusableElement = container.querySelector<HTMLElement>(
    'input, textarea, select, [tabindex]:not([tabindex="-1"])',
  );

  if (!focusableElement) return;

  // Focus after smooth scroll completes. Using preventScroll avoids the
  // browser snap-scrolling the element into view and interrupting the
  // smooth animation.
  //
  // The deferred focus is skipped if focus has moved since invocation:
  // by the time it fires the user may have clicked into another control,
  // and yanking focus back to a stale error field is hostile (and made
  // e2e snapshots nondeterministic — chromium scrolls a date input's
  // segment selection into view even with preventScroll).
  const initiallyActive = document.activeElement;
  const focusTarget = () => {
    if (document.activeElement !== initiallyActive) return;
    focusableElement.focus({ preventScroll: true });
  };

  // Use scrollend event when supported, with a timeout fallback for when
  // scrollend doesn't fire (already at target, or unsupported browser).
  // Whichever path runs first cancels the other.
  const cleanup = new AbortController();

  const fallback = setTimeout(() => {
    cleanup.abort();
    focusTarget();
  }, 800);

  scroller.addEventListener(
    'scrollend',
    () => {
      clearTimeout(fallback);
      focusTarget();
    },
    { once: true, signal: cleanup.signal },
  );
};

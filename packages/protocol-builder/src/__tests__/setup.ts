import '@testing-library/jest-dom/vitest';

/**
 * jsdom implements neither scroll API, and neither `ResizeObserver`. A missing
 * shim surfaces as an unhandled error rather than a readable failure, so they
 * are stubbed here rather than guarded for at every call site:
 *
 * - `scrollTo` is what Fresco's failed-submit focus handling reaches for.
 * - `scrollIntoView` is what the section outline uses to bring a section into
 *   view after moving focus to it.
 * - `ResizeObserver` is observed by Fresco's scroll areas.
 * - `IntersectionObserver` is reached for by Motion's in-view features, which
 *   the form-level error alert mounts. Without it the alert throws while
 *   mounting and React tears the whole editor down, so a test asserting on an
 *   error message finds an empty page instead.
 */
Element.prototype.scrollTo ??= () => undefined;
Element.prototype.scrollIntoView ??= () => undefined;

class ResizeObserverStub implements ResizeObserver {
  observe() {
    // Nothing in this package reacts to a measured size, so reporting one
    // would only invite a test to depend on a number jsdom cannot supply.
  }
  unobserve() {}
  disconnect() {}
}

class IntersectionObserverStub implements IntersectionObserver {
  readonly root = null;
  readonly rootMargin = '';
  readonly scrollMargin = '';
  readonly thresholds: readonly number[] = [];
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
}

globalThis.ResizeObserver ??= ResizeObserverStub;
globalThis.IntersectionObserver ??= IntersectionObserverStub;

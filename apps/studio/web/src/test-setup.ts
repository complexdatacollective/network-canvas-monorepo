import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// jsdom has no IntersectionObserver; motion (via fresco-ui) constructs one.
class IntersectionObserverStub {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
  takeRecords = vi.fn(() => []);
  root = null;
  rootMargin = '';
  thresholds = [];
}
vi.stubGlobal('IntersectionObserver', IntersectionObserverStub);

// Dialog content uses Fresco's scroll area, which observes its viewport and
// children. jsdom does not implement ResizeObserver.
class ResizeObserverStub {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}
vi.stubGlobal('ResizeObserver', ResizeObserverStub);

// jsdom implements neither element nor window smooth scrolling; the form
// system scrolls to the first invalid field on submit.
Object.defineProperty(Element.prototype, 'scrollTo', {
  value: vi.fn(),
  configurable: true,
  writable: true,
});

// jsdom has no layout, so it implements no scrolling at all — and this one is
// called from an EFFECT, not an event handler: the everything bar keeps its
// highlighted row in view as results arrive. An effect that throws unmounts the
// React tree, so without this the dialog silently vanishes mid-test and every
// assertion after it reads a detached DOM.
Object.defineProperty(Element.prototype, 'scrollIntoView', {
  value: vi.fn(),
  configurable: true,
  writable: true,
});

afterEach(() => {
  cleanup();
});

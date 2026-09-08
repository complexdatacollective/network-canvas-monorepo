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
globalThis.IntersectionObserver =
  IntersectionObserverStub as unknown as typeof IntersectionObserver;

// Dialog content uses Fresco's scroll area, which observes its viewport and
// children. jsdom does not implement ResizeObserver.
class ResizeObserverStub {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}
globalThis.ResizeObserver =
  ResizeObserverStub as unknown as typeof ResizeObserver;

// jsdom implements neither element nor window smooth scrolling; the form
// system scrolls to the first invalid field on submit.
Element.prototype.scrollTo =
  vi.fn() as unknown as typeof Element.prototype.scrollTo;

// jsdom has no layout, so it implements no scrolling at all — and this one is
// called from an EFFECT, not an event handler: the everything bar keeps its
// highlighted row in view as results arrive. An effect that throws unmounts the
// React tree, so without this the dialog silently vanishes mid-test and every
// assertion after it reads a detached DOM.
Element.prototype.scrollIntoView =
  vi.fn() as unknown as typeof Element.prototype.scrollIntoView;

afterEach(() => {
  cleanup();
});

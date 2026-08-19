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

// jsdom implements neither element nor window smooth scrolling; the form
// system scrolls to the first invalid field on submit.
Element.prototype.scrollTo =
  vi.fn() as unknown as typeof Element.prototype.scrollTo;

afterEach(() => {
  cleanup();
});

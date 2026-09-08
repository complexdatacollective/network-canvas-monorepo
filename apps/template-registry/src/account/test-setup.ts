import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// Same missing jsdom layout APIs as the Studio/Fresco form and dialog fixtures.
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
class ResizeObserverStub {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}
globalThis.ResizeObserver =
  ResizeObserverStub as unknown as typeof ResizeObserver;
Element.prototype.scrollTo =
  vi.fn() as unknown as typeof Element.prototype.scrollTo;
Element.prototype.scrollIntoView =
  vi.fn() as unknown as typeof Element.prototype.scrollIntoView;
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

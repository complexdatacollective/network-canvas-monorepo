import '@testing-library/jest-dom';

// Setup file for vitest tests
// Mock window.devicePixelRatio for canvas tests
if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'devicePixelRatio', {
    writable: true,
    configurable: true,
    value: 1,
  });

  class MockResizeObserver implements ResizeObserver {
    observe = () => undefined;
    unobserve = () => undefined;
    disconnect = () => undefined;
  }

  Object.defineProperty(window, 'ResizeObserver', {
    writable: true,
    configurable: true,
    value: MockResizeObserver,
  });

  Object.defineProperty(globalThis, 'ResizeObserver', {
    writable: true,
    configurable: true,
    value: MockResizeObserver,
  });

  window.requestAnimationFrame = (callback) =>
    window.setTimeout(() => callback(performance.now()), 16);
  window.cancelAnimationFrame = (handle) => window.clearTimeout(handle);

  Object.defineProperty(globalThis, 'requestAnimationFrame', {
    writable: true,
    configurable: true,
    value: window.requestAnimationFrame,
  });

  Object.defineProperty(globalThis, 'cancelAnimationFrame', {
    writable: true,
    configurable: true,
    value: window.cancelAnimationFrame,
  });
}

// Vitest setup for @codaco/fresco-ui.
//
// Motion and Base UI animations are disabled by the shared setup registered in
// `vitest.config.ts`. The shims here are package-specific jsdom polyfills plus
// an Intl.DateTimeFormat pinning.

// jest-dom matchers (toBeInTheDocument, toHaveTextContent, etc.).
import '@testing-library/jest-dom/vitest';

// Motion's viewport features use IntersectionObserver, which jsdom does not
// implement. Keep observation inert unless an individual test supplies a
// behavior-specific observer.
class IntersectionObserverMock implements IntersectionObserver {
  readonly root = null;
  readonly rootMargin = '0px';
  readonly scrollMargin = '0px';
  readonly thresholds = [0];

  disconnect() {}

  observe() {}

  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }

  unobserve() {}
}

global.IntersectionObserver = IntersectionObserverMock;

// ---------------------------------------------------------------------------
// ResizeObserver mock
// ---------------------------------------------------------------------------
// jsdom does not implement ResizeObserver. The Collection subsystem (and any
// component that measures container width) needs the callback to fire with a
// non-zero width. We dedupe per-element globally and defer the callback via
// queueMicrotask to mimic the real API and avoid infinite render loops.

// Track elements globally to prevent duplicate callbacks
const globalObservedElements = new WeakSet<Element>();
// Track pending callbacks to allow cancellation
const pendingCallbacks = new WeakMap<Element, () => void>();

class ResizeObserverMock implements ResizeObserver {
  private callback: ResizeObserverCallback;
  private localObservedElements = new Set<Element>();

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
  }

  observe(target: Element) {
    this.localObservedElements.add(target);

    // Only fire callback once per element globally
    if (globalObservedElements.has(target)) {
      return;
    }
    globalObservedElements.add(target);

    // Use queueMicrotask to defer callback like real ResizeObserver
    // This allows React to complete its render cycle before we trigger state updates
    const callbackFn = () => {
      // Check if element was unobserved before callback fires
      if (!this.localObservedElements.has(target)) {
        return;
      }

      this.callback(
        [
          {
            target,
            contentRect: {
              width: 800,
              height: 600,
              x: 0,
              y: 0,
              top: 0,
              left: 0,
              bottom: 600,
              right: 800,
              toJSON: () => ({}),
            } as DOMRectReadOnly,
            borderBoxSize: [{ inlineSize: 800, blockSize: 600 }],
            contentBoxSize: [{ inlineSize: 800, blockSize: 600 }],
            devicePixelContentBoxSize: [{ inlineSize: 800, blockSize: 600 }],
          } as ResizeObserverEntry,
        ],
        this,
      );
    };

    pendingCallbacks.set(target, callbackFn);
    queueMicrotask(callbackFn);
  }

  unobserve(target: Element) {
    this.localObservedElements.delete(target);
    pendingCallbacks.delete(target);
  }

  disconnect() {
    for (const el of this.localObservedElements) {
      pendingCallbacks.delete(el);
    }
    this.localObservedElements.clear();
  }
}

global.ResizeObserver = ResizeObserverMock;

// ---------------------------------------------------------------------------
// Element.scrollTo polyfill
// ---------------------------------------------------------------------------
// jsdom doesn't implement Element.scrollTo — polyfill as a no-op so code
// that calls scrollTo after navigation/resets doesn't throw under tests.
if (typeof Element.prototype.scrollTo !== 'function') {
  Element.prototype.scrollTo = function scrollTo() {
    // no-op
  };
}

// ---------------------------------------------------------------------------
// Intl.DateTimeFormat — pin to en-US
// ---------------------------------------------------------------------------
// Pin the default locale for Intl.DateTimeFormat. Node's runtime default
// depends on the host's LANG/LC_ALL env vars, which makes any assertion
// against locale-formatted strings flaky across dev machines and CI. We
// subclass the original constructor and substitute 'en-US' when no locale
// is passed, so `new Intl.DateTimeFormat(undefined, …)` (our production call
// site) behaves as en-US under test while explicit locale arguments still
// work unchanged.
const OriginalDateTimeFormat = Intl.DateTimeFormat;
class PinnedDateTimeFormat extends OriginalDateTimeFormat {
  constructor(
    locales?: Intl.LocalesArgument,
    options?: Intl.DateTimeFormatOptions,
  ) {
    super(locales ?? 'en-US', options);
  }
}
// `Intl.DateTimeFormat`'s type includes a call-without-`new` signature that
// ES classes can't express, so a direct assignment would need an `as unknown
// as typeof Intl.DateTimeFormat` cast. `Object.defineProperty` accepts the
// value via PropertyDescriptor (typed `any`), letting the test substitute the
// constructor without a type assertion.
Object.defineProperty(Intl, 'DateTimeFormat', {
  value: PinnedDateTimeFormat,
  writable: true,
  configurable: true,
});

// ---------------------------------------------------------------------------
// HTMLElement.offsetWidth / offsetHeight polyfill
// ---------------------------------------------------------------------------
// jsdom doesn't compute layout, so offsetWidth/Height are always 0. Hooks
// like useCollectionSetup need an initial non-zero value synchronously
// (before ResizeObserver fires). 800×600 mirrors the ResizeObserver mock.
Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
  configurable: true,
  get() {
    return 800;
  },
});

Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
  configurable: true,
  get() {
    return 600;
  },
});

// ---------------------------------------------------------------------------
// Web Worker mock
// ---------------------------------------------------------------------------
// jsdom doesn't implement Web Workers. The minimal stub lets Comlink-wired
// code (e.g. collection's search worker) instantiate without throwing; the
// actual worker logic isn't exercised in unit tests.
class WorkerMock implements Worker {
  onmessage: ((this: Worker, ev: MessageEvent) => unknown) | null = null;
  onmessageerror: ((this: Worker, ev: MessageEvent) => unknown) | null = null;
  onerror: ((this: AbstractWorker, ev: ErrorEvent) => unknown) | null = null;

  postMessage() {
    // No-op - Comlink will handle the communication
  }

  terminate() {
    // No-op
  }

  addEventListener() {
    // No-op
  }

  removeEventListener() {
    // No-op
  }

  dispatchEvent(): boolean {
    return true;
  }
}

// `typeof Worker` includes a static `prototype: Worker`, so a direct
// assignment would need an `as unknown as typeof Worker` cast.
// `Object.defineProperty` accepts the value via PropertyDescriptor (typed
// `any`), letting the test substitute the constructor without a type
// assertion.
Object.defineProperty(global, 'Worker', {
  value: WorkerMock,
  writable: true,
  configurable: true,
});

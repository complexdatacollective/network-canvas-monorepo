import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// PBKDF2 at the production 600,000 iterations dominates unit-test time and,
// across parallel vitest workers, saturates CI cores so badly that even
// unrelated tests time out. The vault stores kdfIterations per record and
// unlocks with the stored value, so a tiny count exercises the identical
// WebCrypto path — wrap/unwrap round-trips and wrong-secret AES-KW integrity
// failures behave exactly the same. Only the constant is replaced; every
// function stays real. The production value itself remains pinned by
// cryptoRecords.test.ts against the unmocked module via vi.importActual.
vi.mock('~/lib/vault/crypto', async (importOriginal) => ({
  ...(await importOriginal<typeof import('~/lib/vault/crypto')>()),
  PBKDF2_ITERATIONS: 10,
}));

afterEach(() => {
  cleanup();
});

const testRect = {
  x: 0,
  y: 0,
  width: 800,
  height: 600,
  top: 0,
  left: 0,
  bottom: 600,
  right: 800,
  toJSON: () => ({}),
} as DOMRectReadOnly;

// jsdom has no observers; provide deterministic non-zero measurements for
// shared UI components that measure layout or animate when they enter view.
class ResizeObserverStub implements ResizeObserver {
  private observedElements = new Set<Element>();
  private callback: ResizeObserverCallback;

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
  }

  observe(target: Element) {
    this.observedElements.add(target);
    queueMicrotask(() => {
      if (!this.observedElements.has(target)) return;
      this.callback(
        [
          {
            target,
            contentRect: testRect,
            borderBoxSize: [{ inlineSize: 800, blockSize: 600 }],
            contentBoxSize: [{ inlineSize: 800, blockSize: 600 }],
            devicePixelContentBoxSize: [{ inlineSize: 800, blockSize: 600 }],
          } as ResizeObserverEntry,
        ],
        this,
      );
    });
  }

  unobserve(target: Element) {
    this.observedElements.delete(target);
  }

  disconnect() {
    this.observedElements.clear();
  }
}

class IntersectionObserverStub implements IntersectionObserver {
  readonly root: Element | Document | null = null;
  readonly rootMargin = '0px';
  readonly scrollMargin = '0px';
  readonly thresholds: ReadonlyArray<number> = [0];

  private observedElements = new Set<Element>();
  private callback: IntersectionObserverCallback;

  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback;
  }

  observe(target: Element) {
    this.observedElements.add(target);
    queueMicrotask(() => {
      if (!this.observedElements.has(target)) return;
      this.callback(
        [
          {
            boundingClientRect: testRect,
            intersectionRatio: 1,
            intersectionRect: testRect,
            isIntersecting: true,
            rootBounds: testRect,
            target,
            time: performance.now(),
          },
        ],
        this,
      );
    });
  }

  unobserve(target: Element) {
    this.observedElements.delete(target);
  }

  disconnect() {
    this.observedElements.clear();
  }

  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
}

class WorkerStub extends EventTarget implements Worker {
  onerror: ((this: AbstractWorker, ev: ErrorEvent) => unknown) | null = null;
  onmessage: ((this: Worker, ev: MessageEvent) => unknown) | null = null;
  onmessageerror: ((this: Worker, ev: MessageEvent) => unknown) | null = null;

  postMessage(
    _message: unknown,
    _options?: StructuredSerializeOptions | Transferable[],
  ) {
    // no-op
  }

  terminate() {
    // no-op
  }
}

globalThis.ResizeObserver ??= ResizeObserverStub;
globalThis.IntersectionObserver ??= IntersectionObserverStub;
globalThis.Worker ??= WorkerStub;

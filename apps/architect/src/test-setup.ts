import '@testing-library/jest-dom';
import { beforeEach, vi } from 'vitest';

import type { DialogContextType } from '@codaco/fresco-ui/dialogs/DialogProvider';

const dialogMocks = vi.hoisted(() => ({
  closeAllDialogs: vi.fn(),
  closeDialog: vi.fn(),
  confirm: vi.fn(),
  openDialog: vi.fn(),
}));

declare global {
  var __architectDialogMocks: typeof dialogMocks;
}

globalThis.__architectDialogMocks = dialogMocks;

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

vi.mock('@codaco/fresco-ui/dialogs/useDialog', () => ({
  default: () => dialogMocks,
}));

beforeEach(() => {
  dialogMocks.closeAllDialogs.mockReset();
  dialogMocks.closeDialog.mockReset();
  dialogMocks.closeDialog.mockResolvedValue(undefined);
  dialogMocks.openDialog.mockReset();
  dialogMocks.openDialog.mockResolvedValue(true);
  dialogMocks.confirm.mockReset();
  dialogMocks.confirm.mockImplementation(
    async (options: Parameters<DialogContextType['confirm']>[0]) => {
      await options.onConfirm(new AbortController().signal);
      return true;
    },
  );
});

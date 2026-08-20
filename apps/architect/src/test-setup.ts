import '@testing-library/jest-dom';
import { configure } from '@testing-library/react';
import { beforeEach, vi } from 'vitest';

/**
 * How long a `waitFor`/`findBy*` may poll before it gives up.
 *
 * Testing Library's default is 1000ms, which is generous on a developer
 * machine and marginal in CI: this suite is 274 files run in parallel
 * workers, so any one test can be starved for far longer than the work it is
 * actually waiting on takes. `NodePanels.identity` failed exactly that way in
 * August 2026 — its first assertion, that the section's toggle is on after
 * mount, timed out on a loaded runner and passed on an unchanged re-run. The
 * whole test takes ~156ms locally.
 *
 * This is not a sleep and does not make a wrong assertion pass: `waitFor`
 * polls a real condition and still fails when the condition never holds. The
 * only thing a larger budget costs is how long a genuinely broken test takes
 * to go red.
 */
configure({ asyncUtilTimeout: 5_000 });

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

// jsdom implements neither scroll API, and a missing shim surfaces as an
// unhandled error rather than a readable failure. `scrollTo` is what
// fresco-ui's default onSubmitInvalid (focusFirstError) reaches for when a
// submit is blocked; `scrollIntoView` is for everything else that scrolls a
// selection into view (VariableSpotlight, the new-stage screens, useWizardState).
Element.prototype.scrollTo ??= () => undefined;
Element.prototype.scrollIntoView ??= () => undefined;

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

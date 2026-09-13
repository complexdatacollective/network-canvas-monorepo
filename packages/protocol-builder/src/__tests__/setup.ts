import '@testing-library/jest-dom/vitest';

/**
 * The contract's transport tests declare the node environment — jsdom's
 * `FormData` is invisible to Node's `Response`, so a staged file's multipart
 * body never survives the encode — and there is nothing to stub there.
 */
if (typeof window !== 'undefined') {
  stubBrowserAPIsJsdomLacks();
}

/**
 * jsdom implements neither scroll API, and neither `ResizeObserver`. A missing
 * shim surfaces as an unhandled error rather than a readable failure, so they
 * are stubbed here rather than guarded for at every call site:
 *
 * - `scrollTo` is what Fresco's failed-submit focus handling reaches for.
 * - `scrollIntoView` is what `focusStageSection` uses to bring a section into
 *   view after moving focus to it.
 * - `ResizeObserver` is observed by Fresco's scroll areas.
 * - `IntersectionObserver` is reached for by Motion's in-view features, which
 *   the form-level error alert mounts. Without it the alert throws while
 *   mounting and React tears the whole editor down, so a test asserting on an
 *   error message finds an empty page instead.
 * - `Worker` is what every fresco-ui `Collection` builds for its search index,
 *   filtering or not, and the attribute picker's window renders one.
 */
function stubBrowserAPIsJsdomLacks(): void {
  Element.prototype.scrollTo ??= () => undefined;
  Element.prototype.scrollIntoView ??= () => undefined;

  /**
   * Where a range is on screen, which jsdom does not answer for a `Range` at
   * all.
   *
   * The rich-text editor asks after every document change, to keep the caret in
   * view. Without an answer the question throws out of the editor's own
   * transaction, so a test that types a prompt watches the keystrokes land in
   * the DOM and the field's value never change — a failure that looks like the
   * field being broken rather than like a missing shim.
   *
   * Answered by borrowing the element measurement jsdom does implement, which
   * reports zeros because jsdom lays nothing out. Nothing here reads the
   * numbers; what matters is that asking succeeds.
   */
  Range.prototype.getClientRects ??= () => document.body.getClientRects();
  Range.prototype.getBoundingClientRect ??= () =>
    document.body.getBoundingClientRect();

  /**
   * What is under a point, which jsdom cannot know for the same reason. The
   * editor asks while deciding whether a pointer gesture landed inside it;
   * nothing is, and saying so is a truthful answer in a document with no
   * layout.
   */
  document.elementFromPoint ??= () => null;

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

  /**
   * A worker that never answers, for the one fresco-ui `Collection` builds
   * whether or not anything filters through it.
   *
   * jsdom has no `Worker` at all, so the collection's search worker throws
   * while mounting and takes the whole attribute window down with it. Nothing
   * in this package asks the worker anything: the attribute picker filters its
   * own list in place, with no debounce, because that is what the spotlight's
   * behaviour is specified as. So a stub that accepts a message and says
   * nothing back is the truthful shim — a search this package never performs
   * never returns.
   */
  class WorkerStub implements Worker {
    onmessage = null;
    onmessageerror = null;
    onerror = null;
    postMessage() {}
    terminate() {}
    addEventListener() {}
    removeEventListener() {}
    dispatchEvent() {
      return true;
    }
  }

  globalThis.ResizeObserver ??= ResizeObserverStub;
  globalThis.IntersectionObserver ??= IntersectionObserverStub;
  globalThis.Worker ??= WorkerStub;
}

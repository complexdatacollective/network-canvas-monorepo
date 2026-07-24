import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { useScrolledToBottom } from '../useScrolledToBottom';

type IOCallback = IntersectionObserverCallback;

let latestObserverInstances: MockIntersectionObserver[];

class MockIntersectionObserver {
  callback: IOCallback;
  observeSpy = vi.fn();
  disconnectSpy = vi.fn();
  root: Element | Document | null;

  constructor(cb: IOCallback, options?: IntersectionObserverInit) {
    this.callback = cb;
    this.root = (options?.root as Element | Document | null) ?? null;
    latestObserverInstances.push(this);
  }

  observe(target: Element) {
    this.observeSpy(target);
  }

  unobserve() {
    // no-op: required by IntersectionObserver interface
  }

  disconnect() {
    this.disconnectSpy();
  }
}

function latest() {
  return latestObserverInstances[latestObserverInstances.length - 1] ?? null;
}

let latestResizeObservers: MockResizeObserver[] = [];

class MockResizeObserver {
  callback: ResizeObserverCallback;
  observed: Element[] = [];
  disconnectSpy = vi.fn();
  constructor(cb: ResizeObserverCallback) {
    this.callback = cb;
    latestResizeObservers.push(this);
  }
  observe(target: Element) {
    this.observed.push(target);
  }
  unobserve() {
    // no-op: required by ResizeObserver interface
  }
  disconnect() {
    this.disconnectSpy();
  }
}

function makeScrollRoot(dims: {
  scrollTop: number;
  clientHeight: number;
  scrollHeight: number;
}) {
  const el = document.createElement('div');
  Object.defineProperty(el, 'scrollTop', {
    value: dims.scrollTop,
    writable: true,
    configurable: true,
  });
  Object.defineProperty(el, 'clientHeight', {
    value: dims.clientHeight,
    configurable: true,
  });
  Object.defineProperty(el, 'scrollHeight', {
    value: dims.scrollHeight,
    configurable: true,
  });
  return el;
}

describe('useScrolledToBottom', () => {
  afterEach(() => {
    latestObserverInstances = [];
    latestResizeObservers = [];
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  test('returns false initially', () => {
    vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);

    const { result } = renderHook(() => useScrolledToBottom());

    expect(result.current.hasScrolledToBottom).toBe(false);
  });

  test('observes sentinel when callback ref is attached', () => {
    vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);

    const { result } = renderHook(() => useScrolledToBottom());

    const sentinelEl = document.createElement('div');
    act(() => {
      result.current.sentinelRef(sentinelEl);
    });

    expect(latest()?.observeSpy).toHaveBeenCalledWith(sentinelEl);
  });

  test('returns true when sentinel becomes visible', () => {
    vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);

    const { result } = renderHook(() => useScrolledToBottom());

    const sentinelEl = document.createElement('div');
    act(() => {
      result.current.sentinelRef(sentinelEl);
    });

    act(() => {
      latest()?.callback(
        [{ isIntersecting: true }] as IntersectionObserverEntry[],
        latest() as unknown as IntersectionObserver,
      );
    });

    expect(result.current.hasScrolledToBottom).toBe(true);
  });

  test('stays true when sentinel leaves viewport after being visible', () => {
    vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);

    const { result } = renderHook(() => useScrolledToBottom());

    const sentinelEl = document.createElement('div');
    act(() => {
      result.current.sentinelRef(sentinelEl);
    });

    act(() => {
      latest()?.callback(
        [{ isIntersecting: true }] as IntersectionObserverEntry[],
        latest() as unknown as IntersectionObserver,
      );
    });
    expect(result.current.hasScrolledToBottom).toBe(true);

    act(() => {
      latest()?.callback(
        [{ isIntersecting: false }] as IntersectionObserverEntry[],
        latest() as unknown as IntersectionObserver,
      );
    });
    expect(result.current.hasScrolledToBottom).toBe(true);
  });

  test('disconnects old observer when sentinel changes', () => {
    vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);

    const { result } = renderHook(() => useScrolledToBottom());

    const firstEl = document.createElement('div');
    act(() => {
      result.current.sentinelRef(firstEl);
    });

    const firstObserver = latest();

    const secondEl = document.createElement('div');
    act(() => {
      result.current.sentinelRef(secondEl);
    });

    expect(firstObserver?.disconnectSpy).toHaveBeenCalled();
    expect(latest()?.observeSpy).toHaveBeenCalledWith(secondEl);
  });

  test('disconnects observer on unmount', () => {
    vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);

    const { result, unmount } = renderHook(() => useScrolledToBottom());

    const sentinelEl = document.createElement('div');
    act(() => {
      result.current.sentinelRef(sentinelEl);
    });

    const observer = latest();
    unmount();
    expect(observer?.disconnectSpy).toHaveBeenCalled();
  });

  test('resets to false when sentinel detaches (null)', () => {
    vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);

    const { result } = renderHook(() => useScrolledToBottom());

    const sentinelEl = document.createElement('div');
    act(() => {
      result.current.sentinelRef(sentinelEl);
    });

    act(() => {
      latest()?.callback(
        [{ isIntersecting: true }] as IntersectionObserverEntry[],
        latest() as unknown as IntersectionObserver,
      );
    });
    expect(result.current.hasScrolledToBottom).toBe(true);

    act(() => {
      result.current.sentinelRef(null);
    });
    expect(result.current.hasScrolledToBottom).toBe(false);
  });

  test('latches true when scrolled to the exact bottom even if the sentinel edge never reports intersecting', () => {
    vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);
    vi.stubGlobal('ResizeObserver', MockResizeObserver);

    // Container scrolled to the maximum: scrollTop + clientHeight === scrollHeight.
    // A zero-height sentinel sits on the exact bottom edge, which some browsers
    // (Firefox) never report as intersecting — the hook must still latch true.
    const root = makeScrollRoot({
      scrollTop: 1211,
      clientHeight: 720,
      scrollHeight: 1931,
    });
    const rootRef = { current: root };

    const { result } = renderHook(() => useScrolledToBottom(rootRef));
    act(() => {
      result.current.sentinelRef(document.createElement('div'));
    });

    // No intersecting entry was ever delivered.
    expect(result.current.hasScrolledToBottom).toBe(true);
  });

  test('latches true immediately when content does not overflow', () => {
    vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);
    vi.stubGlobal('ResizeObserver', MockResizeObserver);

    const root = makeScrollRoot({
      scrollTop: 0,
      clientHeight: 720,
      scrollHeight: 500,
    });
    const rootRef = { current: root };

    const { result } = renderHook(() => useScrolledToBottom(rootRef));
    act(() => {
      result.current.sentinelRef(document.createElement('div'));
    });

    expect(result.current.hasScrolledToBottom).toBe(true);
  });

  test('stays false until scrolled to the bottom, then latches on the scroll event', () => {
    vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);
    vi.stubGlobal('ResizeObserver', MockResizeObserver);

    const root = makeScrollRoot({
      scrollTop: 0,
      clientHeight: 720,
      scrollHeight: 1931,
    });
    const rootRef = { current: root };

    const { result } = renderHook(() => useScrolledToBottom(rootRef));
    act(() => {
      result.current.sentinelRef(document.createElement('div'));
    });
    expect(result.current.hasScrolledToBottom).toBe(false);

    act(() => {
      root.scrollTop = 1211;
      root.dispatchEvent(new Event('scroll'));
    });
    expect(result.current.hasScrolledToBottom).toBe(true);
  });

  test('observes the scroll container and its content so resize re-measures', () => {
    vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);
    vi.stubGlobal('ResizeObserver', MockResizeObserver);

    const root = makeScrollRoot({
      scrollTop: 0,
      clientHeight: 720,
      scrollHeight: 1931,
    });
    const content = document.createElement('div');
    root.appendChild(content);

    renderHook(() => useScrolledToBottom({ current: root }));

    const ro = latestResizeObservers.at(-1);
    expect(ro?.observed).toContain(root);
    expect(ro?.observed).toContain(content);
  });

  test('removes the scroll listener and disconnects the observer on unmount', () => {
    vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);
    vi.stubGlobal('ResizeObserver', MockResizeObserver);

    const root = makeScrollRoot({
      scrollTop: 0,
      clientHeight: 720,
      scrollHeight: 1931,
    });
    const removeSpy = vi.spyOn(root, 'removeEventListener');

    const { unmount } = renderHook(() =>
      useScrolledToBottom({ current: root }),
    );
    unmount();

    expect(removeSpy).toHaveBeenCalledWith('scroll', expect.any(Function));
    expect(latestResizeObservers.at(-1)?.disconnectSpy).toHaveBeenCalled();
  });

  test('latches at the 1px slack boundary but stays false 2px short', () => {
    vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);
    vi.stubGlobal('ResizeObserver', MockResizeObserver);

    // scrollTop + clientHeight === scrollHeight - 1 → within slack → latches.
    const atSlack = makeScrollRoot({
      scrollTop: 279,
      clientHeight: 720,
      scrollHeight: 1000,
    });
    const a = renderHook(() => useScrolledToBottom({ current: atSlack }));
    expect(a.result.current.hasScrolledToBottom).toBe(true);

    // 2px short → beyond slack → stays false.
    const short = makeScrollRoot({
      scrollTop: 278,
      clientHeight: 720,
      scrollHeight: 1000,
    });
    const b = renderHook(() => useScrolledToBottom({ current: short }));
    expect(b.result.current.hasScrolledToBottom).toBe(false);
  });
});

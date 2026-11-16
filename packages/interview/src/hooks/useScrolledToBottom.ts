'use client';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';

/**
 * Tracks whether a scroll container has ever been scrolled to (or already sits
 * at) its bottom. Once reached, the state latches to true and does not revert
 * when the user scrolls away again.
 *
 * Returns a callback ref to attach to a sentinel element at the bottom of the
 * content, plus a boolean. Pass the scroll container via `rootRef`.
 *
 * "At the bottom" is derived by measuring scroll position directly
 * (`scrollTop + clientHeight >= scrollHeight`) on the container, not from the
 * sentinel's IntersectionObserver: a zero-height sentinel resting at the exact
 * bottom edge is not reliably reported as intersecting across browsers (notably
 * Firefox), and whether it lands on the exact pixel edge depends on sub-pixel
 * layout (font size, zoom). The measurement latches true both when the content
 * is scrolled to the bottom and when it does not overflow at all.
 *
 * The measurement and the IntersectionObserver both live in effects, not in
 * the sentinel callback ref, because refs attach child-first: the container
 * ref is still null while the sentinel callback runs, and an observer built
 * there would watch the viewport instead of the container. The measurement
 * re-runs on the container's `scroll`, on container resize, and on content
 * resize (so a content-height change that leaves the user at the bottom
 * without a scroll — e.g. an error message clearing — is still caught). The
 * IntersectionObserver is kept as a secondary signal, and re-measures on its
 * non-intersecting callbacks; it is the sole signal when no `rootRef` is
 * provided. The sentinel callback resets the latch when the sentinel
 * detaches, so a fresh DOM instance (e.g. a new slide) starts false.
 *
 * While `paused`, nothing is measured and the state stays as it is: the
 * content may not be laid out at its full height yet (a card still resizing
 * towards it), and a measurement then could latch on content that only
 * seemed to fit. It is measured afresh once unpaused.
 */
export function useScrolledToBottom(
  rootRef?: React.RefObject<HTMLElement | null>,
  { paused = false }: { paused?: boolean } = {},
) {
  const [hasScrolledToBottom, setHasScrolledToBottom] = useState(false);

  // Read through a ref, so that pausing does not replace the sentinel
  // callback, which would detach the sentinel and reset the state.
  const pausedRef = useRef(paused);
  useLayoutEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  // Reads rootRef.current lazily, when one of the observers below reports.
  // 1px of slack absorbs sub-pixel scroll rounding.
  const checkAtBottom = useCallback(() => {
    if (pausedRef.current) return;
    const root = rootRef?.current;
    if (root && root.scrollTop + root.clientHeight >= root.scrollHeight - 1) {
      setHasScrolledToBottom(true);
    }
  }, [rootRef]);

  // The sentinel is held as state so the observer is built in an effect, once
  // the container's ref has been attached too.
  const [sentinel, setSentinel] = useState<HTMLDivElement | null>(null);
  const sentinelRef = useCallback((node: HTMLDivElement | null) => {
    setSentinel(node);
    if (!node) setHasScrolledToBottom(false);
  }, []);

  useEffect(() => {
    if (!sentinel) return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        if (pausedRef.current) return;
        if (entries[0]?.isIntersecting) {
          setHasScrolledToBottom(true);
        } else {
          // The sentinel moved (content reflow) but the exact edge may not
          // register as intersecting — fall back to the direct measurement.
          checkAtBottom();
        }
      },
      { root: rootRef?.current ?? null },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [sentinel, rootRef, checkAtBottom]);

  useEffect(() => {
    const root = rootRef?.current;
    if (!root || paused) return undefined;

    checkAtBottom();
    root.addEventListener('scroll', checkAtBottom, { passive: true });

    const resizeObserver = new ResizeObserver(checkAtBottom);
    resizeObserver.observe(root);
    // Observe the content too: `root`'s own border-box is flex-imposed and
    // constant, so it never fires when the content height alone changes.
    const content = root.firstElementChild;
    if (content) resizeObserver.observe(content);

    return () => {
      root.removeEventListener('scroll', checkAtBottom);
      resizeObserver.disconnect();
    };
  }, [rootRef, checkAtBottom, paused]);

  return { hasScrolledToBottom, sentinelRef };
}

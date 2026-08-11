'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

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
 * The measurement lives in an effect (not the sentinel callback ref) because
 * refs attach child-first: the container ref is still null while the sentinel
 * callback runs. It re-measures on the container's `scroll`, on container
 * resize, and on content resize (so a content-height change that leaves the
 * user at the bottom without a scroll — e.g. an error message clearing — is
 * still caught). The IntersectionObserver is kept as a secondary signal, and
 * re-measures on its non-intersecting callbacks; it is the sole signal when no
 * `rootRef` is provided. The sentinel callback resets the latch when the
 * sentinel detaches, so a fresh DOM instance (e.g. a new slide) starts false.
 */
export function useScrolledToBottom(
  rootRef?: React.RefObject<HTMLElement | null>,
) {
  const [hasScrolledToBottom, setHasScrolledToBottom] = useState(false);
  const observerRef = useRef<IntersectionObserver | null>(null);

  // Reads rootRef.current lazily: it is null while the child-first sentinel
  // callback runs, but populated by the time any of these callbacks fire.
  // 1px of slack absorbs sub-pixel scroll rounding.
  const checkAtBottom = useCallback(() => {
    const root = rootRef?.current;
    if (root && root.scrollTop + root.clientHeight >= root.scrollHeight - 1) {
      setHasScrolledToBottom(true);
    }
  }, [rootRef]);

  const sentinelRef = useCallback(
    (node: HTMLDivElement | null) => {
      observerRef.current?.disconnect();
      observerRef.current = null;

      if (!node) {
        setHasScrolledToBottom(false);
        return;
      }

      const observer = new IntersectionObserver(
        (entries) => {
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
      observer.observe(node);
      observerRef.current = observer;
    },
    [rootRef, checkAtBottom],
  );

  useEffect(() => {
    const root = rootRef?.current;
    if (!root) return undefined;

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
  }, [rootRef, checkAtBottom]);

  useEffect(() => {
    return () => {
      observerRef.current?.disconnect();
    };
  }, []);

  return { hasScrolledToBottom, sentinelRef };
}

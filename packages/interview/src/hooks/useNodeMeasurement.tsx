'use client';

import {
  type ReactElement,
  type ReactNode,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

type NodeMeasurement = {
  nodeWidth: number;
  nodeHeight: number;
  /**
   * Hidden React node that renders the measurement component off-screen.
   * The caller MUST render this somewhere inside the subtree whose sizing
   * context it wants to measure — the measured component inherits its CSS
   * cascade from where it sits in the DOM (see note below), so it must
   * live under the same themed/scaled region as the real items. The hook
   * measures it with a `ResizeObserver`.
   */
  measurementContainer: ReactNode;
};

/**
 * Measure the natural width and height of a React element off-screen,
 * for use in layouts that need to know an item's size before computing
 * positions (e.g. `<PedigreeLayout>`).
 *
 * The measurement element is rendered INLINE (not portaled to
 * `document.body`) so it inherits the CSS cascade — crucially
 * `--theme-root-size` — from wherever the caller places it. Network
 * Canvas node sizes derive from `--theme-root-size` (via Tailwind's
 * `--spacing-base`), and the interview Shell ramps that variable with
 * viewport width. A measurement portaled to `document.body` escapes the
 * Shell's scope and resolves the base `1rem`, so it under-measures the
 * nodes that actually render larger inside the Shell — breaking the
 * layout at larger breakpoints. Rendering inline keeps the measured node
 * in the same scaled context as the rendered nodes.
 *
 * `position: fixed` off-screen plus `visibility: hidden` keep it out of
 * flow and invisible without affecting the caller's layout or scroll size.
 */
export function useNodeMeasurement({
  component,
}: {
  component: ReactElement;
}): NodeMeasurement {
  const [dimensions, setDimensions] = useState({ nodeWidth: 0, nodeHeight: 0 });
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    const applyDimensions = (width: number, height: number) => {
      setDimensions((prev) => {
        if (prev.nodeWidth === width && prev.nodeHeight === height) {
          return prev;
        }
        return { nodeWidth: width, nodeHeight: height };
      });
    };

    // Initial synchronous measurement via getBoundingClientRect so the
    // caller gets a non-zero size on the first render after mount.
    const initialRect = wrapper.getBoundingClientRect();
    applyDimensions(initialRect.width, initialRect.height);

    // Keep in sync with later size changes (e.g. font load, CSS variable
    // updates). Reads from `entry.contentRect` — the single-source-of-truth
    // exposed by the observer — so this works both in real DOM and under
    // jsdom with mocked ResizeObserver.
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      applyDimensions(entry.contentRect.width, entry.contentRect.height);
    });
    observer.observe(wrapper);

    return () => observer.disconnect();
  }, []);

  const measurementContainer = useMemo(
    () => (
      <div
        ref={wrapperRef}
        aria-hidden="true"
        style={{
          position: 'fixed',
          top: -9999,
          left: -9999,
          visibility: 'hidden',
          pointerEvents: 'none',
          display: 'inline-block',
        }}
      >
        {component}
      </div>
    ),
    [component],
  );

  return {
    nodeWidth: dimensions.nodeWidth,
    nodeHeight: dimensions.nodeHeight,
    measurementContainer,
  };
}

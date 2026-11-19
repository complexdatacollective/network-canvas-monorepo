'use client';

import { type ReactNode, useLayoutEffect, useRef } from 'react';

import { NETWORK_WEAVE_HEIGHT, NETWORK_WEAVE_WIDTH } from './networkWeaveScene';

/**
 * Lays the flow signals out in the scene's own units and stretches them to
 * the background's size, as the SVG beside them is stretched.
 *
 * The signals are HTML elements rather than SVG shapes so that every browser
 * can move them on its compositor, without repainting. HTML has no `viewBox`,
 * so the stretch is a scale, measured from the stage's own box. Until it has
 * been measured the signals stay hidden: a signal drawn at the wrong scale
 * would sit off its ribbon.
 */
export default function NetworkWeaveSignalStage({
  children,
}: {
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const stage = ref.current;
    if (!stage) return undefined;

    const measure = () => {
      const { clientWidth, clientHeight } = stage;
      if (clientWidth <= 0 || clientHeight <= 0) return;
      stage.style.setProperty(
        '--network-weave-scale-x',
        String(clientWidth / NETWORK_WEAVE_WIDTH),
      );
      stage.style.setProperty(
        '--network-weave-scale-y',
        String(clientHeight / NETWORK_WEAVE_HEIGHT),
      );
      stage.dataset.measured = '';
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className="network-weave__signals"
      style={{ position: 'absolute', inset: 0 }}
    >
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: NETWORK_WEAVE_WIDTH,
          height: NETWORK_WEAVE_HEIGHT,
          transformOrigin: '0 0',
          transform:
            'scale(var(--network-weave-scale-x, 1), var(--network-weave-scale-y, 1))',
        }}
      >
        {children}
      </div>
    </div>
  );
}

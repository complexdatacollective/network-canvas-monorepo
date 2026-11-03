import { useEffect, useRef } from 'react';

import {
  isPageActive,
  subscribeToPageActivity,
} from '@codaco/fresco-ui/pageActivity';

const resizeCanvas = (
  context: CanvasRenderingContext2D,
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
) => {
  if (!canvasRef?.current) {
    return false;
  }

  const currentCanvas = canvasRef.current;

  const { width, height } = currentCanvas.getBoundingClientRect();
  const { devicePixelRatio: ratio } = window;

  if (
    currentCanvas.width !== width * ratio ||
    currentCanvas.height !== height * ratio
  ) {
    currentCanvas.width = width * ratio;
    currentCanvas.height = height * ratio;
    context.scale(ratio, ratio);
    return true;
  }

  return false;
};

type DrawFunction = (
  ctx: CanvasRenderingContext2D,
  time: number,
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
) => void;

const defaultPredraw: DrawFunction = (context: CanvasRenderingContext2D) => {
  context.save();
  const { width, height } = context.canvas;
  context.clearRect(0, 0, width, height);
};

const defaultPostdraw: DrawFunction = (context: CanvasRenderingContext2D) => {
  context.restore();
};

const useCanvas = (
  draw: DrawFunction,
  predraw = defaultPredraw,
  postdraw = defaultPostdraw,
) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // The canvas animates only while the page is in front of the user; the last
  // frame stays on screen otherwise. `draw` sees a clock that starts at the
  // first frame and stands still while the loop is stopped, so the blobs carry
  // on from where they were instead of jumping ahead by the time away. It
  // lives outside the effect so that a re-run of the effect continues it.
  const clockRef = useRef<{ offset: number; stoppedAt: number } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;

    if (!canvas) {
      return undefined;
    }

    const context = canvas.getContext('2d');

    if (!context) {
      return undefined;
    }

    const now = performance.now();
    clockRef.current ??= { offset: now, stoppedAt: now };
    const clock = clockRef.current;

    let requestAnimationId: number | null = null;

    const paint = (ctx: CanvasRenderingContext2D, time: number) => {
      resizeCanvas(context, canvasRef);
      predraw(ctx, time, canvasRef);
      draw(ctx, time, canvasRef);
      postdraw(ctx, time, canvasRef);
    };

    const render = (ctx: CanvasRenderingContext2D, time: number) => {
      paint(ctx, time - clock.offset);
      requestAnimationId = requestAnimationFrame((t) => render(ctx, t));
    };

    const start = () => {
      if (requestAnimationId !== null) return;
      clock.offset += performance.now() - clock.stoppedAt;
      requestAnimationId = requestAnimationFrame((t) => render(context, t));
    };
    const stop = () => {
      if (requestAnimationId === null) return;
      cancelAnimationFrame(requestAnimationId);
      requestAnimationId = null;
      clock.stoppedAt = performance.now();
    };

    paint(context, clock.stoppedAt - clock.offset);
    if (isPageActive()) start();
    const unsubscribe = subscribeToPageActivity((active) => {
      if (active) start();
      else stop();
    });

    return () => {
      unsubscribe();
      stop();
    };
  });

  return canvasRef;
};

export default useCanvas;

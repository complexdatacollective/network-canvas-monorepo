'use client';

import { useEffect, useRef } from 'react';

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

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return undefined;
    }

    const context = canvas.getContext('2d');
    if (!context) {
      return undefined;
    }

    // Setting canvas.width/height resets the context transform, so we must
    // re-apply the DPR scale every time we resize the backing store.
    const syncSize = (cssWidth: number, cssHeight: number) => {
      const ratio = window.devicePixelRatio || 1;
      const targetWidth = Math.round(cssWidth * ratio);
      const targetHeight = Math.round(cssHeight * ratio);
      if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
        canvas.width = targetWidth;
        canvas.height = targetHeight;
        context.scale(ratio, ratio);
      }
    };

    const initialRect = canvas.getBoundingClientRect();
    syncSize(initialRect.width, initialRect.height);

    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) {
        return;
      }

      let cssWidth: number;
      let cssHeight: number;
      if (entry.contentBoxSize) {
        const box = Array.isArray(entry.contentBoxSize)
          ? entry.contentBoxSize[0]
          : entry.contentBoxSize;
        cssWidth = box.inlineSize;
        cssHeight = box.blockSize;
      } else {
        cssWidth = entry.contentRect.width;
        cssHeight = entry.contentRect.height;
      }
      syncSize(cssWidth, cssHeight);
    });
    resizeObserver.observe(canvas);

    let requestAnimationId: number | null = null;

    const render = (time: number) => {
      predraw(context, time, canvasRef);
      draw(context, time, canvasRef);
      postdraw(context, time, canvasRef);
      requestAnimationId = requestAnimationFrame(render);
    };

    requestAnimationId = requestAnimationFrame(render);

    return () => {
      if (requestAnimationId !== null) {
        cancelAnimationFrame(requestAnimationId);
      }
      resizeObserver.disconnect();
    };
  });

  return canvasRef;
};

export default useCanvas;

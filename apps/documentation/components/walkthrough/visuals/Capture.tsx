'use client';

import { useEffect, useId, useRef } from 'react';

import {
  BrowserWindow,
  browserContent,
} from '@codaco/art/illustration/BrowserWindow';
import { usePrefersReducedMotion } from '@codaco/fresco-ui/reducedMotion';

import { GroundShadow } from '../scenes/parts';
import type { Visual } from '../types';
import { screenFrame } from './screenFrame';

type CaptureVisual = Extract<Visual, { kind: 'capture' }>;

// The clip's bottom corners follow the window's rounded outline.
const RADIUS = 23;

const percent = (part: number, whole: number) => `${(part / whole) * 100}%`;

// A recording of the product inside the illustrated browser window. It plays
// once and rests on its last frame; the player's Replay remounts it and its
// Pause button sets `paused`. With reduced motion the last frame is shown as
// a still.
export default function Capture({
  visual,
  paused,
  onEnded,
}: {
  visual: CaptureVisual;
  paused: boolean;
  onEnded: () => void;
}) {
  const id = useId().replace(/[^\w-]/g, '');
  const reduced = usePrefersReducedMotion() === true;
  const video = useRef<HTMLVideoElement>(null);
  const { frame, viewWidth, viewHeight, fit } = screenFrame(
    visual.width,
    visual.height,
  );
  const content = browserContent(frame);
  const width = content.right - content.x;
  const height = content.bottom - content.y;
  const screen = {
    left: percent(content.x, viewWidth),
    top: percent(content.y, viewHeight),
    width: percent(width, viewWidth),
    height: percent(height, viewHeight),
    borderRadius: `0 0 ${percent(RADIUS, width)} ${percent(RADIUS, width)} / 0 0 ${percent(RADIUS, height)} ${percent(RADIUS, height)}`,
  };

  useEffect(() => {
    const element = video.current;
    if (!element) return;
    if (paused) {
      element.pause();
    } else if (element.paused) {
      if (element.ended) element.currentTime = 0;
      void element.play();
    }
  }, [paused]);

  return (
    <div className="@container-size grid size-full place-items-center">
      <div className="relative" style={fit}>
        <svg
          viewBox={`0 0 ${viewWidth} ${viewHeight}`}
          className="font-heading block h-auto w-full overflow-visible"
          aria-hidden
        >
          <GroundShadow
            cx={frame.x + frame.width / 2}
            cy={frame.y + frame.height + 16}
            rx={frame.width / 2}
          />
          <BrowserWindow
            frame={frame}
            url={visual.url}
            clipId={`${id}-window`}
            urlWidth={380}
          />
        </svg>
        {reduced ? (
          <img
            src={`${visual.src}.jpg`}
            alt={visual.alt}
            className="absolute object-cover"
            style={screen}
          />
        ) : (
          <video
            ref={video}
            autoPlay
            muted
            playsInline
            preload="auto"
            aria-label={visual.alt}
            onEnded={onEnded}
            className="absolute object-cover"
            style={screen}
          >
            <source src={`${visual.src}.webm`} type="video/webm" />
            <source src={`${visual.src}.mp4`} type="video/mp4" />
          </video>
        )}
      </div>
    </div>
  );
}

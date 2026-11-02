'use client';

import { useId } from 'react';

import { AppTile } from '@codaco/art/illustration/AppTile';
import {
  BrowserWindow,
  browserContent,
} from '@codaco/art/illustration/BrowserWindow';
import {
  backOut,
  grow,
  segment,
  TAU,
  useIllustrationClock,
} from '@codaco/art/illustration/motion';

import { GroundShadow, pivot } from './parts';
import { AppWindow, appContent, OrMark } from './rosterParts';

// Architect in a browser tab beside Architect Classic's desktop window.
const BROWSER = { x: 90, y: 60, width: 480, height: 320 } as const;
const DESKTOP = { x: 670, y: 80, width: 440, height: 300 } as const;
const END = 2;

const windows = [
  {
    frame: BROWSER,
    content: browserContent(BROWSER),
    icon: '/images/architect-icon.png',
    label: 'Architect',
    at: 0,
  },
  {
    frame: DESKTOP,
    content: appContent(DESKTOP),
    icon: '/images/architect-classic-icon.png',
    label: 'Architect Classic',
    at: 0.3,
  },
] as const;

export function ArchitectVersionsScene() {
  const { ref, time } = useIllustrationClock(END, { from: 0 });
  const id = useId().replace(/[^\w-]/g, '');
  const t = time;
  const or = backOut(segment(t, 1, 0.4));

  return (
    <svg
      ref={ref}
      viewBox="0 0 1200 460"
      className="font-heading block h-auto max-h-full w-full overflow-visible"
      aria-hidden
    >
      {windows.map(({ frame, content, icon, label, at }, index) => {
        const bob = Math.sin((TAU * t) / 2.7 + index) * 3;
        const win = backOut(segment(t, at, 0.5));
        const tile = backOut(segment(t, at + 0.4, 0.5));
        const midX = (content.x + content.right) / 2;
        const midY = (content.y + content.bottom) / 2;
        const body = (
          <>
            <rect
              x={content.x}
              y={content.y}
              width={content.right - content.x}
              height={content.bottom - content.y}
              className="fill-navy-taupe/5"
            />
            <g
              transform={`translate(${midX} ${midY - 22}) scale(${grow(tile)})`}
            >
              <AppTile href={icon} size={104} clipId={`${id}-tile-${index}`} />
            </g>
            <text
              x={midX}
              y={midY + 72}
              textAnchor="middle"
              fontSize={24}
              fontWeight={900}
              className="fill-navy-taupe"
              opacity={segment(t, at + 0.6, 0.3)}
            >
              {label}
            </text>
          </>
        );
        return (
          <g key={label}>
            <GroundShadow
              cx={frame.x + frame.width / 2}
              cy={420}
              rx={frame.width / 2}
            />
            <g
              transform={`translate(0 ${bob}) ${pivot(frame.x + frame.width / 2, frame.y + frame.height / 2, win)}`}
            >
              {index === 0 ? (
                <BrowserWindow
                  frame={frame}
                  url="architect.networkcanvas.com"
                  clipId={`${id}-window-${index}`}
                  urlWidth={270}
                >
                  {body}
                </BrowserWindow>
              ) : (
                <AppWindow
                  frame={frame}
                  title="Architect Classic"
                  clipId={`${id}-window-${index}`}
                >
                  {body}
                </AppWindow>
              )}
            </g>
          </g>
        );
      })}
      <OrMark x={(BROWSER.x + BROWSER.width + DESKTOP.x) / 2} y={230} k={or} />
    </svg>
  );
}

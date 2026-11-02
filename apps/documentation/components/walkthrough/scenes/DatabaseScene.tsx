'use client';

import { useId } from 'react';

import { AppTile } from '@codaco/art/illustration/AppTile';
import {
  BrowserWindow,
  browserContent,
} from '@codaco/art/illustration/BrowserWindow';
import { DottedPath } from '@codaco/art/illustration/DottedPath';
import {
  backOut,
  grow,
  segment,
  TAU,
  useIllustrationClock,
} from '@codaco/art/illustration/motion';

import { DatabaseStack, GroundShadow, link, Particles } from './parts';

// Fresco sends its study data along a link; a Neon database stacks up a disc
// for each batch that arrives.
const WINDOW = { x: 80, y: 90, width: 420, height: 280 } as const;
const CONTENT = browserContent(WINDOW);
const DB: readonly [number, number] = [880, 330];
const BATCHES = [0.7, 1.4, 2.1] as const;
const TRAVEL = 0.7;
const LABEL_AT = 2.9;
const END = 3.4;

export function DatabaseScene() {
  const { ref, time } = useIllustrationClock(END, { from: 0 });
  const id = useId().replace(/[^\w-]/g, '');
  const t = time;
  const windowIn = backOut(segment(t, 0, 0.5));
  const bob = Math.sin((TAU * t) / 2.7) * 3;
  const path = link([WINDOW.x + WINDOW.width + 14, 230], [DB[0] - 110, 230]);
  const levels = BATCHES.map((start, index) =>
    index === 0
      ? backOut(segment(t, 0.3, 0.5))
      : backOut(segment(t, start + TRAVEL - 0.05, 0.45)),
  );
  const label = backOut(segment(t, LABEL_AT, 0.4));
  const midX = (CONTENT.x + CONTENT.right) / 2;
  const midY = (CONTENT.y + CONTENT.bottom) / 2;

  return (
    <svg
      ref={ref}
      viewBox="0 0 1200 460"
      className="font-heading block h-auto max-h-full w-full overflow-visible"
      aria-hidden
    >
      <GroundShadow
        cx={WINDOW.x + WINDOW.width / 2}
        cy={410}
        rx={WINDOW.width / 2}
      />
      <GroundShadow cx={DB[0]} cy={410} rx={120} />
      <g opacity={segment(t, 0.4, 0.3)}>
        <DottedPath d={path.d} time={time} />
      </g>
      {BATCHES.map((start) => (
        <Particles
          key={start}
          path={path}
          since={t - start}
          duration={TRAVEL}
          fill="fill-sea-green"
        />
      ))}
      <g
        transform={`translate(${WINDOW.x + WINDOW.width / 2} ${WINDOW.y + WINDOW.height / 2 + bob}) scale(${grow(windowIn)}) translate(${-WINDOW.x - WINDOW.width / 2} ${-WINDOW.y - WINDOW.height / 2})`}
      >
        <BrowserWindow
          frame={WINDOW}
          url="your-study.netlify.app"
          clipId={`${id}-window`}
          urlWidth={250}
        >
          <rect
            x={CONTENT.x}
            y={CONTENT.y}
            width={CONTENT.right - CONTENT.x}
            height={CONTENT.bottom - CONTENT.y}
            className="fill-navy-taupe/5"
          />
          <g transform={`translate(${midX} ${midY})`}>
            <AppTile
              href="/assets/walkthroughs/fresco-icon.png"
              size={96}
              clipId={`${id}-fresco`}
            />
          </g>
        </BrowserWindow>
      </g>
      <g transform={`translate(0 ${bob})`}>
        <DatabaseStack x={DB[0]} y={DB[1]} levels={levels} />
      </g>
      <g
        transform={`translate(${DB[0]} ${DB[1] + 56 + bob}) scale(${grow(label)})`}
      >
        <rect
          x={-48}
          y={-19}
          width={96}
          height={38}
          rx={19}
          className="stroke-navy-taupe fill-white"
          strokeWidth={4}
        />
        <text
          y={6.5}
          textAnchor="middle"
          fontSize={18}
          fontWeight={900}
          className="fill-navy-taupe"
        >
          Neon
        </text>
      </g>
    </svg>
  );
}

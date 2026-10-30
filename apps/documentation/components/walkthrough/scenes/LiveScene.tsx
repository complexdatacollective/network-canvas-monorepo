'use client';

import { useId } from 'react';

import { AppTile } from '@codaco/art/illustration/AppTile';
import { Badge } from '@codaco/art/illustration/Badge';
import {
  BrowserWindow,
  browserContent,
} from '@codaco/art/illustration/BrowserWindow';
import { Confetti } from '@codaco/art/illustration/Confetti';
import {
  backOut,
  grow,
  segment,
  TAU,
  useIllustrationClock,
} from '@codaco/art/illustration/motion';

import { GroundShadow } from './parts';

// The reader's Fresco dashboard fills in, then a burst of confetti and a LIVE
// stamp.
const WINDOW = { x: 300, y: 50, width: 600, height: 340 } as const;
const CONTENT = browserContent(WINDOW);
const ROWS_AT = 0.5;
const BURST_AT = 1.6;
const BADGE_AT = 1.8;
const END = 4.2;

const rows = [
  ['fill-sea-green', 120],
  ['fill-mustard', 90],
  ['fill-neon-coral', 140],
  ['fill-cerulean-blue', 100],
] as const;

export function LiveScene() {
  const { ref, time } = useIllustrationClock(END, { from: 0 });
  const id = useId().replace(/[^\w-]/g, '');
  const t = time;
  const bob = Math.sin((TAU * t) / 2.7) * 3;
  const win = backOut(segment(t, 0, 0.5));
  const badge = backOut(segment(t, BADGE_AT, 0.5));
  const side = CONTENT.x + 130;

  return (
    <svg
      ref={ref}
      viewBox="0 0 1200 460"
      className="font-heading block h-auto max-h-full w-full overflow-visible"
      aria-hidden
    >
      <GroundShadow
        cx={WINDOW.x + WINDOW.width / 2}
        cy={420}
        rx={WINDOW.width / 2}
      />
      <g
        transform={`translate(${WINDOW.x + WINDOW.width / 2} ${WINDOW.y + WINDOW.height / 2 + bob}) scale(${grow(win)}) translate(${-WINDOW.x - WINDOW.width / 2} ${-WINDOW.y - WINDOW.height / 2})`}
      >
        <BrowserWindow
          frame={WINDOW}
          url="your-study.netlify.app/dashboard"
          clipId={`${id}-window`}
        >
          <rect
            x={CONTENT.x}
            y={CONTENT.y}
            width={side - CONTENT.x}
            height={CONTENT.bottom - CONTENT.y}
            className="fill-navy-taupe/8"
          />
          <g transform={`translate(${CONTENT.x + 64} ${CONTENT.y + 52})`}>
            <AppTile
              href="/assets/walkthroughs/fresco-icon.png"
              size={56}
              clipId={`${id}-fresco`}
            />
          </g>
          {[0, 1, 2].map((index) => (
            <line
              key={index}
              x1={CONTENT.x + 28}
              y1={CONTENT.y + 116 + index * 30}
              x2={CONTENT.x + (index === 0 ? 104 : 88)}
              y2={CONTENT.y + 116 + index * 30}
              className={
                index === 0 ? 'stroke-purple-pizazz/60' : 'stroke-navy-taupe/20'
              }
              strokeWidth={8}
              strokeLinecap="round"
            />
          ))}
          <line
            x1={side + 30}
            y1={CONTENT.y + 40}
            x2={side + 210}
            y2={CONTENT.y + 40}
            className="stroke-navy-taupe/30"
            strokeWidth={12}
            strokeLinecap="round"
          />
          {rows.map(([fill, width], index) => {
            const k = backOut(segment(t, ROWS_AT + index * 0.15, 0.4));
            const y = CONTENT.y + 90 + index * 48;
            return (
              <g
                key={fill}
                transform={`translate(${(1 - k) * 30} 0)`}
                opacity={Math.min(1, k)}
              >
                <rect
                  x={side + 24}
                  y={y - 18}
                  width={CONTENT.right - side - 48}
                  height={36}
                  rx={12}
                  className="fill-navy-taupe/5"
                />
                <circle cx={side + 50} cy={y} r={9} className={fill} />
                <line
                  x1={side + 72}
                  y1={y}
                  x2={side + 72 + width}
                  y2={y}
                  className="stroke-navy-taupe/25"
                  strokeWidth={8}
                  strokeLinecap="round"
                />
                <line
                  x1={CONTENT.right - 110}
                  y1={y}
                  x2={CONTENT.right - 50}
                  y2={y}
                  className="stroke-sea-green/60"
                  strokeWidth={8}
                  strokeLinecap="round"
                />
              </g>
            );
          })}
        </BrowserWindow>
      </g>
      <Confetti
        since={t - BURST_AT}
        origin={[WINDOW.x + WINDOW.width / 2, WINDOW.y + 40]}
        floor={430}
      />
      <g
        transform={`translate(${WINDOW.x + WINDOW.width - 6} ${WINDOW.y + 6}) rotate(${-12 + Math.sin((TAU * t) / 2.7) * 4}) scale(${grow(badge)})`}
      >
        <Badge r={50} fill="fill-sea-green">
          <text
            y={11}
            textAnchor="middle"
            fontSize={30}
            fontWeight={900}
            className="fill-white"
          >
            LIVE
          </text>
        </Badge>
      </g>
    </svg>
  );
}

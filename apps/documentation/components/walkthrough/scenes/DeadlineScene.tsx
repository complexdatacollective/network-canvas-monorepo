'use client';

import { useId } from 'react';

import { Badge } from '@codaco/art/illustration/Badge';
import {
  BrowserWindow,
  browserContent,
} from '@codaco/art/illustration/BrowserWindow';
import {
  backOut,
  grow,
  outline,
  segment,
  TAU,
  useIllustrationClock,
} from '@codaco/art/illustration/motion';
import { cx } from '@codaco/fresco-ui/utils/cva';

import { ClockFace, GroundShadow, smooth } from './parts';

// Fresco's setup opens; a clock beside it sweeps out the two hours the reader
// has to finish it.
const WINDOW = { x: 90, y: 80, width: 520, height: 300 } as const;
const CONTENT = browserContent(WINDOW);
const CLOCK: readonly [number, number] = [860, 220];
const SWEEP_AT = 0.7;
const SWEEP = 1.6;
const BADGE_AT = 2.4;
const END = 3.1;

const steps = [
  'Create account',
  'Configure storage',
  'Upload protocol',
  'Documentation',
];

export function DeadlineScene() {
  const { ref, time } = useIllustrationClock(END, { from: 0 });
  const id = useId().replace(/[^\w-]/g, '');
  const t = time;
  const bob = Math.sin((TAU * t) / 2.7) * 3;
  const win = backOut(segment(t, 0, 0.5));
  const clock = backOut(segment(t, 0.3, 0.5));
  const sweep = smooth(segment(t, SWEEP_AT, SWEEP));
  const badge = backOut(segment(t, BADGE_AT, 0.5));
  // A clock wedge cannot show two hours, so it sweeps the hour hand's arc:
  // two twelfths of the face.
  const hourMinutes = 10;

  return (
    <svg
      ref={ref}
      viewBox="0 0 1200 460"
      className="font-heading block h-auto max-h-full w-full overflow-visible"
      aria-hidden
    >
      <GroundShadow
        cx={WINDOW.x + WINDOW.width / 2}
        cy={415}
        rx={WINDOW.width / 2}
      />
      <GroundShadow cx={CLOCK[0]} cy={415} rx={140} />
      <g
        transform={`translate(${WINDOW.x + WINDOW.width / 2} ${WINDOW.y + WINDOW.height / 2 + bob}) scale(${grow(win)}) translate(${-WINDOW.x - WINDOW.width / 2} ${-WINDOW.y - WINDOW.height / 2})`}
      >
        <BrowserWindow
          frame={WINDOW}
          url="your-study.netlify.app/setup"
          clipId={`${id}-window`}
          urlWidth={300}
        >
          <rect
            x={CONTENT.x}
            y={CONTENT.y}
            width={CONTENT.right - CONTENT.x}
            height={CONTENT.bottom - CONTENT.y}
            className="fill-navy-taupe"
          />
          {steps.map((step, index) => {
            const k = backOut(segment(t, 0.4 + index * 0.12, 0.4));
            const y = CONTENT.y + 50 + index * 52;
            return (
              <g
                key={step}
                transform={`translate(${(1 - k) * -24} 0)`}
                opacity={Math.min(1, k)}
              >
                <circle
                  cx={CONTENT.x + 50}
                  cy={y}
                  r={14}
                  className={cx(
                    index === 0 ? 'fill-neon-coral' : 'fill-white/25',
                    index === 0 && outline,
                  )}
                  strokeWidth={3}
                />
                <text
                  x={CONTENT.x + 78}
                  y={y + 6}
                  fontSize={17}
                  fontWeight={900}
                  letterSpacing={1.5}
                  className="fill-white"
                >
                  {step.toUpperCase()}
                </text>
              </g>
            );
          })}
        </BrowserWindow>
      </g>
      <g
        transform={`translate(${CLOCK[0]} ${CLOCK[1] + bob}) scale(${grow(clock)}) translate(${-CLOCK[0]} ${-CLOCK[1]})`}
      >
        <ClockFace
          x={CLOCK[0]}
          y={CLOCK[1]}
          r={140}
          minutes={hourMinutes}
          k={sweep}
          wedge="fill-neon-coral/50"
        />
      </g>
      <g
        transform={`translate(${CLOCK[0] + 120} ${CLOCK[1] - 120 + bob}) rotate(${-12 + Math.sin((TAU * t) / 2.7) * 4}) scale(${grow(badge)})`}
      >
        <Badge r={54} fill="fill-neon-coral">
          <text
            y={4}
            textAnchor="middle"
            fontSize={40}
            fontWeight={900}
            className="fill-white"
          >
            2
          </text>
          <text
            y={28}
            textAnchor="middle"
            fontSize={14}
            fontWeight={900}
            letterSpacing={2}
            className="fill-white"
          >
            HOURS
          </text>
        </Badge>
      </g>
    </svg>
  );
}

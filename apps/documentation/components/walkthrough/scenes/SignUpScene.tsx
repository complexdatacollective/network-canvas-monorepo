'use client';

import { useId } from 'react';

import {
  BrowserWindow,
  browserContent,
} from '@codaco/art/illustration/BrowserWindow';
import {
  backOut,
  outline,
  segment,
  TAU,
  useIllustrationClock,
} from '@codaco/art/illustration/motion';
import { cx } from '@codaco/fresco-ui/utils/cva';

import {
  CheckStamp,
  Click,
  GroundShadow,
  pivot,
  smooth,
  TextBar,
  type Point,
} from './parts';

// GitHub's sign-up form fills in one field at a time, then the cursor clicks
// Create account.
const FRAME = { x: 330, y: 40, width: 540, height: 360 } as const;
const CONTENT = browserContent(FRAME);
const FIELDS = ['Email', 'Password', 'Username'] as const;
const TYPE_AT = 0.6;
const TYPE = 0.45;
const CLICK_AT = 2.4;
const STAMP_AT = 2.8;
const END = 3.4;

const FIELD_X = CONTENT.x + 150;
const FIELD_WIDTH = 300;
const fieldY = (index: number) => CONTENT.y + 40 + index * 66;
const BUTTON = {
  x: CONTENT.x + 150,
  y: fieldY(3) + 4,
  width: 220,
  height: 48,
} as const;
const TARGET: Point = [BUTTON.x + 120, BUTTON.y + 26];

export function SignUpScene() {
  const { ref, time } = useIllustrationClock(END, { from: 0 });
  const id = useId().replace(/[^\w-]/g, '');
  const t = time;
  const bob = Math.sin((TAU * t) / 2.7) * 3;
  const win = backOut(segment(t, 0, 0.5));
  const pressed =
    segment(t, CLICK_AT, 0.1) * (1 - segment(t, CLICK_AT + 0.2, 0.2));

  return (
    <svg
      ref={ref}
      viewBox="0 0 1200 460"
      className="font-heading block h-auto max-h-full w-full overflow-visible"
      aria-hidden
    >
      <GroundShadow
        cx={FRAME.x + FRAME.width / 2}
        cy={420}
        rx={FRAME.width / 2}
      />
      <g
        transform={`translate(0 ${bob}) ${pivot(FRAME.x + FRAME.width / 2, FRAME.y + FRAME.height / 2, win)}`}
      >
        <BrowserWindow
          frame={FRAME}
          url="github.com/signup"
          clipId={`${id}-window`}
          urlWidth={240}
        >
          {FIELDS.map((label, index) => {
            const y = fieldY(index);
            const typed = smooth(segment(t, TYPE_AT + index * TYPE, TYPE));
            return (
              <g key={label}>
                <text
                  x={FIELD_X - 20}
                  y={y + 31}
                  textAnchor="end"
                  fontSize={18}
                  fontWeight={900}
                  className="fill-navy-taupe"
                >
                  {label}
                </text>
                <rect
                  x={FIELD_X}
                  y={y}
                  width={FIELD_WIDTH}
                  height={48}
                  rx={12}
                  className={cx(
                    typed > 0 && typed < 1 ? 'fill-mustard/20' : 'fill-white',
                    outline,
                  )}
                  strokeWidth={4}
                />
                {typed > 0 ? (
                  <TextBar
                    x={FIELD_X + 20}
                    y={y + 24}
                    width={Math.max(1, typed * (index === 1 ? 120 : 200))}
                    className={
                      index === 1
                        ? 'stroke-navy-taupe/60'
                        : 'stroke-navy-taupe/30'
                    }
                  />
                ) : null}
              </g>
            );
          })}
          <g transform={`translate(0 ${pressed * 3})`}>
            <rect
              {...BUTTON}
              rx={24}
              className={cx('fill-sea-green', outline)}
              strokeWidth={4}
            />
            <text
              x={BUTTON.x + BUTTON.width / 2}
              y={BUTTON.y + 31}
              textAnchor="middle"
              fontSize={19}
              fontWeight={900}
              className="fill-white"
            >
              Create account
            </text>
          </g>
          <Click
            t={t}
            from={[CONTENT.right - 40, CONTENT.y + 60]}
            to={TARGET}
            at={CLICK_AT}
            leave={CLICK_AT + 0.4}
            glide={0.7}
          />
        </BrowserWindow>
      </g>
      <CheckStamp
        x={FRAME.x + FRAME.width - 30}
        y={FRAME.y + 40 + bob}
        k={backOut(segment(t, STAMP_AT, 0.5))}
        t={t}
      />
    </svg>
  );
}

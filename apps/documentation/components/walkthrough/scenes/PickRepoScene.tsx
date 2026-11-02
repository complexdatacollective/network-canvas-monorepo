'use client';

import { BookMarked, Search } from 'lucide-react';
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
  Icon,
  pivot,
  TextBar,
  type Point,
} from './parts';

// Netlify lists the reader's GitHub projects; the cursor picks their copy of
// Fresco out of the list.
const FRAME = { x: 300, y: 40, width: 600, height: 360 } as const;
const CONTENT = browserContent(FRAME);
const repos = ['old-project', 'your-study', 'notes', 'website'] as const;
const PICK = 1;
const CLICK_AT = 1.7;
const STAMP_AT = 2.3;
const END = 3;

const rowY = (index: number) => CONTENT.y + 96 + index * 50;
const TARGET: Point = [CONTENT.x + 220, rowY(PICK) + 4];

export function PickRepoScene() {
  const { ref, time } = useIllustrationClock(END, { from: 0 });
  const id = useId().replace(/[^\w-]/g, '');
  const t = time;
  const bob = Math.sin((TAU * t) / 2.7) * 3;
  const win = backOut(segment(t, 0, 0.5));
  const picked = segment(t, CLICK_AT, 0.2);

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
          url="app.netlify.com/start"
          clipId={`${id}-window`}
          urlWidth={240}
        >
          <rect
            x={CONTENT.x + 30}
            y={CONTENT.y + 22}
            width={CONTENT.right - CONTENT.x - 60}
            height={44}
            rx={22}
            className={cx('fill-white', outline)}
            strokeWidth={4}
          />
          <Icon icon={Search} x={CONTENT.x + 58} y={CONTENT.y + 44} size={22} />
          <TextBar
            x={CONTENT.x + 82}
            y={CONTENT.y + 44}
            width={140}
            className="stroke-navy-taupe/12"
          />
          {repos.map((name, index) => {
            const k = backOut(segment(t, 0.4 + index * 0.12, 0.4));
            const y = rowY(index);
            const chosen = index === PICK;
            return (
              <g
                key={name}
                transform={`translate(${(1 - k) * -20} 0)`}
                opacity={Math.min(1, k)}
              >
                {chosen ? (
                  <rect
                    x={CONTENT.x + 30}
                    y={y - 20}
                    width={CONTENT.right - CONTENT.x - 60}
                    height={44}
                    rx={14}
                    className="fill-cerulean-blue"
                    opacity={0.25 * picked}
                  />
                ) : null}
                <Icon
                  icon={BookMarked}
                  x={CONTENT.x + 58}
                  y={y + 2}
                  size={22}
                />
                <text
                  x={CONTENT.x + 82}
                  y={y + 9}
                  fontSize={20}
                  fontWeight={chosen ? 900 : 700}
                  className={chosen ? 'fill-navy-taupe' : 'fill-navy-taupe/50'}
                >
                  {name}
                </text>
              </g>
            );
          })}
          <Click
            t={t}
            from={[CONTENT.right - 60, CONTENT.bottom - 10]}
            to={TARGET}
            at={CLICK_AT}
            leave={CLICK_AT + 0.4}
          />
        </BrowserWindow>
      </g>
      <CheckStamp
        x={FRAME.x + FRAME.width - 30}
        y={FRAME.y + 40 + bob}
        k={backOut(segment(t, STAMP_AT, 0.5))}
        t={t}
        fill="fill-cerulean-blue"
      />
    </svg>
  );
}

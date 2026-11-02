'use client';

import { Plus } from 'lucide-react';
import { useId } from 'react';

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

import { GroundShadow, Icon, pivot, TextBar } from './parts';
import { NODE_FILL } from './rosterParts';

// A quick add stage with two side panels; the first, of the people already
// named, gets its label.
const FRAME = { x: 200, y: 40, width: 800, height: 350 } as const;
const CONTENT = browserContent(FRAME);
const PANEL_X = CONTENT.x + 20;
const PANEL_WIDTH = 230;
const panels = [
  { y: CONTENT.y + 20, height: 130, at: 0.6 },
  { y: CONTENT.y + 168, height: 108, at: 0.8 },
] as const;
const MAIN_X = (PANEL_X + PANEL_WIDTH + CONTENT.right) / 2;
const named = [
  [PANEL_X + 50, panels[0].y + 88],
  [PANEL_X + 112, panels[0].y + 88],
  [PANEL_X + 174, panels[0].y + 88],
] as const;
const inBin = [
  [MAIN_X - 50, 245],
  [MAIN_X + 44, 222],
  [MAIN_X + 8, 305],
] as const;
const LABEL_AT = 1.6;
const END = 2.4;

export function SidePanelsScene() {
  const { ref, time } = useIllustrationClock(END, { from: 0 });
  const id = useId().replace(/[^\w-]/g, '');
  const t = time;
  const bob = Math.sin((TAU * t) / 2.7) * 3;
  const win = backOut(segment(t, 0, 0.5));
  const label = backOut(segment(t, LABEL_AT, 0.5));

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
          url="Preview"
          clipId={`${id}-window`}
          urlWidth={110}
        >
          <rect
            x={CONTENT.x}
            y={CONTENT.y}
            width={CONTENT.right - CONTENT.x}
            height={CONTENT.bottom - CONTENT.y}
            className="fill-navy-taupe"
          />
          <TextBar
            x={MAIN_X - 140}
            y={CONTENT.y + 40}
            width={280}
            className="stroke-white/40"
          />
          <circle
            cx={MAIN_X}
            cy={262}
            r={100}
            className="fill-white/10 stroke-white/20"
            strokeWidth={4}
          />
          {inBin.map(([x, y], index) => (
            <circle
              key={x}
              cx={x}
              cy={y}
              r={26 * grow(backOut(segment(t, 0.5 + index * 0.1, 0.4)))}
              className={cx(NODE_FILL, 'stroke-white')}
              strokeWidth={4}
            />
          ))}
          <g
            transform={`translate(${CONTENT.right - 50} ${CONTENT.bottom - 46}) scale(${grow(backOut(segment(t, 0.8, 0.4)))})`}
          >
            <circle
              r={28}
              className={cx('fill-sea-green', 'stroke-white')}
              strokeWidth={4}
            />
            <Icon icon={Plus} x={0} y={0} size={30} className="text-white" />
          </g>
          {panels.map((panel, index) => {
            const k = backOut(segment(t, panel.at, 0.5));
            return (
              <g
                key={panel.y}
                transform={`translate(${(1 - k) * -PANEL_WIDTH} 0)`}
              >
                <rect
                  x={PANEL_X}
                  y={panel.y}
                  width={PANEL_WIDTH}
                  height={panel.height}
                  rx={16}
                  className="fill-white/15"
                />
                {index === 0 ? (
                  <>
                    <TextBar
                      x={PANEL_X + 24}
                      y={panel.y + 32}
                      width={120}
                      className="stroke-white/40"
                    />
                    {named.map(([x, y], order) => (
                      <circle
                        key={x}
                        cx={x}
                        cy={y}
                        r={22 * grow(backOut(segment(t, 1 + order * 0.1, 0.4)))}
                        className={cx(NODE_FILL, 'stroke-white')}
                        strokeWidth={4}
                      />
                    ))}
                  </>
                ) : (
                  <>
                    <TextBar
                      x={PANEL_X + 24}
                      y={panel.y + 30}
                      width={90}
                      className="stroke-white/40"
                    />
                    {[0, 1].map((order) => (
                      <rect
                        key={order}
                        x={PANEL_X + 20 + order * 100}
                        y={panel.y + 52}
                        width={90}
                        height={38}
                        rx={10}
                        className="fill-white/80"
                        opacity={segment(t, 1.2 + order * 0.1, 0.3)}
                      />
                    ))}
                  </>
                )}
              </g>
            );
          })}
        </BrowserWindow>
      </g>
      {label > 0 ? (
        <g
          transform={`translate(0 ${bob}) ${pivot(PANEL_X + PANEL_WIDTH / 2, panels[0].y + 32, label)}`}
        >
          <rect
            x={PANEL_X - 6}
            y={panels[0].y + 10}
            width={PANEL_WIDTH + 12}
            height={46}
            rx={23}
            className={cx('fill-mustard', outline)}
            strokeWidth={5}
          />
          <text
            x={PANEL_X + PANEL_WIDTH / 2}
            y={panels[0].y + 41}
            textAnchor="middle"
            fontSize={22}
            fontWeight={900}
            className="fill-navy-taupe"
          >
            Already named
          </text>
        </g>
      ) : null}
    </svg>
  );
}

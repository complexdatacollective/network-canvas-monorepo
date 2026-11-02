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

import { Click, GroundShadow, lerp, pivot, smooth, TextBar } from './parts';

// The guide's two tabs: the cursor picks Architect Classic, its steps appear
// and the tab is ringed.
const FRAME = { x: 230, y: 40, width: 740, height: 350 } as const;
const CONTENT = browserContent(FRAME);
const TAB_Y = CONTENT.y + 70;
const TAB_HEIGHT = 50;
const tabs = [
  { label: 'Architect', x: CONTENT.x + 40, width: 160 },
  { label: 'Architect Classic', x: CONTENT.x + 216, width: 240 },
] as const;
const CLICK_AT = 1.2;
const RING_AT = 1.9;
const END = 2.6;

export function ClassicTabScene() {
  const { ref, time } = useIllustrationClock(END, { from: 0 });
  const id = useId().replace(/[^\w-]/g, '');
  const t = time;
  const bob = Math.sin((TAU * t) / 2.7) * 3;
  const win = backOut(segment(t, 0, 0.5));
  const moved = smooth(segment(t, CLICK_AT + 0.05, 0.3));
  const swap = segment(t, CLICK_AT + 0.1, 0.3);
  const ring = backOut(segment(t, RING_AT, 0.5));
  const [first, second] = tabs;
  const underlineX = lerp(first.x, second.x, moved);
  const underlineWidth = lerp(first.width, second.width, moved);
  const bodyY = TAB_Y + TAB_HEIGHT + 50;

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
          url="documentation.networkcanvas.com"
          clipId={`${id}-window`}
          urlWidth={290}
        >
          <TextBar
            x={CONTENT.x + 40}
            y={CONTENT.y + 38}
            width={320}
            className="stroke-navy-taupe/35"
          />
          <line
            x1={CONTENT.x + 40}
            y1={TAB_Y + TAB_HEIGHT}
            x2={CONTENT.right - 40}
            y2={TAB_Y + TAB_HEIGHT}
            className="stroke-navy-taupe/15"
            strokeWidth={4}
          />
          {tabs.map((tab, index) => {
            const active = index === 0 ? 1 - moved : moved;
            return (
              <text
                key={tab.label}
                x={tab.x + tab.width / 2}
                y={TAB_Y + 33}
                textAnchor="middle"
                fontSize={22}
                fontWeight={900}
                className="fill-navy-taupe"
                opacity={0.45 + 0.55 * active}
              >
                {tab.label}
              </text>
            );
          })}
          <line
            x1={underlineX + 8}
            y1={TAB_Y + TAB_HEIGHT}
            x2={underlineX + underlineWidth - 8}
            y2={TAB_Y + TAB_HEIGHT}
            className="stroke-sea-serpent"
            strokeWidth={7}
            strokeLinecap="round"
          />
          <g opacity={1 - swap}>
            {[420, 360, 300].map((width, index) => (
              <TextBar
                key={width}
                x={CONTENT.x + 40}
                y={bodyY + index * 36}
                width={width}
              />
            ))}
          </g>
          <g opacity={swap}>
            <g
              transform={`translate(${CONTENT.x + 82} ${bodyY + 36}) scale(${grow(backOut(swap))})`}
            >
              <AppTile
                href="/images/architect-classic-icon.png"
                size={84}
                clipId={`${id}-tile`}
              />
            </g>
            {[340, 280, 380].map((width, index) => (
              <TextBar
                key={width}
                x={CONTENT.x + 150}
                y={bodyY + index * 36}
                width={width}
              />
            ))}
          </g>
          <Click
            t={t}
            from={[CONTENT.right - 60, CONTENT.bottom - 10]}
            to={[second.x + second.width / 2, TAB_Y + 26]}
            at={CLICK_AT}
            leave={CLICK_AT + 0.5}
          />
        </BrowserWindow>
      </g>
      {ring > 0 ? (
        <g
          transform={`translate(0 ${bob}) ${pivot(second.x + second.width / 2, TAB_Y + TAB_HEIGHT / 2, ring)}`}
        >
          <rect
            x={second.x - 8}
            y={TAB_Y - 6}
            width={second.width + 16}
            height={TAB_HEIGHT + 12}
            rx={20}
            fill="none"
            className="stroke-mustard"
            strokeWidth={7}
          />
        </g>
      ) : null}
    </svg>
  );
}

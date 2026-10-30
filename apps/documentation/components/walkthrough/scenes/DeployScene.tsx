'use client';

import { useId } from 'react';

import { AppTile } from '@codaco/art/illustration/AppTile';
import { Badge } from '@codaco/art/illustration/Badge';
import {
  BrowserWindow,
  browserContent,
} from '@codaco/art/illustration/BrowserWindow';
import { DottedPath } from '@codaco/art/illustration/DottedPath';
import {
  backOut,
  grow,
  outline,
  segment,
  TAU,
  useIllustrationClock,
} from '@codaco/art/illustration/motion';
import { cx } from '@codaco/fresco-ui/utils/cva';

import {
  Cloud,
  CodeCard,
  GroundShadow,
  link,
  Particles,
  smooth,
} from './parts';

// The reader's copy travels into Netlify, which builds it, and Fresco comes
// up at its own address.
const CARD: readonly [number, number] = [40, 140];
const CLOUD_AT: readonly [number, number] = [540, 210];
const WINDOW = { x: 780, y: 90, width: 390, height: 280 } as const;
const CONTENT = browserContent(WINDOW);
const IN_AT = 0.5;
const TRAVEL = 0.8;
const BUILD_AT = 1.3;
const BUILD = 1.2;
const OUT_AT = 2.5;
const LIVE_AT = 3.3;
const END = 3.9;

export function DeployScene() {
  const { ref, time } = useIllustrationClock(END, { from: 0 });
  const id = useId().replace(/[^\w-]/g, '');
  const t = time;
  const bob = Math.sin((TAU * t) / 2.7) * 3;
  const card = backOut(segment(t, 0, 0.5));
  const cloud = backOut(segment(t, 0.2, 0.5));
  const win = backOut(segment(t, 0.4, 0.5));
  const build = smooth(segment(t, BUILD_AT, BUILD));
  const app = backOut(segment(t, OUT_AT + TRAVEL - 0.1, 0.5));
  const live = backOut(segment(t, LIVE_AT, 0.5));
  const inPath = link([CARD[0] + 314, 235], [CLOUD_AT[0] - 140, 225]);
  const outPath = link([CLOUD_AT[0] + 130, 225], [WINDOW.x - 14, 230]);
  const midX = (CONTENT.x + CONTENT.right) / 2;
  const midY = (CONTENT.y + CONTENT.bottom) / 2;

  return (
    <svg
      ref={ref}
      viewBox="0 0 1200 460"
      className="font-heading block h-auto max-h-full w-full overflow-visible"
      aria-hidden
    >
      <GroundShadow cx={CARD[0] + 150} cy={410} rx={150} />
      <GroundShadow cx={CLOUD_AT[0]} cy={410} rx={130} />
      <GroundShadow
        cx={WINDOW.x + WINDOW.width / 2}
        cy={410}
        rx={WINDOW.width / 2}
      />
      <g opacity={segment(t, IN_AT - 0.2, 0.3)}>
        <DottedPath d={inPath.d} time={time} />
      </g>
      <g opacity={segment(t, OUT_AT - 0.2, 0.3)}>
        <DottedPath d={outPath.d} time={time} />
      </g>
      <Particles
        path={inPath}
        since={t - IN_AT}
        duration={TRAVEL}
        fill="fill-purple-pizazz"
      />
      <Particles
        path={outPath}
        since={t - OUT_AT}
        duration={TRAVEL}
        fill="fill-sea-green"
      />

      <g
        transform={`translate(${CARD[0] + 150} ${CARD[1] + 95 + bob}) scale(${grow(card)}) translate(-150 -95)`}
      >
        <CodeCard x={0} y={0} title="you/your-study" accent="fill-mustard" />
      </g>

      <g
        transform={`translate(${CLOUD_AT[0]} ${CLOUD_AT[1] + bob}) scale(${grow(cloud)}) translate(${-CLOUD_AT[0]} ${-CLOUD_AT[1]})`}
      >
        <Cloud x={CLOUD_AT[0]} y={CLOUD_AT[1]} fill="fill-cerulean-blue" />
        <text
          x={CLOUD_AT[0]}
          y={CLOUD_AT[1] - 4}
          textAnchor="middle"
          fontSize={26}
          fontWeight={900}
          className="fill-white"
        >
          Netlify
        </text>
        <rect
          x={CLOUD_AT[0] - 70}
          y={CLOUD_AT[1] + 22}
          width={140}
          height={18}
          rx={9}
          className={cx('fill-white', outline)}
          strokeWidth={4}
        />
        {build > 0 ? (
          <rect
            x={CLOUD_AT[0] - 66}
            y={CLOUD_AT[1] + 26}
            width={132 * build}
            height={10}
            rx={5}
            className={build >= 1 ? 'fill-sea-green' : 'fill-mustard'}
          />
        ) : null}
      </g>

      <g
        transform={`translate(${WINDOW.x + WINDOW.width / 2} ${WINDOW.y + WINDOW.height / 2 + bob}) scale(${grow(win)}) translate(${-WINDOW.x - WINDOW.width / 2} ${-WINDOW.y - WINDOW.height / 2})`}
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
          <g transform={`translate(${midX} ${midY}) scale(${grow(app)})`}>
            <AppTile
              href="/assets/walkthroughs/fresco-icon.png"
              size={100}
              clipId={`${id}-fresco`}
            />
          </g>
        </BrowserWindow>
      </g>
      <g
        transform={`translate(${WINDOW.x + WINDOW.width - 6} ${WINDOW.y + 6}) rotate(${-12 + Math.sin((TAU * t) / 2.7) * 4}) scale(${grow(live)})`}
      >
        <Badge r={44} fill="fill-sea-green">
          <text
            y={10}
            textAnchor="middle"
            fontSize={26}
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

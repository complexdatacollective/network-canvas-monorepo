'use client';

import { useId } from 'react';

import { cx } from '@codaco/fresco-ui/utils/cva';

import {
  backOut,
  inCubic,
  outline,
  segment,
  TAU,
  useIllustrationClock,
} from './illustrationMotion';

const DEVICE_START = 0.2;
const NODES_START = 0.8;
const MORPH_START = 1.8;
const MORPH_DURATION = 1;
const HOUSE_START = 1;
const PATH_START = 2.9;
const TRAVEL_START = 3.3;
const TRAVEL_DURATION = 1.9;
const LIT_START = 5.2;
const OUT_START = 7.5;
const LOOP = 8.1;
const STILL_TIME = 6.9;

const smooth = (x: number) => x * x * (3 - 2 * x);
const lerp = (from: number, to: number, k: number) => from + (to - from) * k;
const scaleAbout = (x: number, y: number, k: number) =>
  `translate(${x} ${y}) scale(${Math.max(0.001, k)}) translate(${-x} ${-y})`;

// The tablet and the browser window are the same frame at two sizes.
const TABLET = { x: 100, y: 100, width: 330, height: 254 } as const;
const BROWSER = { x: 56, y: 68, width: 462, height: 320 } as const;
const GROUND_Y = 410;

const HOUSE = { x: 756, width: 370, top: 200 } as const;
const HOUSE_MID = HOUSE.x + HOUSE.width / 2;
const WINDOW = { x: HOUSE.x + 24, y: 226, width: 228, height: 160 } as const;
const LAPTOP_X = WINDOW.x + WINDOW.width / 2;
const SCREEN = { width: 156, height: 96, y: 246 } as const;

// The interview travels along one cubic curve from the browser to the house.
const ROUTE = [
  [524, 208],
  [640, -20],
  [650, 340],
  [768, 306],
] as const;

const route = (k: number) => {
  const u = 1 - k;
  const point = (axis: 0 | 1) =>
    u * u * u * ROUTE[0][axis] +
    3 * u * u * k * ROUTE[1][axis] +
    3 * u * k * k * ROUTE[2][axis] +
    k * k * k * ROUTE[3][axis];
  return [point(0), point(1)] as const;
};

const routePath = `M${ROUTE[0][0]} ${ROUTE[0][1]} C${ROUTE[1][0]} ${ROUTE[1][1]} ${ROUTE[2][0]} ${ROUTE[2][1]} ${ROUTE[3][0]} ${ROUTE[3][1]}`;

const roundedPath = (
  x: number,
  y: number,
  width: number,
  height: number,
  top: number,
  bottom: number,
) =>
  `M${x + top} ${y} H${x + width - top} Q${x + width} ${y} ${x + width} ${
    y + top
  } V${y + height - bottom} Q${x + width} ${y + height} ${
    x + width - bottom
  } ${y + height} H${x + bottom} Q${x} ${y + height} ${x} ${
    y + height - bottom
  } V${y + top} Q${x} ${y} ${x + top} ${y} Z`;

const nodes = [
  [-62, -12, 'fill-neon-coral'],
  [-20, -44, 'fill-mustard'],
  [34, -34, 'fill-sea-green'],
  [60, 8, 'fill-cerulean-blue'],
  [14, 38, 'fill-neon-coral'],
  [-38, 36, 'fill-purple-pizazz'],
] as const;

const ties = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 4],
  [4, 5],
  [5, 0],
  [1, 4],
] as const;

// The same interview screen on the tablet, in the browser and on the laptop.
function Sociogram({ shown, scale }: { shown: number; scale: number }) {
  return (
    <g transform={`scale(${scale})`}>
      {[24, 46, 68].map((r) => (
        <circle
          key={r}
          r={r}
          fill="none"
          className="stroke-white/20"
          strokeWidth={3}
        />
      ))}
      {ties.map(([from, to], index) => (
        <line
          key={`${from}-${to}`}
          x1={nodes[from][0]}
          y1={nodes[from][1]}
          x2={nodes[to][0]}
          y2={nodes[to][1]}
          className="stroke-white/60"
          strokeWidth={3}
          opacity={segment(shown, 0.7 + index * 0.08, 0.2)}
        />
      ))}
      {nodes.map(([x, y, fill], index) => (
        <circle
          key={`${x}-${y}`}
          cx={x}
          cy={y}
          r={13 * backOut(segment(shown, 0.05 + index * 0.1, 0.35))}
          className={cx(fill, 'stroke-white')}
          strokeWidth={3}
        />
      ))}
      <circle
        r={15 * backOut(segment(shown, 0.4, 0.35))}
        className="fill-white"
      />
    </g>
  );
}

function Envelope({ x, y, scale }: { x: number; y: number; scale: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${Math.max(0.001, scale)})`}>
      <rect
        x={-26}
        y={-19}
        width={52}
        height={38}
        rx={7}
        className={cx('fill-mustard', outline)}
        strokeWidth={5}
        strokeLinejoin="round"
      />
      <path
        d="M-24 -16 L0 4 L24 -16"
        fill="none"
        className={outline}
        strokeWidth={4}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </g>
  );
}

export function FrescoFundedIllustration() {
  const { ref, time } = useIllustrationClock(STILL_TIME);
  const clipId = `fresco-funded-${useId().replace(/[^\w-]/g, '')}`;
  const t = time % LOOP;

  const out = inCubic(segment(t, OUT_START, 0.5));
  const alive = 1 - out;
  const bob = Math.sin((TAU * t) / 2.7);

  // Tablet to browser.
  const intro = backOut(segment(t, DEVICE_START, 0.6));
  const morph = smooth(segment(t, MORPH_START, MORPH_DURATION));
  const lift = Math.sin(Math.PI * morph) * 22;
  const settle = segment(t, MORPH_START + MORPH_DURATION, 0.4);
  const frame = {
    x: lerp(TABLET.x, BROWSER.x, morph),
    y: lerp(TABLET.y, BROWSER.y, morph) - lift + bob * 3 * settle,
    width: lerp(TABLET.width, BROWSER.width, morph),
    height: lerp(TABLET.height, BROWSER.height, morph),
  };
  const centerX = frame.x + frame.width / 2;
  const centerY = frame.y + frame.height / 2;
  const sideInset = lerp(16, 4, morph);
  const topInset = lerp(16, 60, morph);
  const content = {
    x: frame.x + sideInset,
    y: frame.y + topInset,
    width: frame.width - sideInset * 2,
    height: frame.height - topInset - sideInset,
  };
  const contentPath = roundedPath(
    content.x,
    content.y,
    content.width,
    content.height,
    lerp(14, 0, morph),
    lerp(14, 22, morph),
  );
  const chrome = segment(morph, 0.5, 0.5);
  const bezel = 1 - segment(morph, 0, 0.5);

  // The interview leaves the browser and reaches the laptop.
  const pathOpacity = segment(t, PATH_START, 0.3) * alive;
  const travel = smooth(segment(t, TRAVEL_START, TRAVEL_DURATION));
  const [envX, envY] = route(travel);
  const envelope =
    travel > 0 && travel < 1
      ? segment(t, TRAVEL_START, 0.2) * (1 - segment(travel, 0.94, 0.06))
      : 0;
  const arrival = segment(t, LIT_START, 0.4);
  const lit = smooth(arrival);
  const house = backOut(segment(t, HOUSE_START, 0.6));
  const pulse = segment(t, LIT_START, 1.1);

  return (
    <svg
      ref={ref}
      viewBox="0 0 1200 460"
      className="font-heading block h-auto w-full overflow-visible"
      aria-hidden
    >
      <ellipse
        cx={centerX}
        cy={GROUND_Y + 6}
        rx={(frame.width / 2) * 0.9 * (1 - lift / 160) * intro * alive}
        ry={12 * (1 - lift / 120)}
        className="fill-navy-taupe/12"
      />
      <ellipse
        cx={HOUSE_MID}
        cy={GROUND_Y + 6}
        rx={(HOUSE.width / 2 + 24) * house * alive}
        ry={12}
        className="fill-navy-taupe/12"
      />

      <path
        d={routePath}
        fill="none"
        className="stroke-navy-taupe/40"
        strokeWidth={5}
        strokeDasharray="2 14"
        strokeDashoffset={-time * 40}
        strokeLinecap="round"
        opacity={pathOpacity}
      />

      <g transform={scaleAbout(HOUSE_MID, GROUND_Y, house * alive)}>
        <path
          d={`M${HOUSE.x + 60} ${HOUSE.top - 100} H${HOUSE.x + 108} V${
            HOUSE.top
          } H${HOUSE.x + 60} Z`}
          className={cx('fill-purple-pizazz', outline)}
          strokeWidth={6}
          strokeLinejoin="round"
        />
        <rect
          x={HOUSE.x}
          y={HOUSE.top}
          width={HOUSE.width}
          height={GROUND_Y - HOUSE.top}
          className={cx('fill-white', outline)}
          strokeWidth={6}
          strokeLinejoin="round"
        />
        <path
          d={`M${HOUSE.x - 28} ${HOUSE.top + 6} L${HOUSE_MID} ${
            HOUSE.top - 124
          } L${HOUSE.x + HOUSE.width + 28} ${HOUSE.top + 6} Z`}
          className={cx('fill-neon-coral', outline)}
          strokeWidth={6}
          strokeLinejoin="round"
        />
        <rect
          x={HOUSE.x + 288}
          y={290}
          width={64}
          height={GROUND_Y - 290}
          className={cx('fill-sea-serpent', outline)}
          strokeWidth={6}
          strokeLinejoin="round"
        />
        <circle cx={HOUSE.x + 336} cy={354} r={5} className="fill-white" />
        <rect
          x={WINDOW.x}
          y={WINDOW.y}
          width={WINDOW.width}
          height={WINDOW.height}
          rx={12}
          className={cx('fill-cerulean-blue/20', outline)}
          strokeWidth={6}
        />
        <path
          d={`M${WINDOW.x + 6} ${WINDOW.y + 128} H${
            WINDOW.x + WINDOW.width - 6
          }`}
          className="stroke-navy-taupe/30"
          strokeWidth={4}
        />
        <g transform={`translate(0 ${Math.sin((TAU * t) / 3.1) * 1.5 * lit})`}>
          <rect
            x={LAPTOP_X - SCREEN.width / 2}
            y={SCREEN.y}
            width={SCREEN.width}
            height={SCREEN.height}
            rx={8}
            className={cx('fill-white', outline)}
            strokeWidth={5}
          />
          <rect
            x={LAPTOP_X - SCREEN.width / 2 + 4}
            y={SCREEN.y + 4}
            width={SCREEN.width - 8}
            height={SCREEN.height - 8}
            rx={5}
            className="fill-navy-taupe/20"
          />
          <rect
            x={LAPTOP_X - SCREEN.width / 2 + 4}
            y={SCREEN.y + 4}
            width={SCREEN.width - 8}
            height={SCREEN.height - 8}
            rx={5}
            className="fill-navy-taupe"
            opacity={lit}
          />
          <g
            transform={`translate(${LAPTOP_X} ${SCREEN.y + SCREEN.height / 2})`}
            opacity={lit}
          >
            <Sociogram shown={t - LIT_START} scale={0.56} />
          </g>
          <path
            d={`M${LAPTOP_X - 94} ${SCREEN.y + SCREEN.height + 12} H${
              LAPTOP_X + 94
            } L${LAPTOP_X + 80} ${SCREEN.y + SCREEN.height} H${
              LAPTOP_X - 80
            } Z`}
            className={cx('fill-white', outline)}
            strokeWidth={5}
            strokeLinejoin="round"
          />
        </g>
        <rect
          x={WINDOW.x}
          y={WINDOW.y}
          width={WINDOW.width}
          height={WINDOW.height}
          rx={12}
          fill="none"
          className={outline}
          strokeWidth={6}
        />
      </g>

      <g opacity={pulse > 0 && pulse < 1 ? 1 : 0}>
        {[0, 0.35].map((delay) => {
          const k = segment(pulse, delay, 0.65);
          return (
            <rect
              key={delay}
              x={WINDOW.x - 6 - k * 26}
              y={WINDOW.y - 6 - k * 26}
              width={WINDOW.width + 12 + k * 52}
              height={WINDOW.height + 12 + k * 52}
              rx={20 + k * 20}
              fill="none"
              className="stroke-mustard"
              strokeWidth={6}
              opacity={Math.sin(Math.PI * k)}
            />
          );
        })}
      </g>

      <g transform={scaleAbout(centerX, GROUND_Y, intro * alive)}>
        <rect
          x={frame.x}
          y={frame.y}
          width={frame.width}
          height={frame.height}
          rx={lerp(30, 26, morph)}
          className={cx('fill-white', outline)}
          strokeWidth={6}
        />
        <clipPath id={`${clipId}-content`}>
          <path d={contentPath} />
        </clipPath>
        <path d={contentPath} className="fill-navy-taupe" />
        <g clipPath={`url(#${clipId}-content)`}>
          <g
            transform={`translate(${content.x + content.width / 2} ${
              content.y + content.height / 2 + 6
            })`}
          >
            <Sociogram shown={t - NODES_START} scale={lerp(1, 1.4, morph)} />
          </g>
          <g opacity={chrome}>
            {[0, 1, 2].map((row) => (
              <g key={row}>
                <rect
                  x={content.x + 24}
                  y={content.y + 60 + row * 44}
                  width={64 - row * 10}
                  height={12}
                  rx={6}
                  className="fill-white/25"
                />
                <rect
                  x={content.x + content.width - 24 - (70 - row * 12)}
                  y={content.y + 60 + row * 44}
                  width={70 - row * 12}
                  height={12}
                  rx={6}
                  className="fill-white/25"
                />
              </g>
            ))}
          </g>
          <rect
            x={content.x + content.width / 2 - 70}
            y={content.y + 12}
            width={140}
            height={14}
            rx={7}
            className="fill-white/20"
          />
          <rect
            x={content.x + content.width / 2 - 52}
            y={content.y + 16}
            width={104}
            height={6}
            rx={3}
            className="fill-white/60"
          />
        </g>
        <circle
          cx={frame.x + 8}
          cy={centerY}
          r={3.5}
          className="fill-navy-taupe/50"
          opacity={bezel}
        />
        <g opacity={chrome}>
          <path
            d={`M${frame.x + 3} ${frame.y + 57} H${frame.x + frame.width - 3}`}
            className={outline}
            strokeWidth={5}
          />
          {['fill-neon-coral', 'fill-mustard', 'fill-sea-green'].map(
            (fill, index) => (
              <circle
                key={fill}
                cx={frame.x + 28 + index * 22}
                cy={frame.y + 29}
                r={7}
                className={fill}
              />
            ),
          )}
          <rect
            x={frame.x + 100}
            y={frame.y + 13}
            width={frame.width - 116}
            height={32}
            rx={16}
            className="fill-navy-taupe/10"
          />
          <text
            x={frame.x + 116}
            y={frame.y + 35}
            fontSize={16}
            fontWeight={800}
            className="fill-navy-taupe/75"
          >
            interviewer.networkcanvas.com
          </text>
        </g>
      </g>

      <Envelope
        x={envX}
        y={envY + Math.sin((TAU * t) / 0.9) * 4}
        scale={envelope * alive}
      />
    </svg>
  );
}

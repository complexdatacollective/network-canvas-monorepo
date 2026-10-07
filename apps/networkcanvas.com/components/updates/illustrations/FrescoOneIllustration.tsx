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

const LOOP = 8.8;
const STILL_TIME = 7.3;
const OUT_START = 7.8;
const BADGE_START = 2.6;
const CARD_START = 1.1;
const CARD_TRAVEL = 1.8;
const LOADED_AT = 2.5;
const BASE_COUNT = 41;

const SERVER_X = 175;
const UNIT_W = 240;
const UNIT_H = 60;
const UNIT_YS = [228, 298, 368] as const;
const UNIT_STARTS = [0.2, 0.35, 0.5] as const;
const HUB = [SERVER_X + UNIT_W / 2, UNIT_YS[1]] as const;
const TILE = 104;
const TILE_Y = 140;

type Point = readonly [number, number];

type Device = {
  kind: 'tablet' | 'laptop';
  x: number;
  y: number;
  width: number;
  height: number;
  appear: number;
  start: number;
  attach: Point;
  c1: Point;
  c2: Point;
  flip: 1 | -1;
  shift: number;
};

const devices: readonly Device[] = [
  {
    kind: 'tablet',
    x: 450,
    y: 70,
    width: 330,
    height: 202,
    appear: 2.7,
    start: 3.3,
    attach: [450, 171],
    c1: [400, HUB[1]],
    c2: [390, 171],
    flip: 1,
    shift: 0,
  },
  {
    kind: 'laptop',
    x: 850,
    y: 140,
    width: 316,
    height: 232,
    appear: 3.0,
    start: 4.1,
    attach: [850, 264],
    c1: [560, 420],
    c2: [700, 300],
    flip: 1,
    shift: 4,
  },
];

// A device's interview, relative to its start: the interview travels out,
// the screen fills in, and the answers travel back to the server.
const OUT_DURATION = 0.6;
const BACK_START = 1.9;
const BACK_DURATION = 0.7;
const ARRIVALS = devices.map(
  (device) => device.start + BACK_START + BACK_DURATION,
);

const nodeSpots = [
  [-0.55, -0.45, 'fill-neon-coral'],
  [0.5, -0.55, 'fill-sea-green'],
  [0.05, 0.05, 'fill-mustard'],
  [-0.45, 0.55, 'fill-cerulean-blue'],
  [0.6, 0.5, 'fill-purple-pizazz'],
] as const;

const nodeTies = [
  [0, 2],
  [1, 2],
  [2, 3],
  [2, 4],
  [0, 3],
] as const;

const screens = {
  tablet: { inset: 11, body: 22, radius: 12, top: 36, node: 10 },
  laptop: { inset: 12, body: 20, radius: 10, top: 40, node: 13 },
} as const;

const ease = (x: number) => x * x * (3 - 2 * x);

const grow = (k: number) => Math.max(0.001, k);

const cubic = (
  p0: Point,
  p1: Point,
  p2: Point,
  p3: Point,
  u: number,
): Point => {
  const v = 1 - u;
  const a = v * v * v;
  const b = 3 * v * v * u;
  const c = 3 * v * u * u;
  const d = u * u * u;
  return [
    a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0],
    a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1],
  ];
};

const linkPoint = (device: Device, u: number) =>
  cubic(HUB, device.c1, device.c2, device.attach, u);

function Sociogram({
  device,
  run,
  clipId,
}: {
  device: Device;
  run: number;
  clipId: string;
}) {
  const spec = screens[device.kind];
  const width = device.width - spec.inset * 2;
  const height = device.height - spec.inset * 2;
  const areaTop = spec.top;
  const areaHeight = height - areaTop - 18;
  const cx0 = width / 2;
  const cy0 = areaTop + areaHeight / 2;
  const reachX = width / 2 - spec.node - 6;
  const reachY = areaHeight / 2 - spec.node * 0.3;
  const progress = segment(run, 0.5, 1.4);
  const spots = nodeSpots.map(([x, y, fill], index) => {
    const color = nodeSpots[(index + device.shift) % nodeSpots.length]![2];
    return {
      x: cx0 + x * device.flip * reachX,
      y: cy0 + y * reachY,
      fill: device.shift === 0 ? fill : color,
      k: backOut(segment(run, 0.5 + index * 0.28, 0.4)),
    };
  });

  return (
    <g transform={`translate(${spec.inset} ${spec.inset})`}>
      <clipPath id={clipId}>
        <rect width={width} height={height} rx={spec.radius} />
      </clipPath>
      <g clipPath={`url(#${clipId})`}>
        <rect width={width} height={height} className="fill-navy-taupe" />
        {[0.3, 0.55, 0.8].map((r) => (
          <ellipse
            key={r}
            cx={cx0}
            cy={cy0}
            rx={r * (width / 2 - 4)}
            ry={r * (areaHeight / 2 + 2)}
            fill="none"
            className="stroke-white/15"
            strokeWidth={3}
          />
        ))}
        {nodeTies.map(([from, to], index) => (
          <line
            key={`${from}-${to}`}
            x1={spots[from]!.x}
            y1={spots[from]!.y}
            x2={spots[to]!.x}
            y2={spots[to]!.y}
            className="stroke-white/60"
            strokeWidth={3}
            opacity={segment(run, 1.1 + index * 0.1, 0.25)}
          />
        ))}
        {spots.map((spot, index) => (
          <circle
            key={index}
            cx={spot.x}
            cy={spot.y}
            r={spec.node * spot.k}
            className={cx(spot.fill, outline)}
            strokeWidth={3}
          />
        ))}
        <rect
          x={10}
          y={height - 13}
          width={width - 20}
          height={6}
          rx={3}
          className="fill-white/20"
        />
        <rect
          x={10}
          y={height - 13}
          width={Math.max(0, (width - 20) * progress)}
          height={6}
          rx={3}
          className="fill-sea-green"
        />
        {device.kind === 'tablet' ? (
          <rect
            x={12}
            y={8}
            width={width - 24}
            height={20}
            rx={10}
            className="fill-white/15"
          />
        ) : null}
        {device.kind === 'laptop' ? (
          <>
            <rect width={width} height={34} className="fill-white/10" />
            {['fill-neon-coral', 'fill-mustard', 'fill-sea-green'].map(
              (fill, index) => (
                <circle
                  key={fill}
                  cx={20 + index * 18}
                  cy={17}
                  r={6}
                  className={fill}
                />
              ),
            )}
            <rect
              x={96}
              y={5}
              width={width - 116}
              height={24}
              rx={12}
              className="fill-white/15"
            />
            <text
              x={112}
              y={22}
              fontSize={16}
              fontWeight={800}
              className="fill-white/80"
            >
              your-server.org
            </text>
          </>
        ) : null}
      </g>
    </g>
  );
}

function DeviceBody({
  device,
  run,
  clipId,
}: {
  device: Device;
  run: number;
  clipId: string;
}) {
  const spec = screens[device.kind];
  return (
    <g>
      <rect
        width={device.width}
        height={device.height}
        rx={spec.body}
        className={cx('fill-white', outline)}
        strokeWidth={6}
      />
      <Sociogram device={device} run={run} clipId={clipId} />
      {device.kind === 'laptop' ? (
        <>
          <rect
            x={-16}
            y={device.height - 12}
            width={device.width + 32}
            height={26}
            rx={13}
            className={cx('fill-white', outline)}
            strokeWidth={6}
          />
          <rect
            x={device.width / 2 - 32}
            y={device.height - 12}
            width={64}
            height={9}
            rx={4.5}
            className="fill-navy-taupe/20"
          />
        </>
      ) : null}
    </g>
  );
}

function ProtocolCard() {
  return (
    <g>
      <rect
        x={-42}
        y={-32}
        width={84}
        height={64}
        rx={12}
        className={cx('fill-white', outline)}
        strokeWidth={4}
      />
      <rect
        x={-30}
        y={-23}
        width={40}
        height={8}
        rx={4}
        className="fill-navy-taupe/40"
      />
      {(
        [
          ['fill-neon-coral', 44],
          ['fill-sea-green', 32],
          ['fill-cerulean-blue', 50],
        ] as const
      ).map(([fill, width], index) => (
        <g key={fill} transform={`translate(0 ${-6 + index * 14})`}>
          <circle cx={-28} r={4.5} className={fill} />
          <rect
            x={-16}
            y={-3.5}
            width={width}
            height={7}
            rx={3.5}
            className="fill-navy-taupe/25"
          />
        </g>
      ))}
    </g>
  );
}

export function FrescoOneIllustration() {
  const { ref, time } = useIllustrationClock(STILL_TIME);
  const clipPrefix = `fresco-one-${useId().replace(/[^\w-]/g, '')}`;
  const t = time % LOOP;

  const out = inCubic(segment(t, OUT_START, 0.5));
  const alive = 1 - out;
  const bob = Math.sin((TAU * t) / 2.7);
  const arrived = ARRIVALS.filter((arrival) => t >= arrival).length;
  const lastArrival = arrived > 0 ? ARRIVALS[arrived - 1]! : 0;
  const tick =
    arrived > 0 ? Math.sin(Math.PI * segment(t - lastArrival, 0, 0.45)) : 0;
  const loaded = segment(t, LOADED_AT, 0.4);

  const units = UNIT_YS.map((y, index) => ({
    y,
    k: backOut(segment(t, UNIT_STARTS[index]!, 0.5)) * alive,
  }));
  const tile = backOut(segment(t, 0.75, 0.55)) * alive;
  const badge = backOut(segment(t, BADGE_START, 0.5)) * alive;

  const travel = ease(segment(t, CARD_TRAVEL, 0.7));
  const slot = [SERVER_X, UNIT_YS[1]] as const;
  const cardPos: Point = [
    92 + (slot[0] - 92) * travel,
    52 + (slot[1] - 52) * travel + Math.sin(Math.PI * travel) * -26,
  ];
  const cardScale =
    backOut(segment(t, CARD_START, 0.45)) * (1 - 0.65 * travel) * alive;
  const cardOpacity = 1 - segment(t, CARD_TRAVEL + 0.55, 0.15);
  const cardBob = Math.sin((TAU * t) / 1.8) * 3 * (1 - travel);

  const placed = devices.map((device, index) => {
    const k = backOut(segment(t, device.appear, 0.55)) * alive;
    const dy = Math.sin((TAU * t) / 2.7 + index * 1.3) * 4 * Math.min(1, k);
    return { device, index, k, dy };
  });

  return (
    <svg
      ref={ref}
      viewBox="0 0 1200 460"
      className="font-heading block h-auto w-full overflow-visible"
      aria-hidden
    >
      <ellipse
        cx={SERVER_X}
        cy={424}
        rx={134}
        ry={13}
        className="fill-navy-taupe/12"
        opacity={Math.min(1, units[2]!.k)}
      />
      {placed.map(({ device, k, dy }) => (
        <ellipse
          key={device.kind}
          cx={device.x + device.width / 2}
          cy={device.y + device.height + (device.kind === 'laptop' ? 34 : 16)}
          rx={(device.width / 2) * 0.8 * Math.min(1, k) * (1 - dy * 0.012)}
          ry={9}
          className="fill-navy-taupe/12"
        />
      ))}
      {placed.map(({ device, k }) => {
        const [x, y] = device.attach;
        return (
          <path
            key={device.kind}
            d={`M${HUB[0]} ${HUB[1]} C${device.c1[0]} ${device.c1[1]} ${device.c2[0]} ${device.c2[1]} ${x} ${y}`}
            fill="none"
            className="stroke-navy-taupe/40"
            strokeWidth={5}
            strokeDasharray="2 14"
            strokeDashoffset={-time * 40}
            strokeLinecap="round"
            opacity={Math.min(1, k)}
          />
        );
      })}
      {units.map(({ y, k }, index) => (
        <g
          key={y}
          transform={`translate(${SERVER_X} ${y + (1 - Math.min(1, k)) * 24}) scale(${grow(k)})`}
          opacity={Math.min(1, k)}
        >
          <rect
            x={-UNIT_W / 2}
            y={-UNIT_H / 2}
            width={UNIT_W}
            height={UNIT_H}
            rx={18}
            className={cx('fill-white', outline)}
            strokeWidth={6}
          />
          {index === 0 ? (
            <>
              <text
                x={-96}
                y={8}
                fontSize={24}
                fontWeight={900}
                className="fill-navy-taupe"
              >
                Fresco
              </text>
              <g transform={`translate(58 0) scale(${1 + tick * 0.18})`}>
                <rect
                  x={-40}
                  y={-19}
                  width={80}
                  height={38}
                  rx={19}
                  className="fill-navy-taupe"
                />
                <path
                  d="M-28 0 L-22 6 L-12 -6"
                  fill="none"
                  className="stroke-sea-green"
                  strokeWidth={4}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <text
                  x={14}
                  y={8}
                  textAnchor="middle"
                  fontSize={22}
                  fontWeight={900}
                  className="fill-white"
                >
                  {BASE_COUNT + arrived}
                </text>
              </g>
            </>
          ) : (
            <>
              <circle
                cx={-92}
                r={7}
                className={
                  index === 1 && loaded > 0
                    ? 'fill-sea-green'
                    : 'fill-sea-green/60'
                }
                opacity={0.5 + 0.5 * Math.sin((TAU * t) / 1.4 + index * 2)}
              />
              <circle
                cx={-72}
                r={7}
                className="fill-mustard"
                opacity={0.5 + 0.5 * Math.sin((TAU * t) / 0.9 + index)}
              />
              {index === 1 ? (
                <>
                  <line
                    x1={-26}
                    y1={0}
                    x2={70}
                    y2={0}
                    className="stroke-navy-taupe/20"
                    strokeWidth={4}
                    strokeLinecap="round"
                  />
                  {(
                    [
                      [-26, 'fill-neon-coral'],
                      [22, 'fill-sea-green'],
                      [70, 'fill-cerulean-blue'],
                    ] as const
                  ).map(([x, fill], dot) => (
                    <circle
                      key={x}
                      cx={x}
                      r={9 * backOut(segment(t, LOADED_AT + dot * 0.12, 0.35))}
                      className={cx(fill, outline)}
                      strokeWidth={3}
                    />
                  ))}
                </>
              ) : (
                [-26, -2, 22, 46, 70].map((x) => (
                  <line
                    key={x}
                    x1={x}
                    y1={-12}
                    x2={x}
                    y2={12}
                    className="stroke-navy-taupe/20"
                    strokeWidth={5}
                    strokeLinecap="round"
                  />
                ))
              )}
            </>
          )}
        </g>
      ))}
      <g
        transform={`translate(${SERVER_X} ${TILE_Y + Math.sin((TAU * t) / 2.7) * 3 * tile}) scale(${grow(tile)})`}
      >
        <clipPath id={`${clipPrefix}-tile`}>
          <rect
            x={-TILE / 2}
            y={-TILE / 2}
            width={TILE}
            height={TILE}
            rx={24}
          />
        </clipPath>
        <rect
          x={-TILE / 2}
          y={-TILE / 2}
          width={TILE}
          height={TILE}
          rx={24}
          className="fill-white"
        />
        <image
          href="/images/summer-2026/fresco-icon.png"
          x={-TILE / 2}
          y={-TILE / 2}
          width={TILE}
          height={TILE}
          clipPath={`url(#${clipPrefix}-tile)`}
          preserveAspectRatio="xMidYMid slice"
        />
        <rect
          x={-TILE / 2}
          y={-TILE / 2}
          width={TILE}
          height={TILE}
          rx={24}
          fill="none"
          className={outline}
          strokeWidth={6}
        />
      </g>
      <circle
        cx={HUB[0]}
        cy={HUB[1]}
        r={10 * grow(units[1]!.k)}
        className={cx('fill-sea-serpent', outline)}
        strokeWidth={4}
      />
      {placed.map(({ device }) => {
        const arrival = device.start + BACK_START + BACK_DURATION;
        const ring = segment(t, arrival, 0.5);
        const run = t - device.start;
        const outU = ease(segment(run, 0, OUT_DURATION));
        const backU = 1 - ease(segment(run, BACK_START, BACK_DURATION));
        const showOut = run > 0 && run < OUT_DURATION + 0.05;
        const showBack =
          run > BACK_START && run < BACK_START + BACK_DURATION + 0.02;
        return (
          <g key={device.kind} opacity={alive}>
            {showOut
              ? [0, 0.08, 0.16].map((lag, index) => {
                  const [px, py] = linkPoint(device, Math.max(0, outU - lag));
                  return (
                    <circle
                      key={lag}
                      cx={px}
                      cy={py}
                      r={9 - index * 2}
                      className={cx('fill-mustard', index === 0 && outline)}
                      strokeWidth={3}
                      opacity={1 - index * 0.3}
                    />
                  );
                })
              : null}
            {showBack
              ? [0, 0.08, 0.16].map((lag, index) => {
                  const [px, py] = linkPoint(device, Math.min(1, backU + lag));
                  return (
                    <circle
                      key={lag}
                      cx={px}
                      cy={py}
                      r={9 - index * 2}
                      className={cx('fill-sea-green', index === 0 && outline)}
                      strokeWidth={3}
                      opacity={1 - index * 0.3}
                    />
                  );
                })
              : null}
            {ring > 0 && ring < 1 ? (
              <circle
                cx={HUB[0]}
                cy={HUB[1]}
                r={10 + ring * 26}
                fill="none"
                className="stroke-sea-green"
                strokeWidth={4}
                opacity={1 - ring}
              />
            ) : null}
          </g>
        );
      })}
      {placed.map(({ device, index, k, dy }) => (
        <g
          key={device.kind}
          transform={`translate(${device.x + device.width / 2} ${device.y + device.height / 2 + dy}) scale(${grow(k)}) translate(${-device.width / 2} ${-device.height / 2})`}
        >
          <DeviceBody
            device={device}
            run={t - device.start}
            clipId={`${clipPrefix}-screen-${index}`}
          />
        </g>
      ))}
      <g
        transform={`translate(${SERVER_X + 84} 84) rotate(${-12 + bob * 4}) scale(${grow(badge)})`}
      >
        <circle
          r={46}
          className={cx('fill-mustard', outline)}
          strokeWidth={6}
        />
        <text
          y={14}
          textAnchor="middle"
          fontSize={40}
          fontWeight={900}
          className="fill-navy-taupe"
        >
          1.0
        </text>
      </g>
      <g
        transform={`translate(${cardPos[0]} ${cardPos[1] + cardBob}) scale(${grow(cardScale * 1.35)}) rotate(${-8 * (1 - travel)})`}
        opacity={cardOpacity}
      >
        <ProtocolCard />
      </g>
    </svg>
  );
}

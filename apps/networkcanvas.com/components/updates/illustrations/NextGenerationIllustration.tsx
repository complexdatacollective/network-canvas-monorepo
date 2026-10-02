'use client';

import { useId } from 'react';

import { cx } from '@codaco/fresco-ui/utils/cva';

import {
  ArchitectScene,
  FrescoScene,
  HomeScene,
  InterviewerScene,
} from './AppWindowScenes';
import {
  Arm,
  backOut,
  blink,
  Hand,
  NetworkDecor,
  outline,
  inCubic,
  RobotHead,
  segment,
  TAU,
  useIllustrationClock,
} from './RobotParts';

const apps = [
  {
    name: 'Architect',
    icon: '/images/updates/architect-web-icon.png',
    x: 520,
    url: 'architect.networkcanvas.com',
  },
  {
    name: 'Interviewer',
    icon: '/images/summer-2026/interviewer-icon.svg',
    x: 665,
    url: 'interviewer.networkcanvas.com',
  },
  {
    name: 'Fresco',
    icon: '/images/summer-2026/fresco-icon.png',
    x: 810,
    url: 'your-server.org/fresco',
  },
] as const;

const nodes = [
  [70, 90, 12, 'fill-sea-green'],
  [40, 300, 9, 'fill-mustard'],
  [1130, 120, 14, 'fill-cerulean-blue'],
  [1060, 340, 10, 'fill-neon-coral'],
  [1160, 420, 9, 'fill-sea-green'],
] as const;

const edges = [
  [0, 1],
  [2, 3],
  [3, 4],
] as const;

const APP_STARTS = [0.3, 1.9, 3.5] as const;
const BADGE_START = 5;
const OUT_START = 6.6;
const LOOP = 7.2;
const STILL_TIME = 5.8;

const TILE_Y = 92;
const TILE = 92;
const HALF = TILE / 2;

const scenes = [ArchitectScene, InterviewerScene, FrescoScene] as const;

export function NextGenerationIllustration() {
  const { ref, time } = useIllustrationClock(STILL_TIME);
  const clipPrefix = `app-tile-${useId().replace(/[^\w-]/g, '')}`;
  const t = time % LOOP;

  const out = inCubic(segment(t, OUT_START, 0.4));
  let current = -1;
  APP_STARTS.forEach((start, index) => {
    if (t >= start) current = index;
  });
  const tiles = apps.map((app, index) => {
    const start = APP_STARTS[index]!;
    const pop = backOut(segment(t, start, 0.55));
    const k = pop * (1 - out);
    const hop = Math.sin(Math.PI * segment(t, start, 0.5)) * 22;
    const y = TILE_Y - hop + Math.sin((TAU * t) / 2.7 + index) * 3 * k;
    const labelWidth = app.name.length * 8.5 + 26;
    return {
      ...app,
      labelWidth,
      transform: `translate(${app.x} ${y}) scale(${Math.max(
        0.001,
        Math.min(1, k * 1.05),
      )})`,
    };
  });
  const badge = backOut(segment(t, BADGE_START, 0.5)) * (1 - out);
  const bob = Math.sin((TAU * t) / 2.7);
  const look = (current + 1) * 3;
  const Scene = current >= 0 ? scenes[current] : undefined;
  const sceneShown = current >= 0 ? t - APP_STARTS[current]! : 0;
  const sceneOpacity = segment(sceneShown, 0, 0.25) * (1 - out);
  const previous = out > 0 ? -1 : current - 1;
  const PreviousScene = previous >= 0 ? scenes[previous] : undefined;
  const url =
    current >= 0 && out < 1 ? apps[current]!.url : 'networkcanvas.com';

  return (
    <svg
      ref={ref}
      viewBox="0 0 1200 460"
      className="font-heading block h-auto w-full overflow-visible"
      aria-hidden
    >
      <NetworkDecor nodes={nodes} edges={edges} time={time} period={2.7} />
      <ellipse
        cx={660}
        cy={446}
        rx={300}
        ry={12}
        className="fill-navy-taupe/12"
      />
      <ellipse
        cx={250}
        cy={446}
        rx={120 - bob * 7}
        ry={12}
        className="fill-navy-taupe/12"
      />
      <rect
        x={420}
        y={190}
        width={490}
        height={250}
        rx={26}
        className={cx('fill-white', outline)}
        strokeWidth={6}
      />
      <path d="M423 240 L907 240" className={outline} strokeWidth={5} />
      <rect
        x={445}
        y={203}
        width={300}
        height={26}
        rx={13}
        className="fill-navy-taupe/10"
      />
      <text
        x={461}
        y={221}
        fontSize={15}
        fontWeight={800}
        className="fill-navy-taupe/75"
      >
        {url}
      </text>
      <clipPath id={`${clipPrefix}-window`}>
        <path d="M423 243 H907 V414 Q907 437 884 437 H446 Q423 437 423 414 Z" />
      </clipPath>
      <g clipPath={`url(#${clipPrefix}-window)`}>
        {PreviousScene ? (
          <PreviousScene shown={t - APP_STARTS[previous]!} />
        ) : (
          <HomeScene time={time} />
        )}
        {Scene ? (
          <g opacity={sceneOpacity}>
            <Scene shown={sceneShown} />
          </g>
        ) : null}
      </g>
      {tiles.map((tile, index) => {
        const clipId = `${clipPrefix}-${index}`;
        return (
          <g key={tile.name} transform={tile.transform}>
            <clipPath id={clipId}>
              <rect x={-HALF} y={-HALF} width={TILE} height={TILE} rx={24} />
            </clipPath>
            <rect
              x={-HALF}
              y={-HALF}
              width={TILE}
              height={TILE}
              rx={24}
              className="fill-white"
            />
            <image
              href={tile.icon}
              x={-HALF}
              y={-HALF}
              width={TILE}
              height={TILE}
              clipPath={`url(#${clipId})`}
              preserveAspectRatio="xMidYMid slice"
            />
            <rect
              x={-HALF}
              y={-HALF}
              width={TILE}
              height={TILE}
              rx={24}
              fill="none"
              className={outline}
              strokeWidth={6}
            />
            <rect
              x={-tile.labelWidth / 2}
              y={HALF + 8}
              width={tile.labelWidth}
              height={28}
              rx={14}
              className={cx('fill-white', outline)}
              strokeWidth={4}
            />
            <text
              y={HALF + 27}
              textAnchor="middle"
              fontSize={14}
              fontWeight={900}
              className="fill-navy-taupe"
            >
              {tile.name}
            </text>
          </g>
        );
      })}
      <g
        transform={`translate(1010 150) rotate(${
          -12 + Math.sin((TAU * t) / 2.7) * 4
        }) scale(${Math.max(0.001, badge)})`}
      >
        <circle
          r={54}
          className={cx('fill-mustard', outline)}
          strokeWidth={6}
        />
        <text
          y={-12}
          textAnchor="middle"
          fontSize={14}
          fontWeight={900}
          letterSpacing={2}
          className="fill-navy-taupe"
        >
          SCHEMA
        </text>
        <text
          y={34}
          textAnchor="middle"
          fontSize={44}
          fontWeight={900}
          className="fill-navy-taupe"
        >
          8
        </text>
      </g>
      <g transform={`translate(110 ${100 + bob * 5})`}>
        <Arm d="M70 240 Q30 268 38 312" />
        <Hand x={38} y={318} />
        <g transform={`rotate(${-Math.sin((TAU * t) / 1.35) * 6} 192 238)`}>
          <Arm d="M192 238 Q250 236 286 206" />
          <Hand x={292} y={200} />
        </g>
        <rect
          x={60}
          y={206}
          width={140}
          height={124}
          rx={44}
          className={cx('fill-sea-green', outline)}
          strokeWidth={6}
        />
        <RobotHead
          tilt={3 + bob * 2}
          antennaClassName="fill-neon-coral"
          eyeX={[99 + look, 161 + look]}
          eyeY={114}
          eyeHeight={17 * blink(t, [2.6, 4.3])}
          smile="M112 148 Q132 164 152 148"
        />
      </g>
    </svg>
  );
}

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
  backOut,
  inCubic,
  outline,
  segment,
  TAU,
  useIllustrationClock,
} from './illustrationMotion';

const apps = [
  {
    name: 'Architect',
    icon: '/images/updates/architect-web-icon.png',
    y: 115,
    url: 'architect.networkcanvas.com',
  },
  {
    name: 'Interviewer',
    icon: '/images/summer-2026/interviewer-icon.svg',
    y: 228,
    url: 'interviewer.networkcanvas.com',
  },
  {
    name: 'Fresco',
    icon: '/images/summer-2026/fresco-icon.png',
    y: 341,
    url: 'your-server.org/fresco',
  },
] as const;

const APP_STARTS = [0.3, 1.9, 3.5] as const;
const BADGE_START = 5;
const OUT_START = 6.6;
const LOOP = 7.2;
const STILL_TIME = 5.8;

const TILE_X = 100;
const TILE = 96;
const HALF = TILE / 2;
const LABEL_X = HALF + 16;

// The browser window. The scenes are drawn for a 484 × 194 content area at
// (423, 243); they are scaled to fill this window's content area instead.
const WINDOW = { x: 440, y: 60, width: 710, height: 336 } as const;
const BAR_Y = WINDOW.y + 50;
const CONTENT = {
  x: WINDOW.x + 3,
  y: BAR_Y + 3,
  right: WINDOW.x + WINDOW.width - 3,
  bottom: WINDOW.y + WINDOW.height - 3,
} as const;
const SCENE_SCALE = (CONTENT.right - CONTENT.x) / 484;
const WINDOW_MID_Y = (CONTENT.y + CONTENT.bottom) / 2;

const scenes = [ArchitectScene, InterviewerScene, FrescoScene] as const;

const labelWidth = (name: string) => name.length * 10.5 + 36;

export function NextGenerationIllustration() {
  const { ref, time } = useIllustrationClock(STILL_TIME);
  const clipPrefix = `app-tile-${useId().replace(/[^\w-]/g, '')}`;
  const t = time % LOOP;

  const out = inCubic(segment(t, OUT_START, 0.4));
  let current = -1;
  APP_STARTS.forEach((start, index) => {
    if (t >= start) current = index;
  });
  const allShown = segment(t, BADGE_START, 0.3);
  const tiles = apps.map((app, index) => {
    const start = APP_STARTS[index]!;
    const k = backOut(segment(t, start, 0.55)) * (1 - out);
    const nudge = Math.sin(Math.PI * segment(t, start, 0.5)) * 18;
    const next = APP_STARTS[index + 1];
    const dim = next === undefined ? 0 : segment(t, next, 0.3) * (1 - allShown);
    const y = app.y + Math.sin((TAU * t) / 2.7 + index) * 3 * k;
    return {
      ...app,
      labelWidth: labelWidth(app.name),
      opacity: 1 - 0.45 * dim,
      transform: `translate(${TILE_X + nudge} ${y}) scale(${Math.max(
        0.001,
        Math.min(1, k * 1.05),
      )})`,
    };
  });
  const badge = backOut(segment(t, BADGE_START, 0.5)) * (1 - out);
  const Scene = current >= 0 ? scenes[current] : undefined;
  const sceneShown = current >= 0 ? t - APP_STARTS[current]! : 0;
  const sceneOpacity = segment(sceneShown, 0, 0.25) * (1 - out);
  const previous = out > 0 ? -1 : current - 1;
  const PreviousScene = previous >= 0 ? scenes[previous] : undefined;
  const url =
    current >= 0 && out < 1 ? apps[current]!.url : 'networkcanvas.com';

  const active = current >= 0 ? apps[current] : undefined;
  const linkStart = active
    ? TILE_X + LABEL_X + labelWidth(active.name) + 14
    : 0;
  const linkEnd = WINDOW.x - 14;
  const linkMid = (linkStart + linkEnd) / 2;
  const linkOpacity = sceneOpacity * (1 - allShown);

  return (
    <svg
      ref={ref}
      viewBox="0 0 1200 460"
      className="font-heading block h-auto w-full overflow-visible"
      aria-hidden
    >
      <ellipse
        cx={WINDOW.x + WINDOW.width / 2}
        cy={428}
        rx={WINDOW.width / 2}
        ry={12}
        className="fill-navy-taupe/12"
      />
      {active ? (
        <g opacity={linkOpacity}>
          <path
            d={`M${linkStart} ${active.y} C${linkMid} ${active.y} ${linkMid} ${WINDOW_MID_Y} ${linkEnd} ${WINDOW_MID_Y}`}
            fill="none"
            className="stroke-navy-taupe/40"
            strokeWidth={5}
            strokeDasharray="2 14"
            strokeDashoffset={-time * 40}
            strokeLinecap="round"
          />
          <circle
            cx={linkEnd}
            cy={WINDOW_MID_Y}
            r={7}
            className="fill-navy-taupe/40"
          />
        </g>
      ) : null}
      <rect
        x={WINDOW.x}
        y={WINDOW.y}
        width={WINDOW.width}
        height={WINDOW.height}
        rx={26}
        className={cx('fill-white', outline)}
        strokeWidth={6}
      />
      <path
        d={`M${CONTENT.x} ${BAR_Y} L${CONTENT.right} ${BAR_Y}`}
        className={outline}
        strokeWidth={5}
      />
      {['fill-neon-coral', 'fill-mustard', 'fill-sea-green'].map(
        (fill, index) => (
          <circle
            key={fill}
            cx={WINDOW.x + 30 + index * 22}
            cy={WINDOW.y + 25}
            r={7}
            className={fill}
          />
        ),
      )}
      <rect
        x={WINDOW.x + 106}
        y={WINDOW.y + 12}
        width={360}
        height={26}
        rx={13}
        className="fill-navy-taupe/10"
      />
      <text
        x={WINDOW.x + 122}
        y={WINDOW.y + 30}
        fontSize={15}
        fontWeight={800}
        className="fill-navy-taupe/75"
      >
        {url}
      </text>
      <clipPath id={`${clipPrefix}-window`}>
        <path
          d={`M${CONTENT.x} ${CONTENT.y} H${CONTENT.right} V${
            CONTENT.bottom - 23
          } Q${CONTENT.right} ${CONTENT.bottom} ${CONTENT.right - 23} ${
            CONTENT.bottom
          } H${CONTENT.x + 23} Q${CONTENT.x} ${CONTENT.bottom} ${CONTENT.x} ${
            CONTENT.bottom - 23
          } Z`}
        />
      </clipPath>
      <g clipPath={`url(#${clipPrefix}-window)`}>
        <g
          transform={`translate(${CONTENT.x} ${CONTENT.y}) scale(${SCENE_SCALE}) translate(-423 -243)`}
        >
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
      </g>
      {tiles.map((tile, index) => {
        const clipId = `${clipPrefix}-${index}`;
        return (
          <g key={tile.name} transform={tile.transform} opacity={tile.opacity}>
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
              x={LABEL_X}
              y={-19}
              width={tile.labelWidth}
              height={38}
              rx={19}
              className={cx('fill-white', outline)}
              strokeWidth={4}
            />
            <text
              x={LABEL_X + tile.labelWidth / 2}
              y={6.5}
              textAnchor="middle"
              fontSize={18}
              fontWeight={900}
              className="fill-navy-taupe"
            >
              {tile.name}
            </text>
          </g>
        );
      })}
      <g
        transform={`translate(${WINDOW.x + WINDOW.width - 10} ${
          WINDOW.y + 10
        }) rotate(${-12 + Math.sin((TAU * t) / 2.7) * 4}) scale(${Math.max(
          0.001,
          badge,
        )})`}
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
    </svg>
  );
}

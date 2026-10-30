'use client';

import { useId } from 'react';

import { AppTile, appTileLabelWidth } from '@codaco/art/illustration/AppTile';
import { Badge } from '@codaco/art/illustration/Badge';
import {
  BrowserWindow,
  browserContent,
} from '@codaco/art/illustration/BrowserWindow';
import { DottedPath } from '@codaco/art/illustration/DottedPath';
import {
  backOut,
  inCubic,
  segment,
  TAU,
  useIllustrationClock,
} from '@codaco/art/illustration/motion';

import {
  ArchitectScene,
  FrescoScene,
  HomeScene,
  InterviewerScene,
} from './AppWindowScenes';

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
const LABEL_X = TILE / 2 + 16;

// The browser window. The scenes are drawn for a 484 × 194 content area at
// (423, 243); they are scaled to fill this window's content area instead.
const WINDOW = { x: 440, y: 60, width: 710, height: 336 } as const;
const CONTENT = browserContent(WINDOW);
const SCENE_SCALE = (CONTENT.right - CONTENT.x) / 484;
const WINDOW_MID_Y = (CONTENT.y + CONTENT.bottom) / 2;

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
    ? TILE_X + LABEL_X + appTileLabelWidth(active.name) + 14
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
          <DottedPath
            d={`M${linkStart} ${active.y} C${linkMid} ${active.y} ${linkMid} ${WINDOW_MID_Y} ${linkEnd} ${WINDOW_MID_Y}`}
            time={time}
          />
          <circle
            cx={linkEnd}
            cy={WINDOW_MID_Y}
            r={7}
            className="fill-navy-taupe/40"
          />
        </g>
      ) : null}
      <BrowserWindow frame={WINDOW} url={url} clipId={`${clipPrefix}-window`}>
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
      </BrowserWindow>
      {tiles.map((tile, index) => (
        <g key={tile.name} transform={tile.transform} opacity={tile.opacity}>
          <AppTile
            href={tile.icon}
            size={TILE}
            clipId={`${clipPrefix}-${index}`}
            label={tile.name}
          />
        </g>
      ))}
      <g
        transform={`translate(${WINDOW.x + WINDOW.width - 10} ${
          WINDOW.y + 10
        }) rotate(${-12 + Math.sin((TAU * t) / 2.7) * 4}) scale(${Math.max(
          0.001,
          badge,
        )})`}
      >
        <Badge r={54}>
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
        </Badge>
      </g>
    </svg>
  );
}

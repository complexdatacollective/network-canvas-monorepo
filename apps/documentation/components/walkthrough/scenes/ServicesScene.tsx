'use client';

import { Cloud, Code, Database, FolderOpen } from 'lucide-react';
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
  grow,
  segment,
  TAU,
  useIllustrationClock,
} from '@codaco/art/illustration/motion';

import { GroundShadow, Icon, link, Particles } from './parts';

// Four services connect, one after another, to the reader's own Fresco.
const services = [
  {
    label: 'GitHub',
    icon: Code,
    y: 70,
    tile: 'fill-purple-pizazz',
    particle: 'fill-purple-pizazz',
  },
  {
    label: 'Neon',
    icon: Database,
    y: 170,
    tile: 'fill-sea-green',
    particle: 'fill-sea-green',
  },
  {
    label: 'UploadThing',
    icon: FolderOpen,
    y: 270,
    tile: 'fill-mustard',
    particle: 'fill-mustard',
  },
  {
    label: 'Netlify',
    icon: Cloud,
    y: 370,
    tile: 'fill-cerulean-blue',
    particle: 'fill-cerulean-blue',
  },
] as const;

const TILE_X = 90;
const TILE = 76;
const STARTS = [0.2, 0.6, 1.0, 1.4] as const;
const TRAVEL = 0.8;
const APP_AT = 2.5;
const BADGE_AT = 3;
const END = 3.6;

const WINDOW = { x: 640, y: 70, width: 500, height: 320 } as const;
const CONTENT = browserContent(WINDOW);
const DOCK: readonly [number, number] = [
  WINDOW.x - 12,
  (CONTENT.y + CONTENT.bottom) / 2,
];

export function ServicesScene() {
  const { ref, time } = useIllustrationClock(END, { from: 0 });
  const id = useId().replace(/[^\w-]/g, '');
  const t = time;
  const app = backOut(segment(t, APP_AT, 0.5));
  const badge = backOut(segment(t, BADGE_AT, 0.5));
  const midX = (CONTENT.x + CONTENT.right) / 2;
  const midY = (CONTENT.y + CONTENT.bottom) / 2;

  return (
    <svg
      ref={ref}
      viewBox="0 0 1200 460"
      className="font-heading block h-auto max-h-full w-full overflow-visible"
      aria-hidden
    >
      <GroundShadow
        cx={WINDOW.x + WINDOW.width / 2}
        cy={420}
        rx={WINDOW.width / 2}
      />
      {services.map((service, index) => {
        const k = segment(t, STARTS[index]!, 0.3);
        const from: readonly [number, number] = [
          TILE_X + TILE / 2 + 16 + appTileLabelWidth(service.label) + 14,
          service.y,
        ];
        const path = link(from, DOCK);
        return (
          <g key={service.label}>
            <g opacity={k}>
              <DottedPath d={path.d} time={time} />
            </g>
            <Particles
              path={path}
              since={t - STARTS[index]! - 0.25}
              duration={TRAVEL}
              fill={service.particle}
            />
          </g>
        );
      })}
      <circle cx={DOCK[0]} cy={DOCK[1]} r={8} className="fill-navy-taupe/40" />
      <BrowserWindow
        frame={WINDOW}
        url="your-study.netlify.app"
        clipId={`${id}-window`}
        urlWidth={280}
      >
        <rect
          x={CONTENT.x}
          y={CONTENT.y}
          width={CONTENT.right - CONTENT.x}
          height={CONTENT.bottom - CONTENT.y}
          className="fill-navy-taupe/5"
        />
        <g transform={`translate(${midX} ${midY - 18}) scale(${grow(app)})`}>
          <AppTile
            href="/assets/walkthroughs/fresco-icon.png"
            size={110}
            clipId={`${id}-fresco`}
          />
        </g>
        <text
          x={midX}
          y={midY + 82}
          textAnchor="middle"
          fontSize={24}
          fontWeight={900}
          className="fill-navy-taupe"
          opacity={segment(t, APP_AT + 0.2, 0.3)}
        >
          Your Fresco
        </text>
      </BrowserWindow>
      {services.map((service, index) => {
        const k = backOut(segment(t, STARTS[index]!, 0.5));
        const y =
          service.y + Math.sin((TAU * t) / 2.7 + index) * 3 * Math.min(1, k);
        return (
          <g
            key={service.label}
            transform={`translate(${TILE_X} ${y}) scale(${grow(Math.min(1, k * 1.05))})`}
          >
            <AppTile
              size={TILE}
              clipId={`${id}-${index}`}
              label={service.label}
              fill={service.tile}
            >
              <Icon
                icon={service.icon}
                x={0}
                y={0}
                size={40}
                className="text-white"
              />
            </AppTile>
          </g>
        );
      })}
      <g
        transform={`translate(${WINDOW.x + WINDOW.width - 6} ${WINDOW.y + 6}) rotate(${-12 + Math.sin((TAU * t) / 2.7) * 4}) scale(${grow(badge)})`}
      >
        <Badge r={48}>
          <text
            y={12}
            textAnchor="middle"
            fontSize={30}
            fontWeight={900}
            className="fill-navy-taupe"
          >
            FREE
          </text>
        </Badge>
      </g>
    </svg>
  );
}

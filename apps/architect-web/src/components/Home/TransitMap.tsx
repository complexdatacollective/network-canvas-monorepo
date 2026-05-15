import { motion, useReducedMotion } from 'motion/react';
import { useEffect, useRef } from 'react';

import { STAGE_META, type TimelineStop } from './timelineScript';

// Internal SVG design coordinates. The outer container width controls the
// actual rendered size; everything inside scales via viewBox so stations,
// strokes, labels, and spacing all grow together.
const DESIGN_W = 634;
const DESIGN_H = 1100;
const STATION_X = DESIGN_W / 2;
const STATION_GAP = 140;
const ANCHOR_Y = DESIGN_H * 0.65;
const STATION_R = 36;
const STATION_INNER_R = 28;
const HALO_R = 60;
const ICON_SIZE = 26;
const LINE_STROKE = 16;
const LABEL_W = 240;
const LABEL_EDGE_GAP = 20;
const INDEX_EDGE_GAP = 10;
const INDEX_W = 36;
// How many stations stay mounted at once. The newest sits at ANCHOR_Y and older
// ones stack upward; anything further up has drifted into the top fade mask.
// Keeping this bounded stops the DOM growing without limit while the timeline
// loops.
const VISIBLE_WINDOW = 7;
// Stagger between stations during the initial-mount cascade (newest first,
// then progressively older above).
const INITIAL_BLOOM_STAGGER_S = 0.12;

type TransitMapProps = {
  stops: TimelineStop[];
  count: number;
};

type WindowedStop = TimelineStop & { absoluteIndex: number };

export default function TransitMap({ stops, count }: TransitMapProps) {
  const reducedMotion = useReducedMotion();
  const firstMountRef = useRef(true);
  const isFirstMount = firstMountRef.current;
  useEffect(() => {
    firstMountRef.current = false;
  }, []);

  const windowSize = Math.min(count, VISIBLE_WINDOW);
  const windowStart = count - windowSize;
  const stations: WindowedStop[] = Array.from(
    { length: windowSize },
    (_, k) => {
      const absoluteIndex = windowStart + k;
      const stop = stops[absoluteIndex % stops.length];
      if (!stop) throw new Error('TIMELINE_SCRIPT is empty');
      return { ...stop, absoluteIndex };
    },
  );
  const newestAbs = count - 1;
  const translateY = ANCHOR_Y - newestAbs * STATION_GAP;

  return (
    <div aria-hidden className="pointer-events-none flex h-full w-full">
      <svg
        viewBox={`0 0 ${DESIGN_W} ${DESIGN_H}`}
        width="100%"
        height="100%"
        preserveAspectRatio="xMidYMin meet"
      >
        <title>Protocol timeline</title>
        <defs>
          <linearGradient id="nc-timeline-fade" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#fff" stopOpacity="0" />
            <stop offset="0.11" stopColor="#fff" stopOpacity="0.35" />
            <stop offset="0.24" stopColor="#fff" stopOpacity="1" />
          </linearGradient>
          <mask
            id="nc-timeline-mask"
            maskUnits="userSpaceOnUse"
            x={0}
            y={0}
            width={DESIGN_W}
            height={DESIGN_H}
          >
            <rect
              x={0}
              y={0}
              width={DESIGN_W}
              height={DESIGN_H}
              fill="url(#nc-timeline-fade)"
            />
          </mask>
        </defs>

        <g mask="url(#nc-timeline-mask)">
          <motion.g
            initial={false}
            animate={{ y: translateY }}
            transition={{ type: 'spring', stiffness: 70, damping: 26, mass: 2 }}
          >
            {stations.map((s, i) => {
              if (i === 0) return null;
              const prev = stations[i - 1];
              if (!prev) return null;
              const prevMeta = STAGE_META[prev.key];
              const y1 = prev.absoluteIndex * STATION_GAP;
              const y2 = s.absoluteIndex * STATION_GAP;
              const isNewSeg = s.absoluteIndex === newestAbs;
              const drawSegment = !reducedMotion && (isFirstMount || isNewSeg);
              const segDelay = isFirstMount
                ? (windowSize - i) * INITIAL_BLOOM_STAGGER_S
                : 0;
              return (
                <motion.line
                  key={`seg-${s.absoluteIndex}`}
                  x1={STATION_X}
                  y1={y1}
                  x2={STATION_X}
                  initial={drawSegment ? { y2: y1 } : false}
                  animate={{ y2 }}
                  transition={{
                    type: 'spring',
                    stiffness: 110,
                    damping: 23,
                    mass: 2,
                    delay: segDelay,
                  }}
                  stroke={prevMeta.color}
                  strokeWidth={LINE_STROKE}
                  strokeLinecap="round"
                  opacity={0.9}
                />
              );
            })}

            {stations.map((s, i) => {
              if (i === 0) return null;
              const ys = (s.absoluteIndex - 0.5) * STATION_GAP;
              return (
                <line
                  key={`tick-${s.absoluteIndex}`}
                  x1={STATION_X - 12}
                  x2={STATION_X + 12}
                  y1={ys}
                  y2={ys}
                  stroke="#1F1B3A"
                  strokeWidth={1.6}
                  opacity={0.22}
                />
              );
            })}

            {stations.map((s, i) => {
              const y = s.absoluteIndex * STATION_GAP;
              const meta = STAGE_META[s.key];
              const isNewest = s.absoluteIndex === newestAbs;
              const entryDelay = reducedMotion
                ? undefined
                : isFirstMount
                  ? (windowSize - 1 - i) * INITIAL_BLOOM_STAGGER_S
                  : isNewest
                    ? 0
                    : undefined;
              return (
                <Station
                  key={`station-${s.absoluteIndex}`}
                  x={STATION_X}
                  y={y}
                  meta={meta}
                  label={s.label}
                  sub={s.sub}
                  isNewest={isNewest}
                  labelLeft={s.absoluteIndex % 2 === 1}
                  index={s.absoluteIndex}
                  entryDelay={entryDelay}
                />
              );
            })}
          </motion.g>
        </g>
      </svg>
    </div>
  );
}

type StationProps = {
  x: number;
  y: number;
  meta: (typeof STAGE_META)[keyof typeof STAGE_META];
  label: string;
  sub: string;
  isNewest: boolean;
  labelLeft: boolean;
  index: number;
  entryDelay?: number;
};

function Station({
  x,
  y,
  meta,
  label,
  sub,
  isNewest,
  labelLeft,
  index,
  entryDelay,
}: StationProps) {
  const shouldEntry = entryDelay !== undefined;
  const baseDelay = entryDelay ?? 0;
  const stationSpring = {
    type: 'spring',
    stiffness: 110,
    damping: 15,
    mass: 2,
    delay: baseDelay,
  } as const;
  const labelSpring = {
    type: 'spring',
    stiffness: 110,
    damping: 21,
    mass: 2,
    delay: 0.15 + baseDelay,
  } as const;
  const indexSpring = {
    type: 'spring',
    stiffness: 110,
    damping: 21,
    mass: 2,
    delay: 0.2 + baseDelay,
  } as const;

  return (
    <g>
      {/* Station disc + halo + icon: slide up from below */}
      <motion.g
        initial={shouldEntry ? { y: 120, opacity: 0 } : false}
        animate={{ y: 0, opacity: 1 }}
        transition={stationSpring}
      >
        {isNewest && shouldEntry && (
          <motion.circle
            cx={x}
            cy={y}
            fill="none"
            stroke={meta.color}
            initial={{ r: STATION_R, opacity: 1, strokeWidth: 6 }}
            animate={{ r: HALO_R, opacity: 0, strokeWidth: 1.5 }}
            transition={{
              duration: 1.2,
              delay: 0.5 + baseDelay,
              ease: 'easeOut',
            }}
          />
        )}
        <circle cx={x} cy={y} r={STATION_R} fill="#fff" />
        <circle cx={x} cy={y} r={STATION_INNER_R} fill={meta.color} />
        <foreignObject
          x={x - ICON_SIZE / 2}
          y={y - ICON_SIZE / 2}
          width={ICON_SIZE}
          height={ICON_SIZE}
          style={{ overflow: 'visible' }}
        >
          <div
            className="flex h-full w-full items-center justify-center"
            style={{ filter: 'brightness(0) invert(1)' }}
          >
            <img
              src={meta.icon}
              alt=""
              style={{ width: ICON_SIZE, height: ICON_SIZE }}
            />
          </div>
        </foreignObject>
      </motion.g>

      {/* Label pill: slide in from its outer side */}
      <motion.g
        initial={shouldEntry ? { x: labelLeft ? -80 : 80, opacity: 0 } : false}
        animate={{ x: 0, opacity: 1 }}
        transition={labelSpring}
      >
        <foreignObject
          x={
            labelLeft
              ? x - STATION_R - LABEL_EDGE_GAP - LABEL_W
              : x + STATION_R + LABEL_EDGE_GAP
          }
          y={y - 40}
          width={LABEL_W}
          height={80}
          style={{ overflow: 'visible' }}
        >
          <div
            className="flex h-full w-full items-center"
            style={{ justifyContent: labelLeft ? 'flex-end' : 'flex-start' }}
          >
            <div
              className="font-heading min-w-0 rounded-full bg-white/40 px-6 py-3"
              style={{
                boxShadow: '0 8px 20px rgba(22,21,43,0.10)',
                maxWidth: LABEL_W - 20,
              }}
            >
              <div className="truncate text-[19px] leading-tight font-extrabold tracking-tight text-[hsl(240_35%_17%)]">
                {label}
              </div>
              <div
                className="mt-0.75 text-[12px] leading-none font-bold tracking-[0.16em] uppercase"
                style={{ color: meta.color }}
              >
                {sub}
              </div>
            </div>
          </div>
        </foreignObject>
      </motion.g>

      {/* Index marker: slide in from the opposite outer side */}
      <motion.g
        initial={shouldEntry ? { x: labelLeft ? 60 : -60, opacity: 0 } : false}
        animate={{ x: 0, opacity: 1 }}
        transition={indexSpring}
      >
        <foreignObject
          x={
            labelLeft
              ? x + STATION_R + INDEX_EDGE_GAP
              : x - STATION_R - INDEX_EDGE_GAP - INDEX_W
          }
          y={y - 10}
          width={INDEX_W}
          height={20}
        >
          <div
            className="font-mono text-[12px] tracking-widest text-[hsl(220_4%_44%)]"
            style={{ textAlign: labelLeft ? 'left' : 'right' }}
          >
            {String(index + 1).padStart(2, '0')}
          </div>
        </foreignObject>
      </motion.g>
    </g>
  );
}

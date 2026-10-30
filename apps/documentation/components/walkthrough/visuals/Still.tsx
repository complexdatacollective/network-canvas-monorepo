'use client';

import { useId } from 'react';

import {
  BrowserWindow,
  browserContent,
} from '@codaco/art/illustration/BrowserWindow';
import { ClickRing, Cursor } from '@codaco/art/illustration/Cursor';
import {
  backOut,
  grow,
  segment,
  useIllustrationClock,
} from '@codaco/art/illustration/motion';

import { GroundShadow, lerp, smooth, type Point } from '../scenes/parts';
import type { Region, Visual } from '../types';
import { screenFrame } from './screenFrame';

type StillVisual = Extract<Visual, { kind: 'still' }>;

const PAD = 6;
const MAX_ZOOM = 2.2;
// Past this, a screenshot is enlarged beyond its own pixels and blurs.
const PIXELS_PER_ZOOM = 1000;

const ZOOM_AT = 0.5;
const ZOOM = 0.9;
const BETWEEN = 1.1;
const GLIDE = 0.6;

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

const around = (regions: Region[]): Region | null => {
  if (regions.length === 0) return null;
  const x = Math.max(Math.min(...regions.map((r) => r.x)) - PAD, 0);
  const y = Math.max(Math.min(...regions.map((r) => r.y)) - PAD, 0);
  const right = Math.min(Math.max(...regions.map((r) => r.x + r.w)) + PAD, 100);
  const bottom = Math.min(
    Math.max(...regions.map((r) => r.y + r.h)) + PAD,
    100,
  );
  return { x, y, w: right - x, h: bottom - y };
};

// The camera: a scale and a translation, in percentages of the screenshot,
// that bring the zoom region to the middle without showing past its edge.
const cameraFor = (visual: StillVisual) => {
  const region =
    visual.zoom === false
      ? null
      : (visual.zoom ?? around(visual.highlights ?? []));
  const limit = Math.min(MAX_ZOOM, Math.max(1, visual.width / PIXELS_PER_ZOOM));
  if (!region) return { scale: 1, x: 0, y: 0 };
  const scale = clamp(Math.min(80 / region.w, 80 / region.h), 1, limit);
  const x = clamp(50 - (region.x + region.w / 2) * scale, 100 - 100 * scale, 0);
  const y = clamp(50 - (region.y + region.h / 2) * scale, 100 - 100 * scale, 0);
  return { scale, x, y };
};

// A screenshot inside an illustrated browser window, in the style of the
// /updates scenes: the camera zooms to the highlights, then the cursor visits
// each in turn and clicks while the rest of the page dims.
export default function Still({ visual }: { visual: StillVisual }) {
  const id = useId().replace(/[^\w-]/g, '');
  const highlights = visual.highlights ?? [];
  const camera = cameraFor(visual);
  const zooms = camera.scale > 1;
  const first = zooms ? ZOOM_AT + ZOOM + 0.2 : ZOOM_AT + 0.1;
  const arrivals = highlights.map((_, i) => first + GLIDE + i * BETWEEN);
  const rest = (arrivals[arrivals.length - 1] ?? first) + 1;
  const end = rest + 0.4;
  const { ref, time: t } = useIllustrationClock(end, { from: 0 });

  const { frame, viewWidth, viewHeight, fit } = screenFrame(
    visual.width,
    visual.height,
  );
  const content = browserContent(frame);
  const cw = content.right - content.x;
  const ch = content.bottom - content.y;

  const zoom = smooth(segment(t, ZOOM_AT, ZOOM));
  const scale = lerp(1, camera.scale, zoom);
  const tx = (lerp(0, camera.x, zoom) / 100) * cw;
  const ty = (lerp(0, camera.y, zoom) / 100) * ch;
  // Highlights are placed with the finished camera; they appear after it.
  const place = (r: Region) => ({
    x: (r.x / 100) * cw * camera.scale + (camera.x / 100) * cw,
    y: (r.y / 100) * ch * camera.scale + (camera.y / 100) * ch,
    w: (r.w / 100) * cw * camera.scale,
    h: (r.h / 100) * ch * camera.scale,
  });
  const boxes = highlights.map(place);
  const center = (i: number): Point => {
    const box = boxes[i];
    return box
      ? [box.x + box.w / 2, box.y + box.h / 2]
      : [cw * 0.92, ch * 1.08];
  };

  let active = -1;
  arrivals.forEach((arrival, i) => {
    if (t >= arrival - GLIDE) active = i;
  });
  const resting = t >= rest;
  const leg =
    active >= 0 ? smooth(segment(t, arrivals[active]! - GLIDE, GLIDE)) : 0;
  const from = active > 0 ? center(active - 1) : center(-1);
  const to = active >= 0 ? center(active) : center(-1);
  const tip: Point = [
    lerp(from[0], to[0], leg),
    lerp(from[1], to[1], leg) - Math.sin(Math.PI * leg) * 30,
  ];
  const cursorOpacity = segment(t, first, 0.3) * (1 - segment(t, rest, 0.3));
  const spot =
    active >= 0
      ? segment(t, arrivals[active]! - 0.3, 0.3) * (1 - segment(t, rest, 0.3))
      : 0;
  const spotBox = active >= 0 ? boxes[active] : undefined;

  return (
    // Size containment lets the drawing fit both dimensions of the stage.
    <div className="@container-size grid size-full place-items-center">
      <svg
        ref={ref}
        viewBox={`0 0 ${viewWidth} ${viewHeight}`}
        className="font-heading block h-auto overflow-visible"
        style={fit}
        role="img"
        aria-label={visual.alt}
      >
        <GroundShadow
          cx={frame.x + frame.width / 2}
          cy={frame.y + frame.height + 16}
          rx={frame.width / 2}
        />
        <BrowserWindow
          frame={frame}
          url={visual.url}
          clipId={`${id}-window`}
          urlWidth={380}
        >
          <g transform={`translate(${content.x} ${content.y})`}>
            <g transform={`translate(${tx} ${ty}) scale(${scale})`}>
              <image
                href={visual.src}
                width={cw}
                height={ch}
                preserveAspectRatio="none"
              />
            </g>
            {spotBox && spot > 0 ? (
              <>
                <mask id={`${id}-spot`}>
                  <rect width={cw} height={ch} className="fill-white" />
                  <rect
                    x={spotBox.x - 6}
                    y={spotBox.y - 6}
                    width={spotBox.w + 12}
                    height={spotBox.h + 12}
                    rx={12}
                    className="fill-black"
                  />
                </mask>
                <rect
                  width={cw}
                  height={ch}
                  className="fill-navy-taupe"
                  opacity={0.4 * spot}
                  mask={`url(#${id}-spot)`}
                />
              </>
            ) : null}
            {boxes.map((box, i) => {
              if (highlights[i]?.marked) return null;
              const k = backOut(segment(t, arrivals[i]!, 0.4));
              if (k <= 0) return null;
              const cx = box.x + box.w / 2;
              const cy = box.y + box.h / 2;
              return (
                <rect
                  key={i}
                  x={box.x - 6}
                  y={box.y - 6}
                  width={box.w + 12}
                  height={box.h + 12}
                  rx={12}
                  fill="none"
                  className="stroke-mustard"
                  strokeWidth={6}
                  transform={`translate(${cx} ${cy}) scale(${grow(k)}) translate(${-cx} ${-cy})`}
                />
              );
            })}
            {arrivals.map((arrival, i) => (
              <ClickRing
                key={i}
                at={center(i)}
                progress={segment(t, arrival, 0.45)}
                stroke="stroke-sea-serpent"
              />
            ))}
            {cursorOpacity > 0 && !resting ? (
              <Cursor
                tip={tip}
                fill="fill-sea-serpent"
                opacity={cursorOpacity}
              />
            ) : null}
          </g>
        </BrowserWindow>
      </svg>
    </div>
  );
}

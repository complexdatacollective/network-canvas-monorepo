import { useId } from 'react';
import type { ReactNode } from 'react';

import type { NodeShape } from '@codaco/fresco-ui/Node';

import type { Status } from '../genetics/status';

type StatusMarkerProps = {
  status: Status;
  color: string;
  shape?: NodeShape;
};

const VB = 100;
const R = 40;
const C = VB / 2;
const STROKE = 3;

// The diamond conforms to the node by rotating the square 45° and scaling it
// down so its points stay inside the marker box — mirrors fresco-ui Node's
// `scale-[0.85] rotate-45` diamond treatment so the glyph sits inside the
// rendered diamond.
const DIAMOND_SCALE = 0.85;

// SVG applies transforms right-to-left, so `scale` runs first and shrinks toward
// the (0,0) origin; the `translate` re-centres the scaled square before the
// `rotate` turns it into a diamond. Non-diamond shapes need no transform.
function squareTransform(shape: NodeShape): string | undefined {
  if (shape !== 'diamond') return undefined;
  const shift = (C * (1 - DIAMOND_SCALE)) / DIAMOND_SCALE;
  return `rotate(45, ${C}, ${C}) translate(${shift}, ${shift}) scale(${DIAMOND_SCALE})`;
}

/** The square/diamond body, inset by `inset` on every edge. */
function squareRect(
  inset: number,
  fill: string,
  shape: NodeShape,
  extra?: Record<string, string | number | undefined>,
) {
  return (
    <rect
      x={C - R + inset}
      y={C - R + inset}
      width={(R - inset) * 2}
      height={(R - inset) * 2}
      rx={R * 0.2}
      fill={fill}
      transform={squareTransform(shape)}
      {...extra}
    />
  );
}

/**
 * Disease-coloured shape outline drawn for every status, so each glyph sits
 * inside a disease-coloured perimeter matching the node's own shape.
 */
function ShapeOutline({ color, shape }: { color: string; shape: NodeShape }) {
  if (shape === 'circle') {
    return (
      <circle
        cx={C}
        cy={C}
        r={R - STROKE / 2}
        fill="none"
        stroke={color}
        strokeWidth={STROKE}
        data-shape-outline
      />
    );
  }
  return squareRect(STROKE / 2, 'none', shape, {
    'stroke': color,
    'strokeWidth': STROKE,
    'data-shape-outline': '',
  });
}

function FilledShape({ color, shape }: { color: string; shape: NodeShape }) {
  if (shape === 'circle') {
    return <circle cx={C} cy={C} r={R} fill={color} data-filled-shape />;
  }
  return squareRect(0, color, shape, { 'data-filled-shape': '' });
}

/**
 * The shape's interior as a `<clipPath>` so line/hatch fills are confined to the
 * person's shape. Returns the clip element plus the id to reference it.
 */
function ShapeClip({ id, shape }: { id: string; shape: NodeShape }) {
  return (
    <clipPath id={id}>
      {shape === 'circle' ? (
        <circle cx={C} cy={C} r={R - STROKE / 2} />
      ) : (
        squareRect(STROKE / 2, 'black', shape)
      )}
    </clipPath>
  );
}

/**
 * Single vertical line through the centre, clipped to the shape — the
 * obligate-affected ("will develop it") glyph. When `broken` is set the line is
 * drawn as two segments with a central gap so a centred "?" reads over it.
 */
function VerticalLine({
  color,
  clipId,
  broken = false,
}: {
  color: string;
  clipId: string;
  broken?: boolean;
}) {
  const gap = R * 0.32;
  if (broken) {
    return (
      <g clipPath={`url(#${clipId})`} data-vertical-line>
        <line
          x1={C}
          y1={C - R}
          x2={C}
          y2={C - gap}
          stroke={color}
          strokeWidth={STROKE}
        />
        <line
          x1={C}
          y1={C + gap}
          x2={C}
          y2={C + R}
          stroke={color}
          strokeWidth={STROKE}
        />
      </g>
    );
  }
  return (
    <line
      x1={C}
      y1={C - R}
      x2={C}
      y2={C + R}
      stroke={color}
      strokeWidth={STROKE}
      clipPath={`url(#${clipId})`}
      data-vertical-line
    />
  );
}

/**
 * Horizontal line-fill (hatch of evenly spaced horizontal lines) clipped to the
 * shape — the obligate-carrier glyph. The 2022 revision drops the central dot,
 * so the hatch alone signals carrier status.
 */
function HatchFill({
  color,
  clipId,
  patternId,
}: {
  color: string;
  clipId: string;
  patternId: string;
}) {
  const step = 9;
  return (
    <>
      <pattern
        id={patternId}
        width={VB}
        height={step}
        patternUnits="userSpaceOnUse"
      >
        <line
          x1={0}
          y1={step / 2}
          x2={VB}
          y2={step / 2}
          stroke={color}
          strokeWidth={2}
        />
      </pattern>
      <rect
        x={0}
        y={0}
        width={VB}
        height={VB}
        fill={`url(#${patternId})`}
        clipPath={`url(#${clipId})`}
        data-hatch-fill
      />
    </>
  );
}

/**
 * Centred "?" on a small white circular break, so it reads over the vertical
 * line / hatch of the at-risk glyphs. The white disc gives the "?" its own
 * legible field and visually breaks the line around it.
 */
function AtRiskQuery({ color }: { color: string }) {
  return (
    <>
      <circle cx={C} cy={C} r={R * 0.34} fill="white" data-query-break />
      <text
        x={C}
        y={C + 12}
        textAnchor="middle"
        fontSize={38}
        fontWeight="bold"
        fill={color}
        data-question-mark
      >
        ?
      </text>
    </>
  );
}

function statusGlyph(
  status: Status,
  color: string,
  shape: NodeShape,
  clipId: string,
  patternId: string,
): ReactNode {
  switch (status) {
    case 'affected':
      return <FilledShape color={color} shape={shape} />;
    case 'obligateAffected':
      return <VerticalLine color={color} clipId={clipId} />;
    case 'obligateCarrier':
      return <HatchFill color={color} clipId={clipId} patternId={patternId} />;
    case 'atRiskAffected':
      return (
        <>
          <VerticalLine color={color} clipId={clipId} broken />
          <AtRiskQuery color={color} />
        </>
      );
    case 'atRiskCarrier':
      return (
        <>
          <HatchFill color={color} clipId={clipId} patternId={patternId} />
          <AtRiskQuery color={color} />
        </>
      );
    case 'unknown':
      return null;
    default: {
      const exhaustive: never = status;
      return exhaustive;
    }
  }
}

/**
 * Renders the shape-aware standard pedigree-notation status symbol (Bennett
 * 2022) for a single disease status, on a viewBox-100 canvas filling its
 * positioned parent. The shape outline and notation are drawn in the condition's
 * colour; the symbol field is white (the consumer paints the white background)
 * except `affected`, which is a solid fill.
 *
 * The SVG is `aria-hidden`; consumers own the labelled wrapper, the white
 * background, and positioning. A `data-status` attribute on the root SVG lets
 * consumers and tests locate the rendered marker by status value.
 */
export function StatusMarker({
  status,
  color,
  shape = 'square',
}: StatusMarkerProps) {
  const baseId = useId();
  const clipId = `${baseId}-clip`;
  const patternId = `${baseId}-hatch`;
  return (
    <svg
      viewBox={`0 0 ${VB} ${VB}`}
      aria-hidden
      className="pointer-events-none absolute inset-0 h-full w-full"
      data-status={status}
    >
      <defs>
        <ShapeClip id={clipId} shape={shape} />
      </defs>
      <ShapeOutline color={color} shape={shape} />
      {statusGlyph(status, color, shape, clipId, patternId)}
    </svg>
  );
}

/**
 * The at-risk-homozygous override glyph: a fully shaded shape (solid condition
 * colour) with a centred WHITE "?" drawn directly on the fill — no white circle
 * behind it. Conveys "may be affected" (two copies; consanguinity / compound
 * heterozygosity) and replaces the person's status glyph when set.
 */
export function HomozygousMarker({
  color,
  shape = 'square',
}: {
  color: string;
  shape?: NodeShape;
}) {
  return (
    <svg
      viewBox={`0 0 ${VB} ${VB}`}
      aria-hidden
      className="pointer-events-none absolute inset-0 h-full w-full"
      data-status="atRiskHomozygous"
    >
      <ShapeOutline color={color} shape={shape} />
      <FilledShape color={color} shape={shape} />
      <text
        x={C}
        y={C + 12}
        textAnchor="middle"
        fontSize={38}
        fontWeight="bold"
        fill="white"
        data-question-mark
      >
        ?
      </text>
    </svg>
  );
}

import { useId } from 'react';
import type { ReactNode } from 'react';

import type { NodeShape } from '@codaco/fresco-ui/Node';

import type { Status } from '../genetics/status';

type StatusMarkerProps = {
  status: Status;
  color: string;
  shape?: NodeShape;
  /**
   * Fill behind the notation (defaults white). Dimmed callers pass a
   * background-blended colour so the symbol field recedes with its glyph.
   */
  surfaceColor?: string;
};

const VB = 100;
const C = VB / 2;

// Heavy strokes so the standard pedigree notation stays legible when a
// perimeter sticker is rendered at only ~28px wide.
const OUTLINE_STROKE = 7;
const LINE_STROKE = 9;
const HATCH_STROKE = 6;
const HATCH_STEP = 15;

// Largest radius that keeps the stroked outline inside the 100×100 box.
const R = C - (OUTLINE_STROKE / 2 + 1);
// The diamond is the square rotated 45°: shrink its half-side by √2 so the
// rotated points (the diamond's tips) stay inside the box instead of clipping
// into an octagon.
const DIAMOND_HALF = R / Math.SQRT2;
const CORNER_RADIUS_FRACTION = 0.18;

const WHITE = 'white';

/**
 * One shape primitive for all three node shapes, used for the surface fill, the
 * outline, and the clip path so they share a single geometry (no white border
 * ring from a background drawn larger than the outline).
 */
function Shape({
  shape,
  fill = 'none',
  stroke,
  strokeWidth,
  dataAttr,
}: {
  shape: NodeShape;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  dataAttr?: Record<string, string>;
}) {
  if (shape === 'circle') {
    return (
      <circle
        cx={C}
        cy={C}
        r={R}
        fill={fill}
        stroke={stroke}
        strokeWidth={strokeWidth}
        {...dataAttr}
      />
    );
  }
  const half = shape === 'diamond' ? DIAMOND_HALF : R;
  return (
    <rect
      x={C - half}
      y={C - half}
      width={half * 2}
      height={half * 2}
      rx={half * CORNER_RADIUS_FRACTION}
      fill={fill}
      stroke={stroke}
      strokeWidth={strokeWidth}
      transform={shape === 'diamond' ? `rotate(45 ${C} ${C})` : undefined}
      {...dataAttr}
    />
  );
}

/** The shape interior as a `<clipPath>` so line/hatch fills stay inside it. */
function ShapeClip({ id, shape }: { id: string; shape: NodeShape }) {
  return (
    <clipPath id={id}>
      <Shape shape={shape} fill="black" />
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
  const gap = R * 0.34;
  if (broken) {
    return (
      <g clipPath={`url(#${clipId})`} data-vertical-line>
        <line
          x1={C}
          y1={C - R}
          x2={C}
          y2={C - gap}
          stroke={color}
          strokeWidth={LINE_STROKE}
        />
        <line
          x1={C}
          y1={C + gap}
          x2={C}
          y2={C + R}
          stroke={color}
          strokeWidth={LINE_STROKE}
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
      strokeWidth={LINE_STROKE}
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
  return (
    <>
      <pattern
        id={patternId}
        width={VB}
        height={HATCH_STEP}
        patternUnits="userSpaceOnUse"
      >
        <line
          x1={0}
          y1={HATCH_STEP / 2}
          x2={VB}
          y2={HATCH_STEP / 2}
          stroke={color}
          strokeWidth={HATCH_STROKE}
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
      <circle cx={C} cy={C} r={R * 0.38} fill={WHITE} data-query-break />
      <text
        x={C}
        y={C}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={48}
        fontWeight="bold"
        fill={color}
        data-question-mark
      >
        ?
      </text>
    </>
  );
}

/** The notation drawn over the surface fill (null for affected and unknown). */
function statusGlyph(
  status: Status,
  color: string,
  clipId: string,
  patternId: string,
): ReactNode {
  switch (status) {
    case 'affected':
      return null; // drawn as the solid surface fill below
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
 * positioned parent. The surface fill, outline, and notation share one geometry:
 * the outline is the outermost edge, so there is no white border ring. The
 * symbol field is `surfaceColor` (white by default); `affected` is a solid fill
 * of the condition colour.
 *
 * The SVG is `aria-hidden`; consumers own the labelled wrapper and positioning.
 * A `data-status` attribute on the root SVG lets consumers and tests locate the
 * rendered marker by status value.
 */
export function StatusMarker({
  status,
  color,
  shape = 'square',
  surfaceColor = WHITE,
}: StatusMarkerProps) {
  const baseId = useId();
  const clipId = `${baseId}-clip`;
  const patternId = `${baseId}-hatch`;
  const isAffected = status === 'affected';
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
      {isAffected ? (
        <Shape
          shape={shape}
          fill={color}
          dataAttr={{ 'data-filled-shape': '' }}
        />
      ) : (
        <Shape shape={shape} fill={surfaceColor} />
      )}
      {statusGlyph(status, color, clipId, patternId)}
      <Shape
        shape={shape}
        fill="none"
        stroke={color}
        strokeWidth={OUTLINE_STROKE}
        dataAttr={{ 'data-shape-outline': '' }}
      />
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
      <Shape
        shape={shape}
        fill={color}
        dataAttr={{ 'data-filled-shape': '' }}
      />
      <Shape
        shape={shape}
        fill="none"
        stroke={color}
        strokeWidth={OUTLINE_STROKE}
        dataAttr={{ 'data-shape-outline': '' }}
      />
      <text
        x={C}
        y={C}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={48}
        fontWeight="bold"
        fill="white"
        data-question-mark
      >
        ?
      </text>
    </svg>
  );
}

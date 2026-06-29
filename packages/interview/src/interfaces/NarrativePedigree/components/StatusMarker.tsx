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

/**
 * Disease-coloured shape outline drawn for every status. Ensures non-filled
 * statuses (carrier, at-risk) still sit inside a disease-coloured perimeter
 * matching the node's own shape.
 */
function ShapeOutline({ color, shape }: { color: string; shape: NodeShape }) {
  const strokeWidth = 3;
  if (shape === 'circle') {
    return (
      <circle
        cx={C}
        cy={C}
        r={R - strokeWidth / 2}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        data-shape-outline
      />
    );
  }
  const inset = strokeWidth / 2;
  return (
    <rect
      x={C - R + inset}
      y={C - R + inset}
      width={(R - inset) * 2}
      height={(R - inset) * 2}
      rx={R * 0.2}
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      transform={shape === 'diamond' ? `rotate(45, ${C}, ${C})` : undefined}
      data-shape-outline
    />
  );
}

function FilledShape({ color, shape }: { color: string; shape: NodeShape }) {
  if (shape === 'circle') {
    return <circle cx={C} cy={C} r={R} fill={color} data-filled-shape />;
  }
  return (
    <rect
      x={C - R}
      y={C - R}
      width={R * 2}
      height={R * 2}
      rx={R * 0.2}
      fill={color}
      transform={shape === 'diamond' ? `rotate(45, ${C}, ${C})` : undefined}
      data-filled-shape
    />
  );
}

function CentreDot({
  color,
  dashed = false,
}: {
  color: string;
  dashed?: boolean;
}) {
  return (
    <>
      {dashed && (
        <circle
          cx={C}
          cy={C}
          r={R}
          fill="none"
          stroke={color}
          strokeWidth={2}
          strokeDasharray="6 4"
          strokeOpacity={0.6}
        />
      )}
      <circle cx={C} cy={C} r={R * 0.22} fill={color} data-centre-dot />
    </>
  );
}

function HalfFilled({ color }: { color: string }) {
  const path = `M ${C} ${C - R} A ${R} ${R} 0 0 0 ${C} ${C + R} Z`;
  return <path d={path} fill={color} data-half-fill />;
}

function Unknown({ color }: { color: string }) {
  return (
    <text
      x={C}
      y={C + 14}
      textAnchor="middle"
      fontSize={48}
      fontWeight="bold"
      fill={color}
      data-question-mark
    >
      ?
    </text>
  );
}

/**
 * Renders the shape-aware standard pedigree-notation status symbol for a single
 * disease status, on a viewBox-100 canvas filling its positioned parent.
 *
 * The SVG is `aria-hidden`; consumers own the labelled wrapper, any background
 * fill, and positioning. A `data-status` attribute on the root SVG lets
 * consumers and tests locate the rendered marker by status value.
 *
 * Display merge: `obligateAffected` is a genetics-engine distinction the
 * participant view collapses into the same filled "Has this condition" glyph as
 * `affected`. The engine still computes obligateAffected — only the drawn symbol
 * (and the key entry) are unified.
 */
function statusGlyph(
  status: Status,
  color: string,
  shape: NodeShape,
): ReactNode {
  switch (status) {
    case 'affected':
    case 'obligateAffected':
      return <FilledShape color={color} shape={shape} />;
    case 'obligateCarrier':
      return <CentreDot color={color} />;
    case 'atRiskCarrier':
      return <CentreDot color={color} dashed />;
    case 'atRiskAffected':
      return <HalfFilled color={color} />;
    case 'unknown':
      return <Unknown color={color} />;
    default: {
      const exhaustive: never = status;
      return exhaustive;
    }
  }
}

export function StatusMarker({
  status,
  color,
  shape = 'square',
}: StatusMarkerProps) {
  return (
    <svg
      viewBox={`0 0 ${VB} ${VB}`}
      aria-hidden
      className="pointer-events-none absolute inset-0 h-full w-full"
      data-status={status}
    >
      <ShapeOutline color={color} shape={shape} />
      {statusGlyph(status, color, shape)}
    </svg>
  );
}

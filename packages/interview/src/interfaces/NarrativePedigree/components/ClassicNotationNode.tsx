import Node from '@codaco/fresco-ui/Node';
import type { NodeShape } from '@codaco/fresco-ui/Node';
import type { NcNode } from '@codaco/shared-consts';

import type { Status } from '../genetics/status';

export type ClassicDisease = {
  color: string;
  status: Status;
};

type ClassicNotationNodeProps = {
  node: NcNode & { _uid: string };
  disease: ClassicDisease;
  shape: NodeShape;
  label: string;
};

/** SVG viewBox size used for all inline notation markers. */
const VB = 100;

/** Shape radius / half-side for the SVG overlay. */
const R = 40;

/** Centre coordinate. */
const C = VB / 2;

/**
 * Filled shape: solid fill in disease colour.
 * Shape is a square (rx-rounded rect for square, circle for circle, rotated rect for diamond).
 * The inline SVG is overlaid on the Node and encodes status by fill.
 */
function FilledOverlay({ color, shape }: { color: string; shape: NodeShape }) {
  return (
    <svg
      viewBox={`0 0 ${VB} ${VB}`}
      aria-hidden
      className="pointer-events-none absolute inset-0 h-full w-full"
    >
      {shape === 'circle' ? (
        <circle cx={C} cy={C} r={R} fill={color} data-filled-shape />
      ) : shape === 'diamond' ? (
        <rect
          x={C - R}
          y={C - R}
          width={R * 2}
          height={R * 2}
          rx={R * 0.2}
          fill={color}
          transform={`rotate(45, ${C}, ${C})`}
          data-filled-shape
        />
      ) : (
        <rect
          x={C - R}
          y={C - R}
          width={R * 2}
          height={R * 2}
          rx={R * 0.2}
          fill={color}
          data-filled-shape
        />
      )}
    </svg>
  );
}

/**
 * Double-outline overlay for obligateAffected: filled shape + outer stroke ring.
 * The double outline is rendered as a slightly-inset stroked ring over the filled shape,
 * distinguishing obligateAffected from plain affected.
 */
function ObligateAffectedOverlay({
  color,
  shape,
}: {
  color: string;
  shape: NodeShape;
}) {
  return (
    <svg
      viewBox={`0 0 ${VB} ${VB}`}
      aria-hidden
      className="pointer-events-none absolute inset-0 h-full w-full"
    >
      {shape === 'circle' ? (
        <>
          <circle cx={C} cy={C} r={R} fill={color} data-filled-shape />
          <circle
            cx={C}
            cy={C}
            r={R - 5}
            fill="none"
            stroke="white"
            strokeWidth={3}
            data-double-outline
          />
        </>
      ) : shape === 'diamond' ? (
        <>
          <rect
            x={C - R}
            y={C - R}
            width={R * 2}
            height={R * 2}
            rx={R * 0.2}
            fill={color}
            transform={`rotate(45, ${C}, ${C})`}
            data-filled-shape
          />
          <rect
            x={C - R + 5}
            y={C - R + 5}
            width={(R - 5) * 2}
            height={(R - 5) * 2}
            rx={R * 0.2}
            fill="none"
            stroke="white"
            strokeWidth={3}
            transform={`rotate(45, ${C}, ${C})`}
            data-double-outline
          />
        </>
      ) : (
        <>
          <rect
            x={C - R}
            y={C - R}
            width={R * 2}
            height={R * 2}
            rx={R * 0.2}
            fill={color}
            data-filled-shape
          />
          <rect
            x={C - R + 5}
            y={C - R + 5}
            width={(R - 5) * 2}
            height={(R - 5) * 2}
            rx={R * 0.2}
            fill="none"
            stroke="white"
            strokeWidth={3}
            data-double-outline
          />
        </>
      )}
    </svg>
  );
}

/**
 * Central-dot overlay: unfilled shape (transparent over node background) + a filled centre dot.
 * Used for both obligateCarrier (solid outline) and atRiskCarrier (dashed/lighter outline).
 */
function CentreDotOverlay({
  color,
  dashed = false,
}: {
  color: string;
  dashed?: boolean;
}) {
  return (
    <svg
      viewBox={`0 0 ${VB} ${VB}`}
      aria-hidden
      className="pointer-events-none absolute inset-0 h-full w-full"
    >
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
    </svg>
  );
}

/**
 * Half-filled overlay: left semicircle filled in disease colour, unfilled right side.
 * Used for atRiskAffected.
 */
function HalfFilledOverlay({ color }: { color: string }) {
  const path = `M ${C} ${C - R} A ${R} ${R} 0 0 0 ${C} ${C + R} Z`;
  return (
    <svg
      viewBox={`0 0 ${VB} ${VB}`}
      aria-hidden
      className="pointer-events-none absolute inset-0 h-full w-full"
    >
      <path d={path} fill={color} data-half-fill />
    </svg>
  );
}

/**
 * Unknown overlay: a centred ? glyph over the node, no fill.
 */
function UnknownOverlay({ color }: { color: string }) {
  return (
    <svg
      viewBox={`0 0 ${VB} ${VB}`}
      aria-hidden
      className="pointer-events-none absolute inset-0 h-full w-full"
    >
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
    </svg>
  );
}

/**
 * Selects and renders the correct inline SVG overlay for the given status.
 * The overlay is positioned absolutely over the Node symbol and carries
 * data attributes for test hooks.
 */
function NotationOverlay({
  status,
  color,
  shape,
}: {
  status: Status;
  color: string;
  shape: NodeShape;
}) {
  switch (status) {
    case 'affected':
      return <FilledOverlay color={color} shape={shape} />;
    case 'obligateAffected':
      return <ObligateAffectedOverlay color={color} shape={shape} />;
    case 'obligateCarrier':
      return <CentreDotOverlay color={color} />;
    case 'atRiskCarrier':
      return <CentreDotOverlay color={color} dashed />;
    case 'atRiskAffected':
      return <HalfFilledOverlay color={color} />;
    case 'unknown':
      return <UnknownOverlay color={color} />;
  }
}

/**
 * Classic pedigree-notation node for single-disease mode.
 *
 * The node symbol itself encodes disease status using traditional pedigree notation
 * (filled = affected, central dot = carrier, half = at-risk-affected, etc.).
 * The label is rendered beneath the symbol. No stickers are used.
 *
 * Status → symbol mapping:
 * - affected         → filled symbol (solid fill, disease colour)
 * - obligateAffected → filled symbol + inner ring (double-outline distinguisher)
 * - obligateCarrier  → central dot (unfilled symbol)
 * - atRiskCarrier    → central dot + dashed outline
 * - atRiskAffected   → left-half filled symbol
 * - unknown          → ? glyph (not absence)
 */
export function ClassicNotationNode({
  disease,
  shape,
  label,
}: ClassicNotationNodeProps) {
  const { color, status } = disease;

  return (
    <div className="inline-flex flex-col items-center gap-1">
      <span
        data-notation-status={status}
        className="relative inline-block"
        aria-label={label}
      >
        <Node label="" shape={shape} color="node-color-seq-1" size="sm" />
        <NotationOverlay status={status} color={color} shape={shape} />
      </span>
      <span
        data-node-label
        className="max-w-[6rem] overflow-hidden text-center text-xs leading-tight hyphens-auto text-white"
      >
        {label}
      </span>
    </div>
  );
}

import type { NodeShape } from '@codaco/fresco-ui/Node';

import type { Status } from '../genetics/status';

type StatusMarkerProps = {
  status: Status;
  color: string;
  variant: 'sticker' | 'classic';
  shape?: NodeShape;
};

// ─── Sticker variant constants (viewBox 20) ──────────────────────────────────

const STICKER_VB = 20;
const STICKER_R = 8;
const STICKER_C = STICKER_VB / 2;

// ─── Classic variant constants (viewBox 100) ─────────────────────────────────

const CLASSIC_VB = 100;
const CLASSIC_R = 40;
const CLASSIC_C = CLASSIC_VB / 2;

// ─── Sticker inner marker components ─────────────────────────────────────────

function StickerSolid({ color }: { color: string }) {
  return <circle cx={STICKER_C} cy={STICKER_C} r={STICKER_R} fill={color} />;
}

function StickerDoubleRing({ color }: { color: string }) {
  return (
    <>
      <circle
        cx={STICKER_C}
        cy={STICKER_C}
        r={STICKER_R}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
      />
      <circle
        cx={STICKER_C}
        cy={STICKER_C}
        r={STICKER_R * 0.58}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
      />
    </>
  );
}

function StickerRingDot({ color }: { color: string }) {
  return (
    <>
      <circle
        cx={STICKER_C}
        cy={STICKER_C}
        r={STICKER_R}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
      />
      <circle
        cx={STICKER_C}
        cy={STICKER_C}
        r={STICKER_R * 0.28}
        fill={color}
        data-centre-dot
      />
    </>
  );
}

function StickerHalf({ color }: { color: string }) {
  const path = `M ${STICKER_C} ${STICKER_C - STICKER_R} A ${STICKER_R} ${STICKER_R} 0 0 0 ${STICKER_C} ${STICKER_C + STICKER_R} Z`;
  return (
    <>
      <circle
        cx={STICKER_C}
        cy={STICKER_C}
        r={STICKER_R}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
      />
      <path d={path} fill={color} data-half-fill />
    </>
  );
}

function StickerDot({ color }: { color: string }) {
  return (
    <>
      <circle
        cx={STICKER_C}
        cy={STICKER_C}
        r={STICKER_R}
        fill="none"
        stroke={color}
        strokeWidth={1}
        strokeOpacity={0.4}
      />
      <circle
        cx={STICKER_C}
        cy={STICKER_C}
        r={STICKER_R * 0.28}
        fill={color}
        data-centre-dot
      />
    </>
  );
}

function StickerUnknown({ color }: { color: string }) {
  return (
    <>
      <circle
        cx={STICKER_C}
        cy={STICKER_C}
        r={STICKER_R}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
      />
      <text
        x={STICKER_C}
        y={STICKER_C + 3.5}
        textAnchor="middle"
        fontSize={10}
        fontWeight="bold"
        fill={color}
        data-question-mark
      >
        ?
      </text>
    </>
  );
}

// ─── Classic inner overlay components ────────────────────────────────────────

/**
 * Disease-coloured shape outline drawn for every classic status.
 * Ensures non-filled statuses (carrier, at-risk) still sit inside a
 * disease-coloured perimeter that matches the disease's all-diseases sticker.
 */
function ClassicOutline({ color, shape }: { color: string; shape: NodeShape }) {
  const strokeWidth = 3;
  if (shape === 'circle') {
    return (
      <circle
        cx={CLASSIC_C}
        cy={CLASSIC_C}
        r={CLASSIC_R - strokeWidth / 2}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        data-shape-outline
      />
    );
  }
  if (shape === 'diamond') {
    const inset = strokeWidth / 2;
    return (
      <rect
        x={CLASSIC_C - CLASSIC_R + inset}
        y={CLASSIC_C - CLASSIC_R + inset}
        width={(CLASSIC_R - inset) * 2}
        height={(CLASSIC_R - inset) * 2}
        rx={CLASSIC_R * 0.2}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        transform={`rotate(45, ${CLASSIC_C}, ${CLASSIC_C})`}
        data-shape-outline
      />
    );
  }
  const inset = strokeWidth / 2;
  return (
    <rect
      x={CLASSIC_C - CLASSIC_R + inset}
      y={CLASSIC_C - CLASSIC_R + inset}
      width={(CLASSIC_R - inset) * 2}
      height={(CLASSIC_R - inset) * 2}
      rx={CLASSIC_R * 0.2}
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      data-shape-outline
    />
  );
}

function ClassicFilledShape({
  color,
  shape,
}: {
  color: string;
  shape: NodeShape;
}) {
  if (shape === 'circle') {
    return (
      <circle
        cx={CLASSIC_C}
        cy={CLASSIC_C}
        r={CLASSIC_R}
        fill={color}
        data-filled-shape
      />
    );
  }
  if (shape === 'diamond') {
    return (
      <rect
        x={CLASSIC_C - CLASSIC_R}
        y={CLASSIC_C - CLASSIC_R}
        width={CLASSIC_R * 2}
        height={CLASSIC_R * 2}
        rx={CLASSIC_R * 0.2}
        fill={color}
        transform={`rotate(45, ${CLASSIC_C}, ${CLASSIC_C})`}
        data-filled-shape
      />
    );
  }
  return (
    <rect
      x={CLASSIC_C - CLASSIC_R}
      y={CLASSIC_C - CLASSIC_R}
      width={CLASSIC_R * 2}
      height={CLASSIC_R * 2}
      rx={CLASSIC_R * 0.2}
      fill={color}
      data-filled-shape
    />
  );
}

function ClassicObligateAffected({
  color,
  shape,
}: {
  color: string;
  shape: NodeShape;
}) {
  if (shape === 'circle') {
    return (
      <>
        <circle
          cx={CLASSIC_C}
          cy={CLASSIC_C}
          r={CLASSIC_R}
          fill={color}
          data-filled-shape
        />
        <circle
          cx={CLASSIC_C}
          cy={CLASSIC_C}
          r={CLASSIC_R - 5}
          fill="none"
          stroke="white"
          strokeWidth={3}
          data-double-outline
        />
      </>
    );
  }
  if (shape === 'diamond') {
    return (
      <>
        <rect
          x={CLASSIC_C - CLASSIC_R}
          y={CLASSIC_C - CLASSIC_R}
          width={CLASSIC_R * 2}
          height={CLASSIC_R * 2}
          rx={CLASSIC_R * 0.2}
          fill={color}
          transform={`rotate(45, ${CLASSIC_C}, ${CLASSIC_C})`}
          data-filled-shape
        />
        <rect
          x={CLASSIC_C - CLASSIC_R + 5}
          y={CLASSIC_C - CLASSIC_R + 5}
          width={(CLASSIC_R - 5) * 2}
          height={(CLASSIC_R - 5) * 2}
          rx={CLASSIC_R * 0.2}
          fill="none"
          stroke="white"
          strokeWidth={3}
          transform={`rotate(45, ${CLASSIC_C}, ${CLASSIC_C})`}
          data-double-outline
        />
      </>
    );
  }
  return (
    <>
      <rect
        x={CLASSIC_C - CLASSIC_R}
        y={CLASSIC_C - CLASSIC_R}
        width={CLASSIC_R * 2}
        height={CLASSIC_R * 2}
        rx={CLASSIC_R * 0.2}
        fill={color}
        data-filled-shape
      />
      <rect
        x={CLASSIC_C - CLASSIC_R + 5}
        y={CLASSIC_C - CLASSIC_R + 5}
        width={(CLASSIC_R - 5) * 2}
        height={(CLASSIC_R - 5) * 2}
        rx={CLASSIC_R * 0.2}
        fill="none"
        stroke="white"
        strokeWidth={3}
        data-double-outline
      />
    </>
  );
}

function ClassicCentreDot({
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
          cx={CLASSIC_C}
          cy={CLASSIC_C}
          r={CLASSIC_R}
          fill="none"
          stroke={color}
          strokeWidth={2}
          strokeDasharray="6 4"
          strokeOpacity={0.6}
        />
      )}
      <circle
        cx={CLASSIC_C}
        cy={CLASSIC_C}
        r={CLASSIC_R * 0.22}
        fill={color}
        data-centre-dot
      />
    </>
  );
}

function ClassicHalfFilled({ color }: { color: string }) {
  const path = `M ${CLASSIC_C} ${CLASSIC_C - CLASSIC_R} A ${CLASSIC_R} ${CLASSIC_R} 0 0 0 ${CLASSIC_C} ${CLASSIC_C + CLASSIC_R} Z`;
  return <path d={path} fill={color} data-half-fill />;
}

function ClassicUnknown({ color }: { color: string }) {
  return (
    <text
      x={CLASSIC_C}
      y={CLASSIC_C + 14}
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

// ─── StatusMarker ─────────────────────────────────────────────────────────────

/**
 * Renders the inner status symbol SVG for a single disease status.
 *
 * `variant: 'sticker'` — small viewBox-20 symbol used as a perimeter sticker
 * on a StickerNode. `variant: 'classic'` — large viewBox-100 shape-aware
 * overlay used in ClassicNotationNode.
 *
 * The SVG is `aria-hidden`; consumers are responsible for the labelled wrapper
 * and any positioning. A `data-status` attribute on the root SVG element
 * allows consumers and tests to locate the rendered marker by status value.
 *
 * The at-risk-homozygous triangle, coloured background chip, and outer
 * positioned wrapper are NOT rendered here — they stay in the consumers
 * because their positioning and accessible labels differ per consumer.
 */
export function StatusMarker({
  status,
  color,
  variant,
  shape = 'square',
}: StatusMarkerProps) {
  if (variant === 'sticker') {
    const inner = (() => {
      switch (status) {
        case 'affected':
          return <StickerSolid color={color} />;
        case 'obligateAffected':
          return <StickerDoubleRing color={color} />;
        case 'obligateCarrier':
          return <StickerRingDot color={color} />;
        case 'atRiskAffected':
          return <StickerHalf color={color} />;
        case 'atRiskCarrier':
          return <StickerDot color={color} />;
        case 'unknown':
          return <StickerUnknown color={color} />;
      }
    })();

    return (
      <svg
        viewBox={`0 0 ${STICKER_VB} ${STICKER_VB}`}
        aria-hidden
        data-status={status}
      >
        {inner}
      </svg>
    );
  }

  const statusSymbol = (() => {
    switch (status) {
      case 'affected':
        return <ClassicFilledShape color={color} shape={shape} />;
      case 'obligateAffected':
        return <ClassicObligateAffected color={color} shape={shape} />;
      case 'obligateCarrier':
        return <ClassicCentreDot color={color} />;
      case 'atRiskCarrier':
        return <ClassicCentreDot color={color} dashed />;
      case 'atRiskAffected':
        return <ClassicHalfFilled color={color} />;
      case 'unknown':
        return <ClassicUnknown color={color} />;
    }
  })();

  return (
    <svg
      viewBox={`0 0 ${CLASSIC_VB} ${CLASSIC_VB}`}
      aria-hidden
      className="pointer-events-none absolute inset-0 h-full w-full"
      data-status={status}
    >
      <ClassicOutline color={color} shape={shape} />
      {statusSymbol}
    </svg>
  );
}

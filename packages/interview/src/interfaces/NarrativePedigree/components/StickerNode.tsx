import { useState } from 'react';

import Node from '@codaco/fresco-ui/Node';
import type { NodeColorSequence, NodeShape } from '@codaco/fresco-ui/Node';

import type { Status } from '../genetics/status';
import { stickerPositions } from './stickerPositions';

export type DiseaseSticker = {
  color: string;
  status: Status;
  atRiskHomozygous?: boolean;
};

/** Maximum number of stickers rendered before showing +N overflow. */
export const STICKER_CAP = 6;

/** Pixel size of the node rendered by <Node size="sm"> (96px = size-24). */
const NODE_SIZE_PX = 96;

/** Pixel size of each sticker marker. */
const STICKER_SIZE_PX = 16;

/** Half-sticker offset so the marker is centred on the perimeter point. */
const STICKER_HALF = STICKER_SIZE_PX / 2;

/** SVG viewBox size used for all sticker markers. */
const VB = 20;

/** Radius of the outer circle used in most markers. */
const R = 8;

/** Centre coordinate in the viewBox. */
const C = VB / 2;

type StatusStyleInfo = {
  className: string;
  label: string;
};

const STATUS_STYLE: Record<Status, StatusStyleInfo> = {
  affected: { className: 'sticker-solid', label: 'Affected' },
  obligateAffected: {
    className: 'sticker-double-ring',
    label: 'Obligate affected',
  },
  obligateCarrier: { className: 'sticker-ring-dot', label: 'Obligate carrier' },
  atRiskAffected: { className: 'sticker-half', label: 'At risk (affected)' },
  atRiskCarrier: { className: 'sticker-dot', label: 'At risk (carrier)' },
  unknown: { className: 'sticker-question', label: 'Status unknown' },
};

/** Solid filled circle: disease colour, no stroke. */
function SolidMarker({ color }: { color: string }) {
  return (
    <svg viewBox={`0 0 ${VB} ${VB}`} aria-hidden>
      <circle cx={C} cy={C} r={R} fill={color} />
    </svg>
  );
}

/**
 * Double-ring: two concentric stroked rings, hollow centre.
 * Outer ring at R, inner ring at R*0.6.
 */
function DoubleRingMarker({ color }: { color: string }) {
  return (
    <svg viewBox={`0 0 ${VB} ${VB}`} aria-hidden>
      <circle
        cx={C}
        cy={C}
        r={R}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
      />
      <circle
        cx={C}
        cy={C}
        r={R * 0.58}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
      />
    </svg>
  );
}

/** Ring + centre dot: stroked outer ring plus a small filled dot in the centre. */
function RingDotMarker({ color }: { color: string }) {
  return (
    <svg viewBox={`0 0 ${VB} ${VB}`} aria-hidden>
      <circle
        cx={C}
        cy={C}
        r={R}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
      />
      <circle cx={C} cy={C} r={R * 0.28} fill={color} data-centre-dot />
    </svg>
  );
}

/**
 * Half-filled circle: left half filled, right half empty (stroked).
 * Implemented via a filled semicircle path (left side) + a full stroked ring.
 */
function HalfMarker({ color }: { color: string }) {
  // Left semicircle path: start at top-centre (C, C-R), arc left to bottom-centre (C, C+R).
  const path = `M ${C} ${C - R} A ${R} ${R} 0 0 0 ${C} ${C + R} Z`;
  return (
    <svg viewBox={`0 0 ${VB} ${VB}`} aria-hidden>
      <circle
        cx={C}
        cy={C}
        r={R}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
      />
      <path d={path} fill={color} data-half-fill />
    </svg>
  );
}

/** Centre dot only: small filled dot inside a lightly stroked ring. */
function DotMarker({ color }: { color: string }) {
  return (
    <svg viewBox={`0 0 ${VB} ${VB}`} aria-hidden>
      <circle
        cx={C}
        cy={C}
        r={R}
        fill="none"
        stroke={color}
        strokeWidth={1}
        strokeOpacity={0.4}
      />
      <circle cx={C} cy={C} r={R * 0.28} fill={color} data-centre-dot />
    </svg>
  );
}

/** Unknown: outlined circle with a ? glyph centred inside. */
function UnknownMarker({ color }: { color: string }) {
  return (
    <svg viewBox={`0 0 ${VB} ${VB}`} aria-hidden>
      <circle
        cx={C}
        cy={C}
        r={R}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
      />
      <text
        x={C}
        y={C + 3.5}
        textAnchor="middle"
        fontSize={10}
        fontWeight="bold"
        fill={color}
        data-question-mark
      >
        ?
      </text>
    </svg>
  );
}

const AT_RISK_LABEL = 'At risk of being affected (homozygous)';

/**
 * Small upward-pointing triangle placed at the bottom-right corner of its
 * parent sticker. Signals that a person may be homozygous-affected for this
 * disease — distinct from the primary-status marker shape.
 *
 * Rendered as a sibling to the sticker overlay (not inside it) so that:
 * - its aria-label is not suppressed by the overlay's aria-hidden ancestor, and
 * - the overflow-hidden / rounded-full clip on the sticker span does not trim it.
 */
function AtRiskHomozygousMarker({
  color,
  x,
  y,
}: {
  color: string;
  x: number;
  y: number;
}) {
  return (
    <span
      aria-label={AT_RISK_LABEL}
      data-atrisk-homozygous-marker
      className="pointer-events-none absolute flex items-center justify-center"
      style={{
        width: 8,
        height: 8,
        left: x - STICKER_HALF + STICKER_SIZE_PX - 8,
        top: y - STICKER_HALF + STICKER_SIZE_PX - 8,
      }}
    >
      <svg viewBox="0 0 8 8" aria-hidden width={8} height={8}>
        <polygon points="4,1 7,7 1,7" fill={color} />
      </svg>
    </span>
  );
}

type StickerMarkerProps = {
  sticker: DiseaseSticker;
  x: number;
  y: number;
};

function StickerMarker({ sticker, x, y }: StickerMarkerProps) {
  const { className, label } = STATUS_STYLE[sticker.status];

  const marker = (() => {
    switch (sticker.status) {
      case 'affected':
        return <SolidMarker color={sticker.color} />;
      case 'obligateAffected':
        return <DoubleRingMarker color={sticker.color} />;
      case 'obligateCarrier':
        return <RingDotMarker color={sticker.color} />;
      case 'atRiskAffected':
        return <HalfMarker color={sticker.color} />;
      case 'atRiskCarrier':
        return <DotMarker color={sticker.color} />;
      case 'unknown':
        return <UnknownMarker color={sticker.color} />;
    }
  })();

  return (
    <span
      aria-label={`${label} (${sticker.color})`}
      title={`${label} (${sticker.color})`}
      data-sticker-status={sticker.status}
      className={[
        'pointer-events-none absolute rounded-full border-2 border-white overflow-hidden',
        className,
      ].join(' ')}
      style={{
        width: STICKER_SIZE_PX,
        height: STICKER_SIZE_PX,
        left: x - STICKER_HALF,
        top: y - STICKER_HALF,
      }}
    >
      {marker}
    </span>
  );
}

type OverflowListProps = {
  hidden: DiseaseSticker[];
  onClose: () => void;
};

function OverflowList({ hidden, onClose }: OverflowListProps) {
  return (
    <dialog
      open
      data-overflow-list
      aria-label="All diseases"
      className="absolute -top-2 left-full z-10 ml-2 min-w-max rounded border border-white/20 bg-slate-800 p-2 text-xs text-white shadow-lg"
    >
      <ul>
        {hidden.map((d, i) => (
          <li key={i} className="flex items-center gap-1 py-0.5">
            <span
              className="inline-block size-3 rounded-full border border-white"
              style={{ backgroundColor: d.color }}
              aria-hidden
            />
            <span>{STATUS_STYLE[d.status].label}</span>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={onClose}
        className="mt-1 text-white/60 hover:text-white"
        aria-label="Close disease list"
      >
        Close
      </button>
    </dialog>
  );
}

type StickerNodeProps = {
  label: string;
  shape: NodeShape;
  diseases: DiseaseSticker[];
  color?: NodeColorSequence;
  selected?: boolean;
  highlighted?: boolean;
};

/**
 * Renders a Node with coloured disease-status stickers around its perimeter.
 * Each sticker's colour is the disease colour; its inline SVG encodes the
 * genetic status visually. When more diseases than STICKER_CAP are supplied,
 * the first STICKER_CAP are shown and a +N marker reveals the rest.
 */
export function StickerNode({
  label,
  shape,
  diseases,
  color = 'node-color-seq-1',
  selected,
  highlighted,
}: StickerNodeProps) {
  const [overflowOpen, setOverflowOpen] = useState(false);

  const visibleStickers = diseases.slice(0, STICKER_CAP);
  const hiddenDiseases = diseases.slice(STICKER_CAP);
  const hiddenCount = hiddenDiseases.length;
  const stickerCount = visibleStickers.length;

  const positions = stickerPositions(shape, stickerCount);

  // +N marker sits at the next perimeter position after the visible stickers
  const overflowPositions =
    hiddenCount > 0 ? stickerPositions(shape, stickerCount + 1) : [];
  const overflowPos =
    hiddenCount > 0 ? overflowPositions[stickerCount] : undefined;

  return (
    <div className="relative inline-block">
      <Node
        label={label}
        shape={shape}
        color={color}
        size="sm"
        selected={selected}
        highlighted={highlighted}
      />

      {/* Sticker overlay — aria-hidden because each StickerMarker carries its own aria-label */}
      <span aria-hidden className="pointer-events-none absolute inset-0">
        {visibleStickers.map((sticker, i) => {
          const pos = positions[i];
          if (!pos) return null;
          return (
            <StickerMarker
              key={i}
              sticker={sticker}
              x={pos.x * NODE_SIZE_PX}
              y={pos.y * NODE_SIZE_PX}
            />
          );
        })}
      </span>

      {/* At-risk-homozygous markers — rendered outside the aria-hidden overlay so
          their labels are reachable by assistive technology, and outside the
          overflow-hidden sticker span so the triangle is not clipped. */}
      <span className="pointer-events-none absolute inset-0">
        {visibleStickers.map((sticker, i) => {
          if (sticker.atRiskHomozygous !== true) return null;
          const pos = positions[i];
          if (!pos) return null;
          return (
            <AtRiskHomozygousMarker
              key={i}
              color={sticker.color}
              x={pos.x * NODE_SIZE_PX}
              y={pos.y * NODE_SIZE_PX}
            />
          );
        })}
      </span>

      {/* +N overflow marker */}
      {hiddenCount > 0 && overflowPos && (
        <button
          type="button"
          data-overflow-marker
          aria-label={`Show ${hiddenCount} more diseases`}
          onClick={() => setOverflowOpen((prev) => !prev)}
          className="absolute flex items-center justify-center rounded-full border-2 border-white bg-slate-600 text-[9px] leading-none font-bold text-white"
          style={{
            width: STICKER_SIZE_PX,
            height: STICKER_SIZE_PX,
            left: overflowPos.x * NODE_SIZE_PX - STICKER_HALF,
            top: overflowPos.y * NODE_SIZE_PX - STICKER_HALF,
          }}
        >
          +{hiddenCount}
        </button>
      )}

      {/* Overflow disclosure */}
      {overflowOpen && hiddenCount > 0 && (
        <OverflowList
          hidden={hiddenDiseases}
          onClose={() => setOverflowOpen(false)}
        />
      )}
    </div>
  );
}

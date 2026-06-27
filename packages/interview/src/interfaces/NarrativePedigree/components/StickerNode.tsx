import { useState } from 'react';

import Node from '@codaco/fresco-ui/Node';
import type { NodeColorSequence, NodeShape } from '@codaco/fresco-ui/Node';

import type { Status } from '../genetics/status';
import { stickerPositions } from './stickerPositions';

export type DiseaseSticker = {
  color: string;
  status: Status;
};

/** Maximum number of stickers rendered before showing +N overflow. */
export const STICKER_CAP = 6;

/** Pixel size of the node rendered by <Node size="sm"> (96px = size-24). */
const NODE_SIZE_PX = 96;

/** Pixel size of each sticker marker. */
const STICKER_SIZE_PX = 16;

/** Half-sticker offset so the marker is centred on the perimeter point. */
const STICKER_HALF = STICKER_SIZE_PX / 2;

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

type StickerMarkerProps = {
  sticker: DiseaseSticker;
  x: number;
  y: number;
};

function StickerMarker({ sticker, x, y }: StickerMarkerProps) {
  const { className, label } = STATUS_STYLE[sticker.status];
  const isUnknown = sticker.status === 'unknown';

  return (
    <span
      aria-label={`${label} (${sticker.color})`}
      title={`${label} (${sticker.color})`}
      data-sticker-status={sticker.status}
      className={[
        'pointer-events-none absolute flex items-center justify-center rounded-full border-2 border-white text-[9px] font-bold leading-none text-white',
        className,
      ].join(' ')}
      style={{
        width: STICKER_SIZE_PX,
        height: STICKER_SIZE_PX,
        left: x - STICKER_HALF,
        top: y - STICKER_HALF,
        backgroundColor: sticker.color,
      }}
    >
      {isUnknown && '?'}
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
 * Each sticker's colour is the disease colour; its visual style encodes the
 * genetic status. When more diseases than STICKER_CAP are supplied, the first
 * STICKER_CAP are shown and a +N marker reveals the rest.
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

      {/* Sticker overlay */}
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

import type { CSSProperties } from 'react';

import Node from '@codaco/fresco-ui/Node';
import type { NodeColorSequence, NodeShape } from '@codaco/fresco-ui/Node';
import { dimColor } from '~/interfaces/FamilyPedigree/pedigree-layout/dimColor';

import type { Status } from '../genetics/status';
import { Sticker } from './Sticker';
import { stickerPositions } from './stickerPositions';

export type DiseaseSticker = {
  id: string;
  color: string;
  status: Status;
  atRiskHomozygous?: boolean;
};

/** Maximum number of stickers rendered before showing +N overflow. */
export const STICKER_CAP = 8;

/**
 * Sticker size as a fraction of the rendered node, applied as a percentage so it
 * scales with the node element rather than a fixed pixel size. The Shell ramps
 * the real node size with the viewport, so percentage sizing keeps stickers
 * proportional at every breakpoint.
 */
const STICKER_FRACTION = 0.3;

/**
 * How far each marker is pushed out past the node silhouette, as a fraction of
 * the marker's own radius. 0 = marker centred on the edge (≈50% overlap, which
 * reads as too heavy); higher values sit the marker further out. ~0.6 leaves a
 * modest ~20% overlap so the markers clearly belong to the node without burying
 * it.
 */
const OVERLAP_PUSH = 0.6;

type StickerNodeProps = {
  label: string;
  shape: NodeShape;
  diseases: DiseaseSticker[];
  color?: NodeColorSequence;
  selected?: boolean;
  highlighted?: boolean;
  dimmed?: boolean;
  onSelectDisease?: (diseaseId: string) => void;
};

/**
 * Renders a Node with coloured disease-status stickers around its perimeter.
 * Each sticker's colour is the disease colour; its inline SVG encodes the
 * genetic status visually. When more diseases than STICKER_CAP are supplied,
 * the first STICKER_CAP are shown and a +N marker reveals the rest.
 *
 * Stickers are positioned as percentages of the node element (an `absolute
 * inset-0` overlay), so each marker's centre sits on its perimeter point at 50%
 * overlap regardless of the node's rendered size.
 *
 * `onSelectDisease` wires a pointer-only convenience: clicking a sticker
 * selects that disease without disturbing the node-container's focal action.
 * Sticker spans call stopPropagation so the click is not also interpreted as
 * a focal selection. The stickers are aria-hidden; keyboard access for disease
 * selection is through the disease Select panel.
 */
export function StickerNode({
  label,
  shape,
  diseases,
  color = 'node-color-seq-1',
  selected,
  highlighted,
  dimmed = false,
  onSelectDisease,
}: StickerNodeProps) {
  // When more diseases than STICKER_CAP are supplied, the last perimeter slot
  // becomes a +N badge, so only STICKER_CAP-1 stickers are drawn. Every slot is
  // a position from the SAME evenly-distributed ring, so the badge lands neatly
  // in sequence with the stickers (no separate, mismatched distribution).
  const hasOverflow = diseases.length > STICKER_CAP;
  const stickerCount = hasOverflow ? STICKER_CAP - 1 : diseases.length;
  const hiddenCount = diseases.length - stickerCount;
  const slotCount = hasOverflow ? STICKER_CAP : stickerCount;

  const visibleStickers = diseases.slice(0, stickerCount);
  const positions = stickerPositions(shape, slotCount);
  const overflowPos = hasOverflow ? positions[STICKER_CAP - 1] : undefined;

  // When dimmed, the node body is blended toward the background via a custom
  // --base (--dark auto-derives from it in Node). NodeColorSequence is a closed
  // enum with no slot for a computed colour, so the dimmed path must go through
  // color="custom". The bright path keeps the caller's sequence colour.
  const dimmedStyle = {
    '--base': dimColor('var(--node-1)'),
  } as CSSProperties;

  // Percentage-based size and centring: each marker is sized as a fraction of
  // the overlay (= node) and offset by -50%,-50% so its centre lands on the
  // (pushed-out) perimeter point regardless of the node's rendered pixel size.
  // The push moves the marker radially outward from the node centre by a
  // fraction of its own radius, so it sits mostly outside the silhouette.
  const stickerSpanStyle = (pos: { x: number; y: number }): CSSProperties => {
    const dx = pos.x - 0.5;
    const dy = pos.y - 0.5;
    const len = Math.hypot(dx, dy) || 1;
    const push = (STICKER_FRACTION / 2) * OVERLAP_PUSH;
    const cx = pos.x + (dx / len) * push;
    const cy = pos.y + (dy / len) * push;
    return {
      width: `${STICKER_FRACTION * 100}%`,
      aspectRatio: '1',
      left: `${cx * 100}%`,
      top: `${cy * 100}%`,
      transform: 'translate(-50%, -50%)',
    };
  };

  return (
    <div className="relative inline-block">
      <Node
        label={label}
        shape={shape}
        color={dimmed ? 'custom' : color}
        size="sm"
        selected={selected}
        highlighted={highlighted}
        style={dimmed ? dimmedStyle : undefined}
      />

      {/* Sticker overlay — aria-hidden; individual Sticker spans are also
          aria-hidden. Disease selection via sticker click is a pointer
          convenience only; keyboard path is through the disease Select panel.
          The overlay is pointer-events-none; interactive Sticker chips
          re-enable pointer events on themselves. */}
      <span aria-hidden className="pointer-events-none absolute inset-0">
        {visibleStickers.map((sticker, i) => {
          const pos = positions[i];
          if (!pos) return null;
          return (
            <span key={i} className="absolute" style={stickerSpanStyle(pos)}>
              <Sticker
                status={sticker.status}
                color={sticker.color}
                // Perimeter markers are always circular regardless of the
                // node shape; only the single-condition node-Sticker conforms
                // to the node shape. The node shape still drives sticker
                // POSITIONS via stickerPositions(shape, count) above.
                shape="circle"
                size="100%"
                atRiskHomozygous={sticker.atRiskHomozygous}
                surfaceColor={dimmed ? dimColor('white') : undefined}
                onClick={
                  onSelectDisease !== undefined
                    ? () => onSelectDisease(sticker.id)
                    : undefined
                }
              />
            </span>
          );
        })}
      </span>

      {/* +N overflow count — non-interactive span (not a button). The legend is
          the accessible surface for selecting a specific disease; nesting a
          button here would create an invalid nested-interactive element inside
          the parent focal container's role="button". */}
      {hiddenCount > 0 && overflowPos && (
        <span
          aria-hidden
          data-overflow-marker
          className={[
            'pointer-events-none absolute flex items-center justify-center rounded-full border-2 text-[9px] leading-none font-bold',
            dimmed ? '' : 'border-white bg-slate-600 text-white',
          ].join(' ')}
          style={{
            ...stickerSpanStyle(overflowPos),
            ...(dimmed
              ? {
                  backgroundColor: dimColor('var(--color-slate-600)'),
                  borderColor: dimColor('white'),
                  color: dimColor('white'),
                }
              : {}),
          }}
        >
          +{hiddenCount}
        </span>
      )}
    </div>
  );
}

import type { CSSProperties } from 'react';

import Node from '@codaco/fresco-ui/Node';
import type { NodeShape } from '@codaco/fresco-ui/Node';
import type { NcNode } from '@codaco/shared-consts';

import type { Status } from '../genetics/status';
import { StatusMarker } from './StatusMarker';

export type ClassicDisease = {
  color: string;
  status: Status;
  atRiskHomozygous?: boolean;
};

type ClassicNotationNodeProps = {
  node: NcNode & { _uid: string };
  disease: ClassicDisease;
  shape: NodeShape;
  label: string;
  selected?: boolean;
};

/**
 * Small upward-pointing triangle positioned at the bottom-right corner of the
 * node symbol. Visually signals that the person may be homozygous-affected for
 * this disease — a second signal distinct from all primary-status markers.
 *
 * Decorative (aria-hidden): the status it conveys is announced as text by the
 * per-node summary in NarrativePedigreeView.
 */
function AtRiskHomozygousNotation({ color }: { color: string }) {
  return (
    <span
      aria-hidden
      data-atrisk-homozygous-notation
      className="pointer-events-none absolute right-0 bottom-0 flex items-center justify-center"
      style={{ width: 10, height: 10 }}
    >
      <svg viewBox="0 0 10 10" aria-hidden width={10} height={10}>
        <polygon points="5,1 9,9 1,9" fill={color} />
      </svg>
    </span>
  );
}

/**
 * Classic pedigree-notation node for single-disease mode.
 *
 * The node symbol encodes disease status using traditional pedigree notation
 * (filled = affected, central dot = carrier, half = at-risk-affected, etc.).
 * The disease colour is applied entirely through the SVG overlay; the
 * underlying Node body is rendered transparent so the disease-coloured
 * shape outline and status symbol read clearly against the dark interview theme.
 *
 * The Node receives no visible label so the symbol alone fills and centres
 * within the 96×96px layout cell — keeping the symbol centre at (48,48) where
 * connectors attach. The participant label is rendered as an absolutely-
 * positioned element below the symbol (top-full), out of normal flow, so it
 * overflows into the row gap without shifting the symbol. The accessible name
 * is supplied via `ariaLabel` on the Node button; the visible label span is
 * aria-hidden to avoid a double-announcement.
 *
 * Status → symbol mapping:
 * - affected         → filled symbol (solid fill, disease colour)
 * - obligateAffected → filled symbol + inner ring (double-outline distinguisher)
 * - obligateCarrier  → shape outline + central dot
 * - atRiskCarrier    → shape outline + central dot + dashed ring
 * - atRiskAffected   → shape outline + left-half filled
 * - unknown          → shape outline + ? glyph
 */
export function ClassicNotationNode({
  disease,
  shape,
  label,
  selected,
}: ClassicNotationNodeProps) {
  const { color, status, atRiskHomozygous } = disease;

  return (
    <div className="relative inline-block">
      <span data-notation-status={status} className="relative inline-block">
        <Node
          ariaLabel={label}
          shape={shape}
          color="custom"
          size="sm"
          selected={selected}
          style={
            {
              '--base': 'transparent',
              '--dark': 'transparent',
            } as CSSProperties
          }
        />
        <StatusMarker
          variant="classic"
          status={status}
          color={color}
          shape={shape}
        />
      </span>
      {atRiskHomozygous === true && <AtRiskHomozygousNotation color={color} />}
      <span
        aria-hidden
        className="absolute top-full left-1/2 mt-1 w-24 -translate-x-1/2 truncate text-center text-xs text-white"
      >
        {label}
      </span>
    </div>
  );
}

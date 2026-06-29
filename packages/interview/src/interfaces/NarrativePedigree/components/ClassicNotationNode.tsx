import type { CSSProperties } from 'react';

import Node from '@codaco/fresco-ui/Node';
import type { NodeShape } from '@codaco/fresco-ui/Node';
import type { NcNode } from '@codaco/shared-consts';

import { AT_RISK_HOMOZYGOUS_LABEL, type Status } from '../genetics/status';
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
 * node symbol. Signals that the person may be homozygous-affected for this
 * disease — a second signal distinct from all primary-status markers.
 *
 * Rendered as a sibling to the notation-status span (not inside it) so its
 * aria-label is not suppressed by the overlay's aria-hidden ancestor.
 */
function AtRiskHomozygousNotation({ color }: { color: string }) {
  return (
    <span
      aria-label={AT_RISK_HOMOZYGOUS_LABEL}
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
 * The label is rendered beneath the symbol. No stickers are used.
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
    <div className="inline-flex flex-col items-center gap-1">
      <div className="relative inline-block">
        <span
          data-notation-status={status}
          className="relative inline-block"
          aria-label={label}
        >
          <Node
            label=""
            shape={shape}
            color="custom"
            size="xs"
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
        {atRiskHomozygous === true && (
          <AtRiskHomozygousNotation color={color} />
        )}
      </div>
      <span
        data-node-label
        className="max-w-[6rem] overflow-hidden text-center text-xs leading-tight hyphens-auto text-white"
      >
        {label}
      </span>
    </div>
  );
}

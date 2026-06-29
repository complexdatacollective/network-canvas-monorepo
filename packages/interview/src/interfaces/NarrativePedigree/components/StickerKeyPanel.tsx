'use client';

import { MotionSurface } from '@codaco/fresco-ui/layout/Surface';

import type { Status } from '../genetics/status';
import { Sticker } from './Sticker';

type KeyEntry = {
  status: Status;
  label: string;
};

// Participant-facing wording for each glyph. Kept as whole strings (never
// concatenated) so they read naturally and stay translatable. These describe
// what each marker means in plain language rather than reusing the clinical
// STATUS_LABELS verbatim.
//
// Display merge: `affected` and `obligateAffected` share the "Has this
// condition" glyph, so the key shows ONE entry for them (illustrated by
// `affected`). The genetics engine still computes both — only the displayed
// marker and this key are unified.
const KEY_ENTRIES: KeyEntry[] = [
  { status: 'affected', label: 'Has this condition' },
  { status: 'obligateCarrier', label: 'Carries this condition' },
  { status: 'atRiskAffected', label: 'May have this condition' },
  { status: 'atRiskCarrier', label: 'May carry this condition' },
  { status: 'unknown', label: 'Not known' },
];

// Glyphs in the key illustrate the marker notation, not any one condition, so
// they inherit the surface text colour rather than a disease colour and use a
// single canonical shape.
const KEY_GLYPH_COLOUR = 'currentColor';
const KEY_GLYPH_SHAPE = 'circle' as const;

const AT_RISK_HOMOZYGOUS_KEY_LABEL =
  'May be more seriously affected (two copies of this condition)';

export default function StickerKeyPanel() {
  return (
    <MotionSurface
      noContainer
      spacing="xs"
      shadow="xs"
      className="flex flex-col gap-2 rounded"
    >
      {KEY_ENTRIES.map((entry) => (
        <div key={entry.status} className="flex items-center gap-4 text-base">
          <span aria-hidden className="shrink-0">
            <Sticker
              status={entry.status}
              color={KEY_GLYPH_COLOUR}
              shape={KEY_GLYPH_SHAPE}
            />
          </span>
          {entry.label}
        </div>
      ))}
      <div className="flex items-center gap-4 text-base">
        <span aria-hidden className="shrink-0">
          <Sticker
            status="atRiskCarrier"
            color={KEY_GLYPH_COLOUR}
            shape={KEY_GLYPH_SHAPE}
            atRiskHomozygous
          />
        </span>
        {AT_RISK_HOMOZYGOUS_KEY_LABEL}
      </div>
    </MotionSurface>
  );
}

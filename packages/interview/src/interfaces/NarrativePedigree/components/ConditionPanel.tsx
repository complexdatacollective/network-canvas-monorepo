'use client';

import { useId } from 'react';

import SelectField from '@codaco/fresco-ui/form/fields/Select/Styled';
import { Label } from '@codaco/fresco-ui/Label';
import { MotionSurface } from '@codaco/fresco-ui/layout/Surface';

import type { Status } from '../genetics/status';
import { Sticker } from './Sticker';

type Disease = {
  id: string;
  label: string;
  color: string;
};

type DiseaseOption = {
  value: string;
  label: string;
};

type ConditionPanelProps = {
  diseases: Disease[];
  selectedDiseaseId: string | null;
  onSelect: (id: string | null) => void;
  // Whether the at-risk (probabilistic) notation is shown. Mirrors the
  // NarrativePedigree stage option; the key panel must list only the markers
  // actually drawn on the pedigree, so the two at-risk rows and the homozygous
  // row are omitted when this is false.
  showAtRiskStatuses: boolean;
};

// Non-empty sentinel for the "show every condition" option. Base-UI Select
// treats an empty-string value as "no value" and renders the placeholder
// instead of the option label; using 'all' avoids that blank-trigger bug.
const ALL_CONDITIONS = 'all';

type KeyEntry = {
  status: Status;
  label: string;
  // At-risk (probabilistic) markers are only listed when the stage option is on.
  atRisk?: boolean;
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
  { status: 'atRiskAffected', label: 'May have this condition', atRisk: true },
  { status: 'atRiskCarrier', label: 'May carry this condition', atRisk: true },
  { status: 'unknown', label: 'Not known' },
];

// Key glyphs illustrate the notation, not a specific disease. They need a
// dark foreground colour so the standard pedigree symbols (filled shapes, lines,
// dots) read on the white Sticker background. `--neutral-contrast` resolves to
// the charcoal token in the interview theme — a near-black that works on white.
const KEY_GLYPH_COLOUR = 'var(--neutral-contrast)';
const KEY_GLYPH_SHAPE = 'circle' as const;

const AT_RISK_HOMOZYGOUS_KEY_LABEL =
  'May be more seriously affected (two copies of this condition)';

export default function ConditionPanel({
  diseases,
  selectedDiseaseId,
  onSelect,
  showAtRiskStatuses,
}: ConditionPanelProps) {
  const selectId = useId();

  const keyEntries = showAtRiskStatuses
    ? KEY_ENTRIES
    : KEY_ENTRIES.filter((entry) => !entry.atRisk);

  const options: DiseaseOption[] = [
    { value: ALL_CONDITIONS, label: 'All conditions' },
    ...diseases.map((disease) => ({
      value: disease.id,
      label: disease.label,
    })),
  ];

  const handleChange = (value: string | number | undefined) => {
    onSelect(
      typeof value === 'string' && value !== ALL_CONDITIONS ? value : null,
    );
  };

  return (
    <MotionSurface
      noContainer
      spacing="xs"
      shadow="xs"
      className="flex flex-col gap-2 rounded"
    >
      <Label htmlFor={selectId}>Show a condition</Label>
      <SelectField
        id={selectId}
        name="np-condition"
        options={options}
        value={selectedDiseaseId ?? ALL_CONDITIONS}
        onChange={handleChange}
      />
      <hr className="my-1 border-t border-(--outline)" />
      {keyEntries.map((entry) => (
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
      {showAtRiskStatuses && (
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
      )}
    </MotionSurface>
  );
}

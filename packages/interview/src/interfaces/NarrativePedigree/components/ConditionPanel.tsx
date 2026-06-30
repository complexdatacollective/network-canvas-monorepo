'use client';

import { useId } from 'react';

import SelectField from '@codaco/fresco-ui/form/fields/Select/Styled';
import { Label } from '@codaco/fresco-ui/Label';
import { MotionSurface } from '@codaco/fresco-ui/layout/Surface';
import Heading from '@codaco/fresco-ui/typography/Heading';

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
// Each maps to a distinct Bennett-2022 glyph drawn by the Sticker: affected =
// filled, will-develop (obligate/presymptomatic) = vertical line, carrier =
// horizontal line-fill; the at-risk variants reuse the certain glyph plus a "?".
const KEY_ENTRIES: KeyEntry[] = [
  { status: 'affected', label: 'Has this condition' },
  { status: 'obligateAffected', label: 'Will develop this condition' },
  { status: 'obligateCarrier', label: 'Carries this condition' },
  {
    status: 'atRiskAffected',
    label: 'May develop this condition',
    atRisk: true,
  },
  { status: 'atRiskCarrier', label: 'May carry this condition', atRisk: true },
  { status: 'unknown', label: 'Not known' },
];

// The notation key illustrates the symbols, not a specific disease. When a
// single condition is shown, the glyphs take that condition's colour so the key
// matches the pedigree; when all conditions are shown they fall back to a vivid
// node colour (not charcoal, which is invisible on the dark key panel).
const KEY_GLYPH_FALLBACK_COLOUR = 'var(--node-1)';
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

  // When a single condition is shown, draw the notation key in its colour so the
  // key matches the pedigree; otherwise use a neutral vivid node colour.
  const selectedDisease =
    selectedDiseaseId !== null
      ? diseases.find((disease) => disease.id === selectedDiseaseId)
      : undefined;
  const glyphColour = selectedDisease?.color ?? KEY_GLYPH_FALLBACK_COLOUR;

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

      {diseases.length > 0 && (
        <>
          <hr className="my-1 border-t border-(--outline)" />
          <Heading level="label" margin="none">
            Conditions
          </Heading>
          {diseases.map((disease) => (
            <div key={disease.id} className="flex items-center gap-4 text-base">
              <span
                aria-hidden
                className="size-4 shrink-0 rounded-full"
                style={{ backgroundColor: disease.color }}
              />
              {disease.label}
            </div>
          ))}
        </>
      )}

      <hr className="my-1 border-t border-(--outline)" />
      <Heading level="label" margin="none">
        What the symbols mean
      </Heading>
      {keyEntries.map((entry) => (
        <div key={entry.status} className="flex items-center gap-4 text-base">
          <span aria-hidden className="shrink-0">
            <Sticker
              status={entry.status}
              color={glyphColour}
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
              color={glyphColour}
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

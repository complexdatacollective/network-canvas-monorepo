'use client';

import { Button } from '@codaco/fresco-ui/Button';
import Icon from '@codaco/fresco-ui/Icon';
import Surface from '@codaco/fresco-ui/layout/Surface';
import { ScrollArea } from '@codaco/fresco-ui/ScrollArea';
import Heading from '@codaco/fresco-ui/typography/Heading';

import { NotationKey } from './NotationKey';

type Disease = {
  id: string;
  label: string;
  color: string;
};

type ConditionPanelProps = {
  diseases: Disease[];
  selectedDiseaseId: string | null;
  onSelect: (id: string | null) => void;
  // Whether the at-risk (probabilistic) notation is shown. Mirrors the
  // NarrativePedigree stage option; the key panel must list only the markers
  // actually drawn on the pedigree, so the two at-risk rows are omitted when this
  // is false.
  showAtRiskStatuses: boolean;
  // Captures the current pedigree as an image (the footer action).
  onSnapshot: () => void;
};

// The notation key illustrates the symbols, not a specific disease. When a
// single condition is shown, the glyphs take that condition's colour so the key
// matches the pedigree; when all conditions are shown they fall back to a vivid
// node colour (not charcoal, which is invisible on the dark key panel).
const KEY_GLYPH_FALLBACK_COLOUR = 'var(--node-1)';
const KEY_GLYPH_SHAPE = 'circle' as const;

export default function ConditionPanel({
  diseases,
  selectedDiseaseId,
  onSelect,
  showAtRiskStatuses,
  onSnapshot,
}: ConditionPanelProps) {
  // When a single condition is shown, draw the notation key in its colour so the
  // key matches the pedigree; otherwise use a neutral vivid node colour.
  const selectedDisease =
    selectedDiseaseId !== null
      ? diseases.find((disease) => disease.id === selectedDiseaseId)
      : undefined;
  const glyphColour = selectedDisease?.color ?? KEY_GLYPH_FALLBACK_COLOUR;

  return (
    <Surface
      as="aside"
      noContainer
      spacing="none"
      shadow="md"
      className="flex h-full min-h-0 flex-col rounded-none"
      aria-label="Condition key"
    >
      {/* Header — panel title, fixed above the scrolling key. */}
      <div className="flex shrink-0 flex-col gap-1 border-b border-(--outline) p-4">
        <Heading level="h4" margin="none">
          Key
        </Heading>
      </div>

      {/* Body — clickable disease list + status-notation key, scrolls. */}
      <ScrollArea className="min-h-0 flex-1" viewportClassName="px-4">
        <div className="flex flex-col gap-2 py-2">
          {diseases.length > 0 && (
            <>
              <Heading level="label" margin="none">
                Conditions
              </Heading>
              <p className="text-sm opacity-80">
                Select a condition to see who it affects.
              </p>
              {diseases.map((disease) => {
                const isSelected = disease.id === selectedDiseaseId;
                return (
                  <button
                    key={disease.id}
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => onSelect(isSelected ? null : disease.id)}
                    className={`focusable flex items-center gap-4 rounded px-2 py-1 text-left text-base ${
                      isSelected ? 'bg-white/15 font-bold' : 'hover:bg-white/5'
                    }`}
                  >
                    <span
                      aria-hidden
                      className="size-4 shrink-0 rounded-full"
                      style={{ backgroundColor: disease.color }}
                    />
                    {disease.label}
                  </button>
                );
              })}
              <hr className="my-1 border-t border-(--outline)" />
            </>
          )}

          <Heading level="label" margin="none">
            What the symbols mean
          </Heading>
          <NotationKey
            glyphColour={glyphColour}
            shape={KEY_GLYPH_SHAPE}
            showAtRiskStatuses={showAtRiskStatuses}
          />
        </div>
      </ScrollArea>

      {/* Footer — snapshot action, fixed below the scrolling key. */}
      <div className="shrink-0 border-t border-(--outline) p-4">
        <Button
          color="primary"
          className="w-full"
          icon={
            <Icon name="Camera" aria-hidden="true" className="size-[1em]" />
          }
          onClick={onSnapshot}
        >
          Save snapshot
        </Button>
      </div>
    </Surface>
  );
}

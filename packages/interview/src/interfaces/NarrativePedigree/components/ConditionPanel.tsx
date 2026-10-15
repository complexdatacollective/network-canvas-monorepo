'use client';

import { useId } from 'react';

import { useAppIntl } from '@codaco/app-i18n/react';
import { Button } from '@codaco/fresco-ui/Button';
import RichSelectGroupField from '@codaco/fresco-ui/form/fields/RichSelectGroup';
import Icon from '@codaco/fresco-ui/Icon';
import Surface from '@codaco/fresco-ui/layout/Surface';
import { ScrollArea } from '@codaco/fresco-ui/ScrollArea';
import Heading from '@codaco/fresco-ui/typography/Heading';

import { messages } from '../messages';
import { NotationKey, type NotationWords } from './NotationKey';

type Disease = {
  id: string;
  label: string;
  color: string;
};

/** The panel's words, from the stage's settings. */
export type ConditionPanelWords = Readonly<{
  keyHeading: string;
  heading: string;
  instruction: string;
  saveSnapshot: string;
  notation: NotationWords;
}>;

type ConditionPanelProps = {
  words: ConditionPanelWords;
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
  words,
  diseases,
  selectedDiseaseId,
  onSelect,
  showAtRiskStatuses,
  onSnapshot,
}: ConditionPanelProps) {
  const intl = useAppIntl();
  const headingId = useId();
  const instructionId = useId();
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
      aria-label={intl.formatMessage(messages.conditionKey)}
    >
      {/* Header — panel title, fixed above the scrolling key. */}
      <div className="flex shrink-0 flex-col gap-1 border-b border-(--outline) p-4">
        <Heading level="h4" margin="none">
          {words.keyHeading}
        </Heading>
      </div>

      {/* Body — clickable disease list + status-notation key, scrolls. */}
      <ScrollArea className="min-h-0 flex-1" viewportClassName="px-4">
        <div className="flex flex-col gap-2 py-2">
          {diseases.length > 0 && (
            <>
              <Heading level="label" margin="none" id={headingId}>
                {words.heading}
              </Heading>
              <p id={instructionId} className="text-sm opacity-80">
                {words.instruction}
              </p>
              <RichSelectGroupField
                aria-labelledby={headingId}
                aria-describedby={instructionId}
                size="sm"
                options={diseases.map((disease) => ({
                  value: disease.id,
                  // Plain text: a condition's name is never markdown.
                  label: (
                    <span className="flex items-center gap-2">
                      <span
                        aria-hidden
                        className="size-4 shrink-0 rounded-full"
                        style={{ backgroundColor: disease.color }}
                      />
                      {disease.label}
                    </span>
                  ),
                }))}
                value={selectedDiseaseId ?? undefined}
                // Choosing the shown condition again returns to all conditions.
                onChange={(chosen) => {
                  if (typeof chosen !== 'string') return;
                  onSelect(chosen === selectedDiseaseId ? null : chosen);
                }}
              />
              <hr className="my-1 border-t border-(--outline)" />
            </>
          )}

          <NotationKey
            words={words.notation}
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
          {words.saveSnapshot}
        </Button>
      </div>
    </Surface>
  );
}

'use client';

import { useAppIntl } from '@codaco/app-i18n/react';
import Surface from '@codaco/fresco-ui/layout/Surface';
import { ScrollArea } from '@codaco/fresco-ui/ScrollArea';
import Heading from '@codaco/fresco-ui/typography/Heading';

import { messages } from '../messages';
import { NotationKey, type NotationWords } from './NotationKey';

/** The key's words, from the stage's settings. */
export type ConditionPanelWords = Readonly<{
  keyHeading: string;
  notation: NotationWords;
}>;

type ConditionPanelProps = {
  words: ConditionPanelWords;
  /** The shown condition's colour, which the key's symbols take so the key
   * matches the pedigree. */
  glyphColour: string;
  // Whether the at-risk (probabilistic) notation is shown. Mirrors the
  // NarrativePedigree stage option; the key panel must list only the markers
  // actually drawn on the pedigree, so the two at-risk rows are omitted when this
  // is false.
  showAtRiskStatuses: boolean;
};

const KEY_GLYPH_SHAPE = 'circle' as const;

/** The key to the symbols drawn for the shown condition. */
export default function ConditionPanel({
  words,
  glyphColour,
  showAtRiskStatuses,
}: ConditionPanelProps) {
  const intl = useAppIntl();

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

      <ScrollArea className="min-h-0 flex-1" viewportClassName="px-4">
        <div className="flex flex-col gap-2 py-2">
          <NotationKey
            words={words.notation}
            glyphColour={glyphColour}
            shape={KEY_GLYPH_SHAPE}
            showAtRiskStatuses={showAtRiskStatuses}
          />
        </div>
      </ScrollArea>
    </Surface>
  );
}

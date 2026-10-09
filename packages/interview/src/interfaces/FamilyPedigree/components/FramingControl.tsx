'use client';

import { Speech } from 'lucide-react';
import type { Ref } from 'react';

import { useAppIntl } from '@codaco/app-i18n/react';
import UnconnectedField from '@codaco/fresco-ui/form/Field/UnconnectedField';
import RichSelectGroupField from '@codaco/fresco-ui/form/fields/RichSelectGroup';
import {
  defineToolbarChild,
  ToolbarIconButton,
  ToolbarPopover,
} from '@codaco/fresco-ui/SegmentedToolbar';
import type { FramingId } from '@codaco/protocol-validation';

import { formatRelativeTerm } from '../kinship';
import { configuredWord, usePedigreeWords } from '../pedigreeWords';

type FramingControlProps = {
  /** The framing the participant chose, if they have. */
  value: FramingId | undefined;
  onChange: (framing: FramingId) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Forwarded to the toolbar button. */
  ref?: Ref<HTMLButtonElement>;
};

/**
 * The participant's choice of words for their family, in the stage's
 * toolbar, when the stage leaves the framing to them. Choosing applies at
 * once and closes the popover. Until they have chosen, nothing else closes
 * it: the words on the canvas depend on the answer.
 */
function FramingControl({
  value,
  onChange,
  open,
  onOpenChange,
  ref,
}: FramingControlProps) {
  const words = usePedigreeWords();
  const { wording, text } = words;
  const intl = useAppIntl();

  return (
    <ToolbarPopover
      ref={ref}
      open={open}
      onOpenChange={(next) => {
        if (!next && value === undefined) return;
        onOpenChange(next);
      }}
      trigger={
        <ToolbarIconButton
          aria-label={text(configuredWord(wording.framingControlLabel))}
          icon={<Speech />}
          data-testid="pedigree-framing"
        />
      }
      contentProps={{
        side: 'top',
        className: 'w-xl max-w-[calc(100vw-2rem)]',
      }}
    >
      <UnconnectedField
        component={RichSelectGroupField}
        name="pedigreeFraming"
        label={text(configuredWord(wording.framingChoiceTitle))}
        hint={text(configuredWord(wording.framingChoiceDescription))}
        options={[
          {
            value: 'gendered',
            label: intl.formatList(
              ['mother', 'father', 'sister', 'brother'].map((term) =>
                formatRelativeTerm(term, words),
              ),
              { type: 'unit' },
            ),
          },
          {
            value: 'gamete',
            label: intl.formatList(
              ['eggParent', 'spermParent', 'sibling'].map((term) =>
                formatRelativeTerm(term, words),
              ),
              { type: 'unit' },
            ),
          },
        ]}
        value={value}
        onChange={(chosen) => {
          if (chosen !== 'gendered' && chosen !== 'gamete') return;
          onChange(chosen);
          onOpenChange(false);
        }}
      />
    </ToolbarPopover>
  );
}

export default defineToolbarChild(FramingControl);

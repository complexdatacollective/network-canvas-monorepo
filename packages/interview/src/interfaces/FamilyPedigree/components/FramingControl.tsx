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

import { messages } from '../messages';

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
          aria-label={intl.formatMessage(messages.framingControlLabel)}
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
        label={intl.formatMessage(messages.framingChoiceTitle)}
        hint={intl.formatMessage(messages.framingChoiceDescription)}
        options={[
          {
            value: 'gendered',
            label: intl.formatMessage(messages.framingChoiceGendered),
            description: intl.formatMessage(
              messages.framingChoiceGenderedDescription,
            ),
          },
          {
            value: 'gamete',
            label: intl.formatMessage(messages.framingChoiceGamete),
            description: intl.formatMessage(
              messages.framingChoiceGameteDescription,
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

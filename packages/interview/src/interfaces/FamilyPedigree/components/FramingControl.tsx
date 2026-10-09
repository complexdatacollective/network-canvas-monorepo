'use client';

import { Speech } from 'lucide-react';
import { type Ref, useRef } from 'react';

import { useAppIntl } from '@codaco/app-i18n/react';
import UnconnectedField from '@codaco/fresco-ui/form/Field/UnconnectedField';
import RichSelectGroupField from '@codaco/fresco-ui/form/fields/RichSelectGroup';
import {
  defineToolbarChild,
  ToolbarButton,
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
 * once, closes the popover and returns focus to its button. Until they have
 * chosen, nothing else closes it: the words on the canvas depend on the
 * answer.
 */
function FramingControl({
  value,
  onChange,
  open,
  onOpenChange,
  ref,
}: FramingControlProps) {
  const intl = useAppIntl();
  // The toolbar button, as well as whoever the ref is forwarded to.
  const trigger = useRef<HTMLButtonElement | null>(null);
  const setTrigger = (element: HTMLButtonElement | null) => {
    trigger.current = element;
    if (typeof ref === 'function') ref(element);
    else if (ref) ref.current = element;
  };

  return (
    <ToolbarPopover
      ref={setTrigger}
      open={open}
      onOpenChange={(next) => {
        if (!next && value === undefined) return;
        onOpenChange(next);
      }}
      trigger={
        <ToolbarButton
          className="flex-col gap-0.5 px-5 text-xs [&>.lucide]:h-5"
          icon={<Speech />}
          data-testid="pedigree-framing"
        >
          {intl.formatMessage(messages.framingControlLabel)}
        </ToolbarButton>
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
          // Focus is moved back by hand: once it has been away from the
          // unanswered popover, the popover no longer returns it on closing,
          // and it would be left on nothing.
          trigger.current?.focus();
          onOpenChange(false);
        }}
      />
    </ToolbarPopover>
  );
}

export default defineToolbarChild(FramingControl);

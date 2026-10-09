'use client';

import { Speech } from 'lucide-react';
import { type Ref, useEffect, useRef } from 'react';

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

// A touch that lands on the question within this long of it opening was
// aimed at whatever it now covers, before it appeared, and chooses nothing.
const TOUCH_SETTLE_MS = 500;

/**
 * The participant's choice of words for their family, in the stage's
 * toolbar, when the stage leaves the framing to them. Choosing applies at
 * once, closes the popover and returns focus to its button. Until they have
 * chosen, nothing else closes it: the words on the canvas depend on the
 * answer. It is never taller than the room beside its button, scrolling
 * instead, so its question can be read on a phone held sideways.
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

  // When it last opened, and whether the press under way began on it long
  // enough after that to be meant for it.
  const openedAt = useRef(0);
  useEffect(() => {
    if (open) openedAt.current = performance.now();
  }, [open]);
  const pressMeant = useRef(true);

  return (
    <ToolbarPopover
      ref={setTrigger}
      open={open}
      onOpenChange={(next, eventDetails) => {
        if (!next && value === undefined) {
          eventDetails.cancel();
          // Held open, the popover keeps the focus guard it places before its
          // button, which expects focus only from the button (Shift+Tab out)
          // and sends it back the way it came. Reached by Tab from earlier in
          // the page instead, focus goes on to the button, as it would to
          // any toolbar button, and on from there to the choices.
          const from =
            eventDetails.event instanceof FocusEvent
              ? eventDetails.event.relatedTarget
              : null;
          const button = trigger.current;
          if (
            eventDetails.reason === 'focus-out' &&
            button &&
            eventDetails.trigger === button.previousElementSibling &&
            from !== button
          ) {
            queueMicrotask(() => button.focus());
          }
          return;
        }
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
        className:
          'flex max-h-(--available-height) w-xl max-w-[calc(100vw-2rem)] flex-col',
      }}
    >
      <div
        className="-m-1 min-h-0 overflow-y-auto p-1"
        onPointerDownCapture={(event) => {
          pressMeant.current =
            event.pointerType === 'mouse' ||
            performance.now() - openedAt.current >= TOUCH_SETTLE_MS;
        }}
        onClickCapture={(event) => {
          // A click from the keyboard (detail 0) is always meant.
          if (event.detail === 0 || pressMeant.current) return;
          event.preventDefault();
          event.stopPropagation();
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
      </div>
    </ToolbarPopover>
  );
}

export default defineToolbarChild(FramingControl);

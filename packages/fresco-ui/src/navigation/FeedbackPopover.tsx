'use client';

import { MessageSquareText } from 'lucide-react';
import { type ReactElement, type SyntheticEvent, useId, useState } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';

import { Button, type ButtonProps, IconButton } from '../Button';
import TextAreaField from '../form/fields/TextArea';
import {
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from '../Popover';
import Heading from '../typography/Heading';
import Paragraph from '../typography/Paragraph';

const messages = defineMessages({
  trigger: {
    id: 'frescoUi.feedbackPopover.trigger',
    defaultMessage: 'Feedback',
    description:
      'Label of the button in an application’s top bar that opens a small form for sending feedback about the application to the Network Canvas team. A noun.',
  },
  question: {
    id: 'frescoUi.feedbackPopover.question',
    defaultMessage: 'How could we improve this app?',
    description:
      'Heading of the feedback form, above an empty text box where the user writes an answer for the Network Canvas team. "We" is the team that makes the application.',
  },
  send: {
    id: 'frescoUi.feedbackPopover.send',
    defaultMessage: 'Send',
    description:
      'Button under the feedback text box that sends what the user wrote to the Network Canvas team.',
  },
  thanks: {
    id: 'frescoUi.feedbackPopover.thanks',
    defaultMessage: 'Thanks for your feedback.',
    description:
      'Replaces the feedback form once the user has sent their feedback.',
  },
});

const TRIGGER_NAME = 'Feedback';

export type FeedbackPopoverProps = {
  /** Called with the trimmed text when the user sends it. */
  onSubmit: (feedback: string) => void;
  /** Called each time the form opens. */
  onShown?: () => void;
  /** The most text the box accepts. */
  maxLength?: number;
  /** Whether the trigger shows its label beside the icon. */
  display?: 'label' | 'icon';
  /**
   * The trigger's `Button` look, so it can match the controls beside it. The
   * `text` default sits quietly in a header; `color="dynamic"` takes the
   * colour of the bar it sits on.
   */
  variant?: ButtonProps['variant'];
  color?: ButtonProps['color'];
  size?: ButtonProps['size'];
  /** Extra classes for the trigger button. */
  className?: string;
  /**
   * The trigger element, in place of the `Button` that `variant`, `color`,
   * `size` and `className` style: for a host whose bar dresses its own
   * controls. It receives the popover state; the icon, and the label unless
   * `display` is `icon`, are its children.
   */
  renderTrigger?: ReactElement;
  side?: 'top' | 'bottom';
  align?: 'start' | 'center' | 'end';
  /** Open on first render; for documentation, hosts never need it. */
  defaultOpen?: boolean;
};

/**
 * A quiet button that opens one question, "How could we improve this app?",
 * over a text box. Hosts own where the answer goes and the button's look; the
 * copy is shared.
 */
export default function FeedbackPopover({
  onSubmit,
  onShown,
  maxLength,
  display = 'label',
  variant = 'text',
  color = 'dynamic',
  size = 'sm',
  className,
  renderTrigger,
  side = 'bottom',
  align = 'end',
  defaultOpen,
}: FeedbackPopoverProps) {
  const intl = useAppIntl();
  const questionId = useId();
  const [draft, setDraft] = useState('');
  const [sent, setSent] = useState(false);

  const feedback = draft.trim();
  const iconOnly = display === 'icon';
  const icon = <MessageSquareText aria-hidden />;
  const label = intl.formatMessage(messages.trigger);

  const handleSubmit = (event: SyntheticEvent) => {
    event.preventDefault();
    if (feedback === '') return;
    onSubmit(feedback);
    setSent(true);
  };

  return (
    <Popover
      defaultOpen={defaultOpen}
      onOpenChange={(open) => {
        if (!open) return;
        // Reset on opening, so the thanks does not turn back into the form
        // while the popup is still closing.
        setDraft('');
        setSent(false);
        onShown?.();
      }}
    >
      {iconOnly ? (
        <PopoverTrigger
          nativeButton
          aria-label={TRIGGER_NAME}
          lang="en"
          render={
            renderTrigger ?? (
              <IconButton
                variant={variant}
                color={color}
                size={size}
                icon={icon}
                aria-label={TRIGGER_NAME}
                className={className}
              />
            )
          }
        >
          {renderTrigger ? icon : null}
        </PopoverTrigger>
      ) : (
        <PopoverTrigger
          nativeButton
          render={
            renderTrigger ?? (
              <Button
                variant={variant}
                color={color}
                size={size}
                icon={icon}
                className={className}
              />
            )
          }
        >
          {renderTrigger ? icon : null}
          <span>{label}</span>
        </PopoverTrigger>
      )}
      <PopoverContent side={side} align={align} className="w-80">
        {sent ? (
          <PopoverTitle
            // Sending replaces the form, so focus moves to the thanks.
            ref={(thanks: HTMLElement | null) => thanks?.focus()}
            tabIndex={-1}
            render={<Paragraph margin="none" className="focus:outline-none" />}
          >
            {intl.formatMessage(messages.thanks)}
          </PopoverTitle>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <PopoverTitle
              id={questionId}
              render={<Heading level="h4" margin="none" />}
            >
              {intl.formatMessage(messages.question)}
            </PopoverTitle>
            <TextAreaField
              aria-labelledby={questionId}
              maxLength={maxLength}
              className="[&>textarea]:field-sizing-content [&>textarea]:max-h-60 [&>textarea]:min-h-24"
              value={draft}
              onChange={(next) => setDraft(next ?? '')}
            />
            <Button
              type="submit"
              size="sm"
              color="primary"
              disabled={feedback === ''}
              className="self-end"
            >
              {intl.formatMessage(messages.send)}
            </Button>
          </form>
        )}
      </PopoverContent>
    </Popover>
  );
}

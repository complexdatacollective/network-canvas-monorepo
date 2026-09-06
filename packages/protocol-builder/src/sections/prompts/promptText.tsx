import type { ReactNode } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { RenderMarkdown } from '@codaco/fresco-ui/RenderMarkdown';
import Section from '@codaco/fresco-ui/Section';

import RichTextField from '../../fields/RichTextField.tsx';
import { DialogFormField } from '../../form/DialogForm.tsx';
import type { RowPreviewProps } from '../rowRenderers.tsx';

/**
 * The words this control says for itself.
 *
 * Its own area rather than the census families' — every prompt list in the
 * package asks for the same thing here, and a family that reuses this control
 * should not find its wording filed under `censusPrompts`.
 */
const messages = defineMessages({
  title: {
    id: 'protocolBuilder.promptText.title',
    defaultMessage: 'Participant prompt',
    description:
      'Heading of the group holding the question or instruction one prompt shows the participant. A prompt is one question the participant is asked during a stage, which is one step of an interview.',
  },
  description: {
    id: 'protocolBuilder.promptText.description',
    defaultMessage:
      'Write the question or instruction the participant sees for this prompt.',
    description:
      'Description of the group holding the question or instruction one prompt shows the participant.',
  },
  label: {
    id: 'protocolBuilder.promptText.label',
    defaultMessage: 'Prompt text',
    description:
      'Label of the box a researcher writes the question or instruction one prompt shows the participant into.',
  },
  placeholder: {
    id: 'protocolBuilder.promptText.placeholder',
    defaultMessage: 'Enter your prompt...',
    description:
      'Placeholder in the empty box a researcher writes a prompt into, where the family mounting it has offered no example of its own.',
  },
  required: {
    id: 'protocolBuilder.promptText.required',
    defaultMessage:
      'Write the question or instruction this prompt shows the participant.',
    description:
      'Refusal shown when a researcher saves a prompt without writing anything for the participant to read.',
  },
  emptyPreview: {
    id: 'protocolBuilder.promptText.emptyPreview',
    defaultMessage: 'This prompt has no question yet.',
    description:
      'Shown in place of a prompt’s own words in the list of prompts, when the researcher has written none.',
  },
});

export type PromptTextProps = Readonly<{
  title?: string;
  description?: string;
  label?: string;
  hint?: ReactNode;
  placeholder?: string;
  /**
   * Anything the researcher has to know before writing this interface's
   * prompt — that a Dyad Census shows two people at once, for instance.
   */
  guidance?: ReactNode;
}>;

/**
 * The question a prompt asks, in the row dialog that edits it.
 *
 * A plain Fresco `Field` rather than the package's `ProtocolField`: a row's
 * cells belong to the dialog's own form store, and registering them with the
 * stage's outline is exactly what the array primitives exist to prevent — a
 * removed row's dormant value reappearing in the saved stage.
 *
 * The words a caller may replace are resolved here rather than defaulted in
 * the signature, because a default cannot read the reader's language: a
 * parameter default is evaluated before this component may call `useAppIntl`.
 */
export function PromptTextField({
  title,
  description,
  label,
  hint,
  placeholder,
  guidance,
}: PromptTextProps) {
  const intl = useAppIntl();

  return (
    <Section
      title={title ?? intl.formatMessage(messages.title)}
      description={description ?? intl.formatMessage(messages.description)}
    >
      {guidance}
      <DialogFormField<typeof RichTextField>
        name="text"
        label={label ?? intl.formatMessage(messages.label)}
        {...(hint === undefined ? {} : { hint })}
        component={RichTextField}
        placeholder={placeholder ?? intl.formatMessage(messages.placeholder)}
        singleLine
        required={intl.formatMessage(messages.required)}
      />
    </Section>
  );
}

/**
 * How a prompt reads in the list when its dialog is closed.
 *
 * The prompt is markdown, so it is rendered as markdown: a row showing
 * `**these two people**` would make the researcher check the interview to find
 * out what the participant actually reads.
 */
export function PromptTextPreview({ item }: RowPreviewProps) {
  const intl = useAppIntl();
  const text = typeof item.text === 'string' ? item.text.trim() : '';
  if (text === '') {
    return (
      <span className="text-sm text-current/70 italic">
        {intl.formatMessage(messages.emptyPreview)}
      </span>
    );
  }
  return <RenderMarkdown>{text}</RenderMarkdown>;
}

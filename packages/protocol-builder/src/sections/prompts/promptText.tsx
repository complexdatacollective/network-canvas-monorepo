import type { ReactNode } from 'react';

import { RenderMarkdown } from '@codaco/fresco-ui/RenderMarkdown';
import Section from '@codaco/fresco-ui/Section';

import RichTextField from '../../fields/RichTextField.tsx';
import { DialogFormField } from '../../form/DialogForm.tsx';
import type { RowPreviewProps } from '../rowRenderers.tsx';

const PROMPT_TEXT_REQUIRED =
  'Write the question or instruction this prompt shows the participant.';

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
 */
export function PromptTextField({
  title = 'Participant prompt',
  description = 'Write the question or instruction the participant sees for this prompt.',
  label = 'Prompt text',
  hint,
  placeholder = 'Enter your prompt...',
  guidance,
}: PromptTextProps) {
  return (
    <Section title={title} description={description}>
      {guidance}
      <DialogFormField<typeof RichTextField>
        name="text"
        label={label}
        {...(hint === undefined ? {} : { hint })}
        component={RichTextField}
        placeholder={placeholder}
        singleLine
        required={PROMPT_TEXT_REQUIRED}
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
  const text = typeof item.text === 'string' ? item.text.trim() : '';
  if (text === '') {
    return (
      <span className="text-sm text-current/70 italic">
        This prompt has no question yet.
      </span>
    );
  }
  return <RenderMarkdown>{text}</RenderMarkdown>;
}

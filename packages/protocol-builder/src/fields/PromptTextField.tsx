import type { ReactNode } from 'react';

import { createMessageError } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import Field from '@codaco/fresco-ui/form/Field/Field';
import { RenderMarkdown } from '@codaco/fresco-ui/RenderMarkdown';
import Section from '@codaco/fresco-ui/Section';

import { censusMessages } from '../editors/dyad-census/sections/censusMessages.ts';
import type { RowPreviewProps } from '../form/rowDialog.tsx';
import RichTextField from './RichTextField.tsx';

const WRITE_THE_QUESTION = createMessageError(
  censusMessages.promptTextRequired,
);

const asString = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined;

export type PromptTextFieldProps = Readonly<{
  /** The prompt as the dialog opened on it, for the field's initial value. */
  item: Record<string, unknown>;
  /**
   * What the participant is looking at while they answer. Above the box rather
   * than under it, because it decides how the question is phrased.
   */
  guidance: ReactNode;
  placeholder: string;
}>;

/**
 * The question a census prompt asks, in the row dialog that edits it.
 *
 * An ordinary connected field of the DIALOG's form, so the question reaches
 * the stage when the prompt does and a cancelled prompt takes it with it.
 * Shared by the three censuses and the two bins, which differ only in the
 * sentence above the box and the example inside it.
 */
export function PromptTextField({
  item,
  guidance,
  placeholder,
}: PromptTextFieldProps) {
  const intl = useAppIntl();

  return (
    <Section
      title={intl.formatMessage(censusMessages.promptTextTitle)}
      description={intl.formatMessage(censusMessages.promptTextDescription)}
    >
      {guidance}
      <Field<typeof RichTextField>
        name="text"
        component={RichTextField}
        label={intl.formatMessage(censusMessages.promptTextLabel)}
        placeholder={placeholder}
        singleLine
        initialValue={asString(item.text)}
        required={WRITE_THE_QUESTION}
      />
    </Section>
  );
}

/**
 * How one census prompt reads in the list when its dialog is closed.
 *
 * The question is markdown, so it is rendered as markdown: a row showing
 * `**these two people**` would make the researcher open the interview to find
 * out what the participant actually reads.
 */
export function PromptTextPreview({ item }: RowPreviewProps) {
  const intl = useAppIntl();
  const text = asString(item.text)?.trim() ?? '';

  if (text === '') {
    return (
      <span className="text-sm text-current/70 italic">
        {intl.formatMessage(censusMessages.promptTextEmptyPreview)}
      </span>
    );
  }
  return <RenderMarkdown render={<div />}>{text}</RenderMarkdown>;
}

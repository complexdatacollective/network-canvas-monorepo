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
   *
   * Absent where Architect raises no notice above the box — a Tie-Strength
   * Census says the same thing in the field's own `hint` instead, and a
   * second sentence above the box would have to repeat it or disagree with
   * it.
   */
  guidance?: ReactNode;
  placeholder: string;
  /**
   * What the question itself has to do, where the family says so under the box
   * rather than above it. Absent where the family says nothing there.
   */
  hint?: string;
  /**
   * What this editor's prompt group is called, and what it says.
   *
   * Per editor rather than shared: the group holds the question alone in
   * three of the five families and the question plus the connection an answer
   * records in the other two, so Architect names and explains it differently
   * in each.
   */
  title: string;
  description: string;
  /**
   * Anything else the group holds — the connection type, where the family
   * keeps it inside this group rather than beside it.
   */
  children?: ReactNode;
}>;

/**
 * The question a census prompt asks, in the row dialog that edits it.
 *
 * An ordinary connected field of the DIALOG's form, so the question reaches
 * the stage when the prompt does and a cancelled prompt takes it with it.
 * Shared by the three censuses and the two bins, which differ in whether
 * there is a sentence above the box at all, in what it says, and in the
 * example inside the box.
 */
export function PromptTextField({
  item,
  guidance,
  placeholder,
  hint,
  title,
  description,
  children,
}: PromptTextFieldProps) {
  const intl = useAppIntl();

  return (
    <Section title={title} description={description}>
      {guidance}
      <Field<typeof RichTextField>
        name="text"
        component={RichTextField}
        label={intl.formatMessage(censusMessages.promptTextLabel)}
        {...(hint === undefined ? {} : { hint })}
        placeholder={placeholder}
        singleLine
        initialValue={asString(item.text)}
        required={WRITE_THE_QUESTION}
      />
      {children}
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

import { createMessageError } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import Field from '@codaco/fresco-ui/form/Field/Field';
import Section from '@codaco/fresco-ui/Section';

import EntityTypePickerField from '../../../fields/EntityTypePickerField.tsx';
import type { CodebookSubject } from '../../../protocol-context.ts';
import { censusMessages } from './censusMessages.ts';

export const CREATE_EDGE_FIELD = 'createEdge';

/**
 * The connection type a census prompt creates, as a codebook subject.
 *
 * The prompt's OWN type rather than the stage's subject: a census pairs up
 * nodes and records an EDGE between them, chosen inside each prompt. So the
 * row holds a bare type id and the entity it belongs to is this family's
 * knowledge. `undefined` until one is chosen, which a brand-new prompt is.
 */
export const edgeSubjectOf = (typeId: unknown): CodebookSubject | undefined =>
  typeof typeId === 'string' && typeId !== ''
    ? { entity: 'edge', type: typeId }
    : undefined;

/**
 * The save-time refusal for a connection type the codebook has lost.
 *
 * The picker keeps a deleted type on offer, labelled for what it is, so that
 * the reference the researcher has to repair is visible rather than blanked
 * and written back — which means nothing before a save can refuse it, and the
 * protocol schema would otherwise refuse the whole stage in its own words
 * about a codebook the researcher is no longer looking at.
 *
 * `undefined` for a prompt naming no connection at all: that is the required
 * rule's to refuse, and says nothing about the codebook.
 */
export const missingEdgeTypeIssue = (
  codebookEdges: Readonly<Record<string, unknown>>,
  typeId: unknown,
): string | undefined =>
  typeof typeId === 'string' &&
  typeId !== '' &&
  codebookEdges[typeId] === undefined
    ? createMessageError(censusMessages.edgeGoneRefusal)
    : undefined;

export type EdgeTypeSectionProps = Readonly<{
  title: string;
  /** What answering records between the people the prompt asked about. */
  description: string;
  hint: string;
  /** Shown when the prompt is saved without a connection type. */
  requiredMessage: string;
}>;

/**
 * The connection an answer to this prompt creates.
 *
 * The types come from the editor's own protocol context, so one a collaborator
 * adds or deletes while the dialog is open appears or disappears here — and a
 * researcher whose protocol has no connection type yet makes one from inside
 * the picker, which is where they went looking for it.
 */
export default function EdgeTypeSection({
  title,
  description,
  hint,
  requiredMessage,
}: EdgeTypeSectionProps) {
  const intl = useAppIntl();

  return (
    <Section title={title} description={description}>
      <Field<typeof EntityTypePickerField>
        name={CREATE_EDGE_FIELD}
        component={EntityTypePickerField}
        entityType="edge"
        label={intl.formatMessage(censusMessages.edgeLabel)}
        hint={hint}
        required={requiredMessage}
      />
    </Section>
  );
}

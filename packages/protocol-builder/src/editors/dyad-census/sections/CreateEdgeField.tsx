import { useMemo, useRef, useState } from 'react';
import { v4 as uuid } from 'uuid';

import { createMessageError } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import Button from '@codaco/fresco-ui/Button';
import Dialog from '@codaco/fresco-ui/dialogs/Dialog';
import Field from '@codaco/fresco-ui/form/Field/Field';
import useFormStore from '@codaco/fresco-ui/form/hooks/useFormStore';
import Section from '@codaco/fresco-ui/Section';
import { parseSectionId } from '@codaco/studio-sync/taxonomy';

import CodebookEntityEditor from '../../../codebook/components/CodebookEntityEditor.tsx';
import { useCreateCodebookEntity } from '../../../codebook/writes.ts';
import EntityTypePickerField from '../../../fields/EntityTypePickerField.tsx';
import type { CodebookSubject } from '../../../protocol-context.ts';
import { newEntityDraft } from '../../../sections/subject-picker/SubjectSection.tsx';
import { useProtocolContext } from '../../../state/protocolContext.ts';
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

export type CreateEdgeFieldProps = Readonly<{
  title: string;
  /** What answering records between the people the prompt asked about. */
  description: string;
  hint: string;
  /** Shown when the prompt is saved without a connection type. */
  requiredMessage: string;
}>;

/**
 * The connection an answer to this prompt creates, and a way to invent one.
 *
 * The types come from the editor's own protocol context, so one a collaborator
 * adds or deletes while the dialog is open appears or disappears here.
 *
 * Creating one writes the CODEBOOK, under that section's own lock, and the
 * prompt is then pointed at it as an ordinary unsaved change — exactly as the
 * subject section treats a brand-new node type, and for the same reason: a
 * prompt naming a type that does not exist yet is not a prompt the protocol
 * schema accepts, so the two cannot be saved as one edit.
 */
export default function CreateEdgeField({
  title,
  description,
  hint,
  requiredMessage,
}: CreateEdgeFieldProps) {
  const intl = useAppIntl();
  const codebook = useProtocolContext().codebook;
  const createEntity = useCreateCodebookEntity();
  // The row DIALOG's own store: the connection is the prompt's, and a type
  // created here has to land on the row rather than on the stage behind it.
  const setFieldValue = useFormStore((state) => state.setFieldValue);
  const [session, setSession] = useState<Readonly<{
    key: string;
    typeId: string;
  }> | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);

  /**
   * Every type name the protocol already carries, of BOTH kinds.
   *
   * Node and edge types share one namespace — `CodebookSchema` refuses a
   * protocol that reuses a name across the two maps — so judged against the
   * edge names alone a connection could be given a node type's name here, and
   * the refusal would arrive from the schema with no name-field error to act
   * on.
   */
  const existingEntityNames = useMemo(
    () =>
      [
        ...Object.values(codebook.node ?? {}),
        ...Object.values(codebook.edge ?? {}),
      ].map((definition) => definition.name),
    [codebook],
  );

  const createLabel = intl.formatMessage(censusMessages.edgeCreateLabel);

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
      <div className="mt-4">
        <Button
          ref={trigger}
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setSession({ key: uuid(), typeId: uuid() })}
        >
          {createLabel}
        </Button>
      </div>
      {session !== null && (
        <Dialog
          open
          title={createLabel}
          size="readable"
          // A request in flight refuses every way out, because the dialog is
          // about to show what the host made of it. Escape, a press outside
          // and the close button all arrive at `closeDialog`, so refusing
          // there covers all three, and `dismissible` takes the close button
          // away rather than leaving a control on screen that does nothing.
          // Dismissed mid-flight, a success arriving afterwards would still
          // point the prompt at a type the researcher never saw arrive.
          dismissible={!submitting}
          closeDialog={() => {
            if (submitting) return;
            setSession(null);
          }}
          finalFocus={() => trigger.current}
        >
          <CodebookEntityEditor
            mode="create"
            sessionKey={session.key}
            subject={{ entity: 'edge', type: session.typeId }}
            initialDraft={newEntityDraft(
              'edge',
              Object.keys(codebook.edge ?? {}).length,
            )}
            existingEntityNames={existingEntityNames}
            onSubmit={async (document) => {
              setSubmitting(true);
              try {
                return await createEntity('edge', document);
              } finally {
                setSubmitting(false);
              }
            }}
            onApplied={(outcome) => {
              // The id the HOST minted, read off the write: it is the host's
              // to issue, and the prompt has to name the type it created.
              const ref = parseSectionId(outcome.sectionId);
              if (ref.kind === 'codebookEdge') {
                setFieldValue(CREATE_EDGE_FIELD, ref.typeId);
              }
              setSession(null);
            }}
            onCancel={() => setSession(null)}
          />
        </Dialog>
      )}
    </Section>
  );
}

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
import { useStageEditorForm } from '../../../form/stageEditorContext.ts';
import type { CodebookSubject } from '../../../protocol-context.ts';
import { NEW_ENTITY_DRAFT } from '../../../sections/subject-picker/SubjectSection.tsx';
import { useProtocolContext } from '../../../state/protocolContext.ts';
import { censusMessages } from './censusMessages.ts';

/** Where every census prompt keeps the connection its answer records. */
export const CREATE_EDGE_FIELD = 'createEdge';

/**
 * The connection type a census prompt creates, as a codebook subject.
 *
 * The prompt's OWN type rather than the stage's subject: a census pairs up
 * nodes and records an EDGE between them, and which edge is chosen inside each
 * prompt. So the row holds a bare type id, and the entity it belongs to is
 * this family's knowledge rather than the draft's — the same reading
 * `useStageSubject` takes of a subject a stage holds.
 *
 * `undefined` until a connection type is chosen, which is a real state: a
 * brand-new prompt has none, and a control scoped to it has nothing to offer.
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
 * and written back — which means nothing before a save can refuse it. The
 * required rule sees a value and lets the row close; the protocol schema then
 * refuses the whole stage, in its own words, about a codebook the researcher
 * is no longer looking at.
 *
 * `undefined` for a prompt that names no connection at all: that is the
 * required rule's to refuse, and says nothing about the codebook.
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
  /** Heading of the group this control sits in, in the family's own words. */
  title: string;
  /** What answering records between the people the prompt asked about. */
  description: string;
  /** Guidance under the picker, in the family's own words. */
  hint: string;
  /** Shown when the prompt is saved without a connection type. */
  requiredMessage: string;
}>;

/**
 * The connection an answer to this prompt creates, and a way to invent one.
 *
 * The types come from the editor's own protocol context, so one a collaborator
 * adds or deletes while the dialog is open appears or disappears here without
 * this component doing anything.
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
  const { readOnly } = useStageEditorForm();
  const codebook = useProtocolContext().codebook;
  const createEntity = useCreateCodebookEntity();
  // The row DIALOG's own store: the connection is the prompt's, and a type
  // created here has to land on the row rather than on the stage behind it.
  const setFieldValue = useFormStore((state) => state.setFieldValue);
  const [session, setSession] = useState<Readonly<{
    key: string;
    typeId: string;
  }> | null>(null);
  /**
   * Whether a create is in flight, which is a fact this host has for itself:
   * the editor owns the draft and this owns the write, so the request passes
   * through here on its way out and its answer on the way back.
   */
  const [submitting, setSubmitting] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);

  /**
   * Every type name the protocol already carries, of BOTH kinds.
   *
   * Node and edge types share one namespace — `CodebookSchema` refuses a
   * protocol that reuses a name across the two maps — so judged against the
   * edge names alone a connection could be given a node type's name here: the
   * editor would take it, and the refusal would arrive from the schema after
   * the researcher had finished the dialog, with no name-field error to act on.
   *
   * Read map by map rather than through a computed key, because the two maps
   * hold different definition types and one indexed by a union is a union of
   * maps nothing can be read out of without narrowing it again.
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
      {/*
        The trigger goes when editing does, because a create nobody may start
        is not on offer. An editor already OPEN stays: the name inside it is
        the researcher's own work and exists nowhere else, and unmounting it
        would throw that away to say something the editor's own disabled save
        already says.
      */}
      {!readOnly && (
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
      )}
      {session !== null && (
        <Dialog
          open
          title={createLabel}
          size="readable"
          // A request in flight refuses every way out, because the dialog is
          // about to show what the host made of it. Escape, a press outside
          // and the close button all arrive at `closeDialog`, so refusing
          // there covers all three — and `dismissible` takes the close button
          // away rather than leaving a control on screen that does nothing.
          // Dismissed mid-flight, the handler awaiting the write stays alive
          // and a success arriving afterwards still points the prompt at the
          // new type: the researcher would watch the connection they had
          // chosen be replaced by one they never saw arrive.
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
            initialDraft={NEW_ENTITY_DRAFT.edge}
            existingEntityNames={existingEntityNames}
            readOnly={readOnly}
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

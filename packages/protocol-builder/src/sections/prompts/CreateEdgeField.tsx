import { type ReactNode, useMemo, useRef, useState } from 'react';
import { v4 as uuid } from 'uuid';

import Button from '@codaco/fresco-ui/Button';
import Dialog from '@codaco/fresco-ui/dialogs/Dialog';
import useFormStore from '@codaco/fresco-ui/form/hooks/useFormStore';
import Section from '@codaco/fresco-ui/Section';

import CodebookEntityEditor from '../../codebook/components/CodebookEntityEditor.tsx';
import type { CodebookEntityDraft } from '../../codebook/editing.ts';
import { EntitySelectControl } from '../../fields/EntitySelectField.tsx';
import { DialogFormField } from '../../form/DialogForm.tsx';
import { useStageEditorForm } from '../../form/stageEditorContext.ts';

/**
 * A brand-new edge type the researcher only has to name. Every other property
 * the schema requires is pre-filled and editable afterwards from the codebook,
 * because the point of creating one here is to get back to the prompt.
 */
const NEW_EDGE_DRAFT: CodebookEntityDraft = Object.freeze({
  name: '',
  color: 'edge-color-seq-1',
});

export type CreateEdgeFieldProps = Readonly<{
  title: string;
  description: string;
  label: string;
  hint?: ReactNode;
  /** The message shown when the prompt is saved without an edge type. */
  requiredMessage: string;
  /** Visible text and accessible name of the create control. */
  createLabel: string;
  createDescription: string;
  /** Anything the researcher has to know before writing this prompt. */
  guidance?: ReactNode;
}>;

/**
 * The edge an affirmative answer to this prompt creates.
 *
 * The types come from the editor's own protocol context, so one a collaborator
 * adds or deletes while the dialog is open appears or disappears here without
 * this component doing anything. Creating one is a compound edit against the
 * codebook alone — it lands whole or not at all — and pointing the prompt at
 * it afterwards is an ordinary unsaved change, exactly as the subject section
 * treats a brand-new node type.
 */
export default function CreateEdgeField({
  title,
  description,
  label,
  hint,
  requiredMessage,
  createLabel,
  createDescription,
  guidance,
}: CreateEdgeFieldProps) {
  const { controller, readOnly } = useStageEditorForm();
  const setFieldValue = useFormStore((state) => state.setFieldValue);
  const [session, setSession] = useState<{
    key: string;
    typeId: string;
  } | null>(null);
  /**
   * Whether a create is in flight, which is a fact this host has for itself:
   * the editor owns the draft and this owns request execution, so the request
   * passes through here on its way out and its answer on the way back.
   */
  const [submitting, setSubmitting] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);

  /**
   * Every type name the protocol already carries, of BOTH kinds.
   *
   * Node and edge types share one namespace — the rule `SubjectSection`'s own
   * create dialog applies, and Architect's type editor before it — because
   * `CodebookSchema` refuses a protocol that reuses a name across the two
   * maps. Judged against the edge names alone, a connection could be given a
   * node type's name here: the editor would accept it, and the refusal would
   * arrive from the schema after the researcher had finished the dialog,
   * without the name-field error this editor is otherwise able to give them.
   *
   * Read map by map rather than by a computed key: the codebook's two maps
   * hold different definition types, and one indexed by a union is a union of
   * maps nothing can be read out of without narrowing it again.
   */
  const codebook = controller.snapshot.protocolContext.codebook;
  const existingEntityNames = useMemo(
    () =>
      [
        ...Object.values(codebook.node ?? {}),
        ...Object.values(codebook.edge ?? {}),
      ].map((definition) => definition.name),
    [codebook],
  );

  return (
    <Section title={title} description={description}>
      {guidance}
      <DialogFormField<typeof EntitySelectControl>
        name="createEdge"
        label={label}
        {...(hint === undefined ? {} : { hint })}
        component={EntitySelectControl}
        entityType="edge"
        required={requiredMessage}
      />
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
      {/* Open already, and so kept when editing is taken away: what the
          researcher has typed is theirs, and the editor refuses its own save
          under `readOnly` rather than being torn down to say the same thing.
          What a spectator loses is the control above, which STARTS one. */}
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
          // Dismissed mid-flight, the handler awaiting the request stays alive
          // and a success arriving afterwards still points the prompt at the
          // new type: the researcher would watch the connection they had
          // chosen be replaced by one they never saw arrive, and a refusal
          // would be shown to nobody. `SubjectSection`'s create dialog holds
          // itself shut for exactly this, and this is the same act.
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
            createRequestId={() => uuid()}
            description={createDescription}
            subject={{ entity: 'edge', type: session.typeId }}
            initialDraft={NEW_EDGE_DRAFT}
            existingEntityNames={existingEntityNames}
            readOnly={readOnly}
            onSubmit={async (request) => {
              setSubmitting(true);
              try {
                return await controller.requestCompoundEdit(request);
              } finally {
                setSubmitting(false);
              }
            }}
            onApplied={() => {
              setFieldValue('createEdge', session.typeId);
              setSession(null);
            }}
            onCancel={() => setSession(null)}
          />
        </Dialog>
      )}
    </Section>
  );
}

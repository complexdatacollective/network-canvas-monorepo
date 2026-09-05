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
  const trigger = useRef<HTMLButtonElement>(null);

  const existingEntityNames = useMemo(
    () =>
      Object.values(
        controller.snapshot.protocolContext.codebook.edge ?? {},
      ).map((definition) => definition.name),
    [controller.snapshot.protocolContext.codebook.edge],
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
      {session !== null && (
        <Dialog
          open
          title={createLabel}
          size="readable"
          closeDialog={() => setSession(null)}
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
            onSubmit={(request) => controller.requestCompoundEdit(request)}
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

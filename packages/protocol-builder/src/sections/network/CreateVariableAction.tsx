import { useCallback, useRef, useState } from 'react';
import { v4 as uuid } from 'uuid';

import Button from '@codaco/fresco-ui/Button';
import Dialog from '@codaco/fresco-ui/dialogs/Dialog';
import type { FieldValue } from '@codaco/fresco-ui/form/store/types';
import type { VariableType } from '@codaco/protocol-validation';

import VariableEditor from '../../codebook/components/VariableEditor.tsx';
import { sectionIdForCodebookSubject } from '../../codebook/editing.ts';
import { useStageEditorForm } from '../../form/stageEditorContext.ts';
import type { CodebookSubject } from '../../protocol-context.ts';

/**
 * Writes one value into the STAGE's form, from a control that may be rendered
 * inside a dialog with a form store of its own.
 *
 * How a section finishes the job a codebook creation started: the attribute
 * lands in the protocol through the compound-edit path, and choosing it is an
 * ordinary unsaved form change the researcher can still undo or cancel — not
 * part of that edit. `useFormStore` would address whichever form is nearest,
 * which inside the creation dialog is the wrong one.
 */
export function useSetStageFieldValue(): (
  path: string,
  value: FieldValue,
) => void {
  const { storeApi } = useStageEditorForm();
  return useCallback(
    (path: string, value: FieldValue) => {
      storeApi.getState().setFieldValue(path, value);
    },
    [storeApi],
  );
}

export type CreateVariableActionProps = Readonly<{
  /** The entity the new attribute belongs to. */
  subject: CodebookSubject | undefined;
  /** The one type this attribute may be, because the picker beside it needs it. */
  variableType: VariableType;
  /** Visible text and accessible name of the control, and the dialog's title. */
  label: string;
  description: string;
  /** Receives the new attribute's stable record id once the codebook has it. */
  onCreated: (variableId: string) => void;
}>;

/**
 * Creates a codebook attribute without leaving the stage.
 *
 * The attribute is written through the session's compound-edit path — the same
 * one the codebook editors use — so it lands in the protocol atomically and
 * reports the specific lock holder when it cannot. Choosing it afterwards is a
 * separate, ordinary form change made by the caller: the stage is not saved
 * here, and a stage pointed at a brand-new attribute is frequently not yet
 * valid, which a host would be right to refuse.
 *
 * The type is fixed rather than offered, because the picker this sits beside
 * accepts exactly one kind of attribute: a "layout attribute" control that
 * created a text attribute would produce a reference the stage cannot use.
 */
export default function CreateVariableAction({
  subject,
  variableType,
  label,
  description,
  onCreated,
}: CreateVariableActionProps) {
  const { controller, readOnly } = useStageEditorForm();
  const [session, setSession] = useState<{
    key: string;
    variableId: string;
  } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const entityDocument =
    subject === undefined
      ? undefined
      : controller.snapshot.protocolSections[
          sectionIdForCodebookSubject(subject)
        ];

  // Nothing to add an attribute to: the stage has no subject yet, or the type
  // it names is not in the codebook this editor can see.
  if (readOnly || subject === undefined || entityDocument === undefined) {
    return null;
  }

  return (
    <>
      <Button
        ref={triggerRef}
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setSession({ key: uuid(), variableId: uuid() })}
      >
        {label}
      </Button>
      {session !== null && (
        <Dialog
          open
          title={label}
          size="readable"
          closeDialog={() => setSession(null)}
          finalFocus={() => triggerRef.current}
        >
          <VariableEditor
            mode="create"
            openId={session.key}
            subject={subject}
            authoritativeDocument={entityDocument}
            variableId={session.variableId}
            initialDraft={{ name: '', type: variableType }}
            allowedVariableTypes={[variableType]}
            protocolContext={controller.snapshot.protocolContext}
            description={description}
            title={label}
            createRequestId={() => uuid()}
            onSubmitRequest={(request) =>
              controller.requestCompoundEdit(request)
            }
            onComplete={(variableId) => {
              setSession(null);
              onCreated(variableId);
            }}
          />
        </Dialog>
      )}
    </>
  );
}

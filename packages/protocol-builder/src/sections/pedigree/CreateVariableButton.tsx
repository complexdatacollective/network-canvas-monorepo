import { useRef, useState } from 'react';
import { v4 as uuid } from 'uuid';

import Button from '@codaco/fresco-ui/Button';
import Dialog from '@codaco/fresco-ui/dialogs/Dialog';
import type { VariableOption, VariableType } from '@codaco/protocol-validation';

import VariableEditor from '../../codebook/components/VariableEditor.tsx';
import { sectionIdForCodebookSubject } from '../../codebook/editing.ts';
import { useStageEditorForm } from '../../form/stageEditorContext.ts';
import type { CodebookSubject } from '../../protocol-context.ts';

export type CreateVariableButtonProps = Readonly<{
  /** The type the attribute is created on. `null` while none is chosen. */
  subject: CodebookSubject | null;
  /**
   * The attribute type this slot needs. It is the only type offered, because
   * the slot cannot bind anything else — a pedigree's participant marker is a
   * boolean whatever the researcher would rather it were.
   */
  variableType: VariableType;
  /**
   * The canonical value set the interface owns, seeded and locked.
   *
   * The interview and the genetics engine branch on these exact values, so a
   * researcher may not edit them — and the schema refuses an attribute bound
   * to one of these slots whose options differ.
   */
  lockedOptions?: readonly VariableOption[];
  /**
   * Visible text and accessible name of the control, already formatted.
   *
   * Every caller names its own attribute — "a new participant identifier
   * attribute", "a new disease attribute" — from a descriptor declared in its
   * own family's messages file, and formats it there. A string arrives here
   * rather than a descriptor because this control renders it immediately and
   * hands nothing on: there is no later reader for a descriptor to be resolved
   * for, and the extraction guard sees the caller's declaration either way.
   */
  label: string;
  /** Says what the created attribute is for, inside the dialog. */
  description: string;
  onCreated(variableId: string): void;
}>;

/**
 * Creates a codebook attribute and hands its id back to the slot that asked
 * for it.
 *
 * The attribute is created through the session's compound-edit path, which is
 * what puts it into the protocol atomically and reports the specific lock
 * holder when it cannot. Binding it to the slot afterwards is an ordinary form
 * change rather than part of that edit, and deliberately so: an attribute in
 * the codebook is valid on its own, while a stage pointing at it may not be
 * finished yet — saved as one edit, a host keeping its stored protocol valid
 * would be right to refuse the pair.
 */
export default function CreateVariableButton({
  subject,
  variableType,
  lockedOptions,
  label,
  description,
  onCreated,
}: CreateVariableButtonProps) {
  const { controller, readOnly } = useStageEditorForm();
  const [session, setSession] = useState<{
    key: string;
    variableId: string;
  } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const authoritativeDocument =
    subject === null
      ? undefined
      : controller.snapshot.protocolSections[
          sectionIdForCodebookSubject(subject)
        ];

  // Nothing to add an attribute to yet. Rendering a disabled control instead
  // would offer an action whose only explanation is a choice made in a
  // different field.
  if (readOnly || subject === null || authoritativeDocument === undefined) {
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
            authoritativeDocument={authoritativeDocument}
            variableId={session.variableId}
            initialDraft={{ name: '', type: variableType }}
            allowedVariableTypes={[variableType]}
            lockedOptions={lockedOptions ?? null}
            description={description}
            protocolContext={controller.snapshot.protocolContext}
            createRequestId={() => uuid()}
            onSubmitRequest={(request) =>
              controller.requestCompoundEdit(request)
            }
            onComplete={(variableId) => {
              onCreated(variableId);
              setSession(null);
            }}
          />
        </Dialog>
      )}
    </>
  );
}

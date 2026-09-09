import { useRef, useState } from 'react';
import { v4 as uuid } from 'uuid';

import Button from '@codaco/fresco-ui/Button';
import Dialog from '@codaco/fresco-ui/dialogs/Dialog';
import type { VariableType } from '@codaco/protocol-validation';
import type { SectionDoc } from '@codaco/studio-sync/apply';

import VariableEditor from '../../codebook/components/VariableEditor.tsx';
import { sectionIdForCodebookSubject } from '../../codebook/editing.ts';
import { useStageEditorForm } from '../../form/stageEditorContext.ts';
import type { CodebookSubject } from '../../protocol-context.ts';

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
    /**
     * The type the attribute is being created ON, taken when the editor opened
     * rather than read live.
     *
     * The draft inside belongs to that type: a stage repointed at another one
     * while the editor is open — by this researcher, by an undo, by a
     * collaborator — would otherwise leave the editor authoring an attribute
     * of a type nobody asked it to. `editorReadOnly` below is what says so,
     * and the draft is kept rather than thrown away.
     */
    subject: CodebookSubject;
    /**
     * That type's section as it stood when the editor opened, for the renders
     * after it has gone. The live one is preferred while there is one.
     */
    openedDocument: SectionDoc;
  } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const entityDocument =
    subject === undefined
      ? undefined
      : controller.snapshot.protocolSections[
          sectionIdForCodebookSubject(subject)
        ];

  /**
   * What opening an editor from here would open it ON, or `undefined` while
   * there is nothing to open one against.
   *
   * Nothing to add an attribute to — the stage has no subject yet, the type it
   * names is not in the codebook this editor can see, or a collaborator has
   * taken the lease back — takes the control away. It carries the two values
   * the session captures rather than being a bare boolean, so the capture
   * cannot read them again, and cannot read a different answer, a moment
   * later.
   */
  const launchable =
    readOnly || subject === undefined || entityDocument === undefined
      ? undefined
      : { subject, openedDocument: entityDocument };

  /*
    An editor ALREADY OPEN is a different question, and the answer is that it
    stays. The name the researcher is typing exists nowhere else, and
    unmounting it to report the lost lease would throw that away to say
    something the editor says for itself once its own save is refused — the
    rule the row dialog around `AttributeCodebookControls` already follows, and
    the one the pedigree's `CreateVariableButton` follows for the same
    transition.
  */
  if (launchable === undefined && session === null) {
    return null;
  }

  // The section the OPEN editor is reading, resolved live so a collaborator's
  // changes to it still reach the editor, and falling back to the copy taken
  // when it opened when that section has gone.
  const openedSection =
    session === null
      ? undefined
      : controller.snapshot.protocolSections[
          sectionIdForCodebookSubject(session.subject)
        ];

  /**
   * Whether what is open may be WRITTEN, which is three questions.
   *
   * A lease taken back says this researcher may write nothing. A section that
   * has gone is a section nothing can be written into. And a stage repointed
   * at another type is a picker this attribute is no longer for: an attribute
   * created on the type the editor opened against would be chosen into a field
   * that has stopped naming that type's attributes.
   */
  const editorReadOnly =
    readOnly ||
    openedSection === undefined ||
    subject === undefined ||
    session === null ||
    sectionIdForCodebookSubject(subject) !==
      sectionIdForCodebookSubject(session.subject);

  return (
    <>
      {launchable !== undefined && (
        <Button
          ref={triggerRef}
          type="button"
          variant="outline"
          size="sm"
          onClick={() =>
            setSession({ key: uuid(), variableId: uuid(), ...launchable })
          }
        >
          {label}
        </Button>
      )}
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
            subject={session.subject}
            authoritativeDocument={openedSection ?? session.openedDocument}
            readOnly={editorReadOnly}
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
              // Chosen only while the field still names attributes of the type
              // the attribute was created on. An answer that arrives after the
              // stage has been repointed would otherwise put a reference to the
              // old type's attribute into a picker the change has just cleared.
              if (!editorReadOnly) onCreated(variableId);
              setSession(null);
            }}
          />
        </Dialog>
      )}
    </>
  );
}
